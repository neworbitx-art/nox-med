import type { VitalSign } from "./types";

export type VKey = Exclude<keyof VitalSign, "astronautId" | "missionDay" | "origin">;
/** Wearable channel definitions (all SIMULATED daily summaries). */
export const V: Record<VKey, { label: string; unit: string; dec: number; group: string }> = {
  restingHr: { label: "Resting heart rate", unit: "bpm", dec: 0, group: "Heart rate" },
  meanHr: { label: "Mean heart rate (24 h)", unit: "bpm", dec: 0, group: "Heart rate" },
  maxHr: { label: "Peak heart rate", unit: "bpm", dec: 0, group: "Heart rate" },
  respRate: { label: "Respiratory rate", unit: "breaths/min", dec: 0, group: "Respiration & oxygen" },
  spo2: { label: "SpO₂ (pulse oximetry)", unit: "%", dec: 1, group: "Respiration & oxygen" },
  sleepHours: { label: "Sleep duration", unit: "h", dec: 1, group: "Sleep & activity" },
  activeMin: { label: "Physical activity", unit: "min/day", dec: 0, group: "Sleep & activity" },
  exerciseMin: { label: "Logged exercise", unit: "min/day", dec: 0, group: "Sleep & activity" },
  hrvMs: { label: "HRV (RMSSD)", unit: "ms", dec: 0, group: "Other" },
  systolic: { label: "Systolic BP", unit: "mmHg", dec: 0, group: "Other" },
  diastolic: { label: "Diastolic BP", unit: "mmHg", dec: 0, group: "Other" },
  skinTempC: { label: "Skin temperature", unit: "°C", dec: 1, group: "Other" },
};
export const V_KEYS = Object.keys(V) as VKey[];
