"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Alert, AstronautId, LabResult, UploadedLab } from "./types";
import { ASTRONAUT_IDS, astronauts, baseLabs, baseVitals, environment, mission, setActiveDataset } from "./data";
import { generateAlerts } from "./alerts";
import { ACTIVE_MISSION_ID, missionById } from "./missions";
import { DEMO_RECORDS, type MedicalRecord } from "./crewprofile";

interface Store {
  selectedId: AstronautId;
  /** Mission currently focused in the navigator / overview (the session mission stays NOX-01; records are never overwritten) */
  missionId: string;
  selectMission: (id: string) => void;
  select: (id: AstronautId) => void;
  labs: LabResult[];
  importedLabs: LabResult[];
  addImported: (l: LabResult[]) => void;
  clearImported: () => void;
  /** Real-world transcribed reports; deliberately NOT merged into crew labs/alerts */
  uploadedLabs: UploadedLab[];
  addUploaded: (l: UploadedLab) => void;
  removeUploaded: (id: string) => void;
  clearUploaded: () => void;
  /** Optional structured medical history and device records (fictional). Empty by default. */
  medRecords: MedicalRecord[];
  addRecord: (r: Omit<MedicalRecord, "id" | "fictional" | "origin">) => void;
  removeRecord: (id: string) => void;
  loadDemoRecords: () => void;
  clearRecords: () => void;
  simEvents: Alert[];
  logSimEvent: (a: Alert) => void;
  clearSimEvents: () => void;
  alerts: Alert[];
  currentDay: number;
}
const Ctx = createContext<Store | null>(null);
const K = { sel: "nox.selected", imp: "nox.imported", sim: "nox.simEvents", upl: "nox.uploadedReports", med: "nox.medRecords", mis: "nox.missionId" };

function load<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelected] = useState<AstronautId>("A-01");
  const [missionId, setMissionIdRaw] = useState<string>(ACTIVE_MISSION_ID);
  setActiveDataset(missionId); // synchronous, idempotent: module-level crew/labs/vitals/environment follow the selected mission
  const setMissionId = useCallback((id: string) => { setActiveDataset(id); setMissionIdRaw(id); setSelected((cur) => (ASTRONAUT_IDS as string[]).includes(cur) ? cur : (ASTRONAUT_IDS[0] as AstronautId)); }, []);
  const [importedLabs, setImported] = useState<LabResult[]>([]);
  const [uploadedLabs, setUploaded] = useState<UploadedLab[]>([]);
  const [medRecords, setMed] = useState<MedicalRecord[]>([]);
  const [simEvents, setSim] = useState<Alert[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mid = load<string>(K.mis, ACTIVE_MISSION_ID);
    if (missionById(mid)) { setActiveDataset(mid); setMissionIdRaw(mid); }
    const sel = load<string>(K.sel, "A-01");
    setSelected((ASTRONAUT_IDS as string[]).includes(sel) ? (sel as AstronautId) : (ASTRONAUT_IDS[0] as AstronautId));
    setImported(load<LabResult[]>(K.imp, []));
    setSim(load<Alert[]>(K.sim, []));
    setUploaded(load<UploadedLab[]>(K.upl, []));
    setMed(load<MedicalRecord[]>(K.med, []));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(K.sel, JSON.stringify(selectedId)); localStorage.setItem(K.mis, JSON.stringify(missionId)); localStorage.setItem(K.imp, JSON.stringify(importedLabs)); localStorage.setItem(K.sim, JSON.stringify(simEvents)); localStorage.setItem(K.upl, JSON.stringify(uploadedLabs)); localStorage.setItem(K.med, JSON.stringify(medRecords)); } catch {} }, [ready, selectedId, missionId, importedLabs, simEvents, uploadedLabs, medRecords]);

  const addImported = useCallback((l: LabResult[]) => setImported((p) => [...p, ...l]), []);
  const clearImported = useCallback(() => setImported([]), []);
  const addUploaded = useCallback((l: UploadedLab) => setUploaded((p) => [...p, l]), []);
  const removeUploaded = useCallback((id: string) => setUploaded((p) => p.filter((x) => x.id !== id)), []);
  const clearUploaded = useCallback(() => setUploaded([]), []);
  const addRecord = useCallback((r: Omit<MedicalRecord, "id" | "fictional" | "origin">) => setMed((p) => [...p, { ...r, id: `REC-${Date.now()}-${p.length}`, fictional: true, origin: "user" }]), []);
  const removeRecord = useCallback((id: string) => setMed((p) => p.filter((x) => x.id !== id)), []);
  const loadDemoRecords = useCallback(() => setMed((p) => [...p.filter((x) => x.origin !== "demo"), ...DEMO_RECORDS.map((r, i) => ({ ...r, id: `DEMO-${i + 1}` }))]), []);
  const clearRecords = useCallback(() => setMed([]), []);
  const logSimEvent = useCallback((a: Alert) => setSim((p) => [a, ...p]), []);
  const clearSimEvents = useCallback(() => setSim([]), []);

  const labs = useMemo(() => [...baseLabs, ...importedLabs], [importedLabs, missionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => {
    const gen = generateAlerts(labs, baseVitals, environment, astronauts.map((a) => a.id), mission.currentDay);
    return [...simEvents, ...gen].sort((a, b) => b.missionDay - a.missionDay);
  }, [labs, simEvents, missionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Store = { selectedId, select: setSelected, missionId, selectMission: setMissionId, labs, importedLabs, addImported, clearImported, uploadedLabs, addUploaded, removeUploaded, clearUploaded, medRecords, addRecord, removeRecord, loadDemoRecords, clearRecords, simEvents, logSimEvent, clearSimEvents, alerts, currentDay: mission.currentDay };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMission() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMission must be used inside MissionProvider");
  return c;
}
