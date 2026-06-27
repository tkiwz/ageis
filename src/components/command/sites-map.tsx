"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Site {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  status: string;
  riskLevel: string;
  latitude: number | null;
  longitude: number | null;
  activeIncidents: number;
  activePermits: number;
  sensorCount: number;
}

function riskToColor(level: string): string {
  switch (level) {
    case "CRITICAL": return "#ef4444";
    case "HIGH":     return "#f59e0b";
    case "MEDIUM":   return "#eab308";
    case "LOW":      return "#10b981";
    default:         return "#6b7280";
  }
}

export function SitesMap({ sites }: { sites: Site[] }) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [21.5, 56.0],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles © Esri",
        maxZoom: 19,
      }
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    sites.forEach((site) => {
      if (site.latitude == null || site.longitude == null) return;

      const color = riskToColor(site.riskLevel);
      const hasIncidents = site.activeIncidents > 0;

      const html = `
        <div style="
          position: relative;
          width: 32px; height: 32px;
        ">
          ${hasIncidents ? `<div style="
            position: absolute; inset: -4px;
            border-radius: 50%;
            background: ${color};
            opacity: 0.3;
            animation: pulse 2s ease-out infinite;
          "></div>` : ''}
          <div style="
            position: absolute; inset: 0;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: bold; color: white;
            font-family: system-ui;
          ">${hasIncidents ? site.activeIncidents : ''}</div>
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.5; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        </style>
      `;

      const icon = L.divIcon({
        className: "site-marker",
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([site.latitude, site.longitude], { icon }).addTo(map);

      const popupHtml = `
        <div style="font-family: system-ui; min-width: 220px;">
          <div style="font-size: 10px; opacity: 0.6; font-family: monospace;">${site.code}</div>
          <div style="font-weight: 600; font-size: 15px; margin-top: 2px;">${site.name}</div>
          ${site.nameAr ? `<div style="font-size: 12px; opacity: 0.7; direction: rtl; margin-top: 2px;">${site.nameAr}</div>` : ''}
          <div style="margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; font-size: 10px;">
            <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 999px; font-weight: bold; letter-spacing: 0.5px;">${site.riskLevel}</span>
            <span style="background: #e5e7eb; color: #374151; padding: 2px 8px; border-radius: 999px;">${site.status}</span>
          </div>
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; display: flex; gap: 10px;">
            <span><strong style="color: ${hasIncidents ? '#ef4444' : '#374151'};">${site.activeIncidents}</strong> incidents</span>
            <span><strong>${site.activePermits}</strong> permits</span>
            <span><strong>${site.sensorCount}</strong> sensors</span>
          </div>
          <a href="/operations/sites/${site.id}" style="display: inline-block; margin-top: 10px; font-size: 11px; color: #3b82f6; text-decoration: none; font-weight: 500;">View details →</a>
        </div>
      `;

      marker.bindPopup(popupHtml);
      markersRef.current.push(marker);
    });
  }, [sites]);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%", borderRadius: "12px", overflow: "hidden" }}
    />
  );
}