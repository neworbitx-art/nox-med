/* eslint-disable @next/next/no-img-element */
export const TEAM = [
  { name: "Anna", role: "Artist", src: "/team/anna.jpg", pos: "50% 22%" },
  { name: "Mario", role: "Photographer", src: "/team/mario.jpg", pos: "50% 30%" },
  { name: "Gustavo", role: "Architect", src: "/team/gustavo.jpg", pos: "50% 18%" },
  { name: "Cristian", role: "Software engineer · Surgeon", src: "/team/cristian.jpg", pos: "50% 22%" },
  { name: "Yessy", role: "Lawyer", src: "/team/yessy.jpg", pos: "50% 20%" },
  { name: "Francisco", role: "Data specialist", src: "/team/francisco.jpg", pos: "50% 20%" },
] as const;

function Cards({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="mk-car-set" aria-hidden={hidden || undefined}>
      {TEAM.map((m) => (
        <li key={m.name} className="mk-member">
          <div className="ph"><img src={m.src} alt={hidden ? "" : `${m.name}, ${m.role}`} loading="lazy" decoding="async" style={{ objectPosition: m.pos }} /></div>
          <div className="cap"><b>{m.name}</b><span>{m.role}</span></div>
        </li>
      ))}
    </ul>
  );
}

/** Infinite, slowly moving carousel. Pauses on hover; reduced-motion users get a static wrapped grid. */
export function Team() {
  return (
    <div className="mk-car" role="region" aria-label="NOX team">
      <div className="mk-car-track"><Cards /><Cards hidden /></div>
    </div>
  );
}
