"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, useMap, ZoomControl } from "react-leaflet";
import { useReducedMotion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { BaseTileLayer } from "@/components/map/BaseTileLayer";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { getStatusMarkerIcon } from "@/components/map/mapIcons";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";
import { toCoordinates, type Coordinates } from "@/lib/geo/coordinates";
import type { Complaint } from "@/types/complaint";

export interface IssuesMapInnerProps {
  complaints: Complaint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}

/** A complaint that has somewhere to be drawn. */
type LocatedComplaint = Complaint & { point: Coordinates };

/**
 * Multi-issue map.
 *
 * Markers are coloured by status from the shared tone system, so map
 * colour always agrees with the badges elsewhere. Critical open issues
 * pulse to draw the eye without needing a separate legend colour.
 *
 * WHAT CHANGED, AND WHY IT MATTERED
 *
 * The filter was `latitude !== null && longitude !== null`, which passes
 * NaN and out-of-range values, and every use site then cast with
 * `as number`. The damaging consequence was in FitToMarkers: a bounding
 * box over a real city plus one stray 0,0 spans from India to the Gulf of
 * Guinea, so `fitBounds` framed a hemisphere and every genuine marker
 * became a pixel. One unlocated row broke the whole map.
 *
 * Filtering through `toCoordinates` narrows the type as well as the data,
 * so the casts are gone and an unusable row cannot reach Leaflet.
 */
export default function IssuesMapInner({
  complaints,
  selectedId,
  onSelect,
}: IssuesMapInnerProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  const located = useMemo<LocatedComplaint[]>(
    () =>
      complaints.flatMap((complaint) => {
        const point = toCoordinates(complaint.latitude, complaint.longitude);

        return point ? [{ ...complaint, point }] : [];
      }),
    [complaints]
  );

  const center: [number, number] = located.length
    ? [located[0].point.latitude, located[0].point.longitude]
    : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

  if (tilesFailed) {
    return <MapUnavailable reason="tiles-failed" />;
  }

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_MAP_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      // Without this Leaflet repeats the world sideways, and a marker can
      // then be reached at a longitude beyond ±180 — the same place, but
      // not the value anything else in the product deals in.
      worldCopyJump={false}
      maxBoundsViscosity={1}
      style={{ height: "100%", width: "100%" }}
    >
      <BaseTileLayer onUnavailable={() => setTilesFailed(true)} />

      {/* Bottom-right keeps controls clear of the details panel. */}
      <ZoomControl position="bottomright" />

      <FitToMarkers complaints={located} />
      <FlyToSelected complaints={located} selectedId={selectedId} />

      {located.map((complaint) => {
        const isSelected = complaint.id === selectedId;
        const isUrgentOpen =
          complaint.priority_level === "critical" &&
          !["resolved", "rejected"].includes(complaint.status);

        return (
          <Marker
            key={complaint.id}
            position={[complaint.point.latitude, complaint.point.longitude]}
            icon={getStatusMarkerIcon(complaint.status, {
              selected: isSelected,
              pulse: isUrgentOpen,
            })}
            // Marker keyboard focus + activation, so the map is not
            // pointer-only.
            keyboard
            title={complaint.title}
            alt={`${complaint.title} — ${complaint.address ?? "location recorded"}`}
            eventHandlers={{
              click: () => onSelect(complaint.id),
              keypress: (event) => {
                const key = (event.originalEvent as KeyboardEvent).key;
                if (key === "Enter" || key === " ") onSelect(complaint.id);
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}

/** Frames all markers on first load so nothing sits off-screen. */
function FitToMarkers({ complaints }: { complaints: LocatedComplaint[] }) {
  const map = useMap();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (complaints.length === 0) return;

    if (complaints.length === 1) {
      map.setView(
        [complaints[0].point.latitude, complaints[0].point.longitude],
        16,
        { animate: !reducedMotion }
      );
      return;
    }

    const bounds = L.latLngBounds(
      complaints.map((c) => [c.point.latitude, c.point.longitude])
    );

    map.fitBounds(bounds, {
      padding: [48, 48],
      maxZoom: 16,
      animate: !reducedMotion,
    });
    // Only on dataset change — re-running would fight the user's panning.
  }, [complaints, map, reducedMotion]);

  return null;
}

/** Centres the map when a card in the side list is chosen. */
function FlyToSelected({
  complaints,
  selectedId,
}: {
  complaints: LocatedComplaint[];
  selectedId: string | null;
}) {
  const map = useMap();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!selectedId) return;

    const match = complaints.find((c) => c.id === selectedId);
    if (!match) return;

    const target: [number, number] = [
      match.point.latitude,
      match.point.longitude,
    ];
    const zoom = Math.max(map.getZoom(), 16);

    /*
     * flyTo animates a zoom-and-pan arc, which is exactly the kind of
     * large-area motion prefers-reduced-motion exists to suppress — and
     * it can trigger discomfort in people who set it. setView arrives at
     * the same place instantly.
     */
    if (reducedMotion) {
      map.setView(target, zoom, { animate: false });
      return;
    }

    map.flyTo(target, zoom, { duration: 0.6 });
  }, [selectedId, complaints, map, reducedMotion]);

  return null;
}
