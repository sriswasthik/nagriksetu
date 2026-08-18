"use client";

import { useState } from "react";
import { MapContainer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { BaseTileLayer } from "@/components/map/BaseTileLayer";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { getStatusMarkerIcon } from "@/components/map/mapIcons";
import type { ComplaintStatus } from "@/types/complaint";

interface StaticLocationMapInnerProps {
  /** Already validated by StaticLocationMap — guaranteed to be a place. */
  latitude: number;
  longitude: number;
  status?: ComplaintStatus;
}

/**
 * Non-interactive map showing one point. Loaded only via next/dynamic
 * from StaticLocationMap — Leaflet touches `window` at import time, so it
 * must never reach the server bundle.
 */
export default function StaticLocationMapInner({
  latitude,
  longitude,
  status = "submitted",
}: StaticLocationMapInnerProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  /*
   * A pin floating in flat grey is indistinguishable from a pin in the
   * wrong place, so a tile failure says so and offers the coordinates —
   * which is what somebody navigating to the site actually needs.
   */
  if (tilesFailed) {
    return (
      <MapUnavailable
        reason="tiles-failed"
        latitude={latitude}
        longitude={longitude}
      />
    );
  }

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={16}
      // Fully inert: this is a figure, not a control. Also prevents
      // the map from swallowing page scroll on touch devices.
      dragging={false}
      touchZoom={false}
      doubleClickZoom={false}
      scrollWheelZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
      attributionControl
      // No world copies: without this Leaflet paints the map repeating
      // sideways, which on a narrow figure reads as a rendering fault.
      worldCopyJump={false}
      style={{ height: "100%", width: "100%" }}
    >
      <BaseTileLayer onUnavailable={() => setTilesFailed(true)} />
      <Marker
        position={[latitude, longitude]}
        icon={getStatusMarkerIcon(status, { selected: true })}
      />
    </MapContainer>
  );
}
