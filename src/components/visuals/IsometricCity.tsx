"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/design/motion";

/**
 * ============================================================
 * ISOMETRIC CITY — CSS 3D
 * ============================================================
 *
 * A stylised city block with live issue markers, used as the
 * landing hero visual. It tells the product's story literally:
 * civic issues, located on a city, being tracked.
 *
 * WHY CSS 3D AND NOT THREE.JS:
 * This is a fixed, non-interactive diorama — there is no camera
 * control, no dynamic geometry and no lighting model to justify a
 * WebGL runtime. Real 3D transforms on ~30 elements render on the
 * compositor, cost nothing at parse time, and add zero bytes to the
 * bundle. Pulling in Three.js + React Three Fiber (~600KB) for this
 * would be a large regression in load time for no visual gain.
 *
 * PERFORMANCE / ACCESSIBILITY:
 * - Only `transform` and `opacity` animate, so nothing triggers
 *   layout or paint.
 * - The whole scene is aria-hidden; it is decorative and every fact
 *   it conveys is stated in the adjacent copy.
 * - Under prefers-reduced-motion, buildings appear without their
 *   rise-up animation and markers stop pulsing.
 * - Hidden below `md`, where it would be too small to read and its
 *   cost is least welcome.
 */

/** Building footprint grid: x/y are grid cells, h is height in px. */
const BUILDINGS = [
  { x: 0, y: 0, h: 54, tone: "mid" },
  { x: 1, y: 0, h: 88, tone: "dark" },
  { x: 2, y: 0, h: 40, tone: "light" },
  { x: 3, y: 0, h: 68, tone: "mid" },
  { x: 0, y: 1, h: 72, tone: "light" },
  { x: 1, y: 1, h: 120, tone: "brand" },
  { x: 2, y: 1, h: 58, tone: "mid" },
  { x: 3, y: 1, h: 94, tone: "dark" },
  { x: 0, y: 2, h: 46, tone: "mid" },
  { x: 1, y: 2, h: 64, tone: "light" },
  { x: 2, y: 2, h: 104, tone: "brand" },
  { x: 3, y: 2, h: 50, tone: "mid" },
  { x: 0, y: 3, h: 82, tone: "dark" },
  { x: 1, y: 3, h: 44, tone: "mid" },
  { x: 2, y: 3, h: 70, tone: "light" },
  { x: 3, y: 3, h: 58, tone: "mid" },
] as const;

const TONES = {
  light: { top: "#E8E9E9", left: "#C9CBCB", right: "#B5B6B7" },
  mid: { top: "#B5B6B7", left: "#8F9091", right: "#77797A" },
  dark: { top: "#6B6B6B", left: "#525253", right: "#3D3D3E" },
  brand: { top: "#A24D6C", left: "#853953", right: "#6C2E43" },
} as const;

/** Issue markers, positioned over specific blocks. */
const MARKERS = [
  { x: 1, y: 1, h: 120, tone: "#DC2626", delay: 0 },
  { x: 2, y: 2, h: 104, tone: "#D97706", delay: 0.9 },
  { x: 3, y: 0, h: 68, tone: "#059669", delay: 1.7 },
  { x: 0, y: 3, h: 82, tone: "#0284C7", delay: 2.4 },
] as const;

const CELL = 58;

export function IsometricCity({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={cn("scene-3d pointer-events-none select-none", className)}
    >
      <div
        className="preserve-3d relative mx-auto"
        style={{
          width: CELL * 4,
          height: CELL * 4,
          transform: "rotateX(58deg) rotateZ(-45deg)",
        }}
      >
        {/* Ground plate with street grid */}
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            background:
              "linear-gradient(135deg, rgba(243,244,244,0.9), rgba(212,213,213,0.75))",
            backgroundImage: `
              linear-gradient(to right, rgba(44,44,44,0.10) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(44,44,44,0.10) 1px, transparent 1px)
            `,
            backgroundSize: `${CELL}px ${CELL}px`,
            boxShadow: "0 0 0 1px rgba(44,44,44,0.08)",
          }}
        />

        {BUILDINGS.map((building, index) => (
          <Building
            key={`${building.x}-${building.y}`}
            {...building}
            index={index}
            reduced={Boolean(prefersReducedMotion)}
          />
        ))}

        {MARKERS.map((marker) => (
          <Marker
            key={`${marker.x}-${marker.y}`}
            {...marker}
            reduced={Boolean(prefersReducedMotion)}
          />
        ))}
      </div>
    </div>
  );
}

function Building({
  x,
  y,
  h,
  tone,
  index,
  reduced,
}: {
  x: number;
  y: number;
  h: number;
  tone: keyof typeof TONES;
  index: number;
  reduced: boolean;
}) {
  const colors = TONES[tone];
  const size = CELL - 14;

  return (
    <motion.div
      className="preserve-3d absolute"
      style={{ left: x * CELL + 7, top: y * CELL + 7, width: size, height: size }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, z: -h }}
      animate={{ opacity: 1, z: 0 }}
      transition={{
        duration: reduced ? 0.2 : 0.65,
        ease: EASE_OUT,
        delay: reduced ? 0 : 0.15 + index * 0.045,
      }}
    >
      {/* Roof */}
      <div
        className="absolute inset-0"
        style={{
          background: colors.top,
          transform: `translateZ(${h}px)`,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
        }}
      />
      {/* Two visible walls — the other two never face the camera at
          this fixed angle, so drawing them would be wasted work. */}
      <div
        className="absolute bottom-0 left-0 origin-bottom"
        style={{
          width: size,
          height: h,
          background: colors.left,
          transform: "rotateX(-90deg)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 origin-right"
        style={{
          width: h,
          height: size,
          background: colors.right,
          transform: "rotateY(90deg)",
        }}
      />
    </motion.div>
  );
}

function Marker({
  x,
  y,
  h,
  tone,
  delay,
  reduced,
}: {
  x: number;
  y: number;
  h: number;
  tone: string;
  delay: number;
  reduced: boolean;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: x * CELL + CELL / 2 - 6,
        top: y * CELL + CELL / 2 - 6,
        // Counter-rotate so the marker faces the viewer instead of
        // lying flat on the isometric plane.
        transform: `translateZ(${h + 22}px) rotateZ(45deg) rotateX(-58deg)`,
        transformStyle: "preserve-3d",
      }}
    >
      <motion.span
        className="relative block h-3 w-3 rounded-full"
        style={{ background: tone, boxShadow: `0 0 0 3px ${tone}33` }}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reduced ? 0.2 : 0.4,
          ease: EASE_OUT,
          delay: reduced ? 0 : 0.9 + delay * 0.25,
        }}
      >
        {!reduced && (
          <span
            className="absolute inset-0 rounded-full animate-[marker-ping_2.8s_ease-out_infinite]"
            style={{ background: tone, animationDelay: `${delay}s` }}
          />
        )}
      </motion.span>
    </div>
  );
}
