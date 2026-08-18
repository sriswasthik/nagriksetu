"use client";

import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";

/**
 * ============================================================
 * THE BASE MAP
 * ============================================================
 *
 * One tile layer for every map in the product, so the attribution, the
 * zoom ceiling and — the part that was missing everywhere — the
 * behaviour when tiles do not arrive are the same on all of them.
 *
 * WHY TILE FAILURE NEEDS HANDLING
 *
 * Four maps each configured their own `<TileLayer>` and none listened for
 * `tileerror`. When tiles fail — an offline device, a captive portal, a
 * network that blocks openstreetmap.org, or OSM's own rate limiting — the
 * container stays up, the markers render, and the background is a flat
 * grey void. A citizen looking at a pin floating in grey cannot tell
 * whether the pin is wrong, the map is broken, or their report has no
 * location. All three look identical.
 *
 * So a failure is stated. Markers and coordinates are still shown,
 * because they are the information; the missing thing is the imagery.
 *
 * A single failed tile is not a failure — one 404 at the edge of a pan
 * is routine. It takes a few, which distinguishes "one tile missing"
 * from "there is no map".
 */

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** OSM serves to 19; asking beyond it produces guaranteed 404s. */
const MAX_TILE_ZOOM = 19;

/**
 * Failures before the map is called broken.
 *
 * Low enough to catch a genuinely unreachable tile server on first
 * paint — a viewport is a dozen or so tiles — and high enough that the
 * odd missing tile mid-pan does not raise an alarm.
 */
const TILE_ERROR_THRESHOLD = 4;

export interface BaseTileLayerProps {
  /** Called the first time enough tiles have failed to matter. */
  onUnavailable?: () => void;
}

export function BaseTileLayer({ onUnavailable }: BaseTileLayerProps) {
  const map = useMap();
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const report = onUnavailable;
    if (!report) return;

    let failures = 0;
    let done = reported;

    // Arrow consts, not `function` declarations: a hoisted declaration is
    // not narrowed by the guard above, so `report` would read as possibly
    // undefined inside it.
    const onTileError = () => {
      failures += 1;

      if (!done && failures >= TILE_ERROR_THRESHOLD) {
        done = true;
        setReported(true);
        report();
      }
    };

    /*
     * A successful load clears the count. Otherwise a map that has been
     * panned around for a while accumulates stray failures and eventually
     * declares itself broken while working perfectly.
     */
    const onTileLoad = () => {
      failures = 0;
    };

    map.on("tileerror", onTileError);
    map.on("tileload", onTileLoad);

    return () => {
      map.off("tileerror", onTileError);
      map.off("tileload", onTileLoad);
    };
  }, [map, onUnavailable, reported]);

  return (
    <TileLayer
      attribution={ATTRIBUTION}
      url={TILE_URL}
      maxZoom={MAX_TILE_ZOOM}
      /*
       * Keep stale tiles on screen while new ones load, so panning does
       * not flash grey. It also means a partial outage degrades to an
       * older view rather than to nothing.
       */
      keepBuffer={2}
    />
  );
}

export { MAX_TILE_ZOOM, TILE_URL, ATTRIBUTION };
