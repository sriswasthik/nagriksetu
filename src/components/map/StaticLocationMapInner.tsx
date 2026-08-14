"use client";

import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getStatusMarkerIcon } from "@/components/map/mapIcons";
import type { ComplaintStatus } from "@/types/complaint";

interface StaticLocationMapInnerProps {
  latitude: number;
  longitude: number;
  status?: ComplaintStatus;
}

/**
 * Non-interactive map showing one point. Loaded only via
 * next/dynamic from StaticLocationMap — Leaflet touches `window`
 * at import time, so it must never reach the server bundle.
 */
export default function StaticLocationMapInner({
  latitude,
  longitude,
  status = "submitted",
}: StaticLocationMapInnerProps) {
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
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Marker
        position={[latitude, longitude]}
        icon={getStatusMarkerIcon(status, { selected: true })}
      />
    </MapContainer>
  );
}
