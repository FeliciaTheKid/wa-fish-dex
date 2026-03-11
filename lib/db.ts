import Dexie, { Table } from 'dexie';

export interface LakeLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  county?: string;
  water_type?: string;
  species_present?: string[];
  has_boat_launch?: boolean;
  wdfw_url?: string;
}

// ✅ Restored the missing interface
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
  keeperCount?: number;
  soakTime?: number;
  media?: string[];
}

// ✅ Combined into one single definition
export interface LocalSession {
  id: string;
  type: 'freshwater' | 'saltwater' | 'shellfish';
  location: string;
  startTime: string;
  date: string;
  duration?: string;
  notes: string;
  temp: string;
  wind: string;
  cond: string;
  lat: number | null;
  lon: number | null;
  synced: number;
  catches: any[]; 
  tides?: { high: string, low: string };
}

export class OfflineVault extends Dexie {
  localSpecies!: Table<LocalSpecies>; // This now finds the name correctly
  localSessions!: Table<LocalSession>;
  fishingLocations!: Table<LakeLocation>;

  constructor() {
    super('OfflineVault');
    
    // ⚡ Version 5: Updated for nested catch storage
    this.version(5).stores({
      localSpecies: 'id, sessionId, synced, name, location',
      localSessions: 'id, synced, startTime, type', 
      fishingLocations: 'id, name, [lat+lon]' 
    });
  }
}

export const db = new OfflineVault();