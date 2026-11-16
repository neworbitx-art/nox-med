import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { Backdrop } from "@/components/marketing/Backdrop";
import { FlowSchema } from "@/components/marketing/Schemas";
import { MedDetail } from "@/components/marketing/MedDetail";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "NOX MED",
  description: "Longitudinal blood gas intelligence for long-duration spaceflight: personal baselines, explainable observations, medical officer review.",
};

export default function NoxMedPage() {
  return (
    <>
      <section className="mk-page-hero mk-page-bg">
        <Backdrop src="/backgrounds/earthrise.jpg" variant="c" dim={0.55} position="60% 40%" />
        <div className="mk-wrap">
          <p className="mk-eyebrow mk-fade">NOX MED · Innovation</p>
          <h1 className="mk-fade d1">Read the body as a story, not a snapshot.</h1>
          <p className="mk-lead mk-fade d2">NOX MED follows one quick blood sample across an entire mission and measures each astronaut against their own baseline, so change is understood long before it becomes an emergency.</p>
          <div className="mk-hero-cta mk-fade d3">
            <Link href={ROUTES.demoMed} className="mk-btn mk-btn-primary">Open NOX MED</Link>
            <Link href={ROUTES.demo} className="mk-btn mk-btn-ghost">Explore the demo</Link>
          </div>
        </div>
      </section>
      <section className="mk-section" style={{ paddingTop: 40, paddingBottom: 0 }}>
        <div className="mk-wrap"><Reveal><h3 className="mk-h3">From measurement to review</h3><FlowSchema /></Reveal></div>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <MedDetail />
      </section>
    </>
  );
}
