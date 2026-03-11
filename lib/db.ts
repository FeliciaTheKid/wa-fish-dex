import Dexie, { Table } from 'dexie';

export interface LakeLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  county?: string;
  water_type?: string;
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
}

export interface LocalSession {
  id: string;
  location: string;
  startTime: string;
  duration?: string; // ✅ MATCHES YOUR UI TYPE
  notes: string;
  temp: string;
  wind: string;
  cond: string;
  lat: number | null;
  lon: number | null;
  synced: number;
}

export class OfflineVault extends Dexie {
  localSpecies!: Table<LocalSpecies>;
  localSessions!: Table<LocalSession>;
  fishingLocations!: Table<LakeLocation>;

  constructor() {
    super('OfflineVault');
    
    // ⚡ BUMPED TO VERSION 3
    // We added 'startTime' to the index so your Log Book sorts instantly
    this.version(3).stores({
      localSpecies: 'id, sessionId, synced, name',
      localSessions: 'id, synced, startTime', 
      fishingLocations: 'id, name' 
    });
  }
}

export const db = new OfflineVault();