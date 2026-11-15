import { ALL_ASTRONAUTS } from "./data";
import { MISSIONS, type MissionRecord } from "./missions";
import { CREW_IDENTITY, PORTRAITS } from "./crewprofile";
import type { Astronaut } from "./types";

export interface Assignment { missionId: string; role: string; status: "active" | "planned" | "completed" }
export interface CrewRecord {
  code: string;                // roster code on the mission (A-01, L-02 ...)
  persistentId: string;        // stable across missions
  callsign: string; role: string;
  astronaut?: Astronaut;       // detailed physiology record: exists only for the NOX-01 session crew
  hasClinicalRecords: boolean;
  assignments: Assignment[];
  portraitId?: string;
}

/** Persistent identity per roster entry. Additional assignments are fictional planning entries (never measurements). */
const EXTRA: Record<string, Assignment[]> = {
  "L-03": [{ missionId: "NOX-04", role: "Mission specialist", status: "planned" }],
};
const PERSISTENT_START = 5;

export function crewOf(m: MissionRecord): CrewRecord[] {
  const out: CrewRecord[] = [];
  // stable numbering: A-01..A-04 keep NOX-CREW-0001..0004; others follow roster order across missions
  let counter = PERSISTENT_START - 1; const ids = new Map<string, string>();
  for (const mm of MISSIONS) for (const cc of mm.crew) ids.set(cc.code, cc.astronautId ? CREW_IDENTITY[cc.astronautId].persistentId : `NOX-CREW-${String(++counter).padStart(4, "0")}`);
  for (const c of m.crew) {
    const a = c.astronautId ? ALL_ASTRONAUTS.find((x) => x.id === c.astronautId) : undefined;
    out.push({
      code: c.code, persistentId: ids.get(c.code)!, callsign: c.astronautId ? CREW_IDENTITY[c.astronautId].callsign : c.role, role: c.role, astronaut: a,
      hasClinicalRecords: !!a && m.hasCrewData, portraitId: c.astronautId && PORTRAITS.some((p) => p.id === c.astronautId) ? c.astronautId : undefined,
      assignments: [{ missionId: m.id, role: c.role, status: "active" }, ...(EXTRA[c.code] ?? [])],
    });
  }
  return out;
}
/** All assignments of a persistent identity across the registry (an astronaut can appear in several missions). */
export function assignmentsOf(persistentId: string): Assignment[] {
  const all: Assignment[] = [];
  for (const m of MISSIONS) for (const c of crewOf(m)) if (c.persistentId === persistentId) c.assignments.forEach((a) => { if (!all.some((x) => x.missionId === a.missionId)) all.push(a); });
  return all;
}
