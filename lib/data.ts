import missionJson from "@/data/mission.json";
import astronautsJson from "@/data/astronauts.json";
import labsJson from "@/data/labs.json";
import vitalsJson from "@/data/vitals.json";
import envJson from "@/data/environment.json";
import hourlyJson from "@/data/environment-hourly.json";
import exerciseJson from "@/data/exercise.json";
import type { Astronaut, AstronautId, EnvironmentalSample, ExerciseEvent, HourlyEnvSample, LabResult, Mission, VitalSign } from "./types";

export const mission = missionJson as Mission;
export const astronauts = astronautsJson as Astronaut[];
export const baseLabs = labsJson as LabResult[];
export const baseVitals = vitalsJson as VitalSign[];
export const environment = envJson as EnvironmentalSample[];
export const hourlyEnv = hourlyJson as HourlyEnvSample[];
export const exerciseEvents = exerciseJson as ExerciseEvent[];
export const ASTRONAUT_IDS = astronauts.map((a) => a.id) as AstronautId[];

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
