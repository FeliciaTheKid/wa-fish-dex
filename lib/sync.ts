import { db } from './db';

export const syncData = async () => {
  if (!navigator.onLine) return;

  try {
    // 1. Get unsynced specimens from the correct table name
    const unsyncedFish = await db.localSpecies.where('synced').equals(0).toArray();
    
    for (const fish of unsyncedFish) {
      const res = await fetch('/api/species/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fish)
      });

      if (res.ok) {
        // Update the local record to show it is now synced
        await db.localSpecies.update(fish.id, { synced: 1 });
      }
    }

    // 2. Get unsynced sessions from the correct table name
    const unsyncedSessions = await db.localSessions.where('synced').equals(0).toArray();
    
    for (const session of unsyncedSessions) {
      const res = await fetch('/api/species/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });

      if (res.ok) {
        await db.localSessions.update(session.id, { synced: 1 });
      }
    }
  } catch (err) {
    console.error("Sync failed:", err);
  }
};