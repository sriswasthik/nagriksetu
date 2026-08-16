/**
 * ============================================================
 * SUPABASE ERROR NORMALISATION
 * ============================================================
 *
 * WHAT WENT WRONG WITHOUT THIS
 *
 * Two failures reported from a real deployment, both of them the error
 * handling rather than the operation:
 *
 *   Failed to submit report: {}
 *
 * A PostgrestError is a plain object, not an Error. `instanceof Error`
 * is false, so every caller fell through to its generic "please try
 * again" message, and logging it printed `{}` because it has no stack and
 * nothing the console overlay chooses to show. The actual reason —
 * a NOT NULL violation on complaint_number — was invisible to the person
 * who could have acted on it.
 *
 *   AuthSessionMissingError: Auth session missing!
 *
 * `supabase.auth.getUser()` returns that in `error` when there is simply
 * no session. Being signed out is an ordinary state, not a fault, and
 * rethrowing it turned a header widget's speculative read into a console
 * error with a stack trace.
 *
 * So: one place that turns anything Supabase throws into a real Error
 * carrying a message a human can use, and a distinct type for "not
 * signed in" that callers can choose to ignore.
 */

/** Thrown when an operation needs a session and there is none. */
export class NotSignedInError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "NotSignedInError";
  }
}

export function isNotSignedIn(error: unknown): error is NotSignedInError {
  return error instanceof NotSignedInError;
}

/** The shape supabase-js uses for Postgres and PostgREST failures. */
interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

function asErrorLike(error: unknown): SupabaseErrorLike | null {
  if (error && typeof error === "object") {
    return error as SupabaseErrorLike;
  }

  return null;
}

/**
 * Recognises "this database has not had the migrations applied".
 *
 * PostgREST answers a call to a function it cannot find with PGRST202,
 * and Postgres itself with 42883 (no such function) or 42P01 (no such
 * relation). None of it is anything the person filing a report can fix,
 * so they get a message aimed at whoever deployed it.
 */
export function schemaIsBehind(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883" || code === "42P01";
}

/**
 * The one case that looks identical but is not: PostgREST serves rpc()
 * from a cached copy of the schema, so a function that genuinely exists
 * is invisible until that cache reloads. Same PGRST202, different fix —
 * and telling someone to re-run migrations they have already applied
 * sends them in a circle.
 *
 * PostgREST says so in the message; there is no distinct code.
 */
function schemaCacheIsStale(like: SupabaseErrorLike): boolean {
  const haystack = `${like.message ?? ""} ${like.hint ?? ""}`.toLowerCase();
  return like.code === "PGRST202" && haystack.includes("schema cache");
}

/** Does this error mean the call could not be found, by either route? */
export function isMissingDatabaseObject(error: unknown): boolean {
  const like = asErrorLike(error);
  return like ? schemaIsBehind(like.code) : false;
}

/** Postgres SQLSTATE, when the error carries one. */
export function errorCode(error: unknown): string | undefined {
  return asErrorLike(error)?.code;
}

/**
 * Turns a Supabase error into an Error with an actionable message.
 *
 * `fallback` is used when the error carries nothing useful. The original
 * is preserved as `cause`, so the console still has everything.
 */
export function toActionableError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    // Already an Error, but an empty message is no use to anyone.
    return error.message ? error : new Error(fallback, { cause: error });
  }

  const like = asErrorLike(error);

  if (!like) {
    return new Error(fallback);
  }

  const { code, message, details, hint } = like;

  if (schemaCacheIsStale(like)) {
    return new Error(
      "The database was updated but has not finished reloading. " +
        "Wait a few seconds and try again — or run " +
        "`notify pgrst, 'reload schema';` in the SQL editor to do it now.",
      { cause: error }
    );
  }

  if (schemaIsBehind(code)) {
    return new Error(
      "This CityTrace deployment is missing part of its database schema. " +
        "Paste supabase/bootstrap.sql into the Supabase SQL editor and run " +
        "it (or `supabase db push` if you use the CLI), then try again. " +
        "supabase/diagnose.sql shows exactly what is missing.",
      { cause: error }
    );
  }

  /*
   * A NOT NULL violation on a column the client deliberately does not
   * send means the trigger or default that fills it is absent — the same
   * missing-migration situation, arriving as a constraint error instead.
   */
  if (code === "23502") {
    const column = columnFromNotNull(message);

    if (
      column === "complaint_number" ||
      column === "work_order_number"
    ) {
      return new Error(
        "This CityTrace deployment is missing part of its database schema, " +
          `so the field \`${column}\` could not be filled. ` +
          "Paste supabase/bootstrap.sql into the Supabase SQL editor and run " +
          "it, then try again.",
        { cause: error }
      );
    }

    const composed = [message, details, hint].filter(Boolean).join(" — ");
    return new Error(
      composed || fallback,
      { cause: error }
    );
  }

  if (code === "42501") {
    return new Error(
      message || "You do not have permission to do that.",
      { cause: error }
    );
  }

  /*
   * Everything else keeps the database's own words. The validation
   * messages raised by submit_complaint() — "Latitude must be between
   * -90 and 90" — are written to be read by the person submitting, and
   * replacing them with something generic would be a downgrade.
   */
  const composed = [message, details, hint].filter(Boolean).join(" — ");

  return new Error(composed || fallback, { cause: error });
}

/** Best-effort column name out of a 23502 message, for the notice above. */
function columnFromNotNull(message: string | undefined): string {
  const match = message?.match(/column "([^"]+)"/);
  return match?.[1] ?? "a required field";
}
