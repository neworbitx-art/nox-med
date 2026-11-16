import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { Backdrop } from "@/components/marketing/Backdrop";
import { ROUTES } from "@/lib/routes";
import { PUBLIC_MISSIONS } from "@/lib/marketing-content";

export const metadata: Metadata = { title: "Missions", description: "The NOX mission family, from low Earth orbit to Mars." };

export default function MissionsPage() {
  return (
    <>
      <section className="mk-page-hero mk-page-bg">
        <Backdrop src="/backgrounds/mars.jpg" variant="b" dim={0.45} position="center" />
        <div className="mk-wrap">
          <p className="mk-eyebrow">NOX Missions</p>
          <h1>Four missions. One horizon.</h1>
          <p className="mk-lead">Each mission carries its own crew records and spacecraft telemetry. Open any of them in the interactive demo.</p>
        </div>
      </section>
      <section className="mk-section" style={{ paddingTop: 40 }}>
        <div className="mk-wrap">
          <div className="mk-cards" style={{ marginTop: 0 }}>
            {PUBLIC_MISSIONS.map((m, i) => (
              <Reveal key={m.code} delay={i * 80} className="mk-card">
                <span className="code">{m.code}</span>
                <h3>{m.name}</h3>
                <p>{m.blurb}</p>
                <div className="meta"><span>{m.phase}</span><span>{m.duration}</span></div>
                <Link href={`${ROUTES.demo}/mission/${m.code}`} className="mk-link" style={{ marginTop: 18 }}>Open in demo <span aria-hidden>→</span></Link>
              </Reveal>
            ))}
          </div>
          <div className="mk-hero-cta" style={{ marginTop: 56 }}><Link href={ROUTES.demo} className="mk-btn mk-btn-primary">Explore the demo</Link></div>
        </div>
      </section>
    </>
  );
}
