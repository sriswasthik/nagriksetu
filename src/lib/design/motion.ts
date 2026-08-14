import type { Transition, Variants } from "framer-motion";

/**
 * ============================================================
 * CITYTRACE MOTION SYSTEM
 * ============================================================
 *
 * Shared easings, durations and variants so motion reads as one
 * language across the app instead of per-component guesswork.
 *
 * Reduced motion: components pair these with `useReducedMotion()`
 * and fall back to `*Reduced` variants (opacity only, no travel).
 * The global CSS guard in globals.css is the backstop; this is the
 * intentional path.
 */

/* Decelerating ease — the default for entrances. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/* Symmetric ease — for state changes and layout shifts. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.16,
  base: 0.28,
  slow: 0.45,
  deliberate: 0.7,
} as const;

export const transition: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT,
};

export const transitionFast: Transition = {
  duration: DURATION.fast,
  ease: EASE_OUT,
};

/* Springs for interactive affordances (press, markers, counters). */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 30,
};

/**
 * ------------------------------------------------------------
 * ENTRANCES
 * ------------------------------------------------------------
 */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition },
};

/** Opacity-only counterpart for reduced-motion users. */
export const fadeReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
};

/**
 * ------------------------------------------------------------
 * STAGGERED LISTS
 * ------------------------------------------------------------
 * Parent orchestrates, children use `fadeUp`. Keeps list reveals
 * from firing all at once without wiring each item individually.
 */

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
};

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

/**
 * Picks the motion-safe variant set. Call with the value from
 * `useReducedMotion()`.
 */
export function motionVariants(
  reduced: boolean | null,
  variants: Variants
): Variants {
  return reduced ? fadeReduced : variants;
}

/**
 * Standard `whileInView` config for scroll-revealed sections.
 * `once` avoids re-animating on every scroll pass.
 */
export const inViewOnce = {
  initial: "hidden",
  whileInView: "visible",
  viewport: { once: true, margin: "-80px" },
} as const;
