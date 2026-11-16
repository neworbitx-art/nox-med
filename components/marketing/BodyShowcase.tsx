"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Picked } from "@/components/anatomy/CinematicBody";

const CinematicBody = dynamic(() => import("@/components/anatomy/CinematicBody"), { ssr: false, loading: () => <div className="mk-body-load">Loading anatomy…</div> });

/** Interactive 3D circulatory model (generic adult anatomy, not an astronaut's own). Loads only when scrolled into view. */
export function BodyShowcase() {
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
    <div className="mk-body" ref={ref}>
      <div className="mk-body-canvas" aria-label="Interactive 3D circulatory system. Drag to rotate.">
        {show && <CinematicBody hr={62} reduced={reduced} picked={picked} onPick={setPicked} onHover={() => {}} focusHeart={false} />}
      </div>
      <div className="mk-body-tag" aria-live="polite">{picked ? picked.name : "Drag to rotate · click a vessel"}</div>
    </div>
  );
}
