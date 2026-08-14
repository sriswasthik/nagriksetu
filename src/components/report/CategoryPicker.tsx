"use client";

import {
  Circle,
  Construction,
  Droplets,
  HelpCircle,
  Lightbulb,
  Pipette,
  ShieldAlert,
  Trash2,
  Volume2,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { COMPLAINT_CATEGORIES } from "@/lib/constants";
import type { ComplaintCategory } from "@/types/complaint";

/**
 * Maps the icon names declared in COMPLAINT_CATEGORIES onto real
 * components. Kept here so lib/constants stays free of React
 * imports and can be used server-side.
 */
const ICONS: Record<string, LucideIcon> = {
  Droplets,
  Circle,
  Trash2,
  Waves,
  Lightbulb,
  Construction,
  Pipette,
  Volume2,
  ShieldAlert,
  HelpCircle,
};

/**
 * The database `complaint_category` enum is narrower than the list
 * of things citizens can pick. Anything outside the enum is stored
 * as `other`; the richer AI classification is preserved separately
 * in ai_category by the AI service.
 */
const DB_CATEGORIES: ComplaintCategory[] = [
  "garbage",
  "water_leakage",
  "pothole",
  "drainage",
  "streetlight",
  "other",
];

export function toDatabaseCategory(value: string): ComplaintCategory {
  return DB_CATEGORIES.includes(value as ComplaintCategory)
    ? (value as ComplaintCategory)
    : "other";
}

interface CategoryPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Visual category selector.
 *
 * A radiogroup of tiles rather than a <select>: on mobile this is
 * one tap instead of opening a picker, and the icons make scanning
 * faster than reading a list.
 */
export function CategoryPicker({
  value,
  onChange,
  disabled,
}: CategoryPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="What kind of issue is it?"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
    >
      {COMPLAINT_CATEGORIES.map((category) => {
        const Icon = ICONS[category.icon] ?? HelpCircle;
        const isSelected = value === category.value;

        return (
          <button
            key={category.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(category.value)}
            className={cn(
              "flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? "border-primary bg-primary/8 shadow-sm ring-1 ring-primary"
                : "bg-card hover:border-primary/40 hover:bg-muted/40"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "text-xs leading-tight",
                isSelected ? "font-semibold text-primary" : "font-medium text-foreground"
              )}
            >
              {category.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
