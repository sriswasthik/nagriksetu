"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { getStatusMarkerIcon } from "@/components/map/mapIcons";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";
import type { ComplaintStatus } from "@/types/complaint";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";

/**
 * Work-order statuses are a superset of complaint statuses (they add
 * approved / rework_requested / cancelled / created). Map them onto
 * the complaint status vocabulary so markers reuse the single shared
 * tone system rather than inventing a second colour scheme.
 */
const STATUS_TO_COMPLAINT: Record<WorkOrderStatus, ComplaintStatus> = {
  created: "submitted",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  proof_submitted: "proof_submitted",
  supervisor_review: "supervisor_review",
  approved: "resolved",
  completed: "resolved",
  rework_requested: "reopened",
  cancelled: "rejected",
};

interface WorkOrderMapInnerProps {
  workOrders: WorkOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function WorkOrderMapInner({
  workOrders,
  selectedId,
  onSelect,
}: WorkOrderMapInnerProps) {
  const located = useMemo(
    () =>
      workOrders.filter(
        (wo) =>
          typeof wo.location?.latitude === "number" &&
          typeof wo.location?.longitude === "number"
      ),
    [workOrders]
  );

  const center: [number, number] = located.length
    ? [located[0].location.latitude, located[0].location.longitude]
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
      <ZoomControl position="bottomright" />

      <FitBounds workOrders={located} />

      {located.map((order) => {
        const isSelected = order.id === selectedId;
        const isUrgentOpen =
          order.priorityLevel === "critical" &&
          !["completed", "approved", "cancelled"].includes(order.status);

        return (
          <Marker
            key={order.id}
            position={[order.location.latitude, order.location.longitude]}
            icon={getStatusMarkerIcon(STATUS_TO_COMPLAINT[order.status], {
              selected: isSelected,
              pulse: isUrgentOpen,
            })}
            keyboard
            title={order.complaintTitle}
            alt={`${order.complaintTitle} — ${order.location.address}`}
            eventHandlers={{
              click: () => onSelect(order.id),
              keypress: (event) => {
                const key = (event.originalEvent as KeyboardEvent).key;
                if (key === "Enter" || key === " ") onSelect(order.id);
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}

function FitBounds({ workOrders }: { workOrders: WorkOrder[] }) {
  const map = useMap();

  useEffect(() => {
    if (workOrders.length === 0) return;

    if (workOrders.length === 1) {
      map.setView(
        [workOrders[0].location.latitude, workOrders[0].location.longitude],
        15
      );
      return;
    }

    const bounds = L.latLngBounds(
      workOrders.map((wo) => [wo.location.latitude, wo.location.longitude])
    );

    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
  }, [workOrders, map]);

  return null;
}
