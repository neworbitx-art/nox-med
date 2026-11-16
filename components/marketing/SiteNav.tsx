"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { ROUTES } from "@/lib/routes";

const LINKS = [
  { href: ROUTES.missions, label: "Missions" },
  { href: `${ROUTES.home}#mission-control`, label: "Mission Control" },
  { href: `${ROUTES.home}#nox-med`, label: "NOX MED" },
  { href: ROUTES.about, label: "About" },
];

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 24); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => setOpen(false), [path]);
  return (
    <header className={`mk-nav ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`}>
      <div className="mk-nav-bar">
        <Link href={ROUTES.home} className="mk-nav-brand" aria-label="NOX home"><Logo size={40} /></Link>
        <nav className="mk-nav-links" aria-label="Primary">
          {LINKS.map((l) => <Link key={l.label} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>)}
        </nav>
        <Link href={ROUTES.demo} className="mk-btn mk-btn-sm mk-nav-cta">Launch demo</Link>
        <button className="mk-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}><span /><span /></button>
      </div>
      <div className="mk-nav-sheet" hidden={!open}>
        {LINKS.map((l) => <Link key={l.label} href={l.href}>{l.label}</Link>)}
        <Link href={ROUTES.demo} className="mk-btn">Explore the demo</Link>
      </div>
    </header>
  );
}
