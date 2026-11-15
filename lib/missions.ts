import { astronauts, mission as activeMissionData } from "./data";
import { localReplayAdapter, type TelemetrySnapshot } from "./telemetry-adapter";
import type { AstronautId, EnvironmentalSample } from "./types";

// ───────────────────────── types ─────────────────────────
export type CelestialBodyId = "earth" | "moon" | "mars";
export type V3 = [number, number, number];
export interface CelestialBody { id: CelestialBodyId; label: string; position: V3; radius: number }
export type MissionPhase = "earth-orbit" | "translunar" | "mars-transit" | "mars-orbit";
/** Trajectory category of a mission (see lib/trajectory.ts). */
export type RouteKind = "earth-orbit" | "lunar-transfer" | "earth-mars-transfer" | "mars-orbit";
export const ROUTE_LABEL: Record<RouteKind, string> = { "earth-orbit": "Earth orbit", "lunar-transfer": "Lunar transfer", "earth-mars-transfer": "Earth–Mars transfer", "mars-orbit": "Mars orbit" };
export type MissionStatusLevel = "nominal" | "watch" | "warning" | "critical" | "unknown";
export const LEVELS: MissionStatusLevel[] = ["nominal", "watch", "warning", "critical"];
export const LEVEL_LABEL: Record<MissionStatusLevel, string> = { nominal: "Nominal", watch: "Watch", warning: "Warning", critical: "Critical", unknown: "Unknown / No telemetry" };
/** Worst known level; "unknown" only when nothing is known at all (never hides a known problem). */
export const worst = (l: MissionStatusLevel[]): MissionStatusLevel => {
  const known = l.filter((x) => x !== "unknown");
  if (known.length === 0) return "unknown";
  return known.reduce((a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a), "nominal" as MissionStatusLevel);
};

export interface MissionVehicleStatus { id: string; name: string; phase: MissionPhase; phaseLabel: string; statusText: string; day: number; totalDays: number }
export interface CrewAssignment { code: string; role: string; astronautId?: AstronautId }
export interface MissionAlert { id: string; level: MissionStatusLevel; title: string; detail: string }
export interface ShipReading { key: string; label: string; value: number | null; unit: string; decimals: number; status: MissionStatusLevel }
export interface ShipSubsystem { key: string; label: string; status: MissionStatusLevel; text: string }
export interface ShipHealthStatus { overall: MissionStatusLevel; readings: ShipReading[]; subsystems: ShipSubsystem[]; warnings: MissionAlert[]; snapshot: TelemetrySnapshot }

export interface MissionRecord {
  id: string; name: string; code: string; destination: CelestialBodyId; destinationLabel: string;
  startDate: string;
  vehicle: MissionVehicleStatus; route: RouteKind;
  crew: CrewAssignment[];
  /** Subsystem states. Only present when the mission has telemetry; otherwise they are Unknown. */
  subsystems: ShipSubsystem[];
  dataSource: string;
  /** Whether detailed crew records, labs and measurement modules exist for this mission */
  hasCrewData: boolean;
}

export const BODY_LABEL: Record<CelestialBodyId, string> = { earth: "Earth", moon: "Moon", mars: "Mars" };
const add = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
void add;

// ───────────────────────── ship health ─────────────────────────
/** [watch, warning, critical] thresholds on each side. */
const BANDS: Record<string, { lo?: [number, number, number]; hi?: [number, number, number] }> = {
  co2: { hi: [4, 5.3, 7] }, o2: { lo: [20.5, 19.5, 18] }, pressure: { lo: [100.5, 97, 90], hi: [102, 104, 110] },
  temp: { lo: [20, 18, 15], hi: [25, 27, 30] }, humidity: { lo: [30, 25, 15], hi: [60, 70, 80] }, radiation: { hi: [100, 150, 300] },
};
export function levelOf(key: string, v: number | null): MissionStatusLevel {
  if (v === null) return "unknown";
  const b = BANDS[key]; if (!b) return "nominal";
  for (let i = 2; i >= 0; i--) if ((b.hi && v > b.hi[i]) || (b.lo && v < b.lo[i])) return LEVELS[i + 1];
  return "nominal";
}
export function cabinReadings(c: EnvironmentalSample | null): ShipReading[] {
  const r = (key: string, label: string, value: number | undefined, unit: string, decimals: number): ShipReading => { const v = c ? (value ?? null) : null; return { key, label, value: v, unit, decimals, status: levelOf(key, v) }; };
  return [r("co2", "Cabin CO₂", c?.co2Mmhg, "mmHg", 2), r("o2", "Cabin O₂", c?.o2Pct, "%", 2), r("pressure", "Cabin pressure", c?.pressureKpa, "kPa", 1), r("temp", "Cabin temperature", c?.tempC, "°C", 1),
    r("humidity", "Humidity", c?.humidityPct, "%", 0), r("radiation", "Radiation", c?.radiationUSvH, "µSv/h", 1)];
}
const SUB_KEYS: [string, string][] = [["power", "Power"], ["comms", "Communications"], ["scrubber", "Environmental control / life support"], ["structure", "Structure / subsystems"]];

export function shipHealthFor(m: MissionRecord): ShipHealthStatus {
  const snapshot = localReplayAdapter.latest(m.id);
  const readings = cabinReadings(snapshot.cabin);
  const subsystems: ShipSubsystem[] = snapshot.cabin
    ? m.subsystems
    : SUB_KEYS.map(([key, label]) => ({ key, label, status: "unknown" as const, text: "No telemetry for this mission." }));
  const warnings: MissionAlert[] = [];
  readings.filter((x) => x.status !== "nominal" && x.status !== "unknown").forEach((x) => warnings.push({ id: `${m.id}-${x.key}`, level: x.status, title: `${x.label} outside nominal band`, detail: `${x.value!.toFixed(x.decimals)} ${x.unit} (ship measurement, not a clinical value).` }));
  subsystems.filter((x) => x.status !== "nominal" && x.status !== "unknown").forEach((x) => warnings.push({ id: `${m.id}-${x.key}`, level: x.status, title: `${x.label}: ${LEVEL_LABEL[x.status].toLowerCase()}`, detail: x.text }));
  return { overall: worst([...readings.map((x) => x.status), ...subsystems.map((x) => x.status)]), readings, subsystems, warnings, snapshot };
}

// ───────────────────────── mission registry ─────────────────────────
const sub = (key: string, label: string, status: MissionStatusLevel, text: string): ShipSubsystem => ({ key, label, status, text });
export const ACTIVE_MISSION_ID = activeMissionData.id;

export const MISSIONS: MissionRecord[] = [
  {
    id: "NOX-01", name: activeMissionData.name, code: "NOX-01", destination: "mars", destinationLabel: "Mars", startDate: activeMissionData.startDate,
    vehicle: { id: "NOX-TV-01", name: "NOX Transit Vehicle 1", phase: "mars-transit", phaseLabel: "Mars transit", statusText: "Outbound cruise", day: activeMissionData.currentDay, totalDays: activeMissionData.totalDays },
    route: "earth-mars-transfer",
    crew: astronauts.map((a) => ({ code: a.id, role: a.role, astronautId: a.id })),
    subsystems: [
      sub("power", "Power", "nominal", "Bus nominal; array output within plan."),
      sub("comms", "Communications", "nominal", "High-gain link nominal; one-way light time applies."),
      sub("scrubber", "Environmental control / life support", "watch", "Cabin CO₂ is above the watch line. Scrubber performance has not been diagnosed."),
      sub("structure", "Structure / subsystems", "nominal", "No structural or subsystem warnings."),
    ],
    dataSource: "Local demonstration dataset (replay)", hasCrewData: true,
  },
  {
    id: "NOX-02", name: "Lunar Gateway Sortie", code: "NOX-02", destination: "moon", destinationLabel: "Moon", startDate: "2031-11-05",
    vehicle: { id: "NOX-CV-02", name: "NOX Cislunar Vehicle", phase: "translunar", phaseLabel: "Translunar coast", statusText: "Outbound to lunar orbit", day: 5, totalDays: 21 },
    route: "lunar-transfer",
    crew: [{ code: "L-01", role: "Commander" }, { code: "L-02", role: "Pilot" }, { code: "L-03", role: "Mission specialist" }],
    subsystems: [], dataSource: "No telemetry source connected", hasCrewData: false,
  },
  {
    id: "NOX-03", name: "Earth Orbit Station Rotation", code: "NOX-03", destination: "earth", destinationLabel: "Earth (low orbit)", startDate: "2031-09-13",
    vehicle: { id: "NOX-SM-03", name: "NOX Station Module", phase: "earth-orbit", phaseLabel: "Low Earth orbit", statusText: "Station operations", day: 58, totalDays: 180 },
    route: "earth-orbit",
    crew: [{ code: "E-01", role: "Station commander" }, { code: "E-02", role: "Flight engineer" }],
    subsystems: [], dataSource: "No telemetry source connected", hasCrewData: false,
  },
  {
    id: "NOX-04", name: "Mars Orbit Relay", code: "NOX-04", destination: "mars", destinationLabel: "Mars (orbit)", startDate: "2031-04-13",
    vehicle: { id: "NOX-RV-04", name: "NOX Relay Vehicle", phase: "mars-orbit", phaseLabel: "Mars orbit", statusText: "Relay on station", day: 211, totalDays: 540 },
    route: "mars-orbit",
    crew: [{ code: "R-01", role: "Commander" }, { code: "R-02", role: "Flight engineer" }],
    subsystems: [], dataSource: "No telemetry source connected", hasCrewData: false,
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);
export const isActiveMission = (m: MissionRecord) => m.id === ACTIVE_MISSION_ID;

/** UTC calendar date (YYYY-MM-DD) of a mission day (1.0 = start date). */
export const missionDate = (m: MissionRecord, day: number) => new Date(Date.parse(m.startDate + "T00:00:00Z") + (day - 1) * 86400000).toISOString().slice(0, 10);
/** The single calendar date all missions share as "now" in this fictional timeline. */
export const SCENARIO_NOW = missionDate(MISSIONS[0], MISSIONS[0].vehicle.day);
