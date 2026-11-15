"use client";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export type AtlasSystem = "cardiovascular" | "respiratory" | "blood";
export const ATLAS_SYSTEMS: AtlasSystem[] = ["cardiovascular", "respiratory", "blood"];
const NAME: Record<AtlasSystem, string> = { cardiovascular: "Cardiovascular system", respiratory: "Respiratory system", blood: "Hematological system" };

/**
 * Layered 2D medical illustration with a pseudo-3D look. Original artwork (hand-built SVG), generic adult anatomy, anterior view:
 * the patient's right is on the viewer's left. Each system is its own transparent layer, stacked at different depths so the
 * stack parallaxes with the pointer. The selected system is raised in opacity and colour; the others recede.
 * Not the astronaut's own anatomy and not a measurement.
 */
const C = { art: "#F87171", vein: "#60A5FA", lung: "#38C9F4", marrow: "#F5B642", bone: "#B9C6E3", spleen: "#C084FC", ink: "#F7FAFF" };

function Hot({ id, label, onSelect, children, on }: { id: AtlasSystem; label: string; onSelect: (s: AtlasSystem) => void; children: ReactNode; on: boolean }) {
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };
  return <g role="button" tabIndex={0} aria-label={label} aria-pressed={on} data-hotspot={id} onClick={() => onSelect(id)} onKeyDown={key} style={{ cursor: "pointer", outline: "none" }} className="atlas-hot">{children}</g>;
}

export function BodyAtlas({ system, onSelect, reduced, showLabels = true }: { system: AtlasSystem; onSelect: (s: AtlasSystem) => void; reduced: boolean; showLabels?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const move = (e: React.PointerEvent) => {
    if (reduced || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setRot({ y: ((e.clientX - r.left) / r.width - 0.5) * 14, x: -((e.clientY - r.top) / r.height - 0.5) * 8 });
  };
  const op = (s: AtlasSystem, hi = 1, lo = 0.16) => (system === s ? hi : lo);
  const layer = (z: number): CSSProperties => ({ position: "absolute", inset: 0, width: "100%", height: "100%", transform: `translateZ(${z}px)`, transition: reduced ? "none" : "opacity 0.45s ease" });
  const sh = "url(#shadow)";
  const defs = (
    <defs>
      <radialGradient id="gBody" cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#24366A" /><stop offset="1" stopColor="#0E1736" /></radialGradient>
      <radialGradient id="gHeart" cx="35%" cy="28%" r="85%"><stop offset="0" stopColor="#FCA5A5" /><stop offset="0.45" stopColor="#E5484D" /><stop offset="1" stopColor="#7F1D1D" /></radialGradient>
      <radialGradient id="gAtrium" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#93C5FD" /><stop offset="1" stopColor="#2B4C9B" /></radialGradient>
      <linearGradient id="gLungR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7DD3FC" /><stop offset="1" stopColor="#0E7490" /></linearGradient>
      <linearGradient id="gLungL" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7DD3FC" /><stop offset="1" stopColor="#0E7490" /></linearGradient>
      <radialGradient id="gMarrow" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#FDE68A" /><stop offset="1" stopColor="#D97706" /></radialGradient>
      <radialGradient id="gSpleen" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#E9D5FF" /><stop offset="1" stopColor="#6B21A8" /></radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.55" /></filter>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
  );
  const labelStyle = { fontSize: 9, fill: C.ink, fontFamily: "ui-monospace, monospace", letterSpacing: 0.4 } as const;
  const lbl = (x: number, y: number, tx: number, ty: number, t: string, anchor: "start" | "end" = "start") => (
    <g key={t}><line x1={x} y1={y} x2={tx} y2={ty} stroke={C.ink} strokeOpacity="0.55" strokeWidth="0.6" /><circle cx={x} cy={y} r="1.6" fill={C.ink} /><text x={tx + (anchor === "start" ? 3 : -3)} y={ty + 3} textAnchor={anchor} style={labelStyle}>{t}</text></g>
  );

  return (
    <div ref={box} onPointerMove={move} onPointerLeave={() => setRot({ x: 0, y: 0 })} className="relative mx-auto h-full w-full max-w-[420px] select-none" style={{ perspective: 1100 }} data-testid="atlas" data-system={system}>
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transition: reduced ? "none" : "transform 0.25s ease-out" }}>
        {/* L0: body, skeleton hints */}
        <svg viewBox="0 0 360 600" style={layer(0)} role="img" aria-label="Generic adult torso, anterior view. The patient's right is on the viewer's left.">
          {defs}
          <g filter={sh}>
            <path d="M100 148 Q140 128 164 126 L196 126 Q220 128 260 148 Q276 220 270 330 Q268 400 280 452 L236 462 L224 600 L190 600 L180 470 L170 470 L160 600 L126 600 L118 462 L80 452 Q92 400 90 330 Q84 220 100 148 Z" fill="url(#gBody)" stroke="#35476B" strokeWidth="1.2" />
            <path d="M100 148 Q72 160 66 230 L56 362 L78 368 L92 252 Q98 200 108 172 Z" fill="url(#gBody)" stroke="#35476B" strokeWidth="1.2" />
            <path d="M260 148 Q288 160 294 230 L304 362 L282 368 L268 252 Q262 200 252 172 Z" fill="url(#gBody)" stroke="#35476B" strokeWidth="1.2" />
            <ellipse cx="180" cy="62" rx="34" ry="42" fill="url(#gBody)" stroke="#35476B" strokeWidth="1.2" />
            <rect x="164" y="100" width="32" height="30" rx="8" fill="url(#gBody)" stroke="#35476B" strokeWidth="1" />
          </g>
          <g stroke={C.bone} strokeOpacity="0.2" fill="none" strokeWidth="1.1">
            <path d="M178 132 Q140 144 104 160" /><path d="M182 132 Q220 144 256 160" />
            {[0, 1, 2, 3, 4, 5].map((i) => <g key={i}><path d={`M178 ${176 + i * 22} Q132 ${172 + i * 24} ${116 - i * 2} ${200 + i * 22}`} /><path d={`M182 ${176 + i * 22} Q228 ${172 + i * 24} ${244 + i * 2} ${200 + i * 22}`} /></g>)}
          </g>
          <ellipse cx="180" cy="478" rx="52" ry="8" fill="#000" opacity="0.18" />
        </svg>

        {/* L1: hematological: marrow sites, spleen, circulating cells */}
        <svg viewBox="0 0 360 600" style={{ ...layer(16), opacity: op("blood") }} aria-hidden={system !== "blood"} data-layer="blood">
          <g filter={system === "blood" ? "url(#glow)" : undefined}>
            <Hot id="blood" label="Select hematological system (bone marrow, spleen)" onSelect={onSelect} on={system === "blood"}>
              <path d="M172 152 L188 152 L190 168 L186 262 L180 282 L174 262 L170 168 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" />
              <path d="M174 132 Q180 128 186 132 L188 150 L172 150 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" />
              <path d="M84 446 Q96 410 130 420 Q150 430 160 462 Q150 486 124 484 Q96 482 84 446 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" />
              <path d="M276 446 Q264 410 230 420 Q210 430 200 462 Q210 486 236 484 Q264 482 276 446 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" />
              <path d="M122 480 Q128 530 134 590 L158 590 Q158 530 152 486 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" opacity="0.9" />
              <path d="M238 480 Q232 530 226 590 L202 590 Q202 530 208 486 Z" fill="url(#gMarrow)" stroke="#92400E" strokeWidth="0.8" opacity="0.9" />
              <ellipse cx="262" cy="338" rx="11" ry="24" transform="rotate(14 262 338)" fill="url(#gSpleen)" stroke="#581C87" strokeWidth="0.8" />
              {Array.from({ length: 26 }, (_, i) => <circle key={i} cx={180 + Math.sin(i * 1.7) * 3} cy={286 + i * 7} r="1.5" fill={C.marrow} opacity="0.7" />)}
            </Hot>
          </g>
          {system === "blood" && showLabels && <g>{lbl(180, 200, 96, 190, "STERNUM (RED MARROW)", "start")}{lbl(112, 456, 40, 436, "ILIAC MARROW")}{lbl(264, 340, 286, 316, "SPLEEN")}{lbl(144, 540, 40, 530, "FEMUR")}</g>}
        </svg>

        {/* L2: respiratory */}
        <svg viewBox="0 0 360 600" style={{ ...layer(28), opacity: op("respiratory") }} aria-hidden={system !== "respiratory"} data-layer="respiratory">
          <g filter={sh}>
            <Hot id="respiratory" label="Select respiratory system (lungs, trachea)" onSelect={onSelect} on={system === "respiratory"}>
              <rect x="174" y="112" width="12" height="98" rx="5" fill="#BAE6FD" stroke="#0E7490" strokeWidth="0.8" />
              {Array.from({ length: 9 }, (_, i) => <line key={i} x1="174" x2="186" y1={120 + i * 10} y2={120 + i * 10} stroke="#0E7490" strokeOpacity="0.55" strokeWidth="0.7" />)}
              <path d="M180 208 Q160 224 142 238" fill="none" stroke="#BAE6FD" strokeWidth="6" strokeLinecap="round" /><path d="M180 208 Q200 228 218 246" fill="none" stroke="#BAE6FD" strokeWidth="6" strokeLinecap="round" />
              <path d="M128 176 C108 188 102 252 106 322 C110 342 152 344 176 330 L178 196 C170 182 148 170 128 176 Z" fill="url(#gLungR)" stroke="#0E7490" strokeWidth="1" opacity="0.92" />
              <path d="M232 180 C252 190 258 252 254 322 C250 342 212 344 196 332 C188 304 200 286 196 266 C192 244 196 204 200 192 C208 180 224 176 232 180 Z" fill="url(#gLungL)" stroke="#0E7490" strokeWidth="1" opacity="0.92" />
              <g stroke="#0E7490" strokeOpacity="0.7" fill="none" strokeWidth="0.9"><path d="M110 258 Q150 252 176 236" /><path d="M110 300 Q150 280 176 268" /><path d="M254 280 Q222 280 198 262" /></g>
              <g stroke="#E0F2FE" strokeOpacity="0.55" fill="none" strokeWidth="1">
                <path d="M142 238 Q130 230 120 214 M142 238 Q130 252 118 264 M142 238 Q136 268 128 300 M142 238 Q150 270 150 306" />
                <path d="M218 246 Q232 236 242 218 M218 246 Q234 262 246 280 M218 246 Q226 274 232 308" />
              </g>
            </Hot>
          </g>
          {system === "respiratory" && showLabels && <g>{lbl(180, 150, 92, 128, "TRACHEA")}{lbl(120, 220, 38, 206, "RIGHT LUNG (3 LOBES)")}{lbl(246, 232, 268, 206, "LEFT LUNG (2 LOBES)")}{lbl(142, 238, 38, 246, "BRONCHI")}</g>}
        </svg>

        {/* L3: cardiovascular (front) */}
        <svg viewBox="0 0 360 600" style={{ ...layer(42), opacity: op("cardiovascular") }} aria-hidden={system !== "cardiovascular"} data-layer="cardiovascular">
          <g filter={sh}>
            <Hot id="cardiovascular" label="Select cardiovascular system (heart and great vessels)" onSelect={onSelect} on={system === "cardiovascular"}>
              {/* veins */}
              <path d="M190 164 L192 254" stroke={C.vein} strokeWidth="9" strokeLinecap="round" fill="none" />
              <path d="M168 148 Q182 154 190 166 M212 148 Q198 154 190 166" stroke={C.vein} strokeWidth="6" strokeLinecap="round" fill="none" />
              <path d="M196 336 L190 470 L168 520 M190 470 L206 520" stroke={C.vein} strokeWidth="9" strokeLinecap="round" fill="none" />
              {/* descending aorta and iliacs */}
              <path d="M236 226 L238 466 L222 524 M238 466 L254 524" stroke={C.art} strokeWidth="9" strokeLinecap="round" fill="none" />
              {/* aortic arch + branches */}
              <path d="M212 242 C210 214 204 204 200 204 C214 198 236 204 238 226" stroke={C.art} strokeWidth="11" strokeLinecap="round" fill="none" />
              <path d="M200 206 L188 160 M188 160 Q150 150 124 168 L100 250" stroke={C.art} strokeWidth="6" strokeLinecap="round" fill="none" />
              <path d="M186 162 L184 104" stroke={C.art} strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M208 206 Q204 156 194 108" stroke={C.art} strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M224 206 Q246 160 262 170 L276 250" stroke={C.art} strokeWidth="6" strokeLinecap="round" fill="none" />
              {/* pulmonary arteries + veins */}
              <path d="M210 246 Q208 226 198 222 Q176 222 148 238" stroke={C.vein} strokeWidth="7" strokeLinecap="round" fill="none" />
              <path d="M198 222 Q222 220 234 246" stroke={C.vein} strokeWidth="7" strokeLinecap="round" fill="none" />
              <path d="M150 276 Q176 280 198 284 M150 298 Q176 296 200 292 M254 286 Q230 286 216 288" stroke="#FCA5A5" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.9" />
              {/* heart */}
              <path d="M190 252 C188 236 206 228 222 236 C244 240 256 268 250 296 C246 318 236 334 230 344 C222 338 204 316 194 296 C190 280 190 266 190 252 Z" fill="url(#gHeart)" stroke="#7F1D1D" strokeWidth="1" />
              <path d="M188 262 C186 250 196 242 206 244 C214 250 214 272 208 286 C200 290 190 282 188 262 Z" fill="url(#gAtrium)" stroke="#1E3A8A" strokeWidth="0.8" />
              <path d="M214 240 C216 270 222 310 230 342" stroke="#FCA5A5" strokeWidth="1.2" fill="none" opacity="0.7" />
              <path d="M206 244 Q192 262 196 296" stroke="#FDBA74" strokeWidth="1.8" fill="none" /><path d="M214 242 Q226 250 232 270 Q236 300 232 330" stroke="#FDBA74" strokeWidth="1.8" fill="none" />
              <path d="M200 244 Q214 238 230 252" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="3" fill="none" strokeLinecap="round" />
            </Hot>
          </g>
          {system === "cardiovascular" && showLabels && <g>{lbl(226, 296, 292, 290, "HEART (LEFT VENTRICLE)")}{lbl(236, 330, 292, 340, "DESCENDING AORTA")}{lbl(190, 190, 96, 176, "SUPERIOR VENA CAVA")}{lbl(192, 400, 92, 400, "INFERIOR VENA CAVA")}{lbl(214, 210, 280, 196, "AORTIC ARCH")}</g>}
        </svg>
      </div>
      <span className="sr-only" data-testid="atlas-active">{NAME[system]} selected</span>
    </div>
  );
}
