"use client";

import dynamic from "next/dynamic";

/**
 * Client-only wrapper for the isometric city.
 *
 * WHY ssr: false:
 * The scene is decorative (aria-hidden) and animated, and it reads
 * `useReducedMotion()`, which resolves to `null` on the server and to
 * a real boolean on the client. Server-rendering it therefore produced
 * a hydration mismatch — compounded by Framer Motion writing shorthand
 * `background` / `boxShadow` through the CSSOM on the client while
 * React serialises them as strings on the server.
 *
 * Rendering client-only removes the mismatch at the root rather than
 * papering over it, and has the side benefit of keeping ~30 extra
 * elements out of the server HTML for a purely visual flourish.
 *
 * No loading placeholder: the hero must not reserve empty space or shift
 * layout while this arrives.
 */
const IsometricCityInner = dynamic(
  () => import("@/components/visuals/IsometricCity").then((m) => m.IsometricCity),
  { ssr: false }
);

export function IsometricCityLazy({ className }: { className?: string }) {
  return <IsometricCityInner className={className} />;
}
