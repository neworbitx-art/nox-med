"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fade/slide-in on scroll. Content is visible without JS and for reduced-motion users. */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false), [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    setArmed(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`${className} ${armed ? "mk-reveal" : ""} ${shown ? "is-in" : ""}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
