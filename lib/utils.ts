import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const hasEnvVars = 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined;

// --- EXPANDED WASHINGTON WATER DATABASE ---
const WATER_DB = [
  // SEATTLE & METRO LAKES
  { name: "Lake Washington", lat: 47.6223, lon: -122.2307, type: "lake" },
  { name: "Lake Union", lat: 47.6335, lon: -122.3338, type: "lake" },
  { name: "Green Lake", lat: 47.6786, lon: -122.3418, type: "lake" },
  { name: "Lake Sammamish", lat: 47.6015, lon: -122.0945, type: "lake" },
  { name: "Haller Lake", lat: 47.7214, lon: -122.3379, type: "lake" },
  { name: "Bitter Lake", lat: 47.7262, lon: -122.3533, type: "lake" },

  // RIVERS (Main Stems & Forks)
  { name: "Snoqualmie River (Main)", lat: 47.6562, lon: -121.8906, type: "river" },
  { name: "Snoqualmie River (Middle Fork)", lat: 47.5458, lon: -121.7251, type: "river" },
  { name: "Skykomish River", lat: 47.8422, lon: -121.8598, type: "river" },
  { name: "Cedar River", lat: 47.4815, lon: -122.2032, type: "river" },
  { name: "Duwamish River", lat: 47.5342, lon: -122.3168, type: "river" },
  { name: "Stillaguamish River", lat: 48.2045, lon: -122.1287, type: "river" },

  // CREEKS (Fishable/Legal)
  { name: "Coal Creek", lat: 47.5673, lon: -122.1812, type: "creek" },
  { name: "Thornton Creek", lat: 47.7024, lon: -122.2741, type: "creek" },
  { name: "Pugh Creek", lat: 48.1756, lon: -121.3651, type: "creek" },
  { name: "Raging River", lat: 47.5251, lon: -121.8845, type: "creek" },

  // NATIONAL FORESTS & STATE PARKS (Mt. Baker-Snoqualmie / Alpine Lakes)
  { name: "Baker Lake", lat: 48.7161, lon: -121.6166, type: "lake" },
  { name: "Gold Creek Pond", lat: 47.3879, lon: -121.3789, type: "lake" },
  { name: "Annette Lake", lat: 47.3786, lon: -121.4682, type: "lake" },
  { name: "Pratt Lake", lat: 47.4526, lon: -121.5034, type: "lake" },
  { name: "Rattlesnake Lake", lat: 47.4337, lon: -121.7674, type: "lake" },
  { name: "Wallace Lake", lat: 47.8932, lon: -121.6575, type: "lake" },

  // SALTWATER / PUGET SOUND
  { name: "Elliott Bay", lat: 47.6038, lon: -122.3522, type: "marine" },
  { name: "Shilshole Bay", lat: 47.6837, lon: -122.4082, type: "marine" },
  { name: "Alki Point", lat: 47.5763, lon: -122.4196, type: "marine" },
  { name: "Discovery Bay", lat: 48.0163, lon: -122.8796, type: "marine" }
];

export function calculateDistance(lat1: number, lon1: number, waterName: string): number {
  const water = WATER_DB.find(w => w.name === waterName);
  if (!water) return 999;

  const R = 3958.8; // Earth radius in miles
  const dLat = (water.lat - lat1) * Math.PI / 180;
  const dLon = (water.lon - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(water.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getWaterWithinRadius(lat: number, lon: number, radiusMiles: number): string[] {
  return WATER_DB
    .map(water => ({
      name: water.name,
      distance: calculateDistance(lat, lon, water.name)
    }))
    // We filter for a larger radius for National Forest spots (e.g., 50 miles)
    // but the UI will show the closest first.
    .filter(item => item.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .map(item => item.name);
}

export function getNearestWater(lat: number, lon: number): string {
  const nearby = getWaterWithinRadius(lat, lon, 100); 
  return nearby[0] || "Unknown Water";
}