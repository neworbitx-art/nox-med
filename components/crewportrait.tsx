"use client";
import { useState } from "react";
import { portraitOf } from "@/lib/crewprofile";
import type { AstronautId } from "@/lib/types";

/** One source image per crew member, reused in every view. Falls back to initials if the file is missing. */
export function CrewPortrait({ id, size = 64, className = "" }: { id: AstronautId; size?: number; className?: string }) {
  const p = portraitOf(id);
  const [failed, setFailed] = useState(false);
  const h = Math.round(size * 1.25);
  if (failed || !p.file) return <div className={`num flex items-center justify-center rounded-sm border border-line bg-bg2 text-xs font-semibold text-ink2 ${className}`} style={{ width: size, height: h }} role="img" aria-label={p.alt}>{id}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={p.file} alt={p.alt} width={size} height={h} loading="lazy" decoding="async" onError={() => setFailed(true)} className={`rounded-sm border border-line object-cover ${className}`} style={{ width: size, height: h }} data-portrait-status={p.status} />;
}
