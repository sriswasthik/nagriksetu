"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DURATION } from "@/lib/design/motion";

interface AnimatedCounterProps {
  value: number;
  className?: string;
  /** Appended after the number, e.g. "%" or "h". */
  suffix?: string;
  decimals?: number;
  /** Thousands separators — off for small counts. */
  format?: boolean;
}

/**
 * Counts up to `value` when scrolled into view.
 *
 * Reduced motion (or a zero value) renders the final number
 * immediately. Uses tabular numerals so the width does not jitter
 * as digits change.
 */
export function AnimatedCounter({
  value,
  className,
  suffix,
  decimals = 0,
  format = true,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(() =>
    prefersReducedMotion ? value : 0
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      const timer = setTimeout(() => {
        setDisplay(value);
      }, 0);

      return () => clearTimeout(timer);
    }

    if (!isInView) return;

    // Nothing to animate toward.
    if (value === 0) {
      const timer = setTimeout(() => {
        setDisplay(0);
      }, 0);

      return () => clearTimeout(timer);
    }

    const durationMs = DURATION.deliberate * 1000;
    let frame = 0;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;

      const progress = Math.min((timestamp - start) / durationMs, 1);
      // Ease-out cubic: fast start, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(value * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [isInView, value, prefersReducedMotion]);

  const rendered = format
    ? display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : display.toFixed(decimals);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {rendered}
      {suffix}
    </span>
  );
}
