/*
 * The auth pages read the query string the proxy adds when it turns
 * someone away (`?next=`, `?error=`). useSearchParams() cannot be used
 * during a static prerender — Next.js requires a Suspense boundary, and
 * the fallback is what ends up in the prerendered HTML, so the sign-in
 * form would be replaced by a placeholder on first paint.
 *
 * Rendering the segment dynamically avoids both that and the alternative
 * of setting state in an effect after mount. Nothing is lost: these
 * pages are already uncacheable in practice, since the proxy redirects
 * anyone who is signed in before they render at all.
 */
export const dynamic = 'force-dynamic';

export default function AuthSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
