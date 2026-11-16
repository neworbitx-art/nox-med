"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Picked } from "@/components/anatomy/CinematicBody";
import type { Hud } from "./MedEvidence";

const CinematicBody = dynamic(() => import("@/components/anatomy/CinematicBody"), { ssr: false, loading: () => <div className="mk-body-load">Loading anatomy…</div> });

function Ring({ frac, unit }: { frac: number; unit: string }) {
  const r = 21, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
      <circle cx="26" cy="26" r={r} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 26 26)" />
      <text x="26" y="29.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff" fontFamily="inherit">{unit.length > 6 ? unit.slice(0, 5) : unit}</text>
    </svg>
  );
}

/** NOX MED terminal: interactive 3D circulatory model inside a minimal HUD. Loads only when scrolled into view. Generic anatomy; readings are demonstration data. */
export function BodyShowcase({ hud }: { hud: Hud | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false), [reduced, setReduced] = useState(false), [picked, setPicked] = useState<Picked | null>(null);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = ref.current; if (!el) return;
    if (!("IntersectionObserver" in window)) { setShow(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div className="mk-hud" ref={ref}>
      <div className="mk-hud-canvas" aria-label="Interactive 3D circulatory system. Drag to rotate.">
        {show && <CinematicBody hr={62} reduced={reduced} picked={picked} onPick={setPicked} onHover={() => {}} focusHeart={false} />}
      </div>
      <i className="mk-hud-line l" /><i className="mk-hud-line r" />
      {hud && (
        <>
          <div className="mk-hud-tl"><span>Mission day</span><b>DAY&nbsp;&nbsp;{hud.day}</b></div>
          <ul className="mk-hud-reads">
            {hud.readings.map((x) => (
              <li key={x.label}><div><span>{x.label}</span><b>{x.display}</b></div><Ring frac={x.frac} unit={x.unit} /></li>
            ))}
          </ul>
          <div className="mk-hud-tr"><span>Sample <em>{hud.time} UTC</em></span><span>Crew <em>{hud.crew}</em></span></div>
        </>
      )}
      <div className="mk-hud-bl"><b>NOX&nbsp;MED</b> <span>TERMINAL</span><small>{picked ? picked.name : "Drag to rotate · demonstration data"}</small></div>
    </div>
  );
}
