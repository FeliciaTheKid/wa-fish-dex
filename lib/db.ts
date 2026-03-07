import Dexie, { type Table } from 'dexie';

// Define the structure of our local vault
export interface LocalCatch {
  id: string;
  name: string;
  weight: number;
  length: number;
  date: string;
  location: string;
  sessionId: string;
  synced: number; // 0 for no, 1 for yes (easier for indexing)
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
  synced: number; 
}

export class OfflineVault extends Dexie {
  localSpecies!: Table<LocalCatch>;
  localSessions!: Table<LocalSession>;

  constructor() {
    super('EFishVault');
    // Define the "Primary Keys" (the id) and what we want to search by (synced)
    this.version(1).stores({
      localSpecies: 'id, sessionId, synced',
      localSessions: 'id, synced'
    });
  }
}

export const db = new OfflineVault();