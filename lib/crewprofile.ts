import type { AstronautId } from "./types";
import { mission } from "./data";
import portraitManifest from "../public/crew/manifest.json";

/** Body systems used to filter medical records and (when a model exists) the 3D atlas. */
export type SystemId = "blood" | "metabolic" | "cardiovascular" | "respiratory" | "endocrine" | "musculoskeletal" | "nervous" | "renal" | "digestive" | "immune";
export const SYSTEMS: { id: SystemId; label: string; atlas: boolean }[] = [
  { id: "cardiovascular", label: "Cardiovascular", atlas: true },
  { id: "respiratory", label: "Respiratory", atlas: false },
  { id: "endocrine", label: "Endocrine / metabolic", atlas: false },
  { id: "musculoskeletal", label: "Musculoskeletal", atlas: false },
  { id: "nervous", label: "Nervous", atlas: false },
  { id: "renal", label: "Renal / urinary", atlas: false },
  { id: "digestive", label: "Digestive", atlas: false },
  { id: "blood", label: "Blood", atlas: false },
  { id: "metabolic", label: "Metabolic", atlas: false },
  { id: "immune", label: "Immune / hematologic", atlas: false },
];

export type RecordKind = "condition" | "surgery" | "allergy" | "medication" | "pacemaker" | "cardiac-implant" | "cgm" | "orthopedic" | "other-implant";
export const RECORD_KINDS: { kind: RecordKind; label: string; device: boolean; systems: SystemId[] }[] = [
  { kind: "condition", label: "Chronic medical condition", device: false, systems: [] },
  { kind: "surgery", label: "Surgical history", device: false, systems: [] },
  { kind: "allergy", label: "Allergy", device: false, systems: ["immune"] },
  { kind: "medication", label: "Medication", device: false, systems: [] },
  { kind: "pacemaker", label: "Pacemaker", device: true, systems: ["cardiovascular"] },
  { kind: "cardiac-implant", label: "Implantable cardiac device", device: true, systems: ["cardiovascular"] },
  { kind: "cgm", label: "Continuous glucose monitor", device: true, systems: ["endocrine"] },
  { kind: "orthopedic", label: "Orthopedic prosthesis", device: true, systems: ["musculoskeletal"] },
  { kind: "other-implant", label: "Other medical implant", device: true, systems: [] },
];
export const kindMeta = (k: RecordKind) => RECORD_KINDS.find((r) => r.kind === k)!;

export interface MedicalRecord {
  id: string;
  astronautId: AstronautId;
  kind: RecordKind;
  title: string;
  detail?: string;
  /** Systems this record is relevant to (conditions/medications/surgeries are tagged by the user) */
  systems: SystemId[];
  date?: string;
  /** Every record in this prototype is fictional. Demo records are loaded only on request. */
  fictional: true;
  origin: "user" | "demo";
}

export const isDevice = (r: MedicalRecord) => kindMeta(r.kind).device;
export const recordsForSystem = (all: MedicalRecord[], id: AstronautId, sys: SystemId) =>
  all.filter((r) => r.astronautId === id && (r.systems.includes(sys) || kindMeta(r.kind).systems.includes(sys)));

/** Optional demonstration records. Loaded only when the user asks; nothing is assigned by default. */
export const DEMO_RECORDS: Omit<MedicalRecord, "id">[] = [
  { astronautId: "A-02", kind: "cgm", title: "Continuous glucose monitor (fictional demo)", detail: "Subcutaneous sensor, placed in simulated preflight. Device readings are not blood-gas analyzer results.", systems: ["endocrine"], date: "2031-04-12", fictional: true, origin: "demo" },
  { astronautId: "A-03", kind: "pacemaker", title: "Dual-chamber pacemaker (fictional demo)", detail: "Demonstration record only: device model, settings and interrogation data are not provided.", systems: ["cardiovascular"], date: "2027-09-03", fictional: true, origin: "demo" },
  { astronautId: "A-04", kind: "orthopedic", title: "Tibial intramedullary nail, right (fictional demo)", detail: "Demonstration record of a healed fracture fixation.", systems: ["musculoskeletal"], date: "2024-02-20", fictional: true, origin: "demo" },
  { astronautId: "A-01", kind: "allergy", title: "Penicillin allergy (fictional demo)", detail: "Demonstration record only.", systems: ["immune"], fictional: true, origin: "demo" },
];

// ───────────────────────── portraits ─────────────────────────
export interface PortraitEntry { id: AstronautId; file: string; alt: string; status: "placeholder" | "approved"; brief: string }
export const PORTRAITS = portraitManifest.portraits as PortraitEntry[];
export const portraitOf = (id: AstronautId): PortraitEntry => PORTRAITS.find((p) => p.id === id) ?? { id, file: "", alt: `Crew member ${id} (no portrait on file)`, status: "placeholder", brief: "" };

// ───────────────────────── longitudinal record ─────────────────────────
export type Phase = "previous-mission" | "preflight" | "active-mission" | "postflight" | "future-assignment";
export const PHASE_LABEL: Record<Phase, string> = {
  "previous-mission": "Previous mission", preflight: "Preflight baseline", "active-mission": "Active mission", postflight: "Postflight recovery", "future-assignment": "Future assignment",
};
export interface Episode {
  phase: Phase; label: string; period: string; status: "completed" | "in-progress" | "planned" | "not-recorded";
  /** What the record can and cannot say about this period */
  note: string; hasObservations: boolean;
}

export const CREW_IDENTITY: Record<AstronautId, { persistentId: string; callsign: string }> = {
  "A-01": { persistentId: "NOX-CREW-0001", callsign: "Commander" },
  "A-02": { persistentId: "NOX-CREW-0002", callsign: "Flight engineer" },
  "A-03": { persistentId: "NOX-CREW-0003", callsign: "Science specialist" },
  "A-04": { persistentId: "NOX-CREW-0004", callsign: "Medical officer" },
  "L-01": { persistentId: "NOX-CREW-0005", callsign: "Commander" }, "L-02": { persistentId: "NOX-CREW-0006", callsign: "Pilot" }, "L-03": { persistentId: "NOX-CREW-0007", callsign: "Mission specialist" },
  "E-01": { persistentId: "NOX-CREW-0008", callsign: "Station commander" }, "E-02": { persistentId: "NOX-CREW-0009", callsign: "Flight engineer" },
  "R-01": { persistentId: "NOX-CREW-0010", callsign: "Commander" }, "R-02": { persistentId: "NOX-CREW-0011", callsign: "Flight engineer" },
};

/** Episodes for one astronaut. Observation counts for the active mission come from the real dataset; no future observations are generated. */
export function episodesFor(id: AstronautId, activeLabCount: number, currentDay: number, totalDays: number): Episode[] {
  return [
    { phase: "previous-mission", label: "Earlier assignments", period: "—", status: "not-recorded", hasObservations: false, note: "No previous-mission data has been loaded for this fictional crew member." },
    { phase: "preflight", label: "Preflight baseline", period: "before mission launch", status: "not-recorded", hasObservations: false, note: "No preflight samples are in this dataset. The personal baseline used in trend rules is the first reliable in-mission samples, which is not a preflight baseline." },
    { phase: "active-mission", label: `${mission.id} ${mission.name}`, period: `day ${currentDay} of ${totalDays}`, status: "in-progress", hasObservations: activeLabCount > 0, note: `${activeLabCount} blood gas samples recorded so far. Scenario runs in the Emergency Simulator are separate from this record.` },
    { phase: "postflight", label: "Postflight recovery", period: `after day ${totalDays}`, status: "planned", hasObservations: false, note: "Not started. No postflight observations exist." },
    { phase: "future-assignment", label: "Future assignments", period: "unassigned", status: "planned", hasObservations: false, note: "Planned items carry no clinical observations." },
  ];
}

/** Body systems shown in the mission Crew Health Overview. `atlas: true` means a functional layer with linked measurements; the others are future modules. */
export const OVERVIEW_SYSTEMS: { id: SystemId; label: string; atlas: boolean }[] = [
  { id: "cardiovascular", label: "Cardiovascular", atlas: true },
  { id: "respiratory", label: "Respiratory", atlas: true },
  { id: "blood", label: "Hematological", atlas: true },
  { id: "nervous", label: "Neurological", atlas: false },
  { id: "musculoskeletal", label: "Musculoskeletal", atlas: false },
  { id: "renal", label: "Renal", atlas: false },
  { id: "endocrine", label: "Endocrine", atlas: false },
  { id: "immune", label: "Immune / Lymphatic", atlas: false },
  { id: "digestive", label: "Gastrointestinal", atlas: false },
];
