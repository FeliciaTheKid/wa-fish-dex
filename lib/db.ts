import Dexie, { Table } from 'dexie';

export interface LakeLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  county?: string;
  water_type?: string;
  species_present?: string[]; // Added for Tactical Intel sync
  has_boat_launch?: boolean;  // Added for Tactical Intel sync
  wdfw_url?: string;
}

export interface LocalSpecies {
  id: string;
  name: string;
  weight: number;
  length: number;
  lure?: string;
  date: string;
  location: string;
  sessionId: string;
  synced: number;
  // ✅ Added for Shellfish support
  keeperCount?: number;
  soakTime?: number;
  media?: string[];
}

export interface LocalSession {
  id: string;
  type: 'freshwater' | 'saltwater' | 'shellfish'; // ✅ Added trip type
  location: string;
  startTime: string;
  duration?: string;
  notes: string;
  temp: string;
  wind: string;
  cond: string;
  lat: number | null;
  lon: number | null;
  synced: number;
  tides?: { high: string, low: string };
}

export class OfflineVault extends Dexie {
  localSpecies!: Table<LocalSpecies>;
  localSessions!: Table<LocalSession>;
  fishingLocations!: Table<LakeLocation>;

  constructor() {
    super('OfflineVault');
    
    // ⚡ Version 4: Optimized for Tactical filtering
    this.version(4).stores({
      localSpecies: 'id, sessionId, synced, name, location',
      localSessions: 'id, synced, startTime, type', 
      fishingLocations: 'id, name, [lat+lon]' // Compound index for proximity searches
    });
  }
}

export const db = new OfflineVault();