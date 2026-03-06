'use client'

import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import 'leaflet-defaulticon-compatibility'
import { useEffect } from 'react'

// This component makes the map follow your phone as you walk
function Recenter({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.setView(positions[positions.length - 1], map.getZoom());
    }
  }, [positions, map]);
  return null;
}

export default function SessionMap({ path }: { path: [number, number][] }) {
  // Default to Seattle coordinates if path is empty
  const center: [number, number] = path.length > 0 ? path[path.length - 1] : [47.606, -122.332];

  return (
    <div className="h-64 w-full bg-slate-900">
      <MapContainer 
        center={center} 
        zoom={16} 
        scrollWheelZoom={false} 
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {/* The Blue Line tracking your walk */}
        <Polyline 
          positions={path} 
          pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.7 }} 
        />
        <Recenter positions={path} />
      </MapContainer>
    </div>
  )
}
