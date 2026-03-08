'use client'

import { getNearestWater, getWaterWithinRadius, calculateDistance } from "@/lib/utils";
import { useState, useEffect, useMemo } from 'react'
import { ALL_SPECIES, FISH_GUIDE } from '@/lib/species-db'
import { db } from '../lib/db';

const getWindDirection = (deg: number) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(deg / 45) % 8];
}
type View = 'home' | 'lifelist' | 'sessions' | 'active-session' | 'summary' | 'session-detail'

interface Catch {
  id: string;
  name: string;
  weight: number;
  length: number;
  lure?: string;
  date: string;
  location: string;
  sessionId: string;
  synced: number;
  media?: string[];
}

interface Expedition {
  id: string;
  location: string;
  date: string;
  catches: Catch[];
  notes: string;
  weather: { temp: string, wind: string, cond: string };
  media?: string[];
}

export default function FishDex() {
 const [view, setView] = useState<View>('home')
  const [loading, setLoading] = useState(false)
  const [expandedLifeSpecies, setExpandedLifeSpecies] = useState<string | null>(null)
  
  // --- DATABASE STATES ---
  const [history, setHistory] = useState<Catch[]>([])
  const [sessionsMetadata, setSessionsMetadata] = useState<any[]>([])
  // --- LOCATION & WEATHER ---
  const [sessionLocation, setSessionLocation] = useState<string>("Detecting Location...");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [nearbyWaters, setNearbyWaters] = useState<{name: string, dist: number}[]>([]);
  const [weather, setWeather] = useState({ temp: '--', wind: '--', cond: 'Loading...' });

  // --- SESSION STATE ---
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<Expedition | null>(null)
  const [expandedLogCatch, setExpandedLogCatch] = useState<string | null>(null)
  const [expandedActiveGroup, setExpandedActiveGroup] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [sessionNotes, setSessionNotes] = useState<string>("");
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [isEditingLogLocation, setIsEditingLogLocation] = useState(false);
  useEffect(() => {
    setDeletedSessionIds(JSON.parse(localStorage.getItem('deleted_sessions') || '[]'));
  }, []);
  // --- ADD CATCH STATE ---
  const [showAddDrawer, setShowAddDrawer] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [newName, setNewName] = useState("")
  const [newWeight, setNewWeight] = useState("")
  const [newLength, setNewLength] = useState("")
  const [displayTime, setDisplayTime] = useState("0m");
  const [fullscreenImage, setFullscreenImage] = useState<{url: string, catchId: string} | null>(null);
  const [newLure, setNewLure] = useState("");
  const [pbCelebration, setPbCelebration] = useState<{name: string, weight: number} | null>(null);
  // --- DATA AGGREGATION ---
 const pendingSyncCount = useMemo(() => {
  // Ignore items that are in the delete queue!
  const unsyncedFish = history.filter(f => (f as any).synced === 0 && !deletedSessionIds.includes(f.sessionId)).length;
  const unsyncedSessions = sessionsMetadata.filter(s => s.synced === 0 && !deletedSessionIds.includes(s.id)).length;
  return unsyncedFish + unsyncedSessions;
}, [history, sessionsMetadata, deletedSessionIds]);

const filteredSpecies = useMemo(() => {
  if (!searchTerm) return ALL_SPECIES.slice(0, 5);
  return ALL_SPECIES.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5);
}, [searchTerm]);

  const lifeList = useMemo(() => {
  const list: Record<string, { name: string, count: number, maxWeight: number, waters: Set<string> }> = {};
  
  // 👻 FIXED: Filter out fish that belong to a deleted session!
  history.filter(fish => fish.sessionId && !deletedSessionIds.includes(fish.sessionId)).forEach(fish => {
    if (!list[fish.name]) {
      list[fish.name] = { name: fish.name, count: 0, maxWeight: 0, waters: new Set() };
    }
    list[fish.name].count++;
    list[fish.name].waters.add(fish.location);
    if (fish.weight > list[fish.name].maxWeight) list[fish.name].maxWeight = fish.weight;
  });
  
  return Object.values(list).sort((a, b) => b.count - a.count);
}, [history, deletedSessionIds]); // Added deletedSessionIds here!
const sessionLogs = useMemo(() => {
    const sessions: Record<string, Expedition> = {};

    history.forEach(f => {
      // Hide the ghosts! If it has no ID, or if the ID is in our delete queue, skip it.
      if (!f.sessionId || deletedSessionIds.includes(f.sessionId)) return; 
      
      // Look for real metadata (weather/notes) for this session
      const meta = sessionsMetadata.find(m => m.id === f.sessionId);
      if (!sessions[f.sessionId]) {
        sessions[f.sessionId] = { 
          id: f.sessionId, 
          location: f.location, 
          date: f.date, 
          catches: [], 
          // Use real notes from DB, or fallback to placeholder
          notes: meta?.notes || "No notes recorded.", 
          // Use real weather from DB, or fallback to placeholder
          weather: { 
            temp: meta?.temp || '52°F', 
            wind: meta?.wind || '6mph S', 
            cond: meta?.cond || 'Overcast' 
          } 
        };
      }
      sessions[f.sessionId].catches.push(f);
    });

    return Object.values(sessions).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, sessionsMetadata]);
const groupedSessionCatches = useMemo(() => {
    const sessionHistory = history.filter(h => currentSessionId && h.sessionId === currentSessionId);
    const groups: Record<string, { name: string, items: Catch[] }> = {};
    sessionHistory.forEach(fish => {
      if (!groups[fish.name]) groups[fish.name] = { name: fish.name, items: [] };
      groups[fish.name].items.push(fish);
    });
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [history, currentSessionId]);
  // --- EFFECTS ---
 useEffect(() => {
  if (!startTime) return; // Don't run if no session is active
  
  const interval = setInterval(() => {
    const diff = Date.now() - startTime; 
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    setDisplayTime(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
  }, 1000);
  
  return () => clearInterval(interval);
}, [startTime]); // Ensure it restarts whenever startTime changes

  const updateLocationData = () => {
  if (typeof window !== "undefined" && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      
      // 1. Existing Water Detection (Changed to 5 mile radius)
      const nearby = getWaterWithinRadius(lat, lon, 5).map((name: string) => ({
        name,
        dist: calculateDistance(lat, lon, name) 
      })).sort((a, b) => a.dist - b.dist);
      
      setNearbyWaters(nearby);
      
      // Default to the closest water, or fallback if nothing is within 5 miles
      if (sessionLocation === "Detecting Location..." || sessionLocation === "Current Expedition") {
        setSessionLocation(nearby[0]?.name || "Unknown Water");
      }
      // 2. NEW: Real-Time Weather Fetch
      try {
        const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_KEY;
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`
        );
        const data = await res.json();
        
        setWeather({
          temp: `${Math.round(data.main.temp)}°F`,
          wind: `${Math.round(data.wind.speed)}mph ${getWindDirection(data.wind.deg)}`,
          cond: data.weather[0].main
        });
      } catch (e) {
        console.error("Weather sync failed:", e);
      }
    });
  }
};
const fetchData = async () => {
  try {
    // 1. Get the cloud data
    const [catchRes, sessionRes] = await Promise.all([
      fetch('/api/species/list', { cache: 'no-store' }),
      fetch('/api/species/sessions/list', { cache: 'no-store' }) 
    ]);
    
    const catchData = await catchRes.json();
    const sessionData = await sessionRes.json();

    // 2. Get the "Unsynced" data from your phone
    const localUnsyncedFish = await db.localSpecies.where('synced').equals(0).toArray();
    const localUnsyncedSessions = await db.localSessions.where('synced').equals(0).toArray();

    // 3. 🛡️ Merge & Deduplicate (The "Bouncer" Logic)
    setHistory(() => {
      const allFish = [...localUnsyncedFish, ...(catchData.species || [])];
      // This creates a map of id -> fish, automatically overwriting duplicates
      return Array.from(new Map(allFish.map(f => [f.id, f])).values());
    });

    setSessionsMetadata(() => {
      const allSessions = [...localUnsyncedSessions, ...(sessionData.sessions || [])];
      // This creates a map of id -> session, automatically overwriting duplicates
      return Array.from(new Map(allSessions.map(s => [s.id, s])).values());
    });

  } catch (e) { 
    // 🌲 IF OFFLINE: Just show the local vault!
    const allLocal = await db.localSpecies.toArray();
    setHistory(allLocal);
    console.log("Offline mode: Displaying local vault only.");
  }
}

  useEffect(() => { 
    fetchData(); 
  }, []);

  useEffect(() => {
    if (view === 'active-session') {
      updateLocationData();
    }
  }, [view]);
  // --- LOCATION AUTO-CORRECT ---
  useEffect(() => {
    // If we are in a session and the location has finally loaded...
    if (currentSessionId && sessionLocation !== "Detecting Location..." && sessionLocation !== "Current Expedition") {
      setHistory(prev => {
        let hasChanges = false;
        const updated = prev.map(fish => {
          // Find fish in this session that still have the placeholder location
          if (fish.sessionId === currentSessionId && (fish.location === "Detecting Location..." || fish.location === "Current Expedition")) {
            hasChanges = true;
            // Update the local Dexie vault in the background
            db.localSpecies.update(fish.id, { location: sessionLocation, synced: 0 }).catch(console.error);
            return { ...fish, location: sessionLocation, synced: 0 };
          }
          return fish;
        });
        return hasChanges ? updated : prev;
      });
    }
  }, [sessionLocation, currentSessionId]);
// --- PERSISTENCE EFFECT ---
useEffect(() => {
  const savedId = localStorage.getItem('active_session_id');
  const savedStart = localStorage.getItem('active_session_start');

  if (savedId && savedStart) {
    // 1. Set the session ID first
    setCurrentSessionId(savedId);
    setStartTime(parseInt(savedStart));
    setView('active-session');
    
    // 2. NOW tell the app to refresh the history from Supabase
    // This ensures that when the data arrives, the ID is already waiting
    fetchData(); 
  }
}, []);
// --- SYNC MANAGER EFFECT ---
useEffect(() => {
  const syncOfflineData = async () => {
    if (!navigator.onLine) return;

    try {
      // 👻 STEP 0: Bust the Ghosts (Process the Delete Queue)
      const deletedQueue = JSON.parse(localStorage.getItem('deleted_sessions') || '[]');
      if (deletedQueue.length > 0) {
        console.log("👻 Clearing deleted expeditions from the cloud...");
        
        const remainingGhosts = [];
        for (const id of deletedQueue) {
          const res = await fetch(`/api/species/delete-session?id=${id}`, { method: 'DELETE' });
          if (!res.ok) {
            remainingGhosts.push(id); // If it fails, keep it in the queue to try again later
          } else {
            console.log("✅ Ghost busted:", id);
          }
        }
        
        // Update the queue to only contain failed deletions (if any)
        localStorage.setItem('deleted_sessions', JSON.stringify(remainingGhosts));
        setDeletedSessionIds(remainingGhosts);
      }

      // ⚡️ STEP 1: Sync Sessions FIRST (The Parent Record)
      const unsyncedSessions = await db.localSessions.where('synced').equals(0).toArray();
      for (const sess of unsyncedSessions) {
        console.log("⚡️ Syncing Session:", sess.location);
        const res = await fetch('/api/species/sessions/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sess)
        });
        
        if (res.ok) {
          console.log("✅ Session Synced:", sess.id);
          await db.localSessions.update(sess.id, { synced: 1 });
        } else {
          console.error("❌ Session Sync Failed:", await res.text());
        }
      }

      // 🎣 STEP 2: Sync Fish SECOND (The Child Records)
      const unsyncedFish = await db.localSpecies.where('synced').equals(0).toArray();
      for (const fish of unsyncedFish) {
        console.log("⚡️ Syncing Specimen:", fish.name);
        const res = await fetch('/api/species/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fish)
        });

        if (res.ok) {
          console.log("✅ Specimen Synced:", fish.id);
          await db.localSpecies.update(fish.id, { synced: 1 });
        } else {
          console.error("❌ Specimen Sync Failed:", await res.text());
        }
      }
      
      // STEP 3: Refresh the UI once the "relays" are flipped
      if (unsyncedFish.length > 0 || unsyncedSessions.length > 0 || deletedQueue.length > 0) {
        await fetchData(); 
      }
    } catch (err) {
      console.error("Sync Manager System Fault:", err);
    }
  };

  syncOfflineData();
  window.addEventListener('online', syncOfflineData);
  return () => window.removeEventListener('online', syncOfflineData);
}, []); // Note: leaving dependency array empty so it registers the listeners once
// --- HANDLERS ---
  const handleStartSession = () => {
    const newId = crypto.randomUUID();
    const now = Date.now();
    
    // Lock session into phone's vault
    localStorage.setItem('active_session_id', newId);
    localStorage.setItem('active_session_start', now.toString());

    setCurrentSessionId(newId);
    setStartTime(now);
    setView('active-session');
  }
const handleFinalizeSession = async () => {
  if (!currentSessionId) return;
  
  setLoading(true);

  try {
    // 🌍 NEW: RETROACTIVELY FIX LOCATIONS
    // If the location loaded late, update all fish in this session to match the final location
    const sessionCatches = await db.localSpecies.where('sessionId').equals(currentSessionId).toArray();
    for (const fish of sessionCatches) {
      if (fish.location !== sessionLocation) {
        await db.localSpecies.update(fish.id, { location: sessionLocation, synced: 0 });
      }
    }

    const sessionData = {
      id: currentSessionId,
      location: sessionLocation,
      startTime: new Date(startTime!).toISOString(),
      notes: sessionNotes,
      temp: weather.temp,
      wind: weather.wind,
      cond: weather.cond,
      synced: 0 // ⚡️ Mark as ready for the Sync Manager
    };

    // 1. SAVE TO LOCAL VAULT ONLY
    await db.localSessions.add(sessionData);

    // 2. Cleanup UI immediately
    localStorage.removeItem('active_session_id');
    localStorage.removeItem('active_session_start');
    
    setCurrentSessionId(null);
    setStartTime(null);
    setSessionNotes("");
    
    // 3. Trigger the data refresh
    await fetchData();
    setView('home'); 

  } catch (e: any) {
    console.error("Local save failed:", e);
  } finally {
    setLoading(false);
  }
};
const handleUpdateSessionLocation = async (sessionId: string, newLocation: string) => {
    if (!newLocation || newLocation.trim() === "") {
      setIsEditingLogLocation(false);
      return;
    }
    
    try {
      // 1. Update the local metadata state
      setSessionsMetadata(prev => prev.map(s => 
        s.id === sessionId ? { ...s, location: newLocation, synced: 0 } : s
      ));

      // 2. Update all fish in history that belong to this session
      setHistory(prev => prev.map(f => 
        f.sessionId === sessionId ? { ...f, location: newLocation, synced: 0 } : f
      ));

      // 3. Update the database (Dexie)
      await db.localSessions.update(sessionId, { location: newLocation, synced: 0 });
      const fishEntries = await db.localSpecies.where('sessionId').equals(sessionId).toArray();
      for (const fish of fishEntries) {
        await db.localSpecies.update(fish.id, { location: newLocation, synced: 0 } as any);
      }

      // 4. Update the currently viewed session object so the UI updates immediately
      if (selectedSession) {
        setSelectedSession({ ...selectedSession, location: newLocation });
      }

      setIsEditingLogLocation(false);

      // 5. Trigger a background sync to the cloud
      fetch('/api/species/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, location: newLocation })
      }).catch(console.error);

    } catch (err) {
      console.error("Failed to update location:", err);
    }
  };
const handleAddCatch = async () => {
  if (!newName || !currentSessionId) return;

  const weightNum = Number(newWeight) || 0;

  // 🏆 PB CHECK: Compare this fish to your existing Life List
  const existingRecord = lifeList.find(s => s.name === newName);
  const isPB = weightNum > (existingRecord?.maxWeight || 0);

  const newCatch = {
    id: crypto.randomUUID(),
    name: newName,
    quantity: 1, // Keep this for DB consistency
    weight: weightNum,
    length: Number(newLength) || 0,
    lure: newLure, // 🎣 Save the lure!
    date: new Date().toISOString(),
    location: sessionLocation,
    sessionId: currentSessionId,
    media: [],
    synced: 0 
  };

  try {
    // 1. SAVE TO LOCAL VAULT FIRST (Instant)
    await db.localSpecies.add(newCatch);

    // 2. Update UI immediately (Optimistic)
    setHistory(prev => [newCatch, ...prev]);

    // 3. 🎉 CELEBRATION TRIGGER
    if (isPB) {
      setPbCelebration({ name: newName, weight: weightNum });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 
      setTimeout(() => setPbCelebration(null), 5000); 
    }

    // 4. Reset Drawer & UI States
    setShowAddDrawer(false);
    setNewName("");
    setNewWeight("");
    setNewLength("");
    setNewLure(""); 
    setSearchTerm("");

    // 5. TRY TO SYNC IN THE BACKGROUND
    fetch('/api/species/add', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCatch) 
    }).then(async (res) => {
      if (res.ok) {
        // ✅ Mark as synced in local DB
        await db.localSpecies.update(newCatch.id, { synced: 1 });
        
        // ✅ Update the local State immediately (The "Sync Meter" fix)
        setHistory(prev => prev.map(f => 
          f.id === newCatch.id ? { ...f, synced: 1 } : f
        ));
        
        // Refresh everything else in the background
        await fetchData(); 
        console.log("✅ Sync successful, Status Bar updated.");
      }
    });

  } catch (err) {
    console.error("Local Save Failed:", err);
    alert("Database Error: Check phone storage.");
  }
};

const handleImageUpload = (catchId: string, file: File) => {
    const fakeUrl = URL.createObjectURL(file);
    
    setHistory(prev => prev.map(c => {
      if (c.id === catchId) return { ...c, media: [...(c.media || []), fakeUrl] };
      return c;
    }));

    if (selectedSession) {
      setSelectedSession({
        ...selectedSession,
        catches: selectedSession.catches.map(c => {
          if (c.id === catchId) return { ...c, media: [...(c.media || []), fakeUrl] };
          return c;
        })
      });
    }
  };

  // --- DELETE IMAGE HANDLER ---
  const handleDeleteImage = async () => {
    if (!fullscreenImage) return;
    const { url, catchId } = fullscreenImage;

    if (!window.confirm("Are you sure you want to delete this photo?")) return;

   // 1. Update local history and Dexie vault
    setHistory(prev => prev.map(c => {
      if (c.id === catchId) {
        const newMedia = (c.media || []).filter(m => m !== url);
        
        // ⚡️ We add 'async' and 'await' here to handle the DB update
        (async () => {
          await db.localSpecies.update(catchId, { media: newMedia, synced: 0 } as any);
        })().catch(console.error);

        return { ...c, media: newMedia, synced: 0 };
      }
      return c;
    }));
    // 2. Update the live detail view
    if (selectedSession) {
      setSelectedSession({
        ...selectedSession,
        catches: selectedSession.catches.map(c => {
          if (c.id === catchId) return { ...c, media: (c.media || []).filter(m => m !== url) };
          return c;
        })
      });
    }

    // 3. Close the viewer
    setFullscreenImage(null);
  };
// --- NEW: DELETE HANDLERS ---
  const handleDeleteCatch = async (catchId: string) => {
    if (!window.confirm("Delete this specimen?")) return;
    
    // 1. Kill it locally first (Instant UI)
    // This ensures your Pixel 10 vault is clean immediately
    await db.localSpecies.delete(catchId);
    setHistory(prev => prev.filter(c => c.id !== catchId));

    // Update the detail view if it's currently open
    if (selectedSession) {
      setSelectedSession({
        ...selectedSession,
        catches: selectedSession.catches.filter(c => c.id !== catchId)
      });
    }

    // 2. Kill it in the cloud (Supabase)
    const res = await fetch(`/api/species/delete?id=${catchId}`, { method: 'DELETE' });
    
    if (!res.ok) {
      console.error("Cloud delete failed. The fish might still be in Supabase.");
    } else {
      console.log("✅ Purged from the Cloud.");
      // Optional: final sync to keep everything aligned
      await fetchData();
    }
  };
const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Are you sure you want to delete this entire expedition?")) return;

    try {
      // Get the fish IDs before we clear them from the UI
      const fishToDelete = history.filter(c => c.sessionId === sessionId).map(c => c.id);

      // 1. Purge the local vault
      await db.localSessions.delete(sessionId);
      await db.localSpecies.where('sessionId').equals(sessionId).delete();

      // 2. Queue for cloud deletion (Ghost Buster)
      const newDeleted = [...deletedSessionIds, sessionId];
      setDeletedSessionIds(newDeleted);
      localStorage.setItem('deleted_sessions', JSON.stringify(newDeleted));

      // 3. Update UI immediately
      setHistory(prev => prev.filter(c => c.sessionId !== sessionId));
      setSessionsMetadata(prev => prev.filter(s => s.id !== sessionId));
      setSelectedSession(null);
      setView('sessions');

      // 4. Try to delete from cloud immediately if online
      if (navigator.onLine) {
        const res = await fetch(`/api/species/delete-session?id=${sessionId}`, { method: 'DELETE' });
        if (res.ok) {
          // 🚨 FALLBACK: Delete fish individually in case Supabase doesn't cascade delete!
          for (const fishId of fishToDelete) {
            fetch(`/api/species/delete?id=${fishId}`, { method: 'DELETE' }).catch(console.error);
          }

          const updatedDeleted = newDeleted.filter(id => id !== sessionId);
          setDeletedSessionIds(updatedDeleted);
          localStorage.setItem('deleted_sessions', JSON.stringify(updatedDeleted));
        }
      }
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };
  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30">
      
       {/* 1. HOME VIEW */}
{view === 'home' && (
  <main className="max-w-md mx-auto px-6 pt-20 pb-10 flex flex-col min-h-screen">
    <h1 className="text-8xl font-black italic text-white mb-2 tracking-tighter">eFish</h1>
    <p className="text-blue-500 font-black text-[10px] uppercase tracking-[0.4em] mb-12 text-center">The Washington Archive</p>
    
    <div className="space-y-4 flex-grow">
      {currentSessionId ? (
        <button onClick={() => setView('active-session')} className="w-full py-10 rounded-[2.5rem] bg-blue-600 shadow-2xl flex flex-col items-center gap-1 border-b-4 border-blue-800">
          <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Session Active</span>
          <span className="text-2xl font-black uppercase italic tracking-tighter">Resume Trip</span>
        </button>
      ) : (
        <button onClick={handleStartSession} className="w-full py-14 rounded-[3rem] bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-4 active:scale-95 transition-all">
          <span className="text-6xl text-white">⚓</span>
          <span className="font-black uppercase tracking-[0.2em] text-xs">Start New Trip</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => setView('lifelist')} className="bg-slate-900/50 p-8 rounded-[2rem] border border-slate-800 flex flex-col items-center gap-2 hover:bg-slate-800">
          <span className="text-2xl">🏆</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Life List</span>
        </button>
        <button onClick={() => setView('sessions')} className="bg-slate-900/50 p-8 rounded-[2rem] border border-slate-800 flex flex-col items-center gap-2 hover:bg-slate-800">
          <span className="text-2xl">📖</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Log Book</span>
        </button>
      </div>
    </div>

  <div className="mt-12 p-4 rounded-2xl bg-slate-900/30 border border-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${pendingSyncCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {pendingSyncCount > 0 ? 'Local Vault Active' : 'System Synced'}
          </span>
        </div>
        
        {pendingSyncCount > 0 ? (
          <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
            {pendingSyncCount} Pending Items
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase text-emerald-500">
            Archive Secure
          </span>
        )}
      </div>
    </main>
  )}
{/* 2. ACTIVE SESSION */}
      {view === 'active-session' && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-40 animate-in fade-in duration-300">
          
          {/* TOP HEADER (Only one this time!) */}
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView('home')} className="bg-slate-900 w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center font-black">←</button>
            <div className="text-right">
              <p className="text-[9px] font-black text-blue-500 uppercase">Trip Clock</p>
              <p className="text-2xl font-black italic">{displayTime}</p>
            </div>
          </div>

          {/* THIS IS YOUR NEW LOCATION DROPDOWN */}
          {isEditingLocation ? (
            <div className="bg-slate-900 p-5 rounded-[2rem] border border-blue-500 mb-4 shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Select Location</p>
                <button onClick={() => setIsEditingLocation(false)} className="text-[10px] text-slate-500 uppercase font-black hover:text-white transition-colors">Cancel</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 mb-3 pr-1">
                {nearbyWaters.length > 0 ? (
                  nearbyWaters.map(water => (
                    <button
                      key={water.name}
                      onClick={() => {
                        setSessionLocation(water.name);
                        setIsEditingLocation(false);
                      }}
                      className="w-full text-left p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-black text-white flex justify-between items-center transition-colors"
                    >
                      <span className="truncate pr-4">{water.name}</span>
                      <span className="text-slate-400 text-[10px] font-black">{water.dist.toFixed(1)}mi</span>
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-500 text-center py-4 font-black uppercase tracking-widest">No named waters within 5 miles.</p>
                )}
              </div>
              <input
                type="text"
                placeholder="Or type a custom spot..."
                className="w-full bg-[#020617] border border-slate-800 rounded-xl p-4 text-sm text-white outline-none focus:border-blue-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    setSessionLocation(e.currentTarget.value);
                    setIsEditingLocation(false);
                  }
                }}
              />
            </div>
          ) : (
            <div onClick={() => setIsEditingLocation(true)} className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 mb-4 cursor-pointer hover:border-blue-500/50 transition-colors shadow-xl group">
                <p className="text-[9px] font-black text-slate-500 uppercase mb-1 tracking-widest flex justify-between">
                  📍 Location
                  <span className="text-blue-500/50 group-hover:text-blue-500 transition-colors">Tap to change</span>
                </p>
                <p className="text-xl font-black italic text-white uppercase truncate">{sessionLocation}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-8 text-center">
            <div className="bg-slate-900/40 py-4 rounded-2xl border border-slate-800/50">
              <p className="text-[8px] font-black text-slate-500 uppercase">Air</p>
              <p className="text-xs font-black">{weather.temp}</p>
            </div>
            <div className="bg-slate-900/40 py-4 rounded-2xl border border-slate-800/50">
              <p className="text-[8px] font-black text-slate-500 uppercase">Wind</p>
              <p className="text-xs font-black">{weather.wind}</p>
            </div>
            <div className="bg-slate-900/40 py-4 rounded-2xl border border-slate-800/50">
              <p className="text-[8px] font-black text-slate-500 uppercase">Sky</p>
              <p className="text-[9px] font-black uppercase">{weather.cond}</p>
            </div>
          </div>

          <div className="space-y-2">
            {groupedSessionCatches.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No catches yet. Keep casting!</p>
                </div>
            ) : (
                groupedSessionCatches.map(group => (
                    <div key={group.name} className="bg-slate-900/60 rounded-2xl border border-slate-800/50 overflow-hidden">
                        <div 
                          onClick={() => setExpandedActiveGroup(expandedActiveGroup === group.name ? null : group.name)}
                          className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/40 transition-colors"
                        >
                            <span className="font-black text-[10px] uppercase text-white tracking-tighter">{group.name}</span>
                            <div className="flex gap-3 items-center">
                                <span className="bg-blue-600 px-2 py-0.5 rounded text-[9px] font-black text-white">x{group.items.length}</span>
                                <span className="text-blue-500 text-xs">{expandedActiveGroup === group.name ? '▲' : '▼'}</span>
                            </div>
                        </div>

                        {/* Expandable area showing individual catches to delete */}
                        {expandedActiveGroup === group.name && (
                            <div className="p-4 pt-0 border-t border-slate-800/50 mt-2 space-y-2">
                                {group.items.map((fish, index) => (
                                    <div key={fish.id} className="flex justify-between items-center bg-slate-800/30 p-3 rounded-xl border border-slate-800/50">
                                        <div>
                                            <p className="text-[10px] font-bold text-white uppercase">
                                              Catch #{group.items.length - index} <span className="text-slate-500 mx-1">•</span> {fish.weight}lb <span className="text-slate-500 mx-1">•</span> {fish.length}in
                                            </p>
                                            <p className="text-[8px] text-slate-400 uppercase mt-0.5">
                                              {new Date(fish.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteCatch(fish.id)}
                                            className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))
            )}
          </div>
          
          <button onClick={() => setView('summary')} className="mt-8 w-full py-5 text-[10px] font-black uppercase text-blue-400 border border-blue-500/20 rounded-2xl bg-blue-500/5 hover:bg-blue-500/10 transition-colors">End Expedition</button>
        </main>
      )}
     {/* EXPEDITION SUMMARY (REVIEW AFTER) */}
      {view === 'summary' && (
        <main className="max-w-md mx-auto px-6 pt-12 pb-32 animate-in fade-in zoom-in duration-300">
          <h2 className="text-5xl font-black italic uppercase text-white mb-2 tracking-tighter">Expedition<br/>Review</h2>
          <p className="text-blue-500 font-black text-[10px] uppercase mb-4 tracking-[0.2em]">{sessionLocation}</p>

          {/* NEW: WEATHER STRIP */}
          <div className="flex gap-2 mb-8">
            <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{weather.temp}</span>
            <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{weather.wind}</span>
            <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{weather.cond}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Duration</p>
              <p className="text-2xl font-black text-white italic">{displayTime}</p>
            </div>
            <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Catches</p>
              <p className="text-2xl font-black text-white italic">
                {history.filter(h => currentSessionId && h.sessionId === currentSessionId).length}
              </p>
            </div>
          </div>

          {/* NEW: CATCH SUMMARY LIST */}
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 mb-8">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Haul Breakdown</p>
            {groupedSessionCatches.length === 0 ? (
               <p className="text-[10px] text-slate-600 uppercase font-black text-center py-2">No catches logged this trip.</p>
            ) : (
               <div className="space-y-3">
                 {groupedSessionCatches.map(group => (
                    <div key={group.name} className="flex justify-between items-center border-b border-slate-800/50 pb-3 last:border-0 last:pb-0">
                       <span className="font-black text-[11px] uppercase text-white tracking-tighter">{group.name}</span>
                       <div className="flex gap-2">
                           {group.items.map(fish => (
                               <span key={fish.id} className="text-[9px] text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded">
                                   {fish.weight}lb
                               </span>
                           ))}
                           <span className="bg-blue-600 px-2 py-0.5 rounded text-[9px] font-black text-white ml-2">x{group.items.length}</span>
                       </div>
                    </div>
                 ))}
               </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 mb-8">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">Expedition Notes</p>
            <textarea 
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="What worked? What didn't? Water conditions, lures used..."
              className="w-full h-32 bg-transparent text-sm text-slate-300 outline-none resize-none placeholder-slate-700"
            />
          </div>

          <button onClick={handleFinalizeSession} className="w-full py-6 rounded-[2rem] bg-blue-600 shadow-xl flex items-center justify-center gap-2 border-b-4 border-blue-800 text-sm font-black uppercase tracking-widest active:scale-95 transition-all">
            Finalize Log Book
          </button>
          
          <button onClick={() => setView('active-session')} className="w-full mt-4 py-4 text-[10px] font-black uppercase text-slate-500 text-center hover:text-white transition-colors">
            Return to Active Session
          </button>
        </main>
      )}
      
      {/* 3. LIFE LIST VIEW */}
      {view === 'lifelist' && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-32">
          <button onClick={() => setView('home')} className="mb-8 text-slate-500 font-black uppercase text-[10px] tracking-widest">← Dashboard</button>
          <h2 className="text-5xl font-black italic uppercase mb-2 tracking-tighter text-white">Life List</h2>
          <p className="text-blue-500 font-black text-[10px] uppercase mb-10">{lifeList.length} Species Found</p>
          <div className="space-y-3">
           {lifeList.map(item => (
  <div key={item.name} className="bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden shadow-lg">
    <button onClick={() => setExpandedLifeSpecies(expandedLifeSpecies === item.name ? null : item.name)} className="w-full p-6 flex justify-between items-center text-left">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-black uppercase tracking-widest text-white">{item.name}</p>
          
          {/* 🎣 The Sync Badge: Checks if any fish in history with this name are unsynced */}
          {history.some(f => f.name === item.name && (f as any).synced === 0) && (
            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded animate-pulse">
              Waiting to Sync
            </span>
          )}
        </div>
        <p className="text-[9px] font-bold text-slate-500 uppercase">
          Total: {item.count} • P.B. {item.maxWeight}lb
        </p>
      </div>
      <span className="text-blue-500 text-xs">{expandedLifeSpecies === item.name ? '▲' : '▼'}</span>
    </button>

                {expandedLifeSpecies === item.name && (
                  <div className="bg-black/30 p-6 pt-0 border-t border-slate-800/50">
                    <p className="text-[8px] font-black text-blue-500 uppercase mb-3 pt-4 tracking-widest">Verified Locations</p>
                    <div className="space-y-2">
                      {Array.from(item.waters).map(water => (
                        <div key={water} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>{water}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      )}

      {/* 4. LOG BOOK & DETAIL */}
      {view === 'sessions' && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-32">
          <button onClick={() => setView('home')} className="mb-8 text-slate-500 font-black uppercase text-[10px] tracking-widest">← Dashboard</button>
          <h2 className="text-5xl font-black italic uppercase mb-2 tracking-tighter text-white">Log Book</h2>
          <div className="space-y-4">
            {sessionLogs.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-[2rem]">
                <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">No expeditions logged</p>
              </div>
            ) : (
              sessionLogs.map(session => (
                <div key={session.id} onClick={() => { setSelectedSession(session); setView('session-detail'); }} className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl cursor-pointer active:scale-[0.98] transition-all">
                  <p className="text-xl font-black italic uppercase text-white truncate mb-1">{session.location}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{new Date(session.date).toLocaleDateString()}</p>
                  
                  <div className="flex gap-2 mt-3 mb-2">
                    <span className="text-[8px] bg-slate-800 px-2 py-1 rounded text-slate-400 uppercase font-black">{session.weather.temp}</span>
                    <span className="text-[8px] bg-slate-800 px-2 py-1 rounded text-slate-400 uppercase font-black">{session.weather.wind}</span>
                    <span className="text-[8px] bg-slate-800 px-2 py-1 rounded text-slate-400 uppercase font-black">{session.weather.cond}</span>
                  </div>

                  <div className="mt-4 text-blue-500 text-[10px] font-black uppercase tracking-widest">{session.catches.length} Specimen Record</div>
                </div>
              ))
            )}
          </div>
        </main>
      )}

      {view === 'session-detail' && selectedSession && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-32">
          <button onClick={() => setView('sessions')} className="mb-8 text-slate-500 font-black uppercase text-[10px] tracking-widest">← Back to Logs</button>
          {/* 📱 MOBILE-FRIENDLY EDITABLE LOCATION HEADER */}
          {isEditingLogLocation ? (
            <div className="mb-8 bg-slate-900/80 p-5 rounded-[2rem] border border-blue-500 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-3">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Update Location</p>
                <button onClick={() => setIsEditingLogLocation(false)} className="text-[10px] text-slate-500 uppercase font-black">Cancel</button>
              </div>

              {/* Suggestions from the GPS/Weather Data */}
              {nearbyWaters.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Suggestions Near Here</p>
                  <div className="flex flex-wrap gap-2">
                    {nearbyWaters.slice(0, 3).map(water => (
                      <button 
                        key={water.name}
                        onClick={() => handleUpdateSessionLocation(selectedSession.id, water.name)}
                        className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl text-[10px] font-black text-white border border-slate-700 transition-colors"
                      >
                        {water.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Enter location name..."
                  defaultValue={selectedSession.location === "Detecting Location..." ? "" : selectedSession.location}
                  className="flex-1 bg-[#020617] border border-slate-800 rounded-xl p-4 text-sm text-white outline-none focus:border-blue-500/50"
                  id="logLocationInput"
                />
                <button 
                  onClick={() => {
                    const val = (document.getElementById('logLocationInput') as HTMLInputElement).value;
                    handleUpdateSessionLocation(selectedSession.id, val);
                  }}
                  className="bg-blue-600 px-6 rounded-xl font-black text-[10px] uppercase text-white shadow-lg active:scale-95 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => setIsEditingLogLocation(true)}
              className="group cursor-pointer mb-4"
            >
              <h2 className="text-4xl font-black italic uppercase text-white leading-tight group-hover:text-blue-400 transition-colors flex items-center gap-3">
                {selectedSession.location}
                <span className="text-xs opacity-40">✏️</span>
              </h2>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Tap title to rename spot</p>
            </div>
          )}
          {/* NEW: SAVED WEATHER STRIP */}
          <div className="flex gap-2 mb-8">
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{selectedSession.weather.temp}</span>
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{selectedSession.weather.wind}</span>
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-300">{selectedSession.weather.cond}</span>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 mb-8">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">Expedition Notes</p>
            <textarea 
              value={selectedSession.notes}
              onChange={(e) => setSelectedSession({...selectedSession, notes: e.target.value})}
              className="w-full h-32 bg-transparent text-sm text-slate-300 outline-none resize-none"
            />
          </div>

          <p className="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Logged Catches</p>
          <div className="space-y-2 mb-12">
           {selectedSession.catches.map(fish => (
  <div key={fish.id} className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
    <button 
      onClick={() => setExpandedLogCatch(expandedLogCatch === fish.id ? null : fish.id)} 
      className="w-full p-4 flex justify-between items-center text-left"
    >
      <span className="font-black text-[11px] uppercase tracking-tighter text-white">{fish.name}</span>
      <div className="flex items-center gap-3">
        {fish.media && fish.media.length > 0 && <span className="text-[10px]">📷</span>}
        
        {/* THIS IS YOUR NEW LINE */}
        <span className="text-[10px] text-slate-400 font-bold">{fish.weight}lb • {fish.length}in {fish.lure && `• 🎣 ${fish.lure}`}</span>
        
      </div>
    </button>
    {/* ... expanded media area ... */}
                {/* Expanded area: Image upload & Delete Catch */}
                {expandedLogCatch === fish.id && (
                  <div className="p-4 pt-0 border-t border-slate-800/50 mt-2">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-3 pt-4 tracking-widest">Media Record</p>
                    
                    {fish.media && fish.media.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto mb-3 pb-2">
                        {fish.media.map((url, i) => (
                           // eslint-disable-next-line @next/next/no-img-element
                         <img 
  key={i} 
  src={url} 
  alt="Catch" 
  onClick={() => setFullscreenImage({ url, catchId: fish.id })}
  className="h-16 w-16 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80 transition-opacity" 
/>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4">
                      <label className="flex-1 flex items-center justify-center gap-2 bg-slate-800/50 py-3 rounded-xl border border-dashed border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                        <span className="text-[10px] font-black uppercase text-blue-500">+ Upload Photo</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleImageUpload(fish.id, e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                      <button 
                        onClick={() => handleDeleteCatch(fish.id)} 
                        className="flex-1 flex items-center justify-center bg-red-500/10 py-3 rounded-xl border border-dashed border-red-500/30 hover:bg-red-500/20 transition-colors"
                      >
                        <span className="text-[10px] font-black uppercase text-red-500">Delete Specimen</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {selectedSession.catches.length === 0 && (
               <p className="text-[10px] text-slate-600 uppercase font-black text-center py-4">No specimens in this log.</p>
            )}
          </div>

          {/* Delete Entire Session Button */}
          <button 
            onClick={() => handleDeleteSession(selectedSession.id)} 
            className="w-full py-5 text-[10px] font-black uppercase text-red-400 border border-red-500/20 rounded-2xl bg-red-500/5 hover:bg-red-500/10 transition-colors"
          >
            Delete Entire Expedition
          </button>
        </main>
      )}

      {/* 5. RECORD CATCH DRAWER */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#020617] rounded-t-[3rem] border-t border-slate-800 p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic uppercase text-white">New Specimen</h2>
              <button onClick={() => setShowAddDrawer(false)} className="text-slate-500 font-black text-[10px]">Close</button>
            </div>
            <input 
              type="text" 
              placeholder="Search Species..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none mb-4"
            />
            <div className="flex flex-wrap gap-2 mb-6">
              {filteredSpecies.map(s => (
                <button key={s} onClick={() => { setNewName(s); setSearchTerm(s); }} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${newName === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{s}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="Weight (lbs)" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none" />
              <input type="number" value={newLength} onChange={(e) => setNewLength(e.target.value)} placeholder="Length (in)" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none" />
            </div>
            {/* 🎣 NEW LURE INPUT */}
<input 
  type="text" 
  value={newLure} 
  onChange={(e) => setNewLure(e.target.value)} 
  placeholder="Lure / Bait (e.g. Ned Rig)" 
  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none mb-8" 
/>
            <button onClick={handleAddCatch} disabled={!newName || loading} className="w-full bg-blue-600 py-6 rounded-3xl font-black uppercase text-sm">{loading ? 'Archiving...' : 'Log Catch'}</button>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BUTTON */}
      {view === 'active-session' && (
        <button 
          onClick={() => setShowAddDrawer(true)} 
          className="fixed bottom-10 left-6 right-6 max-w-md mx-auto bg-blue-600 h-24 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-3 text-white z-40 active:scale-95 border-b-4 border-blue-800"
        >
          <div className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center font-black text-xl">+</div>
          <span className="font-black uppercase text-xs tracking-[0.2em]">Record Specimen</span>
        </button>
      )}
{/* 6. FULLSCREEN IMAGE VIEWER */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-6 pt-12">
            <button onClick={() => setFullscreenImage(null)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">← Close</button>
            <button onClick={handleDeleteImage} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20 transition-colors">Delete Photo</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 pb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fullscreenImage.url} alt="Fullscreen Catch" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
      {/* 🏆 PB CELEBRATION BANNER */}
      {pbCelebration && (
        <div className="fixed top-10 left-6 right-6 z-[100] bg-gradient-to-r from-amber-500 to-yellow-600 p-1 rounded-3xl shadow-[0_0_30px_rgba(245,158,11,0.5)] animate-in slide-in-from-top-full duration-500">
          <div className="bg-[#020617] rounded-[1.4rem] p-6 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 mb-1">New Personal Best</p>
            <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">
              {pbCelebration.weight}lb {pbCelebration.name}
            </h3>
            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">The archive has been updated.</p>
          </div>
        </div>
      )}
    </div>
  )
}
