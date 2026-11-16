/**
 * Public-facing mission summaries for the landing pages.
 * Deliberately hand-written (not imported from lib/missions) so the public site never bundles
 * demo clinical data, crew records or telemetry. Keep names/codes aligned with lib/missions.ts.
 */
export interface PublicMission { code: string; name: string; destination: string; duration: string; blurb: string; phase: string }
export const PUBLIC_MISSIONS: PublicMission[] = [
  { code: "NOX-01", name: "Mars Transit", destination: "Mars", duration: "900 days", phase: "Mars transit", blurb: "The long cruise. A full crew, an Earth–Mars transfer and the longest unbroken health record in the programme." },
  { code: "NOX-02", name: "Lunar Gateway Sortie", destination: "Moon", duration: "21 days", phase: "Translunar coast", blurb: "A fast cislunar run that tests rapid health baselining and contingency care close to home." },
  { code: "NOX-03", name: "Earth Orbit Station Rotation", destination: "Low Earth orbit", duration: "180 days", phase: "Low Earth orbit", blurb: "Six-month station rotations. The proving ground for trend monitoring and prevention." },
  { code: "NOX-04", name: "Mars Orbit Relay", destination: "Mars orbit", duration: "540 days", phase: "Mars orbit", blurb: "A relay vehicle holding station at Mars, keeping the network connected." },
];
