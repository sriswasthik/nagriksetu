"use client";

/**
 * ============================================================
 * CHART THEME
 * ============================================================
 *
 * Shared Recharts configuration so every chart reads as one system:
 * the CityTrace palette, minimal grid lines, and a tooltip built
 * from the same surfaces as the rest of the UI.
 *
 * Colours are the resolved values of the --chart-* tokens. Recharts
 * renders SVG attributes rather than CSS classes, so it cannot
 * consume the CSS variables directly.
 */
export const CHART_COLORS = {
  primary: "#853953",
  secondary: "#612D53",
  primaryLight: "#D998AC",
  neutral: "#8F9091",
  neutralDark: "#525253",
  success: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
} as const;

/** Categorical series colours, ordered for maximum separation. */
export const CHART_SERIES = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.primaryLight,
  CHART_COLORS.neutralDark,
  CHART_COLORS.neutral,
] as const;

/** Axis/grid defaults — quiet, so the data carries the emphasis. */
export const AXIS_PROPS = {
  stroke: "#B5B6B7",
  tick: { fill: "#6B6B6B", fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: "#D4D5D5",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/**
 * Recharts injects `active`/`payload`/`label` into whatever it is
 * given as `content`. Declared structurally rather than by extending
 * Recharts' own TooltipProps, whose v3 `labelFormatter` signature
 * conflicts with the simpler one this component exposes.
 */
interface ChartTooltipPayloadEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadEntry[];
  label?: string | number;
  /** Formats the label (e.g. an ISO date into a readable date). */
  labelFormatter?: (label: string) => string;
  /** Appended to each value, e.g. "%" or "h". */
  valueSuffix?: string;
}

/**
 * Tooltip matching the app's popover surface. Replaces Recharts'
 * default, which ignores the design system entirely.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueSuffix = "",
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold text-foreground">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}

      <ul className="space-y-1">
        {payload.map((entry) => (
          <li
            key={String(entry.name)}
            className="flex items-center gap-2 text-xs"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="tabular ml-auto font-semibold text-foreground">
              {typeof entry.value === "number"
                ? entry.value.toLocaleString("en-IN")
                : entry.value}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend styled to match body copy rather than Recharts' default. */
export function ChartLegend({
  payload,
}: {
  payload?: { value: string; color: string }[];
}) {
  if (!payload?.length) return null;

  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
      {payload.map((entry) => (
        <li key={entry.value} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-xs text-muted-foreground">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}
