import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
  }

  export const hasEnvVars = 
    process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined;

     // --- UPDATED CALCULATE DISTANCE ---
// This version takes 4 numbers, clearing your TypeScript error.
export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// These helpers are now wired to use the 4-number logic
export function getWaterWithinRadius(lat: number, lon: number, radiusMiles: number, waters: any[]): string[] {
  return waters
    .map(water => ({
      name: water.name,
      distance: calculateDistance(lat, lon, water.lat, water.lon)
    }))
    .filter(item => item.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .map(item => item.name);
}

export function getNearestWater(lat: number, lon: number, waters: any[]): string {
  const sorted = waters
    .map(w => ({
      name: w.name,
      distance: calculateDistance(lat, lon, w.lat, w.lon)
    }))
    .sort((a, b) => a.distance - b.distance);

  return sorted[0]?.name ?? "Unknown Water";
}