import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Lang } from '../i18n/translations';
import { buildMapPopupHtml, escapeHtml } from '../lib/geolocation';

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  hours?: string;
  distanceKm?: number;
  mapsUrl?: string;
  verified?: boolean;
}

export interface MapUserLocation {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  label?: string;
}

export interface MapViewportCommand {
  lat: number;
  lng: number;
  zoom?: number;
  seq: number;
  openMarkerId?: string | number | null;
  openUserPopup?: boolean;
}

interface LeafletMapProps {
  centerLat: number;
  centerLng: number;
  farmerLabel: string;
  markers: MapMarker[];
  selectedMarkerId?: string | number | null;
  onSelectMarker?: (id: string | number) => void;
  userLocation?: MapUserLocation | null;
  viewportCommand?: MapViewportCommand | null;
  lang?: Lang;
  heightClass?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  centerLat,
  centerLng,
  farmerLabel,
  markers,
  selectedMarkerId = null,
  onSelectMarker,
  userLocation = null,
  viewportCommand = null,
  lang = 'en',
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLookupRef = useRef<Map<string | number, L.CircleMarker>>(new Map());
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const onSelectMarkerRef = useRef(onSelectMarker);
  const prevCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const activePopupIdRef = useRef<string | number | null>(null);

  onSelectMarkerRef.current = onSelectMarker;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: 12,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    userLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    prevCenterRef.current = { lat: centerLat, lng: centerLng };

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 60);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      userLayerRef.current = null;
      markersLayerRef.current = null;
      markerLookupRef.current.clear();
      userMarkerRef.current = null;
    };
  }, []);

  // Re-center only if base taluk center prop actually changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prevCenterRef.current) return;
    if (
      Math.abs(prevCenterRef.current.lat - centerLat) > 0.0001 ||
      Math.abs(prevCenterRef.current.lng - centerLng) > 0.0001
    ) {
      prevCenterRef.current = { lat: centerLat, lng: centerLng };
      map.setView([centerLat, centerLng], 12, { animate: true });
    }
  }, [centerLat, centerLng]);

  // Draw current GPS location (blue marker + accuracy circle) or fallback taluk center marker
  useEffect(() => {
    const userLayer = userLayerRef.current;
    if (!userLayer) return;
    userLayer.clearLayers();
    userMarkerRef.current = null;

    const isKn = lang === 'kn';

    if (userLocation) {
      const clampedAccuracy = Math.max(25, Math.min(userLocation.accuracyMeters ?? 120, 2500));
      L.circle([userLocation.lat, userLocation.lng], {
        radius: clampedAccuracy,
        color: '#2563EB',
        weight: 1.5,
        fillColor: '#3B82F6',
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(userLayer);

      const accuracyLabel =
        typeof userLocation.accuracyMeters === 'number' && Number.isFinite(userLocation.accuracyMeters)
          ? ` (±${Math.round(userLocation.accuracyMeters)} m)`
          : '';
      const locTitle = userLocation.label || (isKn ? 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳ' : 'Your Current Location');

      const gpsMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 9,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#2563EB',
        fillOpacity: 1,
      })
        .addTo(userLayer)
        .bindPopup(
          `<div style="font-family:inherit;font-size:12px"><strong>${escapeHtml(
            locTitle
          )}</strong><div style="margin-top:2px;color:#475569">${userLocation.lat.toFixed(
            5
          )}, ${userLocation.lng.toFixed(5)}${escapeHtml(accuracyLabel)}</div></div>`
        );

      userMarkerRef.current = gpsMarker;
    } else {
      L.circleMarker([centerLat, centerLng], {
        radius: 8,
        color: '#155E34',
        weight: 2.5,
        fillColor: '#22C55E',
        fillOpacity: 0.85,
      })
        .addTo(userLayer)
        .bindPopup(
          `<div style="font-family:inherit;font-size:12px"><strong>${escapeHtml(
            farmerLabel
          )}</strong><div style="margin-top:2px;color:#475569">${
            isKn ? 'ಆಯ್ದ ತಾಲ್ಲೂಕು ಕೇಂದ್ರ' : 'Selected taluk center'
          }</div></div>`
        );
    }
  }, [userLocation, centerLat, centerLng, farmerLabel, lang]);

  // Draw shop/service markers and bind bilingual popups
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    const map = mapRef.current;
    if (!markersLayer || !map) return;

    markersLayer.clearLayers();
    markerLookupRef.current.clear();

    markers.forEach((m) => {
      const isSelected = selectedMarkerId !== null && String(selectedMarkerId) === String(m.id);
      const baseColor = m.verified ? '#155E34' : '#B45309';
      const fillColor = m.verified ? '#16A34A' : '#F59E0B';

      const circle = L.circleMarker([m.lat, m.lng], {
        radius: isSelected ? 11 : 8,
        color: isSelected ? '#0F172A' : baseColor,
        weight: isSelected ? 3.5 : 2,
        fillColor: isSelected ? (m.verified ? '#15803D' : '#D97706') : fillColor,
        fillOpacity: isSelected ? 1 : 0.88,
      }).addTo(markersLayer);

      circle.bindPopup(buildMapPopupHtml(m, lang));

      circle.on('click', () => {
        activePopupIdRef.current = m.id;
        map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
        onSelectMarkerRef.current?.(m.id);
      });

      if (isSelected) {
        circle.bringToFront();
      }

      markerLookupRef.current.set(m.id, circle);
    });

    if (
      activePopupIdRef.current !== null &&
      selectedMarkerId !== null &&
      String(activePopupIdRef.current) === String(selectedMarkerId)
    ) {
      const target = markerLookupRef.current.get(selectedMarkerId);
      if (target) {
        target.openPopup();
      }
    }
  }, [markers, selectedMarkerId, lang]);

  // Smooth pan/zoom & open popup on explicit viewport command (card click / My Location / Taluk fallback)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewportCommand) return;

    const targetZoom = viewportCommand.zoom ?? Math.max(map.getZoom(), 14);
    map.flyTo([viewportCommand.lat, viewportCommand.lng], targetZoom, { duration: 0.55 });

    if (viewportCommand.openMarkerId !== undefined && viewportCommand.openMarkerId !== null) {
      activePopupIdRef.current = viewportCommand.openMarkerId;
      const targetMarker = markerLookupRef.current.get(viewportCommand.openMarkerId);
      if (targetMarker) {
        targetMarker.openPopup();
      }
    } else if (viewportCommand.openUserPopup && userMarkerRef.current) {
      activePopupIdRef.current = null;
      userMarkerRef.current.openPopup();
    } else {
      activePopupIdRef.current = null;
      map.closePopup();
    }
  }, [viewportCommand]);

  return (
    <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
