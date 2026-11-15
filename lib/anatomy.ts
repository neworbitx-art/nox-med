import type { MetricKey } from "./types";
import type { VKey } from "./wearables";
import type { SystemId } from "./crewprofile";

/** Catalog of the 26 separately selectable meshes in public/models/cardiovascular.glb (node name = id). */
export type StructureGroup = "Heart chambers" | "Great vessels" | "Coronary vessels";
export interface StructureDef { id: string; label: string; group: StructureGroup; kind: "chamber" | "artery" | "vein"; description: string }

export const MODEL_URL = "/models/cardiovascular.glb";
export const MODEL_INFO = {
  url: MODEL_URL,
  meshCount: 26,
  source: "Z-Anatomy (derived from BodyParts3D)",
  note: "Generic anatomical atlas model, simplified for the web. It is not the astronaut's own anatomy and does not reflect any measurement.",
};

const S = (id: string, label: string, group: StructureGroup, kind: StructureDef["kind"], description: string): StructureDef => ({ id, label, group, kind, description });
export const STRUCTURES: StructureDef[] = [
  S("left-ventricle", "Left ventricle", "Heart chambers", "chamber", "Thick-walled chamber that pumps oxygenated blood into the aorta for the systemic circulation."),
  S("right-ventricle", "Right ventricle", "Heart chambers", "chamber", "Chamber that pumps deoxygenated blood through the pulmonary trunk to the lungs."),
  S("left-atrium", "Left atrium", "Heart chambers", "chamber", "Receives oxygenated blood from the pulmonary veins and passes it to the left ventricle."),
  S("right-atrium", "Right atrium", "Heart chambers", "chamber", "Receives systemic venous blood from the superior and inferior vena cavae."),
  S("ascending-aorta", "Ascending aorta", "Great vessels", "artery", "First segment of the aorta, rising from the left ventricle; the coronary arteries arise at its root."),
  S("aortic-arch", "Aortic arch", "Great vessels", "artery", "Curved segment giving rise to the brachiocephalic trunk, left common carotid and left subclavian arteries."),
  S("thoracic-aorta", "Thoracic aorta", "Great vessels", "artery", "Descending aorta within the chest (proximal part shown)."),
  S("brachiocephalic-trunk", "Brachiocephalic trunk", "Great vessels", "artery", "First branch of the arch; divides into the right common carotid and right subclavian arteries."),
  S("l-common-carotid", "Left common carotid artery", "Great vessels", "artery", "Branch of the arch supplying the left side of the head and neck (proximal part shown)."),
  S("r-common-carotid", "Right common carotid artery", "Great vessels", "artery", "Supplies the right side of the head and neck (proximal part shown)."),
  S("l-subclavian", "Left subclavian artery", "Great vessels", "artery", "Branch of the arch supplying the left arm (proximal part shown)."),
  S("r-subclavian", "Right subclavian artery", "Great vessels", "artery", "Supplies the right arm (proximal part shown)."),
  S("pulmonary-trunk", "Pulmonary trunk", "Great vessels", "artery", "Carries deoxygenated blood from the right ventricle; divides into the left and right pulmonary arteries."),
  S("l-pulmonary-artery", "Left pulmonary artery", "Great vessels", "artery", "Carries blood from the pulmonary trunk to the left lung."),
  S("r-pulmonary-artery", "Right pulmonary artery", "Great vessels", "artery", "Carries blood from the pulmonary trunk to the right lung."),
  S("superior-vena-cava", "Superior vena cava", "Great vessels", "vein", "Returns venous blood from the head, neck and arms to the right atrium."),
  S("inferior-vena-cava", "Inferior vena cava (thoracic part)", "Great vessels", "vein", "Returns venous blood from the lower body to the right atrium."),
  S("l-brachiocephalic-vein", "Left brachiocephalic vein", "Great vessels", "vein", "Joins the right brachiocephalic vein to form the superior vena cava."),
  S("r-brachiocephalic-vein", "Right brachiocephalic vein", "Great vessels", "vein", "Joins the left brachiocephalic vein to form the superior vena cava."),
  S("left-coronary-artery", "Left coronary artery", "Coronary vessels", "artery", "Arises from the aortic root; divides into the anterior interventricular and circumflex arteries."),
  S("right-coronary-artery", "Right coronary artery", "Coronary vessels", "artery", "Arises from the aortic root and runs in the right atrioventricular groove."),
  S("lad", "Anterior interventricular artery", "Coronary vessels", "artery", "Branch of the left coronary artery running in the groove between the ventricles."),
  S("circumflex", "Circumflex artery", "Coronary vessels", "artery", "Branch of the left coronary artery running in the left atrioventricular groove."),
  S("great-cardiac-vein", "Great cardiac vein", "Coronary vessels", "vein", "Drains the anterior heart wall toward the coronary sinus."),
  S("middle-cardiac-vein", "Middle cardiac vein", "Coronary vessels", "vein", "Runs in the posterior interventricular groove and drains to the coronary sinus."),
  S("coronary-sinus", "Coronary sinus", "Coronary vessels", "vein", "Collects cardiac venous blood and empties into the right atrium."),
];
export const STRUCTURE_BY_ID = Object.fromEntries(STRUCTURES.map((s) => [s.id, s])) as Record<string, StructureDef>;
export const GROUPS: StructureGroup[] = ["Heart chambers", "Great vessels", "Coronary vessels"];

/** Display colours (conventional atlas colouring: arteries red, veins blue, myocardium dusky red) */
export const colorOf = (s: StructureDef) => (s.kind === "vein" ? "#4a68c4" : s.kind === "chamber" ? "#F87171" : s.group === "Coronary vessels" ? "#e0452f" : "#F87171");

// ───────────────────────── linked physiological data ─────────────────────────
export type Source = "analyzer" | "wearable" | "cabin";
export type EnvKey = "co2Mmhg" | "o2Pct" | "pressureKpa" | "tempC" | "humidityPct" | "radiationUSvH";
export interface DataLink { source: Source; lab?: MetricKey; vital?: VKey; env?: EnvKey; label: string; note?: string; oxygenation?: boolean }

const L = (lab: MetricKey, label: string, note?: string, oxygenation = false): DataLink => ({ source: "analyzer", lab, label, note, oxygenation });
const E = (env: EnvKey, label: string, note?: string): DataLink => ({ source: "cabin", env, label, note });
const W = (vital: VKey, label: string, note?: string): DataLink => ({ source: "wearable", vital, label, note });

export const CARDIO_LINKS: DataLink[] = [
  W("restingHr", "Resting heart rate"), W("meanHr", "Mean heart rate (24 h)"),
  W("systolic", "Systolic blood pressure", "wearable / vitals record"), W("diastolic", "Diastolic blood pressure", "wearable / vitals record"),
  L("tHb", "Hemoglobin"), L("Hct", "Hematocrit", "calculated by the analyzer"),
  L("pO2", "Arterial pO₂", "interpreted only for arterial / capillary samples", true), L("sO2", "Oxygen saturation (sO₂)", "interpreted only for arterial / capillary samples", true),
  L("pH", "Blood pH"), L("pCO2", "pCO₂"), L("Lac", "Lactate"), L("K", "Potassium"), L("iCa", "Ionized calcium"),
];

/** Which measurements to put in front of the user for the selected structure group (context only, never attribution). */
export const GROUP_FOCUS: Record<StructureGroup | "all", (string)[]> = {
  all: CARDIO_LINKS.map((l) => (l.lab ?? l.vital) as string),
  "Heart chambers": ["restingHr", "meanHr", "systolic", "diastolic", "K", "iCa", "Lac"],
  "Great vessels": ["systolic", "diastolic", "tHb", "Hct", "pO2", "sO2", "pH", "pCO2"],
  "Coronary vessels": ["restingHr", "Lac", "K", "iCa", "tHb", "pO2"],
};

export const SYSTEM_LINKS: Partial<Record<SystemId, DataLink[]>> = {
  cardiovascular: CARDIO_LINKS,
  respiratory: [L("pO2", "Arterial pO₂", "arterial / capillary samples only", true), L("pCO2", "pCO₂"), L("sO2", "Oxygen saturation (sO₂)", "arterial / capillary samples only", true), W("respRate", "Respiratory rate"), E("co2Mmhg", "Cabin CO₂ exposure", "ambient cabin air, not blood pCO₂"), E("o2Pct", "Cabin O₂ fraction", "oxygen environment"), W("spo2", "SpO₂ (pulse oximetry)", "wearable, not the analyzer")],
  endocrine: [L("Glu", "Glucose (blood gas analyzer)", "point-in-time sample; not a CGM reading")],
  renal: [L("K", "Potassium"), L("Na", "Sodium"), L("Cl", "Chloride")],
  blood: [L("tHb", "Hemoglobin"), L("Hct", "Hematocrit", "calculated by the analyzer"), L("sO2", "Oxygen saturation (sO₂)", "arterial / capillary samples only", true), L("FO2Hb", "Oxyhemoglobin (FO₂Hb)", "arterial / capillary samples only", true), L("pH", "Blood pH"), L("HCO3", "Bicarbonate (cHCO₃⁻)", "calculated by the analyzer"), L("BE", "Base excess", "calculated by the analyzer")],
  metabolic: [L("Glu", "Glucose (blood gas analyzer)", "point-in-time sample; not a CGM reading"), L("Lac", "Lactate"), L("HCO3", "Bicarbonate (cHCO₃⁻)", "calculated by the analyzer"), L("BE", "Base excess", "calculated by the analyzer")],
};

/** Compact physiological summary for the mission overview. */
export const SUMMARY_LINKS: DataLink[] = [
  L("pH", "pH"), L("pCO2", "pCO₂"), L("pO2", "pO₂", "arterial / capillary samples only", true), L("HCO3", "HCO₃⁻", "calculated"), L("Lac", "Lactate"), L("Na", "Sodium"), L("K", "Potassium"), L("tHb", "Hemoglobin"),
  W("restingHr", "Resting heart rate"), W("respRate", "Respiratory rate"), W("spo2", "SpO₂ (pulse oximetry)"), W("systolic", "Systolic BP"), W("diastolic", "Diastolic BP"),
];
