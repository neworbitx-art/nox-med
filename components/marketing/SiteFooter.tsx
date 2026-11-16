import Link from "next/link";
import { Logo } from "./Logo";
import { ROUTES } from "@/lib/routes";

export function SiteFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap mk-footer-grid">
        <div><Logo size={72} /><p>New Orbit Exploration. Health intelligence for the next generation of crewed missions.</p></div>
        <nav aria-label="Footer">
          <Link href={ROUTES.missions}>Missions</Link>
          <Link href={ROUTES.about}>About</Link>
          <Link href={ROUTES.demo}>Mission demo</Link>
          <Link href={ROUTES.demoMed}>NOX MED</Link>
        </nav>
      </div>
      <div className="mk-wrap mk-footer-base"><span>© {new Date().getFullYear()} NOX — New Orbit Exploration · www.neworbitx.com</span><Link href={ROUTES.noxMed} className="mk-footer-cta">NOX MED · Science &amp; data <span aria-hidden>→</span></Link></div>
    </footer>
  );
}
