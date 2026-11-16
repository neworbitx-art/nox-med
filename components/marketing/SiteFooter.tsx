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
      <div className="mk-wrap mk-footer-base">© {new Date().getFullYear()} NOX — New Orbit Exploration · www.neworbitx.com</div>
    </footer>
  );
}
