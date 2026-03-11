'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { getNearestWater, getWaterWithinRadius, calculateDistance } from "@/lib/utils";
import { ALL_SPECIES } from '@/lib/species-db'
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase'

// 🌍 MAP IMPORTS (Dynamic for Next.js to prevent SSR issues)
import dynamic from 'next/dynamic'
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
import 'leaflet/dist/leaflet.css'

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================
type View = 'home' | 'lifelist' | 'sessions' | 'active-session' | 'summary' | 'session-detail' | 'scout'
type ExpeditionType = 'freshwater' | 'saltwater' | 'shellfish'
type YearFilter = 'all-time' | string;

interface Catch {
  id: string;
  name: string;
  weight: number;
  length: number;
  lure?: string;
  soakTime?: number; 
  keeperCount?: number; 
  date: string;
  location: string;
  sessionId: string;
  synced: number;
  media?: string[];
}

interface Expedition {
  id: string;
  type: ExpeditionType;
  location: string;
  date: string;
  startTime: string;
  duration?: string;
  catches: Catch[];
  notes: string;
  temp: string; 
  wind: string;
  cond: string;
  tides?: { high: string, low: string }; 
  lat: number | null; 
  lon: number | null;
  synced: number;
}
interface LakeScout {
  id: string;
  name: string;
  county: string;
  water_type: string;
  wdfw_url: string;
  species_present: string[];
  has_boat_launch: boolean;
  lat: number;
  lon: number;
}

interface SpeciesLibrary {
  id: string;
  name: string;
  id_tips: string;
  habitat: string;
  daily_limit: string;
  min_size: string;
  image_url: string;
}

// ============================================================================
// 2. OFFLINE DATA SEEDS
// ============================================================================


// ============================================================================
// 3. CORE HELPERS
// ============================================================================
const calculateDuration = (start: string, end?: string) => {
  if (!start) return "0m";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = endTime - startTime;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const WMO_CODES: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Fog",
  51: "Light Drizzle", 53: "Drizzle", 55: "Heavy Drizzle",
  61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Snow", 75: "Heavy Snow",
  80: "Light Showers", 81: "Showers", 82: "Heavy Showers",
  95: "Thunderstorm"
};
const getWindDirection = (deg: number) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(deg / 45) % 8];
};

const mockTidalCalc = (lat: number, lon: number) => {
  const hour = new Date().getHours();
  return {
    high: `${(hour + 4) % 12 || 12}:15 ${hour + 4 >= 12 && hour + 4 < 24 ? 'PM' : 'AM'} (8.2ft)`,
    low: `${(hour + 10) % 12 || 12}:45 ${hour + 10 >= 12 && hour + 10 < 24 ? 'PM' : 'AM'} (-1.1ft)`
  };
};

// ============================================================================
// 4. MAIN COMPONENT
// ============================================================================
export default function FishDex() {
  const [view, setView] = useState<View>('home');
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear().toString();
  const [yearFilter, setYearFilter] = useState<YearFilter>(currentYear);
  const [expandedLifeSpecies, setExpandedLifeSpecies] = useState<string | null>(null);
  const [isCustomLocation, setIsCustomLocation] = useState(false);
  const [history, setHistory] = useState<Catch[]>([]);
  const [sessionsMetadata, setSessionsMetadata] = useState<any[]>([]);
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [currentLakeData, setCurrentLakeData] = useState<any>(null);
  const [sessionLocation, setSessionLocation] = useState<string>("Detecting Location...");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [nearbyWaters, setNearbyWaters] = useState<{name: string, dist: number, data: any}[]>([]);
  const [weather, setWeather] = useState({ temp: '--', wind: '--', cond: 'Loading...' });
  const [tides, setTides] = useState<{high: string, low: string} | null>(null);
  const [sessionLat, setSessionLat] = useState<number | null>(null);
  const [sessionLon, setSessionLon] = useState<number | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [expeditionType, setExpeditionType] = useState<ExpeditionType>('freshwater');
  const [selectedSession, setSelectedSession] = useState<Expedition | null>(null);
  const [expandedLogCatch, setExpandedLogCatch] = useState<string | null>(null);
  const [expandedActiveGroup, setExpandedActiveGroup] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [sessionNotes, setSessionNotes] = useState<string>("");
  const [isEditingLogLocation, setIsEditingLogLocation] = useState(false);
  const [displayTime, setDisplayTime] = useState("0m");
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newName, setNewName] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newLength, setNewLength] = useState("");
  const [newLure, setNewLure] = useState("");
  const [newSoakTime, setNewSoakTime] = useState("");
  const [newKeeperCount, setNewKeeperCount] = useState("1");
  const [fullscreenImage, setFullscreenImage] = useState<{url: string, catchId: string} | null>(null);
  const [pbCelebration, setPbCelebration] = useState<{name: string, weight: number, year: string} | null>(null);
  
  const [scoutSearchMode, setScoutSearchMode] = useState<'lake' | 'fish'>('lake');
  const [scoutResults, setScoutResults] = useState<any[]>([]);
  const [scoutQuery, setScoutQuery] = useState("");

  // ============================================================================
  // 5. HANDLER FUNCTIONS (MOVED INSIDE COMPONENT)
  // ============================================================================
  
  const handleImageUpload = (catchId: string, file: File) => {
    const fakeUrl = URL.createObjectURL(file);
    setHistory(prev => prev.map(c => c.id === catchId ? { ...c, media: [...(c.media || []), fakeUrl] } : c));

    if (selectedSession) {
      setSelectedSession({
        ...selectedSession,
        catches: selectedSession.catches.map(c => c.id === catchId ? { ...c, media: [...(c.media || []), fakeUrl] } : c)
      });
    }
  };

  const handleUpdateSessionLocation = async (sessionId: string, newLocation: string) => {
    if (!newLocation || newLocation.trim() === "") {
      setIsEditingLogLocation(false);
      return;
    }
    try {
      setSessionsMetadata(prev => prev.map(s => s.id === sessionId ? { ...s, location: newLocation, synced: 0 } : s));
      setHistory(prev => prev.map(f => f.sessionId === sessionId ? { ...f, location: newLocation, synced: 0 } : f));
      await db.localSessions.update(sessionId, { location: newLocation, synced: 0 });
      
      if (selectedSession) setSelectedSession({ ...selectedSession, location: newLocation });
      setIsEditingLogLocation(false);
    } catch (err) {
      console.error("Failed to update location:", err);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Are you sure you want to delete this entire expedition?")) return;
    try {
      await db.localSessions.delete(sessionId);
      await db.localSpecies.where('sessionId').equals(sessionId).delete();
      setHistory(prev => prev.filter(c => c.sessionId !== sessionId));
      setSessionsMetadata(prev => prev.filter(s => s.id !== sessionId));
      setSelectedSession(null);
      setView('sessions');
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleDeleteImage = async () => {
    if (!fullscreenImage) return;
    const { url, catchId } = fullscreenImage;
    if (!window.confirm("Are you sure you want to delete this photo?")) return;

    setHistory(prev => prev.map(c => {
      if (c.id === catchId) {
        const newMedia = (c.media || []).filter(m => m !== url);
        db.localSpecies.update(catchId, { media: newMedia, synced: 0 } as any).catch(console.error);
        return { ...c, media: newMedia, synced: 0 };
      }
      return c;
    }));
    setFullscreenImage(null);
  };

  const handleFinalizeSession = async () => {
  if (!currentSessionId || !startTime) return;

  const sessionData: Expedition = {
    id: currentSessionId,
    type: expeditionType,
    location: sessionLocation,
    startTime: new Date(startTime).toISOString(),
    date: new Date(startTime).toISOString(),
    duration: calculateDuration(new Date(startTime).toISOString()), // ⏱️ Store the final time
    notes: sessionNotes,
    temp: weather.temp,
    wind: weather.wind,
    cond: weather.cond,
    lat: sessionLat ?? null,
    lon: sessionLon ?? null,
    tides: tides || undefined,
    synced: 0,
    catches: []
  };

    await db.localSessions.add(sessionData);
    localStorage.removeItem('active_session_id');
    localStorage.removeItem('active_session_start');
    localStorage.removeItem('active_session_type');
    setCurrentSessionId(null);
    setSessionNotes("");
    setView('home');
    fetchData();
  };

  // ============================================================================
  // 6. INITIALIZATION & DATA FETCHING
  // ============================================================================
  useEffect(() => {
    setDeletedSessionIds(JSON.parse(localStorage.getItem('deleted_sessions') || '[]'));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Concurrent Fetch from Cloud
      const [catchRes, sessionRes] = await Promise.all([
        fetch('/api/species/list', { cache: 'no-store' }),
        fetch('/api/species/sessions/list', { cache: 'no-store' }) 
      ]);
      
      const catchData = await catchRes.json();
      const sessionData = await sessionRes.json();

      // 2. Pull ALL local data (Synced + Unsynced)
      const localFish = await db.localSpecies.toArray();
      const localSessions = await db.localSessions.toArray();

      // 3. Sync Offline Lake Cache
      const localLakeCount = await db.fishingLocations.count();
      if (localLakeCount === 0 && navigator.onLine) {
        const { data: lakes, error } = await supabase.from('fishing_locations').select('*');
        if (!error && lakes) await db.fishingLocations.bulkAdd(lakes);
      }

      // 4. Deduplicate Sessions (The "Ghost Log" Killer)
      setSessionsMetadata(() => {
        const sessionMap = new Map();
        localSessions.forEach(s => sessionMap.set(s.id, s));
        if (sessionData.sessions) {
          sessionData.sessions.forEach((s: any) => sessionMap.set(s.id, s));
        }
        return Array.from(sessionMap.values());
      });

      // 5. Deduplicate Fish
      setHistory(() => {
        const fishMap = new Map();
        localFish.forEach(f => fishMap.set(f.id, f));
        if (catchData.species) {
          catchData.species.forEach((f: any) => fishMap.set(f.id, f));
        }
        return Array.from(fishMap.values());
      });

    } catch (e) { 
      console.warn("Cloud fetch failed, loading offline vault...");
      const allLocalFish = await db.localSpecies.toArray();
      const allLocalSessions = await db.localSessions.toArray();
      setHistory(allLocalFish);
      setSessionsMetadata(allLocalSessions);
    } finally {
      setLoading(false);
    }
  };

  const updateLocationData = async () => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setSessionLat(lat);
      setSessionLon(lon);

      const allLakes = await db.fishingLocations.toArray();
      const nearby = allLakes
        .map((water: any) => ({ 
          name: water.name, 
          dist: calculateDistance(lat, lon, water.lat, water.lon),
          data: water 
        }))
        .filter((w: any) => w.dist < 5) 
        .sort((a: any, b: any) => a.dist - b.dist);
      
      setNearbyWaters(nearby);
      
      const currentLoc = sessionLocation;
      const needsUpdate = currentLoc === "Detecting Location..." || currentLoc === "Unknown Coordinates" || currentLoc.includes("Coord:");

      if (needsUpdate && nearby.length > 0) {
        setSessionLocation(nearby[0].name);
        setCurrentLakeData(nearby[0].data); 
      } else if (needsUpdate) {
        setSessionLocation(`Station: ${lat.toFixed(3)}, ${lon.toFixed(3)}`);
      }

      if (expeditionType === 'saltwater' || expeditionType === 'shellfish') {
        setTides(mockTidalCalc(lat, lon));
      }
      
      try {
        const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_KEY;
        if (apiKey && navigator.onLine) {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`);
          const data = await res.json();
          if (data.main) {
            setWeather({
              temp: `${Math.round(data.main.temp)}°F`,
              wind: `${Math.round(data.wind.speed)}mph ${getWindDirection(data.wind.deg)}`,
              cond: data.weather[0].main
            });
          }
        }
      } catch (e) { 
    setWeather({ temp: 'Pending', wind: 'Pending', cond: 'Offline' });
  }
    }, (error) => {
      console.error("GPS Error:", error);
      setSessionLocation("GPS Signal Blocked");
    }, { enableHighAccuracy: true });
  };

// 1. UPDATED RECONNECTION LISTENER
useEffect(() => {
  const handleOnline = async () => {
    console.log("🌐 Signal Restored: Forcing Weather Backfill...");
    // Give the DB 1 second to breathe before querying
    setTimeout(() => {
      backfillMissingWeather();
      fetchData(); // Syncs the "Local Vault Active" status
    }, 1000);
  };

  window.addEventListener('online', handleOnline);
  if (navigator.onLine) backfillMissingWeather();

  return () => window.removeEventListener('online', handleOnline);
}, []); // Keep dependency array empty to prevent re-running on every history change

// 2. IMPROVED BACKFILL ENGINE
const backfillMissingWeather = async () => {
  const incompleteSessions = await db.localSessions
    .where('temp').equals('Pending')
    .toArray();

  if (incompleteSessions.length === 0) return;

  for (const session of incompleteSessions) {
    if (!session.lat || !session.lon) continue;

    try {
      const dateStr = new Date(session.startTime).toISOString().split('T')[0];
      const hour = new Date(session.startTime).getHours();

      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${session.lat}&longitude=${session.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`
      );
      const data = await res.json();

      if (!data.hourly) continue;

      const tempVal = Math.round(data.hourly.temperature_2m[hour]);
      const windVal = Math.round(data.hourly.wind_speed_10m[hour]);
      const conditionText = WMO_CODES[data.hourly.weather_code[hour]] || "Overcast";

      const updatedFields = {
        temp: `${tempVal}°F`,
        wind: `${windVal}mph`,
        cond: conditionText,
        synced: 0 
      };

      // Update Database
      await db.localSessions.update(session.id, updatedFields);
      
      // Update UI State immediately
      setSessionsMetadata(prev => prev.map(s => 
        s.id === session.id ? { ...s, ...updatedFields } : s
      ));

      // Update Selected Session if the user is currently looking at it
      if (selectedSession?.id === session.id) {
        setSelectedSession(prev => prev ? { ...prev, ...updatedFields } : null);
      }

    } catch (err) {
      console.error("Backfill failed:", err);
    }
  }
};


  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (view === 'active-session') updateLocationData(); }, [view, expeditionType]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (startTime) setDisplayTime(calculateDuration(new Date(startTime).toISOString()));
    }, 60000);
    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    const savedId = localStorage.getItem('active_session_id');
    const savedStart = localStorage.getItem('active_session_start');
    const savedType = localStorage.getItem('active_session_type') as ExpeditionType;
    if (savedId && savedStart) {
      setCurrentSessionId(savedId);
      setStartTime(parseInt(savedStart));
      if (savedType) setExpeditionType(savedType);
      setView('active-session');
    }
  }, []);

  const intelligenceData = useMemo(() => {
    if (!sessionLocation || !currentLakeData) return null;
    const historyAtLake = history.filter(h => h.location === sessionLocation && !deletedSessionIds.includes(h.sessionId));
    const lureSuccess: Record<string, number> = {};
    historyAtLake.forEach(h => { if (h.lure) lureSuccess[h.lure] = (lureSuccess[h.lure] || 0) + 1; });
    const topLure = Object.entries(lureSuccess).sort((a, b) => b[1] - a[1])[0];

    return {
      expectedSpecies: currentLakeData.species_present || ["Unknown"],
      historyCount: historyAtLake.length,
      topTactic: topLure ? `${topLure[0]} (${topLure[1]} catches)` : 'No data. Experiment required.',
      boatLaunch: currentLakeData.has_boat_launch
    };
  }, [sessionLocation, currentLakeData, history, deletedSessionIds]);

  const handleStartSession = (type: ExpeditionType) => {
    const newId = crypto.randomUUID();
    const now = Date.now();
    localStorage.setItem('active_session_id', newId);
    localStorage.setItem('active_session_start', now.toString());
    localStorage.setItem('active_session_type', type);
    setCurrentSessionId(newId);
    setStartTime(now);
    setExpeditionType(type);
    setView('active-session');
  };

  const handleCancelSession = () => {
    if (window.confirm("Abort expedition? This will erase all data for this active session.")) {
      localStorage.removeItem('active_session_id');
      localStorage.removeItem('active_session_start');
      localStorage.removeItem('active_session_type');
      setCurrentSessionId(null);
      setStartTime(null);
      setHistory(prev => prev.filter(c => c.sessionId !== currentSessionId));
      setView('home');
    }
  };

  const handleScoutSearch = async (query: string) => {
    setScoutQuery(query);
    if (query.length < 2) { setScoutResults([]); return; }
    setLoading(true);
    try {
      let response;
      if (scoutSearchMode === 'lake') {
        response = await supabase.from('fishing_locations').select('*').ilike('name', `%${query}%`).limit(10);
      } else {
        response = await supabase.rpc('search_lakes_by_species', { search_term: query });
      }
      const { data, error } = response;
      if (error) throw error;
      setScoutResults(data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewOfficialRegs = (lakeName: string) => {
    const cleanName = lakeName.split('(')[0].trim();
    const searchParam = encodeURIComponent(cleanName);
    const searchUrl = `https://wdfw.wa.gov/fishing/locations?title=${searchParam}`;
    window.open(searchUrl, '_blank');
  };

  const handleNearbyScout = async () => {
    if (!sessionLat || !sessionLon) { alert("GPS coordinates not acquired."); return; }
    setLoading(true);
    setScoutQuery("Nearby Waters");
    try {
      const { data, error } = await supabase.rpc('get_nearby_lakes', {
        user_lat: sessionLat,
        user_lon: sessionLon,
        radius_meters: 16093 
      });
      if (error) throw error;
      setScoutResults(data || []);
    } catch (err) {
      const allLocalLakes = await db.fishingLocations.toArray();
      const offlineNearby = allLocalLakes
        .filter((lake: any) => calculateDistance(sessionLat, sessionLon, lake.lat, lake.lon) < 10)
        .sort((a, b) => calculateDistance(sessionLat, sessionLon, a.lat, a.lon) - calculateDistance(sessionLat, sessionLon, b.lat, b.lon));
      setScoutResults(offlineNearby);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCatch = async () => {
    if (!newName || !currentSessionId) return;
    const weightNum = Number(newWeight) || 0;
    const existingRecord = lifeList.find(s => s.name === newName);
    const isPB = weightNum > (existingRecord?.maxWeight || 0);

    const newCatch: Catch = {
      id: crypto.randomUUID(),
      name: newName,
      weight: weightNum,
      length: Number(newLength) || 0,
      lure: newLure,
      soakTime: Number(newSoakTime) || 0,
      keeperCount: Number(newKeeperCount) || 1,
      date: new Date().toISOString(),
      location: sessionLocation,
      sessionId: currentSessionId,
      synced: 0,
      media: []
    };
    
    try {
      await db.localSpecies.add(newCatch);
      setHistory([newCatch, ...history]);
      if (isPB && expeditionType === 'freshwater') {
        setPbCelebration({ name: newName, weight: weightNum, year: new Date().getFullYear().toString() });
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        setTimeout(() => setPbCelebration(null), 6000);
      }
      setShowAddDrawer(false);
      setNewName(""); setNewWeight(""); setNewLength(""); setNewLure(""); setNewSoakTime(""); setNewKeeperCount("1"); setSearchTerm("");
    } catch (err) { console.error(err); }
  };

  const handleDeleteCatch = async (catchId: string) => {
    if (!window.confirm("Delete this record permanently?")) return;
    await db.localSpecies.delete(catchId);
    setHistory(prev => prev.filter(c => c.id !== catchId));
    if (selectedSession) {
      setSelectedSession({ ...selectedSession, catches: selectedSession.catches.filter(c => c.id !== catchId) });
    }
    if (navigator.onLine) {
      fetch(`/api/species/delete?id=${catchId}`, { method: 'DELETE' }).catch(console.error);
    }
  };

  const filteredHistory = useMemo(() => {
    if (yearFilter === 'all-time') return history;
    return history.filter(h => new Date(h.date).getFullYear().toString() === yearFilter);
  }, [history, yearFilter]);

  const pendingSyncCount = useMemo(() => {
    const unsyncedFish = history.filter(f => (f as any).synced === 0 && !deletedSessionIds.includes(f.sessionId)).length;
    const unsyncedSessions = sessionsMetadata.filter(s => s.synced === 0 && !deletedSessionIds.includes(s.id)).length;
    return unsyncedFish + unsyncedSessions;
  }, [history, sessionsMetadata, deletedSessionIds]);

  const filteredSpeciesList = useMemo(() => {
    if (intelligenceData?.expectedSpecies && !searchTerm && expeditionType === 'freshwater') {
      return intelligenceData.expectedSpecies; 
    }
    let sourceList: string[] = [];
    if (expeditionType === 'freshwater') sourceList = ALL_SPECIES;
    else if (expeditionType === 'saltwater') sourceList = ['Lingcod', 'Pacific cod', 'Cabezon', 'Pacific halibut', 'Chinook salmon', 'Coho salmon'];
    else if (expeditionType === 'shellfish') sourceList = ['Dungeness crab', 'Red rock crab', 'Signal crayfish', 'Pacific razor clam', 'Spot shrimp'];
    
    if (!searchTerm) return sourceList.slice(0, 5);
    return sourceList.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5);
  }, [searchTerm, expeditionType, intelligenceData]);

  const sessionLogs = useMemo(() => {
    return sessionsMetadata
      .filter(meta => !deletedSessionIds.includes(meta.id))
      .filter(meta => yearFilter === 'all-time' || new Date(meta.startTime || meta.date).getFullYear().toString() === yearFilter)
      .map(meta => ({ ...meta, catches: history.filter(f => f.sessionId === meta.id) }))
      .sort((a, b) => new Date(b.startTime || b.date).getTime() - new Date(a.startTime || a.date).getTime());
  }, [history, sessionsMetadata, deletedSessionIds, yearFilter]);

  const groupedSessionCatches = useMemo(() => {
    const sessionHistory = history.filter(h => h.sessionId === currentSessionId);
    const groups: Record<string, { name: string, items: Catch[], totalKeepers: number }> = {};
    sessionHistory.forEach(fish => {
      if (!groups[fish.name]) groups[fish.name] = { name: fish.name, items: [], totalKeepers: 0 };
      groups[fish.name].items.push(fish);
      groups[fish.name].totalKeepers += (fish.keeperCount || 1);
    });
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [history, currentSessionId]);

  const lifeList = useMemo(() => {
    const list: Record<string, any> = {};
    filteredHistory.filter(fish => fish.sessionId && !deletedSessionIds.includes(fish.sessionId)).forEach(fish => {
      if (!list[fish.name]) {
        list[fish.name] = { name: fish.name, count: 0, maxWeight: 0, waters: new Set(), lureCounts: {} };
      }
      list[fish.name].count += (fish.keeperCount || 1);
      list[fish.name].waters.add(fish.location);
      if (fish.weight > list[fish.name].maxWeight) list[fish.name].maxWeight = fish.weight;
      if (fish.lure) list[fish.name].lureCounts[fish.lure] = (list[fish.name].lureCounts[fish.lure] || 0) + 1;
    });
    return Object.values(list).sort((a: any, b: any) => b.count - a.count);
  }, [filteredHistory, deletedSessionIds]);
  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      
      {/* ------------------------------------------------------------------------
          HOME VIEW 
          ------------------------------------------------------------------------ */}
      {view === 'home' && (
        <main className="max-w-md mx-auto px-6 pt-16 pb-10 flex flex-col min-h-screen relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-7xl font-black italic text-white tracking-tighter leading-none">eFish</h1>
              <p className="text-blue-500 font-black text-[9px] uppercase tracking-[0.4em] mt-1">Washington Archive</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex">
             <button onClick={() => setYearFilter(currentYear)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${yearFilter === currentYear ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>{currentYear}</button> 
              <button onClick={() => setYearFilter('all-time')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${yearFilter === 'all-time' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500'}`}>All-Time</button>
            </div>
          </div>
          
          <div className="space-y-4 flex-grow">
            {currentSessionId ? (
              <button onClick={() => setView('active-session')} className="w-full py-12 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-blue-800 shadow-[0_10px_40px_rgba(37,99,235,0.3)] flex flex-col items-center border-b-4 border-blue-900 active:scale-95 transition-all">
                <span className="text-[10px] font-black uppercase text-blue-200 tracking-[0.3em] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span> Expedition Active
                </span>
                <span className="text-3xl font-black uppercase italic tracking-tighter text-white">Resume Trip</span>
              </button>
            ) : (
              <div className="bg-slate-900/50 p-2 rounded-[3rem] border border-slate-800/80 shadow-2xl backdrop-blur-md">
                <p className="text-center text-[8px] font-black uppercase text-slate-500 tracking-[0.3em] pt-4 pb-2">Deploy Expedition</p>
                <div className="grid grid-cols-1 gap-2 p-2">
                  <button onClick={() => handleStartSession('freshwater')} className="w-full py-6 rounded-[2rem] bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between px-8 active:scale-[0.98] transition-all group">
                    <div className="flex items-center gap-4"><span className="text-2xl">🌲</span><span className="font-black uppercase tracking-widest text-xs text-white">Freshwater</span></div>
                    <span className="text-slate-500 group-hover:text-blue-400">→</span>
                  </button>
                  <button onClick={() => handleStartSession('saltwater')} className="w-full py-6 rounded-[2rem] bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between px-8 active:scale-[0.98] transition-all group">
                    <div className="flex items-center gap-4"><span className="text-2xl">🌊</span><span className="font-black uppercase tracking-widest text-xs text-white">Saltwater</span></div>
                    <span className="text-slate-500 group-hover:text-blue-400">→</span>
                  </button>
                  <button onClick={() => handleStartSession('shellfish')} className="w-full py-6 rounded-[2rem] bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between px-8 active:scale-[0.98] transition-all group">
                    <div className="flex items-center gap-4"><span className="text-2xl">🦀</span><span className="font-black uppercase tracking-widest text-xs text-white">Shellfish</span></div>
                    <span className="text-slate-500 group-hover:text-blue-400">→</span>
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => setView('scout')} className="w-full py-8 mt-4 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex items-center justify-between px-8 group active:scale-95 transition-all shadow-xl hover:border-blue-500/30">
              <div className="flex items-center gap-4">
                <span className="text-3xl grayscale group-hover:grayscale-0 transition-all">🗺️</span>
                <div className="text-left">
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">WDFW Integration</p>
                  <p className="text-lg font-black italic uppercase text-white tracking-tight">Field Scout</p>
                </div>
              </div>
              <span className="text-slate-700 group-hover:text-blue-500 transition-colors">→</span>
            </button>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setView('lifelist')} className="bg-slate-900/50 p-8 rounded-[2rem] border border-slate-800 flex flex-col items-center gap-3 hover:bg-slate-800/80 transition-all">
                <span className="text-3xl">🏆</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Life List</span>
              </button>
              <button onClick={() => setView('sessions')} className="bg-slate-900/50 p-8 rounded-[2rem] border border-slate-800 flex flex-col items-center gap-3 hover:bg-slate-800/80 transition-all">
                <span className="text-3xl">📖</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Log Book</span>
              </button>
            </div>
          </div>

          <div 
            onClick={() => {
              if (navigator.onLine) {
                console.log("Manual Sync Triggered...");
                backfillMissingWeather();
                fetchData(); 
              }
            }}
            className="mt-8 p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800/50 flex items-center justify-between active:scale-95 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${pendingSyncCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
                {pendingSyncCount > 0 ? 'Local Vault Active (Tap to Sync)' : 'Cloud Synced'}
              </span>
            </div>
            {pendingSyncCount > 0 && (
              <span className="text-[8px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                {pendingSyncCount} Items
              </span>
            )}
          </div>
        </main>
      )}

      {/* ------------------------------------------------------------------------
          ACTIVE SESSION VIEW 
          ------------------------------------------------------------------------ */}
      {view === 'active-session' && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView('home')} className="bg-slate-900 hover:bg-slate-800 w-12 h-12 rounded-full border border-slate-700 flex items-center justify-center font-black transition-colors">←</button>
            <div className="text-right">
              <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> {expeditionType} Trip
              </p>
              <p className="text-2xl font-black italic tracking-tighter text-white">{displayTime}</p>
            </div>
          </div>



{/* --- TACTICAL LOCATION CENTER --- */}
<div 
  className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 mb-4 shadow-xl group relative overflow-hidden transition-all active:scale-[0.98] cursor-pointer" 
  onClick={() => setShowLocationModal(true)}
>
  <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
  <p className="text-[9px] font-black text-slate-500 uppercase mb-1 tracking-widest flex justify-between items-center">
    <span>📍 Current AO</span>
    <span className="text-blue-500 text-[8px] animate-pulse font-black uppercase tracking-widest">Tap to Change</span>
  </p>

  <div className="mt-2 flex items-center justify-between">
    <h2 className="text-3xl font-black italic text-white uppercase truncate tracking-tighter leading-none">
      {sessionLocation}
    </h2>
    <span className="text-slate-700 text-xl group-hover:text-blue-500 transition-colors">🔍</span>
  </div>
</div>

          {/* DYNAMIC ENVIRONMENTAL DATA */}
          {expeditionType === 'freshwater' ? (
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-slate-900/60 py-4 rounded-[1.5rem] border border-slate-800/50 text-center shadow-inner">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Air</p>
                <p className="text-sm font-black text-white">{weather.temp}</p>
              </div>
              <div className="bg-slate-900/60 py-4 rounded-[1.5rem] border border-slate-800/50 text-center shadow-inner">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Wind</p>
                <p className="text-sm font-black text-white">{weather.wind}</p>
              </div>
              <div className="bg-slate-900/60 py-4 rounded-[1.5rem] border border-slate-800/50 text-center shadow-inner">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Sky</p>
                <p className="text-[10px] font-black uppercase text-white truncate px-1">{weather.cond}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-6">
              <div className="bg-slate-900/60 p-4 rounded-[1.5rem] border border-slate-800/50 flex justify-between items-center">
                <div>
                  <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">High Tide</p>
                  <p className="text-sm font-black text-white">{tides?.high || '--'}</p>
                </div>
                <span className="text-2xl opacity-20">🌊</span>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-[1.5rem] border border-slate-800/50 flex justify-between items-center">
                <div>
                  <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Low Tide</p>
                  <p className="text-sm font-black text-white">{tides?.low || '--'}</p>
                </div>
                <span className="text-2xl opacity-20">🐚</span>
              </div>
            </div>
          )}

          {/* PREDICTIVE INTELLIGENCE PANEL */}
{intelligenceData && expeditionType === 'freshwater' && (
  <div className="mb-8 bg-gradient-to-br from-slate-900 to-[#050b1a] p-5 rounded-[2rem] border border-blue-900/30 shadow-2xl relative overflow-hidden">
    {/* Ambient Glow */}
    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl"></div>
    
    <div className="flex justify-between items-center mb-4">
      <p className="text-[8px] font-black text-blue-500 uppercase tracking-[0.3em]">Tactical Intelligence</p>
      {currentLakeData?.county && (
        <span className="text-[7px] font-black text-slate-400 uppercase bg-slate-800/80 px-2 py-1 rounded border border-slate-700 backdrop-blur-sm">
          {currentLakeData.county} Co.
        </span>
      )}
    </div>
    
    <div className="space-y-4 relative z-10">
      {/* Species Row */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-sm border border-blue-500/20 shadow-inner">🐟</div>
        <div>
          <p className="text-[9px] font-bold uppercase text-slate-500 mb-0.5 tracking-tight">Expected Species</p>
          <p className="text-[11px] font-black text-white leading-snug">
            {intelligenceData.expectedSpecies.join(', ')}
          </p>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/50">
        <div className="flex items-center gap-2.5">
          <span className="text-xs opacity-70">🚢</span>
          <div>
            <p className="text-[7px] font-black uppercase text-slate-500 tracking-tighter">Boat Access</p>
            <p className={`text-[9px] font-black uppercase ${intelligenceData.boatLaunch ? 'text-emerald-500' : 'text-red-500'}`}>
              {intelligenceData.boatLaunch ? 'Launch Available' : 'No Launch'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs opacity-70">📊</span>
          <div>
            <p className="text-[7px] font-black uppercase text-slate-500 tracking-tighter">Your Intel</p>
            <p className="text-[9px] font-black uppercase text-blue-400">
              {intelligenceData.historyCount} Local Catches
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* Regulation Quick-Link */}
    {currentLakeData?.wdfw_url && (
      <a 
        href={currentLakeData.wdfw_url} 
        target="_blank" 
        rel="noreferrer" 
        className="mt-4 block w-full bg-slate-800/50 hover:bg-blue-600/20 py-2.5 rounded-xl text-[8px] font-black uppercase text-slate-400 hover:text-blue-400 text-center border border-slate-700 hover:border-blue-500/30 transition-all tracking-[0.1em]"
      >
        Open WDFW Regulations ↗
      </a>
    )}
  </div>
)}

          {/* HAUL TRACKER */}
          <div className="space-y-3">
            <div className="flex justify-between items-end mb-4 px-2">
              <p className="text-[10px] font-black text-white uppercase tracking-widest">Live Haul</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase">{groupedSessionCatches.reduce((acc, curr) => acc + curr.totalKeepers, 0)} Total</p>
            </div>
            
            {groupedSessionCatches.length === 0 ? (
              <div className="border-2 border-dashed border-slate-800/80 rounded-[2rem] p-10 text-center">
                <p className="text-[10px] uppercase font-black text-slate-600 tracking-widest">No entries yet. Keep casting.</p>
              </div>
            ) : (
              groupedSessionCatches.map(group => (
                <div key={group.name} className="bg-slate-900/60 rounded-2xl border border-slate-800/50 overflow-hidden shadow-lg">
                  <div onClick={() => setExpandedActiveGroup(expandedActiveGroup === group.name ? null : group.name)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/40 transition-colors">
                    <span className="font-black text-[11px] uppercase text-white tracking-widest">{group.name}</span>
                    <div className="flex gap-3 items-center">
                      <span className="bg-blue-600 px-3 py-1 rounded-full text-[9px] font-black text-white shadow-inner">x{group.totalKeepers}</span>
                      <span className="text-slate-600 text-[10px]">{expandedActiveGroup === group.name ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  
                  {expandedActiveGroup === group.name && (
                    <div className="p-4 pt-0 border-t border-slate-800/50 mt-2 space-y-2 bg-black/20">
                      {group.items.map((fish, index) => (
                        <div key={fish.id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-[10px] font-black text-white uppercase tracking-tight">Entry #{group.items.length - index}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                {expeditionType === 'shellfish' 
                                  ? `${fish.keeperCount} Keepers • Soak: ${fish.soakTime}hr` 
                                  : `${fish.weight}lb • ${fish.length}in`}
                              </p>
                              {fish.lure && <p className="text-[8px] text-blue-400 uppercase mt-1 font-black">🎣 {fish.lure}</p>}
                            </div>
                            <button onClick={() => handleDeleteCatch(fish.id)} className="text-[8px] font-black uppercase text-red-500 bg-red-500/10 px-3 py-1.5 rounded hover:bg-red-500/20 transition-colors">Del</button>
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            {fish.media && fish.media.length > 0 ? (
                               <div className="flex gap-2 overflow-x-auto pb-1">
                                {fish.media.map((url: string) => (
                                  <img key={url} src={url} onClick={() => setFullscreenImage({ url, catchId: fish.id })} className="w-12 h-12 rounded-lg object-cover border border-slate-600" alt="Catch" />
                                ))}
                               </div>
                            ) : (
                               <label className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-2 cursor-pointer hover:text-white transition-colors w-max">
                                 <span className="text-lg">📷</span> Attach Photo
                                 <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(fish.id, e.target.files[0]); }}/>
                               </label>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          
          <div className="mt-8 grid grid-cols-2 gap-3">
  {/* NEW: Cancel/Abort Button */}
  <button 
    onClick={handleCancelSession} 
    className="py-6 text-[10px] font-black uppercase text-red-500 border border-red-500/20 rounded-[2rem] bg-red-500/5 hover:bg-red-500/10 transition-colors tracking-widest shadow-inner"
  >
    Abort Trip
  </button>

  {/* EXISTING: Conclude Button */}
  <button 
    onClick={() => setView('summary')} 
    className="py-6 text-[10px] font-black uppercase text-blue-400 border border-blue-500/20 rounded-[2rem] bg-blue-500/5 hover:bg-blue-500/10 transition-colors tracking-widest shadow-inner"
  >
    Conclude
  </button>
</div>

          <button onClick={() => setShowAddDrawer(true)} className="fixed bottom-10 left-6 right-6 max-w-md mx-auto bg-blue-600 h-20 rounded-[2.5rem] shadow-[0_10px_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 text-white z-40 border-b-4 border-blue-800 active:scale-95 transition-all">
            <span className="text-2xl font-black">+</span>
            <span className="font-black uppercase text-xs tracking-[0.2em]">{expeditionType === 'shellfish' ? 'Log Pot/Limit' : 'Record Specimen'}</span>
          </button>
        </main>
      )}

      {/* ------------------------------------------------------------------------
          SCOUT 
          ------------------------------------------------------------------------ */}
      {view === 'scout' && (
        <main className="max-w-md mx-auto px-6 pt-12 pb-32 animate-in fade-in duration-300">
          <button onClick={() => setView('home')} className="mb-10 text-slate-500 font-black uppercase text-[9px] tracking-[0.2em] hover:text-white transition-colors">← Operations Center</button>
          
          <h2 className="text-6xl font-black italic uppercase mb-1 tracking-tighter text-white leading-none">Scout</h2>
          <p className="text-blue-500 font-black text-[9px] uppercase mb-8 tracking-[0.3em]">WDFW Tactical Database</p>

          <div className="flex bg-slate-900 rounded-[1.5rem] p-1.5 mb-8 border border-slate-800 shadow-inner">
            <button onClick={() => { setScoutSearchMode('lake'); setScoutResults([]); setScoutQuery(""); }} className={`flex-1 py-4 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${scoutSearchMode === 'lake' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Waterbodies</button>
            <button onClick={() => { setScoutSearchMode('fish'); setScoutResults([]); setScoutQuery(""); }} className={`flex-1 py-4 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${scoutSearchMode === 'fish' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Species Lib.</button>
          </div>

          <div className="relative mb-8">
  <input 
    type="text" 
    value={scoutQuery} 
    placeholder={scoutSearchMode === 'lake' ? "Search 8,000+ WA Lakes..." : "Search Fish Species..."} 
    className="w-full bg-slate-900/80 border border-slate-700 rounded-[2rem] p-6 pr-32 text-sm text-white outline-none focus:border-blue-500 transition-all shadow-2xl placeholder:text-slate-600 font-bold" 
    onChange={(e) => handleScoutSearch(e.target.value)} 
  />
  
  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
    {loading && <div className="text-xl animate-spin text-blue-500">⚙</div>}

    {scoutSearchMode === 'lake' && (
      <button 
        onClick={handleNearbyScout}
        className="bg-blue-600/20 hover:bg-blue-600 p-3 rounded-xl border border-blue-500/40 transition-all active:scale-95 shadow-lg group"
        title="Find lakes within 10 miles"
      >
        <span className="text-lg group-active:animate-ping">📡</span>
      </button>
    )}
  </div>
</div>

          <div className="space-y-4">
            {scoutResults.length === 0 && scoutQuery.length > 1 && !loading && (
              <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-[2rem]">
                 <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">No matching intel found.</p>
              </div>
            )}

            {scoutResults.map((result) => (
  <div key={result.id} className="bg-slate-900/60 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl hover:border-blue-500/40 transition-colors">
    {/* --- UPDATED HEADER --- */}
    <div className="flex justify-between items-start mb-6">
      <div className="w-2/3">
        <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none mb-2">
          {result.name}
        </h3>
        {/* 🌲 BACKCOUNTRY BADGE */}
        {!result.has_boat_launch && result.water_type === 'Lake' && (
          <span className="text-[7px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20 uppercase tracking-[0.2em] animate-in fade-in zoom-in duration-500">
            ⛰️ Backcountry / Trek-In
          </span>
        )}
      </div>
      {scoutSearchMode === 'lake' && (
        <span className="text-[8px] font-black bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg uppercase tracking-widest border border-blue-500/30 text-right">
          {result.county} Co.
        </span>
      )}
    </div>

                {scoutSearchMode === 'lake' ? (
                  <div className="space-y-4">
  {/* 🐟 NEW: DYNAMIC SPECIES PILLS (REPLACES OLD TEXT BLOCK) */}
  <div className="bg-black/30 p-5 rounded-2xl border border-slate-800">
    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3">Full Biodiversity Intel</p>
    <div className="flex flex-wrap gap-2">
      {result.species_present && result.species_present.length > 0 ? (
        result.species_present.map((fish: string) => (
          <span 
            key={fish} 
            className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all ${
              scoutQuery && fish.toLowerCase().includes(scoutQuery.toLowerCase())
                ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.4)]' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {fish}
          </span>
        ))
      ) : (
        <p className="text-[10px] text-slate-600 font-bold uppercase italic">No biodiversity data on file.</p>
      )}
    </div>
  </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/30 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                         <span className="text-[9px] font-black uppercase text-slate-400">Boat Access</span>
                         <span className={`w-3 h-3 rounded-full ${result.has_boat_launch ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      </div>
                      <div className="bg-black/30 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                         <span className="text-[9px] font-black uppercase text-slate-400">Water Type</span>
                         <span className="text-[10px] font-black text-white">{result.water_type}</span>
                      </div>
                    </div>
                    <button 
  onClick={() => handleViewOfficialRegs(result.name)} 
  className="block w-full bg-blue-600/10 hover:bg-blue-600/20 py-4 rounded-2xl text-[9px] font-black uppercase text-blue-400 text-center border border-blue-500/30 transition-colors tracking-widest mt-2"
>
  View Official Regs ↗
</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                   <div className="bg-black/30 p-5 rounded-2xl border border-slate-800">
      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3">
        Full Biodiversity Intel
      </p>
      <div className="flex flex-wrap gap-2">
        {result.species_present && result.species_present.length > 0 ? (
          result.species_present.map((fish: string) => {
            // Highlights fish that match your current search term
            const isMatch = scoutQuery && fish.toLowerCase().includes(scoutQuery.toLowerCase());
            
            return (
              <span 
                key={fish} 
                className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all ${
                  isMatch
                    ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.4)] scale-105 z-10' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 opacity-70'
                }`}
              >
                {fish}
              </span>
            );
          })
        ) : (
          <p className="text-[10px] text-slate-600 font-bold uppercase italic">No biodiversity data on file.</p>
        )}
      </div>
    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Min Size</p>
                        <p className="text-sm font-black uppercase text-white">{result.min_size || 'None'}</p>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Daily Limit</p>
                        <p className="text-sm font-black uppercase text-white">{result.daily_limit || 'None'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      )}

      {/* ------------------------------------------------------------------------
    LIFE LIST 
    ------------------------------------------------------------------------ */}
{view === 'lifelist' && (
  <main className="max-w-md mx-auto px-6 pt-12 pb-32 animate-in fade-in duration-300">
    <div className="flex justify-between items-start mb-8">
      <div>
        <button onClick={() => setView('home')} className="mb-4 text-slate-500 font-black uppercase text-[9px] tracking-widest hover:text-white transition-colors">← Return</button>
        <h2 className="text-5xl font-black italic uppercase text-white tracking-tighter leading-none">Life List</h2>
        <p className="text-blue-500 font-black text-[10px] uppercase tracking-widest mt-2">{lifeList.length} Unique Species</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex flex-col gap-1 shadow-lg">
        <button onClick={() => setYearFilter(currentYear)} className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${yearFilter === currentYear ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{currentYear}</button>
        <button onClick={() => setYearFilter('all-time')} className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${yearFilter === 'all-time' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>All-Time</button>
      </div>
    </div>

    <div className="space-y-4">
      {lifeList.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
            <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">No records for {yearFilter}</p>
          </div>
      ) : (
        lifeList.map((item: any, index: number) => (
          <div key={item.name} className="bg-slate-900/80 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-xl">
            <button onClick={() => setExpandedLifeSpecies(expandedLifeSpecies === item.name ? null : item.name)} className="w-full p-6 flex justify-between items-center text-left hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-3xl font-black italic text-slate-700">#{index + 1}</span>
                <div>
                  <p className="text-lg font-black uppercase tracking-tight text-white mb-0.5">{item.name}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Total: {item.count} <span className="text-blue-500 mx-1">•</span> P.B. {item.maxWeight}lb
                  </p>
                </div>
              </div>
              <span className="text-slate-600 text-[10px]">{expandedLifeSpecies === item.name ? '▲' : '▼'}</span>
            </button>

            {expandedLifeSpecies === item.name && (
              <div className="bg-black/40 p-6 pt-2 border-t border-slate-800/50">
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-inner">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Verified Coordinates</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(item.waters).map(water => (
                      <span 
                        key={water as string} 
                        className="text-[10px] font-black uppercase text-blue-400 bg-blue-500/5 px-4 py-2 rounded-xl border border-blue-500/20 shadow-sm"
                      >
                        {water as string}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  </main>
)}

     {/* ------------------------------------------------------------------------
    LOG BOOK (SESSIONS) 
    ------------------------------------------------------------------------ */}
{view === 'sessions' && (
  <main className="max-w-md mx-auto px-6 pt-12 pb-32 animate-in fade-in duration-300">
    {/* HEADER SECTION WITH NAVIGATION */}
    <div className="flex justify-between items-start mb-10">
      <div>
        <button 
          onClick={() => setView('home')} 
          className="mb-4 text-slate-500 font-black uppercase text-[9px] tracking-[0.2em] hover:text-white transition-colors"
        >
          ← Return
        </button>
        <h2 className="text-5xl font-black italic uppercase text-white tracking-tighter leading-none">Log Book</h2>
        <p className="text-blue-500 font-black text-[10px] uppercase tracking-widest mt-2">{sessionLogs.length} Expeditions</p>
      </div>

      {/* 2026/ALL-TIME FILTER TOGGLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex flex-col gap-1 shadow-lg">
        <button 
          onClick={() => setYearFilter(currentYear)} 
          className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${yearFilter === '2026' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
        >
          2026
        </button>
        <button 
          onClick={() => setYearFilter('all-time')} 
          className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${yearFilter === 'all-time' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
        >
          All-Time
        </button>
      </div>
    </div>

    {/* SESSIONS LIST */}
    <div className="space-y-4">
      {sessionLogs.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
          <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Archive Empty</p>
        </div>
      ) : (
        sessionLogs.map(session => (
          <div 
            key={session.id} 
            onClick={() => { setSelectedSession(session as Expedition); setView('session-detail'); }} 
            className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl cursor-pointer hover:border-blue-500/30 active:scale-[0.98] transition-all relative overflow-hidden"
          >
            {/* TYPE INDICATOR STRIPE */}
            <div className={`absolute top-0 left-0 w-1.5 h-full ${session.type === 'freshwater' ? 'bg-emerald-500' : session.type === 'saltwater' ? 'bg-blue-600' : 'bg-amber-500'}`}></div>
            
            <div className="flex justify-between items-start mb-2 pl-2">
              <p className="text-2xl font-black italic uppercase text-white truncate tracking-tight">{session.location}</p>
              {session.synced === 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mt-2 ml-2 shadow-[0_0_10px_rgba(245,158,11,0.8)]" title="Unsynced"></span>
              )}
            </div>
            
            {/* METADATA: DATE, TYPE, AND DURATION */}
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 pl-2">
              {new Date(session.startTime || session.date).toLocaleDateString()} 
              <span className="text-slate-600 mx-1">•</span> {session.type}
              {session.duration && (
                <>
                  <span className="text-slate-600 mx-1">•</span> 
                  <span className="text-blue-400">{session.duration}</span>
                </>
              )}
            </p>
            
            {/* TACTICAL BADGES */}
<div className="flex gap-2 pl-2">
  {/* 👇 REPLACE THE OLD TEMP SPAN WITH THIS 👇 */}
  <span className={`text-[8px] px-2 py-1 rounded-md uppercase font-black border ${
    session.temp === 'Pending' 
      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse' 
      : 'bg-black/40 text-slate-300 border-slate-800'
  }`}>
    {session.temp}
  </span>
  
  <span className="text-[8px] bg-black/40 px-2 py-1 rounded-md text-slate-300 uppercase font-black border border-slate-800">{session.wind}</span>
  <span className="text-[8px] bg-blue-600/10 px-2 py-1 rounded-md text-blue-400 uppercase font-black border border-blue-500/20 ml-auto">{session.catches.length} Entries</span>
</div>
          </div>
        ))
      )}
    </div>
  </main>
)}

      {/* ------------------------------------------------------------------------
          SESSION DETAIL & OFFLINE MAP 
          ------------------------------------------------------------------------ */}
      {view === 'session-detail' && selectedSession && (
        <main className="max-w-md mx-auto px-6 pt-12 pb-32 animate-in slide-in-from-right-8 duration-300">
          <button onClick={() => setView('sessions')} className="mb-8 text-slate-500 font-black uppercase text-[9px] tracking-widest hover:text-white transition-colors">← Back to Log Book</button>
          
          <div className="mb-10">
            {isEditingLogLocation ? (
              <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                <input id="editLocationInput" autoFocus className="flex-1 bg-slate-900 border border-blue-500 rounded-xl p-4 text-white text-sm outline-none font-bold" defaultValue={selectedSession.location} onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateSessionLocation(selectedSession.id, e.currentTarget.value); }} />
                <button onClick={() => { const val = (document.getElementById('editLocationInput') as HTMLInputElement).value; handleUpdateSessionLocation(selectedSession.id, val); }} className="bg-blue-600 px-6 rounded-xl font-black text-[10px] uppercase text-white tracking-widest border-b-4 border-blue-800 active:scale-95">Save</button>
              </div>
            ) : (
              <h2 onClick={() => setIsEditingLogLocation(true)} className="text-5xl font-black italic uppercase text-white leading-[0.9] tracking-tighter cursor-pointer hover:text-blue-400 transition-colors group">
                {selectedSession.location} <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-2">✏️</span>
              </h2>
            )}
            
            <div className="mt-4 flex flex-wrap items-center gap-2">
  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-white shadow-inner ${selectedSession.type === 'freshwater' ? 'bg-emerald-600' : selectedSession.type === 'saltwater' ? 'bg-blue-600' : 'bg-amber-600'}`}>
    {selectedSession.type}
  </span>
  <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-700">
    {new Date(selectedSession.date || selectedSession.startTime || new Date().toISOString()).toLocaleDateString()}
  </span>
  {/* ⏱️ Duration Badge */}
  {selectedSession.duration && (
    <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-blue-500/30 shadow-lg animate-in fade-in zoom-in duration-300">
      Time: {selectedSession.duration}
    </span>
  )}
</div>
          </div>

          {selectedSession.lat && selectedSession.lon && (
            <div className="mb-10">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">Topological Intel</p>
              <div className="relative w-full h-64 rounded-[2rem] overflow-hidden border border-slate-800 shadow-2xl bg-slate-900 z-0">
                <MapContainer center={[selectedSession.lat, selectedSession.lon]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false}>
                  <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="" />
                  <Marker position={[selectedSession.lat, selectedSession.lon]}>
                    <Popup className="text-[10px] font-black uppercase">{selectedSession.location}</Popup>
                  </Marker>
                </MapContainer>
                <div className="absolute inset-0 border-[6px] border-[#020617] rounded-[2rem] pointer-events-none"></div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 shadow-xl mb-10">
            {/* 📝 FIELD NOTES SECTION */}
            {selectedSession.notes && (
              <div className="mb-8 pb-8 border-b border-slate-800/50">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-4">Field Notes</p>
                <div className="bg-black/30 rounded-2xl p-5 border border-slate-800/50">
                  <p className="text-xs text-slate-300 font-medium leading-relaxed italic">
                    "{selectedSession.notes}"
                  </p>
                </div>
              </div>
            )}

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Expedition Log</p>
            {selectedSession.catches.length === 0 ? (
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center py-4">No entries recorded.</p>
            ) : (
              <div className="space-y-3">
                {selectedSession.catches.map(fish => (
                  <div key={fish.id} className="bg-black/30 rounded-2xl border border-slate-800/50 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-black text-[12px] uppercase tracking-tighter text-white block">{fish.name}</span>
                        {selectedSession.type === 'shellfish' ? (
                          <span className="text-[10px] text-slate-400 font-bold uppercase mt-1 block">{fish.keeperCount} Keepers <span className="text-slate-600 mx-1">•</span> {fish.soakTime}hr Soak</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase mt-1 block">{fish.weight}lb <span className="text-slate-600 mx-1">•</span> {fish.length}in {fish.lure && <><span className="text-slate-600 mx-1">•</span> 🎣 {fish.lure}</>}</span>
                        )}
                      </div>
                      <button onClick={() => handleDeleteCatch(fish.id)} className="text-[8px] font-black uppercase text-red-500 bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20 active:scale-90 transition-all">Del</button>
                    </div>
                    {fish.media && fish.media.length > 0 && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800 overflow-x-auto pb-1">
                        {fish.media.map((url: string) => (
                          <img key={url} src={url} onClick={() => setFullscreenImage({ url, catchId: fish.id })} className="w-14 h-14 rounded-xl object-cover border border-slate-700 cursor-pointer shadow-md" alt="Catch" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => handleDeleteSession(selectedSession.id)} className="w-full py-6 text-[10px] font-black uppercase text-red-400 border border-red-500/20 rounded-[2rem] bg-red-500/5 hover:bg-red-500/10 transition-colors tracking-widest">Erase Expedition</button>
        </main>
      )}

     {/* ------------------------------------------------------------------------
    SUMMARY VIEW (Debrief)
    ------------------------------------------------------------------------ */}
{view === 'summary' && (
  <main className="max-w-md mx-auto px-6 pt-16 pb-32 animate-in zoom-in-95 duration-300">
    <h2 className="text-6xl font-black italic uppercase text-white tracking-tighter mb-10 leading-[0.8]">Debrief</h2>
    
    <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800 shadow-2xl mb-8">
      <p className="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Field Notes</p>
      <textarea 
        value={sessionNotes} 
        onChange={(e) => setSessionNotes(e.target.value)} 
        placeholder="Record water clarity, patterns, mistakes made..." 
        className="w-full h-40 bg-transparent text-sm text-white outline-none resize-none font-medium placeholder:text-slate-700" 
      />
    </div>
    
    {/* 🛡️ BUTTON STACK */}
    <div className="flex flex-col gap-4">
      {/* NEW: Return/Resume Button */}
      <button 
        onClick={() => setView('active-session')} 
        className="w-full py-6 rounded-[2rem] bg-slate-800 text-slate-400 font-black uppercase tracking-[0.2em] border border-slate-700 text-[10px] active:scale-95 transition-all"
      >
        ← Resume Expedition
      </button>

      {/* EXISTING: Seal Archive Button */}
      <button 
        onClick={handleFinalizeSession} 
        className="w-full py-8 rounded-[2rem] bg-blue-600 font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(37,99,235,0.4)] border-b-4 border-blue-800 text-xs active:scale-95 transition-all text-white"
      >
        Seal Archive
      </button>
    </div>
  </main>
)}

      {/* ------------------------------------------------------------------------
          DYNAMIC ADD DRAWER 
          ------------------------------------------------------------------------ */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#020617] rounded-t-[3rem] border-t border-slate-800 p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Log Data</h2>
              <button onClick={() => setShowAddDrawer(false)} className="text-slate-500 text-[10px] font-black uppercase tracking-widest bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">Close</button>
            </div>
            
            <input type="text" placeholder="Search Database..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-sm text-white outline-none mb-4 font-bold shadow-inner" />
            
            <div className="flex flex-wrap gap-2 mb-8">
              {filteredSpeciesList.map((s: string) => (
                <button key={s} onClick={() => { setNewName(s); setSearchTerm(s); }} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${newName === s ? 'bg-blue-600 text-white shadow-lg border border-blue-500' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'}`}>{s}</button>
              ))}
            </div>

            {expeditionType === 'shellfish' ? (
               <div className="grid grid-cols-2 gap-4 mb-8">
                 <div className="relative">
                   <p className="absolute -top-2 left-4 bg-[#020617] px-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">Keepers</p>
                   <input type="number" value={newKeeperCount} onChange={(e) => setNewKeeperCount(e.target.value)} placeholder="0" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white outline-none font-bold text-lg" />
                 </div>
                 <div className="relative">
                   <p className="absolute -top-2 left-4 bg-[#020617] px-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">Soak (Hrs)</p>
                   <input type="number" value={newSoakTime} onChange={(e) => setNewSoakTime(e.target.value)} placeholder="0" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white outline-none font-bold text-lg" />
                 </div>
               </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="relative">
                    <p className="absolute -top-2 left-4 bg-[#020617] px-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">Weight (lb)</p>
                    <input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="0.0" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white outline-none font-bold text-lg" />
                  </div>
                  <div className="relative">
                    <p className="absolute -top-2 left-4 bg-[#020617] px-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">Length (in)</p>
                    <input type="number" value={newLength} onChange={(e) => setNewLength(e.target.value)} placeholder="0.0" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white outline-none font-bold text-lg" />
                  </div>
                </div>
                <div className="relative mb-8">
                  <p className="absolute -top-2 left-4 bg-[#020617] px-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">Tactical Lure/Bait</p>
                  <input type="text" value={newLure} onChange={(e) => setNewLure(e.target.value)} placeholder="e.g., Green Kastmaster" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white outline-none font-bold text-sm shadow-inner" />
                </div>
              </>
            )}

            <button onClick={handleAddCatch} disabled={!newName} className="w-full bg-blue-600 py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs text-white border-b-4 border-blue-800 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100">Commit Record</button>
          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE VIEWER */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-6 pt-12">
            <button onClick={() => setFullscreenImage(null)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-slate-800 px-4 py-2 rounded-xl transition-colors">← Close</button>
            <button onClick={handleDeleteImage} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20 transition-colors">Delete</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 pb-12">
            <img src={fullscreenImage.url} alt="Fullscreen Catch" className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}

{/* PB CELEBRATION BANNER */}
      {pbCelebration && (
        <div className="fixed top-12 left-6 right-6 z-[100] bg-gradient-to-r from-amber-500 to-yellow-600 p-1 rounded-[2rem] shadow-[0_20px_50px_rgba(245,158,11,0.4)] animate-in slide-in-from-top-full duration-500">
          <div className="bg-[#020617] rounded-[1.8rem] p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl"></div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2 relative z-10">{pbCelebration.year} Personal Best</p>
            <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter relative z-10">
              {pbCelebration.weight}lb <br/> {pbCelebration.name}
            </h3>
            <p className="text-[8px] text-slate-400 mt-4 font-bold uppercase tracking-widest relative z-10">The database has been updated.</p>
          </div>
        </div>
      )}

      {/* --- NEARBY WATERS MODAL --- */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6 animate-in fade-in duration-200">
          <div className="w-full max-auto max-w-md bg-slate-900 rounded-[3rem] border border-slate-800 p-8 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Nearby Intel</h3>
              <button onClick={() => setShowLocationModal(false)} className="text-slate-500 text-[10px] font-black uppercase">Close</button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
  {nearbyWaters.length > 0 ? (
    nearbyWaters.filter(w => w.dist <= 5).map(water => (
      <button 
        key={water.name}
        onClick={() => { 
          // 🎯 Update the location name
          setSessionLocation(water.name); 
          // 🧠 Sync the species list/data for the Intel panel
          setCurrentLakeData(water.data); 
          // 🚪 Close the window
          setShowLocationModal(false); 
        }}
        className={`w-full p-6 rounded-2xl border flex justify-between items-center transition-all ${
          sessionLocation === water.name 
            ? 'bg-blue-600 border-blue-400 shadow-lg scale-[1.02]' 
            : 'bg-black/40 border-slate-800 hover:border-slate-700'
        }`}
      >
        <span className="font-black uppercase text-xs text-white italic tracking-tight">{water.name}</span>
        <span className="text-[10px] font-bold text-slate-400">{water.dist.toFixed(1)}mi</span>
      </button>
    ))
  ) : (
    <div className="py-10 text-center">
      <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">No matching intel within 5 miles.</p>
      <button onClick={() => updateLocationData()} className="mt-4 text-blue-500 font-black text-[9px] uppercase tracking-widest underline">Ping GPS Again</button>
    </div>
  )}
</div>

<button 
  onClick={() => { setIsCustomLocation(true); setShowLocationModal(false); }}
  className="mt-6 w-full py-5 rounded-2xl border border-dashed border-slate-700 text-[9px] font-black uppercase text-slate-500 hover:text-white hover:border-blue-500/50 transition-all tracking-[0.2em]"
>
  + Manual Spot Entry
</button>
          </div>
        </div>
      )}
    </div> 
  ); 
}    