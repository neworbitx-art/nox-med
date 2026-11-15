import type { V3 } from "./orbits";
import { RADIUS } from "./orbits";

/**
 * Visual scaling used by the Local views (documented on the About page).
 * Directions are exact; distances from the primary's centre are compressed with a power law:
 *   display = R_disp * (d / R_body) ^ K,  K = 0.55
 * so the planet surface maps to R_disp, a 420 km LEO sits just above it, and the Moon (60 R_E) lies ~9.5 R_disp away.
 * This keeps every orbit visible but does NOT preserve distance ratios; sizes are not to scale either.
 */
export const DISPLAY = { bodyRadius: 1.5, K: 0.55, moonRadius: 0.41 };
export function compress(rel: V3, body: "earth" | "mars"): V3 {
  const d = Math.hypot(rel[0], rel[1], rel[2]); if (d === 0) return [0, 0, 0];
  const k = (DISPLAY.bodyRadius * Math.pow(d / RADIUS[body], DISPLAY.K)) / d; return [rel[0] * k, rel[1] * k, rel[2] * k];
}
/** Ecliptic (x east, z north) -> three.js (y up) axes. */
export const toScene = (v: V3): V3 => [v[0], v[2], -v[1]];
/** Heliocentric scale for the Interplanetary view, scene units per AU (linear; bodies are drawn oversized). */
export const HELIO_UNITS_PER_AU = 20;
