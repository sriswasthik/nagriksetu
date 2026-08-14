"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  DURATION,
  EASE_OUT,
  fadeUp,
  fadeReduced,
  staggerContainer,
} from "@/lib/design/motion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait before animating — for hand-tuned sequences. */
  delay?: number;
}

/**
 * ============================================================
 * SCROLL REVEAL PRIMITIVES
 * ============================================================
 *
 * Wraps content in a single, consistent entrance so pages do not
 * each invent their own. `once: true` means content never
 * re-animates as the user scrolls back up.
 *
 * Reduced motion collapses travel to a short opacity fade rather
 * than removing feedback entirely.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      data-reveal=""
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: reduced ? DURATION.fast : DURATION.base,
        ease: EASE_OUT,
        delay: reduced ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Parent for staggered lists. Children must be `RevealItem`s —
 * the stagger is orchestrated here so items need no delay props.
 */
export function RevealGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      data-reveal=""
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      data-reveal=""
      className={className}
      variants={reduced ? fadeReduced : fadeUp}
    >
      {children}
    </motion.div>
  );
}
