import { describe, expect, it } from "vitest";
import { NET, modelTelemetry, netPointAt, netOrbitRing, moonNet } from "@/lib/network";
import { MISSIONS } from "@/lib/missions";
import { msOfDay, trajectoryFor } from "@/lib/trajectory";

describe("mission-network layout", () => {
  it("places every mission at its current day with finite coordinates", () => {
    for (const m of MISSIONS) { const p = netPointAt(m.id, m.vehicle.day); expect(p, m.id).not.toBeNull(); p!.forEach((x) => expect(Number.isFinite(x)).toBe(true)); }
  });
  it("keeps orbit vehicles on their display ring", () => {
    for (const id of ["NOX-03", "NOX-04"]) {
      const ring = netOrbitRing(id)!, c = id === "NOX-03" ? NET.earth : NET.mars, R = Math.hypot(ring[0][0] - c[0], ring[0][1] - c[1], ring[0][2] - c[2]);
      const m = MISSIONS.find((x) => x.id === id)!, p = netPointAt(id, m.vehicle.day)!;
      expect(Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])).toBeCloseTo(R, 5);
    }
  });
  it("transfer starts at the Earth limb, ends at the Mars ring, and advances monotonically in x", () => {
    const tr = trajectoryFor("NOX-01"), a = netPointAt("NOX-01", 1)!, b = netPointAt("NOX-01", tr.pathEndDay)!;
    expect(Math.hypot(a[0] - NET.earth[0], a[1] - NET.earth[1])).toBeCloseTo(NET.earthR * 1.02, 1);
    expect(Math.hypot(b[0] - NET.mars[0], b[1] - NET.mars[1], b[2] - NET.mars[2])).toBeCloseTo(NET.marsOrbitR, 1);
    let prev = -1e9; for (let i = 0; i <= 60; i++) { const q = netPointAt("NOX-01", 1 + ((tr.pathEndDay - 1) * i) / 60)!; expect(q[0]).toBeGreaterThanOrEqual(prev - 1e-6); prev = q[0]; }
  });
  it("lunar path is curved (not a straight line) and the vehicle stays outside the Moon sphere", () => {
    const tr = trajectoryFor("NOX-02"), pts = Array.from({ length: 30 }, (_, i) => netPointAt("NOX-02", 1 + ((tr.pathEndDay - 1) * i) / 29)!);
    const a = pts[0], b = pts[29]; let maxDev = 0; for (const p of pts) { const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2); maxDev = Math.max(maxDev, Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1])); }
    expect(maxDev).toBeGreaterThan(2);
    for (let d = tr.pathEndDay; d <= 6.5; d += 0.1) { const p = netPointAt("NOX-02", d)!, m = moonNet(msOfDay("NOX-02", d))!; expect(Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2])).toBeGreaterThanOrEqual(NET.moonR * 1.3); }
  });
  it("telemetry comes from the model and has plausible magnitudes", () => {
    const t = modelTelemetry("NOX-03", 10)!; expect(t.dist!.km).toBeCloseTo(420, 0); expect(t.speed!.kmS).toBeGreaterThan(7.5); expect(t.speed!.kmS).toBeLessThan(7.8);
    const h = modelTelemetry("NOX-01", 184)!; expect(h.speed!.label).toContain("Sun"); expect(h.speed!.kmS).toBeGreaterThan(10); expect(h.speed!.kmS).toBeLessThan(45);
    expect(modelTelemetry("NOX-01", 5000)).toBeNull();
  });
});
