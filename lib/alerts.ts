import type { Alert, AstronautId, EnvironmentalSample, LabResult, MetricKey, Severity, VitalSign } from "./types";
import { METRICS, METRIC_KEYS, fmt } from "./metrics";
import { interpretability, statusIn } from "./validity";
import { mean, trendOf } from "./analysis";
import { dayToDate } from "./data";

const RANK: Record<Severity, number> = { critical: 0, warning: 1, watch: 2, info: 3 };

export function generateAlerts(
  labs: LabResult[], vitals: VitalSign[], env: EnvironmentalSample[], ids: AstronautId[], currentDay: number,
): Alert[] {
  const out: Alert[] = [];

  for (const id of ids) {
    const mine = labs.filter((l) => l.astronautId === id).sort((a, b) => a.missionDay - b.missionDay);

    // 1. Critical limits and persistent out-of-range excursions (reliable, sample-type-appropriate values only)
    for (const key of METRIC_KEYS) {
      const m = METRICS[key];
      let prevDir = 0;
      for (const l of mine) {
        const i = interpretability(l, key);
        if (!i.ok) continue;
        const v = l.values[key] as number;
        const st = statusIn(l, key);
        const dir = v < i.range.low ? -1 : v > i.range.high ? 1 : 0;
        if (st === "critical") {
          out.push({ id: `${id}-${key}-${l.id}-c`, astronautId: id, missionDay: l.missionDay, severity: "critical", category: "lab", metric: key,
            title: `${m.label} critical (${fmt(key, v)} ${m.unit})`.replace(" )", ")"), detail: `Outside critical limit on sample ${l.id} (${l.sampleType})${l.origin === "imported" ? ", imported" : ""}.` });
        } else if (dir !== 0 && dir === prevDir) {
          out.push({ id: `${id}-${key}-${l.id}-p`, astronautId: id, missionDay: l.missionDay, severity: "warning", category: "lab", metric: key,
            title: `${m.label} ${dir > 0 ? "above" : "below"} range on consecutive samples`, detail: `${fmt(key, v)} ${m.unit} (ref ${i.range.low}–${i.range.high}, ${l.sampleType}).` });
        }
        prevDir = dir;
      }
    }

    // 2. Personal-baseline drift (latest 4 samples vs first 10) — detects change before range excursion
    for (const key of METRIC_KEYS) {
      const t = trendOf(mine, key);
      if (!t || Math.abs(t.z) < 3) continue;
      const m = METRICS[key];
      out.push({ id: `${id}-${key}-drift`, astronautId: id, missionDay: t.latestDay, severity: "watch", category: "trend", metric: key,
        title: `${m.label} drifting ${t.z > 0 ? "up" : "down"} from personal baseline`,
        detail: `Baseline ${fmt(key, t.baselineMean)} → latest ${fmt(key, t.latest)} ${m.unit} (z=${t.z.toFixed(1)}, ${t.slopePer30d >= 0 ? "+" : ""}${t.slopePer30d.toFixed(m.decimals)}/30 d).` });
    }

    // 3. Wearable-derived observations
    const v = vitals.filter((x) => x.astronautId === id);
    const baseV = v.filter((x) => x.missionDay <= 30);
    const recent = v.filter((x) => x.missionDay > currentDay - 7);
    if (baseV.length > 10 && recent.length >= 4) {
      const dHr = mean(recent.map((x) => x.restingHr)) - mean(baseV.map((x) => x.restingHr));
      const dSleep = mean(recent.map((x) => x.sleepHours)) - mean(baseV.map((x) => x.sleepHours));
      const hrvRatio = mean(recent.map((x) => x.hrvMs)) / mean(baseV.map((x) => x.hrvMs));
      if (dHr >= 5) out.push({ id: `${id}-hr`, astronautId: id, missionDay: currentDay, severity: "watch", category: "vital", metric: "restingHr", title: "Resting heart rate elevated vs baseline", detail: `7-day mean +${dHr.toFixed(1)} bpm above first-30-day baseline.` });
      if (dSleep <= -0.8) out.push({ id: `${id}-sleep`, astronautId: id, missionDay: currentDay, severity: "watch", category: "vital", metric: "sleepHours", title: "Sleep duration reduced", detail: `7-day mean ${dSleep.toFixed(1)} h vs baseline.` });
      if (hrvRatio <= 0.85) out.push({ id: `${id}-hrv`, astronautId: id, missionDay: currentDay, severity: "watch", category: "vital", metric: "hrvMs", title: "Heart-rate variability reduced", detail: `7-day mean at ${(hrvRatio * 100).toFixed(0)}% of baseline.` });
    }
    for (const x of v) {
      if (x.spo2 < 94) out.push({ id: `${id}-spo2-${x.missionDay}`, astronautId: id, missionDay: x.missionDay, severity: "warning", category: "vital", metric: "spo2", title: `Wearable SpO₂ ${x.spo2}%`, detail: "Below 94% on daily wearable summary." });
    }
  }

  // 4. Environment (crew-wide), one alert per excursion run
  const runs = (pred: (e: EnvironmentalSample) => boolean, make: (e: EnvironmentalSample) => Omit<Alert, "id" | "astronautId" | "missionDay" | "category">) => {
    let prev = false;
    for (const e of env) {
      const on = pred(e);
      if (on && !prev) out.push({ id: `ENV-${make(e).metric}-${e.missionDay}`, astronautId: "CREW", missionDay: e.missionDay, category: "environment", ...make(e) });
      prev = on;
    }
  };
  runs((e) => e.co2Mmhg > 4, (e) => ({ severity: "watch", metric: "co2Mmhg", title: "Cabin CO₂ above 4.0 mmHg", detail: `${e.co2Mmhg} mmHg — check scrubber performance.` }));
  runs((e) => e.co2Mmhg > 5.3, (e) => ({ severity: "warning", metric: "co2Mmhg", title: "Cabin CO₂ above 5.3 mmHg", detail: `${e.co2Mmhg} mmHg — exposure limit approached.` }));
  runs((e) => e.radiationUSvH > 100, (e) => ({ severity: "warning", metric: "radiationUSvH", title: "Radiation dose-rate spike", detail: `${e.radiationUSvH} µSv/h (${dayToDate(e.missionDay)}), possible solar particle event.` }));
  runs((e) => e.pressureKpa < 100.5, (e) => ({ severity: "watch", metric: "pressureKpa", title: "Cabin pressure dip", detail: `${e.pressureKpa} kPa — verify leak check.` }));

  return out.sort((a, b) => b.missionDay - a.missionDay || RANK[a.severity] - RANK[b.severity]);
}

export type StatusLevel = "nominal" | "watch" | "attention" | "critical";

/** Crew status from ACTIVE alerts: lab/trend/vital alerts in the last 7 mission days or still-current observations. */
export function statusFor(alerts: Alert[], id: AstronautId, currentDay: number): StatusLevel {
  const mine = alerts.filter((a) => a.astronautId === id && a.missionDay > currentDay - 7);
  if (mine.some((a) => a.severity === "critical")) return "critical";
  if (mine.some((a) => a.severity === "warning")) return "attention";
  if (mine.some((a) => a.severity === "watch")) return "watch";
  return "nominal";
}
export type { MetricKey };
