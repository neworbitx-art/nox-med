import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { Patch } from "@/components/marketing/Logo";
import { ROUTES } from "@/lib/routes";
import { PUBLIC_MISSIONS } from "@/lib/marketing-content";
import { Backdrop, Stars } from "@/components/marketing/Backdrop";
import { DriftSchema } from "@/components/marketing/Schemas";
import { Team } from "@/components/marketing/Team";

export default function Home() {
  return (
    <>
      <section className="mk-hero" aria-label="NOX — The next orbit starts here">
        <div className="mk-earth" aria-hidden="true" />
        <div className="mk-wrap mk-hero-inner">
          <p className="mk-eyebrow mk-fade">NOX — New Orbit Exploration</p>
          <h1 className="mk-fade d1" style={{ marginTop: 22 }}>The next orbit <em>starts here.</em></h1>
          <p className="mk-fade d2">Mission intelligence and astronaut health monitoring for crews that travel farther than anyone has before.</p>
          <div className="mk-hero-cta mk-fade d3">
            <Link href={ROUTES.demo} className="mk-btn mk-btn-primary">Explore the demo</Link>
            <Link href={ROUTES.missions} className="mk-btn mk-btn-ghost">View missions</Link>
          </div>
        </div>
        <div className="mk-scroll" aria-hidden="true">Scroll</div>
      </section>

      <section id="mission-control" className="mk-section">
        <Backdrop src="/backgrounds/cupola.jpg" variant="a" dim={0.42} />
        <div className="mk-wrap mk-split">
          <Reveal>
            <p className="mk-eyebrow">Interactive Mission Control</p>
            <h2 className="mk-h2">Every mission, one living view.</h2>
            <p className="mk-lead">Fly through the mission network in 3D. Select a vehicle, scrub its trajectory through time, and read spacecraft environment and crew status side by side.</p>
            <div className="mk-ticks">
              <div><b>4</b><span>Missions</span></div>
              <div><b>3D</b><span>Trajectories</span></div>
              <div><b>Live</b><span>Mission clock</span></div>
            </div>
            <Link href={ROUTES.demo} className="mk-link">Open mission control <span aria-hidden>→</span></Link>
          </Reveal>
          <Reveal delay={150}>
            <div className="mk-panel" aria-hidden="true">
              <header><span>MISSION NAVIGATOR</span><span>● LIVE</span></header>
              <div className="mk-orbit">
                <svg viewBox="0 0 400 210" fill="none">
                  <ellipse cx="200" cy="105" rx="170" ry="62" stroke="rgba(255,255,255,.25)" strokeDasharray="3 6" />
                  <ellipse cx="200" cy="105" rx="110" ry="38" stroke="rgba(0,207,255,.5)" />
                  <circle cx="200" cy="105" r="26" fill="#14181C" stroke="#00CFFF" />
                  <circle cx="310" cy="105" r="5" fill="#00CFFF" /><circle cx="48" cy="92" r="4" fill="#fff" />
                  <path d="M310 105 C 340 40, 380 40, 395 60" stroke="#00CFFF" strokeWidth="1.2" />
                </svg>
              </div>
              <dl><dt>Selected</dt><dd>NOX-01</dd><dt>Phase</dt><dd>Mars transit</dd><dt>Trajectory</dt><dd>Earth–Mars transfer</dd><dt>Source</dt><dd>Model-derived</dd></dl>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="missions" className="mk-section alt">
        <Backdrop src="/backgrounds/mars.jpg" variant="b" dim={0.4} />
        <div className="mk-wrap">
          <Reveal>
            <p className="mk-eyebrow">NOX Missions</p>
            <h2 className="mk-h2">From low orbit to Mars.</h2>
            <p className="mk-lead">A family of missions built around one idea: the farther the crew goes, the earlier we need to see change coming.</p>
          </Reveal>
          <div className="mk-cards">
            {PUBLIC_MISSIONS.map((m, i) => (
              <Reveal key={m.code} delay={i * 80} className="mk-card">
                <span className="code">{m.code}</span>
                <h3>{m.name}</h3>
                <p>{m.blurb}</p>
                <div className="meta"><span>{m.destination}</span><span>{m.duration}</span></div>
              </Reveal>
            ))}
          </div>
          <Link href={ROUTES.missions} className="mk-link">All missions <span aria-hidden>→</span></Link>
        </div>
      </section>

      <section id="nox-med" className="mk-section mk-med-home">
        <Stars />
        <div className="mk-wrap mk-split">
          <Reveal delay={100}>
            <DriftSchema />
          </Reveal>
          <Reveal>
            <p className="mk-eyebrow">NOX MED · Innovation</p>
            <h2 className="mk-h2">Detect the change before it becomes an emergency.</h2>
            <p className="mk-lead">Most blood tests are read as a snapshot. NOX MED reads them as a story: one quick sample, followed across the whole mission and measured against each astronaut&apos;s own baseline.</p>
            <ul className="mk-pillars">
              <li><b>Your own baseline</b><span>The reference is the astronaut, not a population average.</span></li>
              <li><b>Time, not snapshots</b><span>Every sample is read against the mission so far.</span></li>
              <li><b>Explained, never a black box</b><span>Each observation shows its reasoning and its uncertainty.</span></li>
            </ul>
            <div className="mk-cta-row">
              <Link href={ROUTES.noxMed} className="mk-link">Discover the innovation <span aria-hidden>→</span></Link>
              <Link href={ROUTES.demoMed} className="mk-link mk-link-quiet">Open NOX MED <span aria-hidden>→</span></Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mk-section alt">
        <Backdrop src="/backgrounds/earthrise.jpg" variant="c" dim={0.5} position="65% 45%" />
        <div className="mk-wrap mk-split">
          <Reveal>
            <p className="mk-eyebrow">About NOX</p>
            <h2 className="mk-h2">Built for the distance.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mk-prose">
              <p>NOX — New Orbit Exploration is a software and medical-intelligence initiative for human spaceflight. We combine mission engineering and clinical practice so that crews, flight surgeons and mission teams read the same picture.</p>
              <p>On missions where help is days or months away, prevention is the only dependable medicine.</p>
            </div>
            <Link href={ROUTES.about} className="mk-link">About NOX <span aria-hidden>→</span></Link>
          </Reveal>
        </div>
        <div className="mk-wrap" id="team">
          <Reveal><p className="mk-eyebrow" style={{ marginTop: 72 }}>The team</p><h2 className="mk-h2">The people behind NOX.</h2></Reveal>
          <Team />
        </div>
      </section>

      <section className="mk-section mk-invite" aria-label="Explore the demo">
        <Backdrop src="/backgrounds/launch.jpg" variant="b" dim={0.5} position="50% 40%" />
        <div className="mk-wrap">
          <Reveal>
            <div className="mk-center"><Patch size={150} /></div>
            <p className="mk-eyebrow">Ready for launch</p>
            <h2 className="mk-h2" style={{ marginTop: 18 }}>Step inside the mission.</h2>
            <p className="mk-lead">Open the interactive demo and explore trajectories, telemetry and crew health yourself.</p>
            <div className="mk-hero-cta"><Link href={ROUTES.demo} className="mk-btn mk-btn-primary">Explore the demo</Link></div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
