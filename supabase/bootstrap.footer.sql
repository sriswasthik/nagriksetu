-- ============================================================
-- TELL PostgREST TO RELOAD
-- ============================================================
--
-- PostgREST serves rpc() calls from a cached copy of the schema. A
-- function created after that cache was built is invisible until it
-- reloads, and the error is indistinguishable from the function not
-- existing at all:
--
--   PGRST202: Could not find the function public.submit_complaint(...)
--             in the schema cache
--
-- Supabase reloads within a minute or so on its own, but there is no
-- reason to wait or to wonder whether the paste worked.

notify pgrst, 'reload schema';


-- ============================================================
-- DONE
-- ============================================================
-- Next: run supabase/diagnose.sql. Every row should read `ok`, and the
-- second query should return no rows.
