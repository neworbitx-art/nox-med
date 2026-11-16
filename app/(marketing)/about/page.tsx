import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { Backdrop } from "@/components/marketing/Backdrop";
import { Patch } from "@/components/marketing/Logo";
import { ROUTES } from "@/lib/routes";
import { Team } from "@/components/marketing/Team";

export const metadata: Metadata = { title: "About", description: "NOX — New Orbit Exploration: health intelligence for long-duration human spaceflight." };

export default function AboutPage() {
  return (
    <>
      <section className="mk-page-hero mk-page-bg">
        <Backdrop src="/backgrounds/cupola.jpg" variant="a" dim={0.45} position="center" />
        <div className="mk-wrap">
          <p className="mk-eyebrow">About NOX</p>
          <div style={{ marginTop: 22 }}><Patch size={140} /></div>
          <h1>Prevention is the only medicine at distance.</h1>
        </div>
      </section>
      <section className="mk-section" style={{ paddingTop: 40 }}>
        <div className="mk-wrap">
          <Reveal className="mk-prose">
            <p>NOX — New Orbit Exploration is an initiative building software for the health of crews on long-duration missions. It is created by a team that combines software engineering with clinical surgical practice.</p>
            <p>Beyond low Earth orbit, a return to hospital is not an option. Our approach is to make small changes visible early: trends in blood gas and physiology, read in the context of the spacecraft environment, so the right decision can be made before a problem becomes an emergency.</p>
          </Reveal>
          <div className="mk-grid3">
            <Reveal><h3>Trends, not snapshots</h3><p>A single value tells you little. NOX follows each astronaut across the whole mission.</p></Reveal>
            <Reveal delay={100}><h3>Honest data</h3><p>Every value carries its provenance and quality flag. Spacecraft readings are never presented as clinical values.</p></Reveal>
            <Reveal delay={200}><h3>Built for the crew</h3><p>Clear, calm interfaces for crew, flight surgeons and mission teams, on the ground and in flight.</p></Reveal>
          </div>
          <Reveal><p className="mk-eyebrow" style={{ marginTop: 72 }}>The team</p></Reveal>
          <Team />
          <div className="mk-hero-cta" style={{ marginTop: 56 }}>
            <Link href={ROUTES.demo} className="mk-btn mk-btn-primary">Explore the demo</Link>
            <Link href={`${ROUTES.demo}/about`} className="mk-btn mk-btn-ghost">Data sources &amp; methods</Link>
          </div>
        </div>
      </section>
    </>
  );
}
