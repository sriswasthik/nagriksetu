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
import type { ComplaintStatus } from "@/types/complaint";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";

/**
 * work_order_status and complaint_status share their vocabulary, so
 * markers reuse the single shared tone system rather than inventing a
 * second colour scheme.
 */
const STATUS_TO_COMPLAINT: Record<WorkOrderStatus, ComplaintStatus> = {
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  proof_submitted: "proof_submitted",
  supervisor_review: "supervisor_review",
  citizen_confirmation: "citizen_confirmation",
  resolved: "resolved",
  reopened: "reopened",
};

interface WorkOrderMapInnerProps {
  workOrders: WorkOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** A work order with somewhere to be drawn. */
type LocatedWorkOrder = WorkOrder & { point: Coordinates };

/**
 * The authority hotspot map and the officer map.
 *
 * WHAT CHANGED
 *
 * The filter was `typeof wo.location?.latitude === "number"`, and
 * `typeof NaN === "number"` is true — so it let through exactly the
 * values it was meant to catch. Worse, `mapWorkOrder()` coalesced a
 * missing latitude to 0, so an unlocated work order arrived here as a
 * perfectly well-typed 0,0 that this check happily accepted.
 *
 * The result was FitBounds framing a box from the city to the Gulf of
 * Guinea: every real marker collapsed to a pixel because one row had no
 * coordinates. On the authority map, which loads every work order in the
 * city, one such row was enough.
 */
export default function WorkOrderMapInner({
  workOrders,
  selectedId,
  onSelect,
}: WorkOrderMapInnerProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  const located = useMemo<LocatedWorkOrder[]>(
    () =>
      workOrders.flatMap((order) => {
        const point = toCoordinates(
          order.location?.latitude,
          order.location?.longitude
        );

        return point ? [{ ...order, point }] : [];
      }),
    [workOrders]
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
      worldCopyJump={false}
      style={{ height: "100%", width: "100%" }}
    >
      <BaseTileLayer onUnavailable={() => setTilesFailed(true)} />
      <ZoomControl position="bottomright" />

      <FitBounds workOrders={located} />

      {located.map((order) => {
        const isSelected = order.id === selectedId;
        const isUrgentOpen =
          order.priorityLevel === "critical" &&
          !["resolved"].includes(order.status);

        return (
          <Marker
            key={order.id}
            position={[order.point.latitude, order.point.longitude]}
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

function FitBounds({ workOrders }: { workOrders: LocatedWorkOrder[] }) {
  const map = useMap();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (workOrders.length === 0) return;

    if (workOrders.length === 1) {
      map.setView(
        [workOrders[0].point.latitude, workOrders[0].point.longitude],
        15,
        { animate: !reducedMotion }
      );
      return;
    }

    const bounds = L.latLngBounds(
      workOrders.map((wo) => [wo.point.latitude, wo.point.longitude])
    );

    map.fitBounds(bounds, {
      padding: [56, 56],
      maxZoom: 15,
      animate: !reducedMotion,
    });
  }, [workOrders, map, reducedMotion]);

  return null;
}
