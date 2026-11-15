export type AstronautId = "A-01" | "A-02" | "A-03" | "A-04";
export type DataOrigin = "simulated" | "imported";

export type MetricKey =
  | "pH" | "pCO2" | "pO2" | "sO2" | "tHb" | "Hct" | "COHb"
  | "Na" | "K" | "iCa" | "Cl" | "Glu" | "Lac" | "HCO3" | "BE" | "FO2Hb" | "MetHb";

export type MetricGroup = "Blood gas" | "Electrolytes" | "Metabolites" | "Hematology & oximetry";

export interface MetricDef {
  key: MetricKey;
  label: string;
  name: string;
  unit: string;
  decimals: number;
  group: MetricGroup;
  refLow: number;
  refHigh: number;
  critLow?: number;
  critHigh?: number;
  meaning: string;
}

export interface Astronaut {
  id: AstronautId;
  role: string;
  age: number;
  sex: "F" | "M";
  heightCm: number;
  massKg: number;
  note: string;
}

export interface Mission {
  id: string;
  name: string;
  totalDays: number;
  currentDay: number;
  startDate: string;
  dataNotice: string;
}

export type SampleType = "arterial" | "venous" | "capillary" | "unknown";
export type Verification = "verified" | "pending" | "rejected";

/** Quality-control flag raised by the analyzer or operator; applies to specific analytes. */
export interface QcFlag {
  code: string;
  analytes: MetricKey[];
  message: string;
}

export type Provenance = "measured" | "calculated";

export interface LabResult {
  id: string;
  astronautId: AstronautId;
  missionDay: number;
  /** ISO 8601 UTC collection timestamp */
  collectedAt: string;
  sampleType: SampleType;
  analyzer: string;
  origin: DataOrigin;
  verification: Verification;
  qcFlags: QcFlag[];
  /** Inspired O2 fraction (0–1), when known; required for PaO2/FiO2 */
  fio2?: number;
  values: Partial<Record<MetricKey, number>>;
}

export interface VitalSign {
  astronautId: AstronautId;
  missionDay: number;
  restingHr: number;
  hrvMs: number;
  spo2: number;
  systolic: number;
  diastolic: number;
  skinTempC: number;
  respRate: number;
  sleepHours: number;
  /** Daily mean / peak heart rate across the 24 h wearable record */
  meanHr: number;
  maxHr: number;
  /** Minutes of moderate-or-higher physical activity (includes logged exercise) */
  activeMin: number;
  /** Minutes of logged exercise events */
  exerciseMin: number;
  origin: DataOrigin;
}

export type ExerciseType = "Treadmill (running)" | "Resistive (ARED)" | "Cycle ergometer";

export interface ExerciseEvent {
  id: string;
  astronautId: AstronautId;
  missionDay: number;
  /** ISO 8601 UTC start */
  startedAt: string;
  durationMin: number;
  type: ExerciseType;
  avgHr: number;
  peakHr: number;
  origin: DataOrigin;
}

/** Hourly cabin telemetry. A null field = that sensor was offline; absent hour = all telemetry offline. */
export interface HourlyEnvSample {
  /** Whole hours since mission start (0 = day 1, 00:00 UTC) */
  hour: number;
  co2Mmhg: number | null;
  o2Pct: number | null;
  pressureKpa: number | null;
  tempC: number | null;
  humidityPct: number | null;
  radiationUSvH: number | null;
}

export interface EnvironmentalSample {
  missionDay: number;
  co2Mmhg: number;
  o2Pct: number;
  pressureKpa: number;
  tempC: number;
  humidityPct: number;
  radiationUSvH: number;
  noiseDb: number;
}

export type Severity = "critical" | "warning" | "watch" | "info";

export interface Alert {
  id: string;
  astronautId: AstronautId | "CREW";
  missionDay: number;
  severity: Severity;
  category: "lab" | "trend" | "vital" | "environment" | "simulation";
  title: string;
  detail: string;
  metric?: string;
}

/** A laboratory report transcribed from an uploaded PDF/image. Real-world data: kept apart from simulated crew records. */
export interface UploadedLab {
  id: string;
  /** Operator-chosen pseudonymous label (e.g. "Subject 1"). The report's own patient ID/name/sample number is never stored. */
  subjectLabel: string;
  /** Collection time as printed on the report (device clock; no time zone is printed), stored as ISO text */
  collectedAt: string;
  sampleType: SampleType;
  analyzer: string;
  verification: Verification;
  qcFlags: QcFlag[];
  temperatureC?: number;
  fio2?: number;
  values: Partial<Record<MetricKey, number>>;
  /** Analytes the analyzer calculated rather than measured */
  calculated: MetricKey[];
  /** Analytes in the report that NOX MED does not chart (e.g. FHHb, ctBil, anion gap) */
  extra: Record<string, number>;
  source: "pdf-text" | "image-manual" | "manual";
  savedAt: string;
}
