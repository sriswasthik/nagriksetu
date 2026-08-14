"use client";

import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Draws attention to a filter that needs the user's action. */
  tone?: "default" | "attention";
}

interface FilterChipsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

/**
 * Horizontal filter chips.
 *
 * Implemented as a radiogroup rather than buttons so arrow keys move
 * between options and assistive tech announces the selected state —
 * a plain row of buttons gives neither.
 *
 * Scrolls horizontally on narrow screens instead of wrapping into a
 * tall stack that pushes content off-screen.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<T>) {
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";

    if (!forward && !back) return;

    event.preventDefault();

    const nextIndex = forward
      ? (index + 1) % options.length
      : (index - 1 + options.length) % options.length;

    onChange(options[nextIndex].value);

    // Move focus with selection so keyboard and visual state agree.
    const group = event.currentTarget.parentElement;
    const next = group?.children[nextIndex] as HTMLElement | undefined;
    next?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1",
        // Hide the scrollbar; the chips themselves signal overflow.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {option.tone === "attention" && !isSelected && option.count ? (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-sky-500"
              />
            ) : null}

            {option.label}

            {option.count !== undefined && (
              <span
                className={cn(
                  "tabular text-xs",
                  isSelected ? "text-primary-foreground/75" : "text-muted-foreground/70"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
