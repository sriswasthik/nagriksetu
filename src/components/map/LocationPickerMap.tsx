"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { useReducedMotion } from "framer-motion";
import "leaflet/dist/leaflet.css";

import { BaseTileLayer } from "@/components/map/BaseTileLayer";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { getPinIcon } from "@/components/map/mapIcons";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";
import {
  isRenderableCoordinate,
  normalizePickedCoordinate,
} from "@/lib/geo/coordinates";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  className?: string;
}

/**
 * Draggable-pin location picker.
 *
 * Lets the citizen correct GPS drift, which matters: an automatic fix can
 * land on the wrong side of a road, and dispatching a crew to the wrong
 * side of a dual carriageway wastes a visit.
 *
 * Loaded via next/dynamic (ssr: false) by its consumer — Leaflet touches
 * `window` at import time.
 *
 * COORDINATES ARE NORMALISED WHERE THEY ENTER
 *
 * A click and a marker drag both used to pass Leaflet's raw LatLng
 * straight out. Leaflet reports the longitude of the world copy that was
 * clicked, so panning east across the antimeridian and tapping produces
 * ~+540 for a place at ~-180 — the same spot, but a value the database
 * refuses. The citizen placed the pin accurately and would have been told
 * at the end of the form that their location was invalid.
 *
 * Wrapping at the point of entry means what they placed is what gets
 * stored. `worldCopyJump={false}` reduces how often it arises; the
 * normalisation is what makes it correct when it does.
 */
export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  className,
}: LocationPickerMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  /*
   * Validated, not just null-checked. A stale form value or a GPS fix
   * that reported 0,0 would otherwise place the draggable pin in the Gulf
   * of Guinea and centre the map there, which reads as the picker being
   * broken rather than as there being no location yet.
   */
  const hasPosition = isRenderableCoordinate(latitude, longitude);

  const center: [number, number] = hasPosition
    ? [latitude as number, longitude as number]
    : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

  /*
   * The picker is the fallback when GPS is denied or unavailable, so it
   * has to keep working without tiles: the pin, the coordinate readout
   * and the address field are all still usable. Saying the imagery failed
   * beats a pin floating in grey, which reads as a broken pin.
   */
  if (tilesFailed) {
    return (
      <MapUnavailable
        reason="tiles-failed"
        latitude={latitude}
        longitude={longitude}
        className={className}
      />
    );
  }

  function handlePick(rawLatitude: number, rawLongitude: number) {
    const picked = normalizePickedCoordinate(rawLatitude, rawLongitude);

    // Null only for a genuinely unusable pick — a latitude outside ±90,
    // which Leaflet clamps, so in practice this is belt and braces.
    if (picked) onChange(picked.latitude, picked.longitude);
  }

  return (
    <MapContainer
      center={center}
      zoom={hasPosition ? 17 : DEFAULT_MAP_ZOOM}
      scrollWheelZoom={false}
      // No wrapped world copies to click on, so an antimeridian longitude
      // is rare rather than merely handled.
      worldCopyJump={false}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <BaseTileLayer onUnavailable={() => setTilesFailed(true)} />

      <ClickHandler onPick={handlePick} />
      {hasPosition && (
        <RecenterOnChange
          lat={latitude as number}
          lng={longitude as number}
        />
      )}

      {hasPosition && (
        <Marker
          position={[latitude as number, longitude as number]}
          icon={getPinIcon()}
          draggable
          // Keyboard-reachable, so correcting the pin is not pointer-only.
          keyboard
          title="Drag to correct the location"
          alt="Report location — drag to correct"
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng();
              handlePick(lat, lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

/** Pans the map when the coordinates change from outside (GPS capture). */
function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 17), {
      // A pan-and-zoom across the viewport is the motion
      // prefers-reduced-motion is for. The destination is the same either
      // way.
      animate: !reducedMotion,
    });
  }, [lat, lng, map, reducedMotion]);

  return null;
}
