"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { getStatusMarkerIcon } from "@/components/map/mapIcons";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";
import type { Complaint } from "@/types/complaint";

export interface IssuesMapInnerProps {
  complaints: Complaint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}

/**
 * Multi-issue map.
 *
 * Markers are coloured by status from the shared tone system, so map
 * colour always agrees with the badges elsewhere. Critical open
 * issues pulse to draw the eye without needing a separate legend
 * colour.
 */
export default function IssuesMapInner({
  complaints,
  selectedId,
  onSelect,
}: IssuesMapInnerProps) {
  const located = useMemo(
    () =>
      complaints.filter(
        (c) => c.latitude !== null && c.longitude !== null
      ),
    [complaints]
  );

  const center: [number, number] = located.length
    ? [located[0].latitude as number, located[0].longitude as number]
    : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_MAP_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

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
            position={[complaint.latitude as number, complaint.longitude as number]}
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
function FitToMarkers({ complaints }: { complaints: Complaint[] }) {
  const map = useMap();

  useEffect(() => {
    if (complaints.length === 0) return;

    if (complaints.length === 1) {
      map.setView(
        [complaints[0].latitude as number, complaints[0].longitude as number],
        16
      );
      return;
    }

    const bounds = L.latLngBounds(
      complaints.map((c) => [c.latitude as number, c.longitude as number])
    );

    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
    // Only on dataset change — re-running would fight the user's panning.
  }, [complaints, map]);

  return null;
}

/** Centres the map when a card in the side list is chosen. */
function FlyToSelected({
  complaints,
  selectedId,
}: {
  complaints: Complaint[];
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;

    const match = complaints.find((c) => c.id === selectedId);
    if (!match) return;

    map.flyTo(
      [match.latitude as number, match.longitude as number],
      Math.max(map.getZoom(), 16),
      { duration: 0.6 }
    );
  }, [selectedId, complaints, map]);

  return null;
}
