"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getPinIcon } from "@/components/map/mapIcons";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  className?: string;
}

/**
 * Draggable-pin location picker.
 *
 * Lets the citizen correct GPS drift, which matters: an automatic
 * fix can land on the wrong side of a road, and dispatching a crew
 * to the wrong side of a dual carriageway wastes a visit.
 *
 * Loaded via next/dynamic (ssr: false) by its consumer — Leaflet
 * touches `window` at import time.
 */
export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  className,
}: LocationPickerMapProps) {
  const hasPosition = latitude !== null && longitude !== null;

  const center: [number, number] = hasPosition
    ? [latitude, longitude]
    : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

  return (
    <MapContainer
      center={center}
      zoom={hasPosition ? 17 : DEFAULT_MAP_ZOOM}
      scrollWheelZoom={false}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ClickHandler onChange={onChange} />
      {hasPosition && <RecenterOnChange lat={latitude} lng={longitude} />}

      {hasPosition && (
        <Marker
          position={[latitude, longitude]}
          icon={getPinIcon()}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng();
              onChange(lat, lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}

function ClickHandler({
  onChange,
}: {
  onChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onChange(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

/** Pans the map when the coordinates change from outside (GPS capture). */
function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true });
  }, [lat, lng, map]);

  return null;
}
