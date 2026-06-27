"use client";

import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type DroneStatus = "PATROLLING" | "IDLE" | "RETURNING" | "CHARGING";

export interface MapDrone {
  id: string;
  code: string;
  status: DroneStatus;
  lat: number;
  lng: number;
  homeLat: number;
  homeLng: number;
  battery: number;
  waypoints: { lat: number; lng: number }[];
}

export interface MapDetection {
  id: string;
  lat: number;
  lng: number;
  type: string;
  severity: "HIGH" | "CRITICAL";
  timestamp: Date;
}

interface Props {
  drones: MapDrone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  flashDrone: string | null;
  detections: MapDetection[];
}

const STATUS_COLOR: Record<DroneStatus, string> = {
  PATROLLING: "#10b981",
  RETURNING:  "#f59e0b",
  CHARGING:   "#3b82f6",
  IDLE:       "#6b7280",
};

let cssInjected = false;
function injectPulseCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes drone-ring {
      0%   { transform: translate(-50%,-50%) scale(1); opacity: 0.7; }
      100% { transform: translate(-50%,-50%) scale(2.8); opacity: 0; }
    }
    @keyframes alert-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(s);
}

function makeDroneIcon(color: string, code: string, battery: number, status: DroneStatus) {
  injectPulseCSS();
  const low = battery < 20;
  const patrolling = status === "PATROLLING";
  const returning = status === "RETURNING";

  const ring = (patrolling || returning) ? `
    <div style="
      position:absolute; top:50%; left:50%;
      width:52px; height:52px;
      border:2px solid ${color};
      border-radius:50%;
      opacity:0.6;
      animation:drone-ring ${patrolling ? "2s" : "1.2s"} ease-out infinite;
    "></div>` : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:0;height:0">
        ${ring}
        <svg
          viewBox="0 0 56 56"
          style="position:absolute;top:-28px;left:-28px;width:56px;height:56px;z-index:2"
        >
          <!-- body -->
          <circle cx="28" cy="28" r="10" fill="${color}" stroke="white" stroke-width="2.5"/>
          <!-- rotors & arms -->
          <line x1="21" y1="21" x2="13" y2="13" stroke="${color}" stroke-width="2"/>
          <circle cx="13" cy="13" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
          <line x1="35" y1="21" x2="43" y2="13" stroke="${color}" stroke-width="2"/>
          <circle cx="43" cy="13" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
          <line x1="35" y1="35" x2="43" y2="43" stroke="${color}" stroke-width="2"/>
          <circle cx="43" cy="43" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
          <line x1="21" y1="35" x2="13" y2="43" stroke="${color}" stroke-width="2"/>
          <circle cx="13" cy="43" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
        </svg>
        <!-- label -->
        <div style="
          position:absolute;
          top:30px; left:50%; transform:translateX(-50%);
          white-space:nowrap;
          font-size:10px; font-weight:700;
          color:${low ? "#ef4444" : "white"};
          background:rgba(0,0,0,0.75);
          padding:1px 5px; border-radius:3px;
          border:1px solid ${low ? "#ef4444" : "transparent"};
          z-index:3;
        ">${code}${low ? " ⚡" : ""}</div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function makeAlertIcon(type: string, severity: "HIGH" | "CRITICAL") {
  const color = severity === "CRITICAL" ? "#ef4444" : "#f59e0b";
  return L.divIcon({
    className: "",
    html: `
      <div style="
        background:${color}cc;
        color:white; font-size:10px; font-weight:700;
        padding:3px 7px; border-radius:5px;
        white-space:nowrap;
        border:1px solid ${color};
        box-shadow:0 0 12px ${color};
        animation:alert-blink 1s ease-in-out infinite;
      ">⚠ ${type.replace(/_/g, " ")}</div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 20],
  });
}

export function DroneMap({ drones, selectedId, onSelect, flashDrone, detections }: Props) {
  return (
    <MapContainer
      center={[22.3, 57.0]}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      {/* Real satellite imagery from ESRI — free, no key needed */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
        maxZoom={19}
      />
      {/* Place name labels on top of satellite */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        opacity={0.6}
      />

      {/* Patrol routes — dashed lines */}
      {drones.map((d) => (
        <Polyline
          key={`route-${d.id}`}
          positions={[
            ...d.waypoints.map((w) => [w.lat, w.lng] as [number, number]),
            [d.waypoints[0].lat, d.waypoints[0].lng],
          ]}
          color={STATUS_COLOR[d.status]}
          weight={1.5}
          dashArray="7,5"
          opacity={0.45}
        />
      ))}

      {/* Drones */}
      {drones.map((d) => {
        const color = flashDrone === d.id ? "#ef4444" : STATUS_COLOR[d.status];
        return (
          <Marker
            key={d.id}
            position={[d.lat, d.lng]}
            icon={makeDroneIcon(color, d.code, d.battery, d.status)}
            eventHandlers={{
              click: () => onSelect(d.id === selectedId ? null : d.id),
            }}
          />
        );
      })}

      {/* Active detection markers */}
      {detections.map((det) => {
        if (Date.now() - det.timestamp.getTime() > 30000) return null;
        return (
          <Marker
            key={det.id}
            position={[det.lat, det.lng]}
            icon={makeAlertIcon(det.type, det.severity)}
          />
        );
      })}
    </MapContainer>
  );
}