import Dexie, { type Table } from 'dexie';

export interface LocalCatch {
  id: string;
  name: string;
  weight: number;
  length: number;
  lure?: string; // 🎣 Add this line!
  date: string;
  location: string;
  sessionId: string;
  synced: number; 
}

export interface LocalSession {
  id: string;
  location: string;
  startTime: string;
  endTime?: string;
  notes: string;
  temp: string;
  wind: string;
  cond: string;
  lat: number | null;
  lon: number | null; 
  synced: number; 
}

export class OfflineVault extends Dexie {
  localSpecies!: Table<LocalCatch>;
  localSessions!: Table<LocalSession>;

  constructor() {
    super('EFishVault');
    
    // We bump this to version 2 because we are adding new columns
    this.version(2).stores({
      localSpecies: 'id, sessionId, synced',
      // 📍 Added lat and lon to the session store
      localSessions: 'id, synced, lat, lon' 
    });
  }
}

export const db = new OfflineVault();