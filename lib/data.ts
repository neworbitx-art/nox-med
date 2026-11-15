import missionJson from "@/data/mission.json";
import astronautsJson from "@/data/astronauts.json";
import labsJson from "@/data/labs.json";
import vitalsJson from "@/data/vitals.json";
import envJson from "@/data/environment.json";
import hourlyJson from "@/data/environment-hourly.json";
import exerciseJson from "@/data/exercise.json";
import m02 from "@/data/missions/NOX-02.json";
import m03 from "@/data/missions/NOX-03.json";
import m04 from "@/data/missions/NOX-04.json";
import type { Astronaut, AstronautId, EnvironmentalSample, ExerciseEvent, HourlyEnvSample, LabResult, Mission, VitalSign } from "./types";

export const mission = missionJson as Mission;
export const astronauts = astronautsJson as Astronaut[];
export const baseLabs = labsJson as LabResult[];
export const baseVitals = vitalsJson as VitalSign[];
export const environment = envJson as EnvironmentalSample[];
export const hourlyEnv = hourlyJson as HourlyEnvSample[];
export const exerciseEvents = exerciseJson as ExerciseEvent[];
export const ASTRONAUT_IDS = astronauts.map((a) => a.id) as AstronautId[];

/** Complete record set of one mission. NOX-01 is the original dataset; NOX-02/03/04 are SYNTHETIC demonstration data (scripts/generate-missions.ts). */
export interface MissionDataset { mission: Mission; astronauts: Astronaut[]; labs: LabResult[]; vitals: VitalSign[]; exercise: ExerciseEvent[]; environment: EnvironmentalSample[]; hourly: HourlyEnvSample[] }
const fromJson = (j: unknown) => j as MissionDataset;
export const DATASETS: Record<string, MissionDataset> = {
  "NOX-01": { mission, astronauts: [...astronauts], labs: [...baseLabs], vitals: [...baseVitals], exercise: [...exerciseEvents], environment: [...environment], hourly: [...hourlyEnv] },
  "NOX-02": fromJson(m02), "NOX-03": fromJson(m03), "NOX-04": fromJson(m04),
};
export const ALL_ASTRONAUTS: Astronaut[] = Object.values(DATASETS).flatMap((d) => d.astronauts);
let activeId = "NOX-01";
export const activeDatasetId = () => activeId;
const swap = <T,>(target: T[], src: T[]) => { target.splice(0, target.length, ...src); };
/**
 * Point the module-level collections (astronauts, labs, vitals, environment, ...) at one mission's dataset.
 * They are mutated in place so every existing consumer keeps working unchanged; the store calls this synchronously
 * before any child renders. Records of other missions are never mixed in.
 */
export function setActiveDataset(id: string) {
  const d = DATASETS[id]; if (!d || id === activeId) return;
  activeId = id; Object.assign(mission, d.mission);
  swap(astronauts, d.astronauts); swap(baseLabs, d.labs); swap(baseVitals, d.vitals); swap(exerciseEvents, d.exercise); swap(environment, d.environment); swap(hourlyEnv, d.hourly); swap(ASTRONAUT_IDS, d.astronauts.map((a) => a.id));
}

export function dayToDate(day: number): string {
  const d = new Date(mission.startDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString().slice(0, 10);
}

export const labsFor = (labs: LabResult[], id: AstronautId) =>
  labs.filter((l) => l.astronautId === id).sort((a, b) => a.missionDay - b.missionDay || a.id.localeCompare(b.id));

export const vitalsFor = (id: AstronautId) =>
  baseVitals.filter((v) => v.astronautId === id).sort((a, b) => a.missionDay - b.missionDay);

/** Elapsed mission days (fractional, 1.0 = mission start) for an ISO timestamp; gives accurate chronological scaling. */
export function elapsedDays(iso: string): number {
  return (Date.parse(iso) - Date.parse(mission.startDate + "T00:00:00Z")) / 86400000 + 1;
}
