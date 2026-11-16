import { PageHeader, Card, Tag } from "@/components/ui";
import { EPHEMERIS_META } from "@/lib/ephemeris";

export const metadata = { title: "About / Data Sources · NOX MED" };

const PROVENANCE: [string, "neutral" | "calc" | "ok" | "warn", string][] = [
  ["measured", "ok", "Measured on an instrument."],
  ["imported", "neutral", "Entered or uploaded by a user through Laboratory Import. Stored only in this browser."],
  ["calculated", "calc", "Derived from other values (for example HCO₃⁻, base excess, hematocrit by the analyzer)."],
  ["planned", "warn", "A scheduled time or event (checkpoint times, mission days). Not an observation."],
  ["modeled trajectory", "calc", "Position computed by the orbital model from stated assumptions."],
  ["ephemeris-derived", "calc", "Planet or Moon position read from the locally stored ephemeris table."],
];

export default function About() {
  return (
    <>
      <PageHeader title="About / Data Sources" desc="Where the information in NOX MED comes from and how much to trust it." />
      <div className="grid max-w-3xl gap-3 text-[13px] text-ink2">
        <Card title="Missions">
          <p>NOX-01 to NOX-04 are NOX missions. Vehicle icons are original procedural 3D shapes: a crew capsule with service module (Earth and lunar missions) and a stainless long-range transit vehicle (Mars missions). Each mission shows only its own crew records and spacecraft telemetry; values are never borrowed from another mission.</p>
        </Card>
        <Card title="Data provenance labels">
          <ul className="space-y-1.5">{PROVENANCE.map(([k, tone, d]) => <li key={k} className="flex gap-2"><span className="w-40 shrink-0"><Tag tone={tone}>{k}</Tag></span><span>{d}</span></li>)}</ul>
          <p className="mt-2 text-mute">Quality flags (QC clean, QC flag, not interpreted) describe a measurement&apos;s validity. They do not change its provenance.</p>
        </Card>
        <Card title="Orbital mechanics and ephemerides">
          <p>Positions of Earth, Mars and the Moon come from a local table generated with astronomy-engine (MIT, VSOP87/ELP-based analytic theory).</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]"><dt className="text-mute">Source</dt><dd>{EPHEMERIS_META.source}</dd><dt className="text-mute">Frame</dt><dd>{EPHEMERIS_META.frame}</dd><dt className="text-mute">Units</dt><dd>{EPHEMERIS_META.units.position}, {EPHEMERIS_META.units.velocity}</dd><dt className="text-mute">Interpolation</dt><dd>{EPHEMERIS_META.interpolation}; never extrapolated</dd><dt className="text-mute">Origins</dt><dd>{EPHEMERIS_META.note}</dd></dl>
          <p className="mt-2">Trajectories: Earth–Mars transfer by a Lambert solution between ephemeris positions; lunar transfer by Kepler propagation with the apogee solved against the lunar ephemeris; Earth and Mars orbits are circular. These are patched-conic, two-body models without perturbations, maneuvers or Earth/Mars departure and capture hyperbolae. They are not mission-design solutions. The NOX-01 departure date (2031-05-10) is not an efficient launch window, so the modeled transfer is long and has a high arrival v∞; each mission&apos;s assumptions are listed in its Navigator panel.</p>
          <p className="mt-2">Visual scaling. The default <b>Overview</b> is a mission-network composition, not true geometry: Earth–Moon is drawn in a rotating frame (Earth fixed, Moon held on the +X axis) with radial compression d<sub>disp</sub> = R·(d/R<sub>E</sub>)<sup>0.28</sup>; Earth and Mars orbits keep the model&apos;s orbital phase but are re-oriented and enlarged; the Earth–Mars transfer is an &ldquo;unrolled&rdquo; projection (x = fraction of swept heliocentric angle, y = radial rise above the departure radius, normalised). Phases and timing follow the trajectory model; distances, angles and sizes do not. The <b>Interplanetary</b> view is the Sun-centred physics view (linear, 20 scene units per AU, enlarged bodies). The <b>Earth–Moon</b> and <b>Mars</b> views keep directions exact and compress distances as display = R·(d/R)<sup>0.55</sup>. Lunar capture inside the Moon&apos;s sphere of influence is schematic in every view. The bottom bar shows distance and speed computed from the trajectory model, never live telemetry. No view is to scale.</p>
          <p className="mt-2">Playback is driven by a mission clock. It is not a live feed; the &quot;now&quot; position is the dataset&apos;s current mission day.</p>
        </Card>
        <Card title="Spacecraft health vs. astronaut health">
          <p>Astronaut health (clinical records), spacecraft environment (cabin CO₂, O₂, pressure, temperature, humidity, radiation) and spacecraft engineering (power, communications, life support, structure) are three separate assessments. A healthy ship does not imply healthy crew, and ship measurements are never attributed to a person&apos;s physiology.</p>
        </Card>
        <Card title="Anatomy illustrations">
          <p>The Crew Health Overview shows a full-body cardiovascular view built from open anatomical meshes: BodyParts3D © The Database Center for Life Science (DBCLS), adapted by the open-source Body Atlas project (github.com/mhaney93/body-atlas) with parts from Z-Anatomy. <code>skin.glb</code> is CC BY 4.0; <code>circulatory.glb</code> is CC BY-SA 4.0 and was modified (parts merged, simplified, re-oriented). It is generic adult male anatomy, not patient-specific, and not a measurement. See <code>docs/ASSET_LICENSES.md</code> for licences.</p>
        </Card>
        <Card title="Textures and software">
          <p>Planet textures come from public-domain imagery mirrored on GitHub/npm (details in <code>docs/ASSET_LICENSES.md</code>); the Moon&apos;s far side is procedural filler. Software: Next.js, React, three.js, Recharts, astronomy-engine, lucide-react, pdfjs-dist.</p>
        </Card>
      </div>
    </>
  );
}
