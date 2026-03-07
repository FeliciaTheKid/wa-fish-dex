'use client'

import { getNearestWater, getWaterWithinRadius, calculateDistance } from "@/lib/utils";
import { useState, useEffect, useMemo } from 'react'
import { ALL_SPECIES, FISH_GUIDE } from '@/lib/species-db'

type View = 'home' | 'lifelist' | 'sessions' | 'active-session' | 'summary' | 'session-detail'

interface Catch {
  id: string;
  name: string;
  quantity: number; 
  weight: number;
  length: number;
  date: string;
  location: string;
  sessionId: string;
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
  const [history, setHistory] = useState<Catch[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedLifeSpecies, setExpandedLifeSpecies] = useState<string | null>(null)
  
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
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  
  // --- ADD CATCH STATE ---
  const [showAddDrawer, setShowAddDrawer] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [newName, setNewName] = useState("")
  const [newWeight, setNewWeight] = useState("")
  const [newLength, setNewLength] = useState("")
  const [displayTime, setDisplayTime] = useState("0m");

  // --- DATA AGGREGATION ---
  const filteredSpecies = useMemo(() => {
    if (!searchTerm) return ALL_SPECIES.slice(0, 5);
    return ALL_SPECIES.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5);
  }, [searchTerm]);

  const lifeList = useMemo(() => {
    const list: Record<string, { name: string, count: number, maxWeight: number, waters: Set<string> }> = {};
    history.forEach(fish => {
      if (!list[fish.name]) list[fish.name] = { name: fish.name, count: 0, maxWeight: 0, waters: new Set() };
      list[fish.name].count++;
      list[fish.name].waters.add(fish.location);
      if (fish.weight > list[fish.name].maxWeight) list[fish.name].maxWeight = fish.weight;
    });
    return Object.values(list).sort((a, b) => b.count - a.count);
  }, [history]);

const sessionLogs = useMemo(() => {
    const sessions: Record<string, Expedition> = {};
    history.forEach(f => {
      if (!f.sessionId) return;
      if (!sessions[f.sessionId]) {
        sessions[f.sessionId] = { 
          id: f.sessionId, 
          location: f.location, 
          date: f.date, 
          catches: [], 
          notes: savedNotes[f.sessionId] || "No notes recorded for this expedition.", 
          weather: { temp: '52°F', wind: '6mph S', cond: 'Overcast' } 
        };
      }
      sessions[f.sessionId].catches.push(f);
    });
    return Object.values(sessions).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, savedNotes]);

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
    if (view !== 'active-session' || !startTime) return;
    const interval = setInterval(() => {
      const diff = Date.now() - startTime;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setDisplayTime(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }, 1000);
    return () => clearInterval(interval);
  }, [view, startTime]);

  const updateLocationData = () => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const nearby = getWaterWithinRadius(lat, lon, 15).map((name: string) => ({
          name,
          dist: calculateDistance(lat, lon, name) 
        })).sort((a, b) => a.dist - b.dist);
        setNearbyWaters(nearby);
        if (sessionLocation === "Detecting Location...") setSessionLocation(nearby[0]?.name || "Current Expedition");
        setWeather({ temp: '52°F', wind: '6mph S', cond: 'Overcast' });
      });
    }
  };

const fetchData = async () => {
    try {
      const res = await fetch('/api/species/list', { cache: 'no-store' });
      
      // This is the "Bouncer" check for that 401 error
      if (res.status === 401) {
        console.error("Access Denied: Check Vercel Deployment Protection or Supabase Keys.");
        return;
      }

      const data = await res.json();
      setHistory(data.species || []);
    } catch (e) { 
      console.error("Connection failed:", e); 
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

  // --- HANDLERS ---
  const handleStartSession = () => {
    setCurrentSessionId(crypto.randomUUID());
    setStartTime(Date.now());
    setView('active-session');
  }
const handleFinalizeSession = () => {
    // Save the notes to our local dictionary before clearing the active session
    if (currentSessionId && sessionNotes) {
      setSavedNotes(prev => ({ ...prev, [currentSessionId]: sessionNotes }));
    }
    
    // Clear the active session states
    setCurrentSessionId(null);
    setStartTime(null);
    setSessionNotes("");
    setView('home'); 
  }
  const handleAddCatch = async () => {
    if (!newName || !currentSessionId) return;
    setLoading(true);

const newCatch: Catch = {
id: crypto.randomUUID(),
name: newName,
quantity: 1,
weight: Number(newWeight) || 0,
length: Number(newLength) || 0,
date: new Date().toISOString(),
location: sessionLocation,
sessionId: currentSessionId,
media: []
};

    setHistory(prev => [newCatch, ...prev]);

    await fetch('/api/species/add', { 
      method: 'POST', 
      body: JSON.stringify(newCatch) 
    });

    setShowAddDrawer(false);
    setNewName("");
    setNewWeight("");
    setNewLength("");
    setSearchTerm("");
    setLoading(false);
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

  // --- NEW: DELETE HANDLERS ---
  const handleDeleteCatch = async (catchId: string) => {
    if (!window.confirm("Are you sure you want to delete this specimen from your log?")) return;
    
    // Update local history
    setHistory(prev => prev.filter(c => c.id !== catchId));
    
    // Update selected session view immediately
    if (selectedSession) {
      setSelectedSession({
        ...selectedSession,
        catches: selectedSession.catches.filter(c => c.id !== catchId)
      });
    }

    // Fire off to the backend to actually delete it
    try {
      await fetch(`/api/species/delete?id=${catchId}`, { method: 'DELETE' });
    } catch (e) { console.error("Failed to delete catch from database", e); }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Are you sure you want to delete this entire expedition and all the specimens caught during it? This cannot be undone.")) return;
    
    // Remove all catches tied to this session from history
    setHistory(prev => prev.filter(c => c.sessionId !== sessionId));
    
    // Clear out the current view and go back to the logs
    setSelectedSession(null);
    setView('sessions');

    // Fire off to the backend
    try {
      await fetch(`/api/species/delete-session?id=${sessionId}`, { method: 'DELETE' });
    } catch (e) { console.error("Failed to delete session from database", e); }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30">
      
      {/* 1. HOME VIEW */}
      {view === 'home' && (
        <main className="max-w-md mx-auto px-6 pt-20">
          <h1 className="text-8xl font-black italic text-white mb-2 tracking-tighter">eFish</h1>
          <p className="text-blue-500 font-black text-[10px] uppercase tracking-[0.4em] mb-12 text-center">The Washington Archive</p>
          <div className="space-y-4">
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
        </main>
      )}"
      {/* 2. ACTIVE SESSION */}
      {view === 'active-session' && (
        <main className="max-w-md mx-auto px-6 pt-8 pb-40 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView('home')} className="bg-slate-900 w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center font-black">←</button>
            <div className="text-right">
              <p className="text-[9px] font-black text-blue-500 uppercase">Trip Clock</p>
              <p className="text-2xl font-black italic">{displayTime}</p>
            </div>
          </div>

          <div onClick={() => setIsEditingLocation(true)} className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 mb-4 cursor-pointer hover:border-blue-500/50 transition-colors shadow-xl">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-1 tracking-widest">📍 Location</p>
              <p className="text-xl font-black italic text-white uppercase truncate">{sessionLocation}</p>
          </div>

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
                    <p className="text-xs font-black uppercase tracking-widest text-white">{item.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">Total: {item.count} • P.B. {item.maxWeight}lb</p>
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
          
          {/* Changed mb-8 to mb-4 below */}
          <h2 className="text-4xl font-black italic uppercase text-white leading-tight mb-4">{selectedSession.location}</h2>
          
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
                    <span className="text-[10px] text-slate-400 font-bold">{fish.weight}lb • {fish.length}in</span>
                  </div>
                </button>

                {/* Expanded area: Image upload & Delete Catch */}
                {expandedLogCatch === fish.id && (
                  <div className="p-4 pt-0 border-t border-slate-800/50 mt-2">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-3 pt-4 tracking-widest">Media Record</p>
                    
                    {fish.media && fish.media.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto mb-3 pb-2">
                        {fish.media.map((url, i) => (
                           // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={url} alt="Catch" className="h-16 w-16 object-cover rounded-lg border border-slate-700" />
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

    </div>
  )
}
