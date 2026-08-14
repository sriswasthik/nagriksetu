import L from "leaflet";

import { getStatusMeta, getToneClasses } from "@/lib/design/status";
import type { ComplaintStatus } from "@/types/complaint";

/**
 * ============================================================
 * LEAFLET MARKER FACTORY
 * ============================================================
 *
 * Leaflet's default marker relies on bundled PNG assets whose paths
 * break under bundlers. We build DivIcons from inline SVG instead:
 * no asset resolution, and markers can be coloured straight from the
 * shared status tone system so map colour always matches the badges.
 */

/** Cache — recreating identical icons per marker is wasteful. */
const iconCache = new Map<string, L.DivIcon>();

export function getStatusMarkerIcon(
  status: ComplaintStatus,
  options: { selected?: boolean; pulse?: boolean } = {}
): L.DivIcon {
  const { selected = false, pulse = false } = options;
  const cacheKey = `${status}-${selected}-${pulse}`;

  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const meta = getStatusMeta(status);
  const color = getToneClasses(meta.tone).marker;

  const size = selected ? 40 : 30;
  const ring = selected ? 3 : 2;

  const icon = L.divIcon({
    className: "citytrace-marker",
    html: `
      <span class="relative block" style="width:${size}px;height:${size}px">
        ${
          pulse
            ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.35;animation:marker-ping 2.4s ease-out infinite"></span>`
            : ""
        }
        <span style="
          position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          border-radius:9999px;background:${color};
          border:${ring}px solid #fff;
          box-shadow:0 2px 6px rgba(44,44,44,.35);
        ">
          <span style="width:${selected ? 10 : 7}px;height:${selected ? 10 : 7}px;border-radius:9999px;background:rgba(255,255,255,.9)"></span>
        </span>
      </span>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

/** Marker for the location the user is currently picking. */
export function getPinIcon(): L.DivIcon {
  const cached = iconCache.get("pin");
  if (cached) return cached;

  const icon = L.divIcon({
    className: "citytrace-marker",
    html: `
      <span style="display:block;width:34px;height:44px">
        <svg viewBox="0 0 24 30" width="34" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 29s10-9.2 10-17A10 10 0 1 0 2 12c0 7.8 10 17 10 17Z"
                fill="#853953" stroke="#fff" stroke-width="1.8"/>
          <circle cx="12" cy="11.5" r="3.6" fill="#fff"/>
        </svg>
      </span>
    `,
    iconSize: [34, 44],
    // Anchor at the pin tip, not its centre.
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });

  iconCache.set("pin", icon);
  return icon;
}
