/* eslint-disable @next/next/no-img-element */
import { Reveal } from "./Reveal";

/** Photo order is fixed per person; `pos` keeps each face inside the 4:5 portrait crop. */
export const TEAM = [
  { name: "Anna", role: "Artist", src: "/team/anna.jpg", pos: "50% 22%" },
  { name: "Mario", role: "Photographer", src: "/team/mario.jpg", pos: "50% 30%" },
  { name: "Gustavo", role: "Architect", src: "/team/gustavo.jpg", pos: "50% 18%" },
  { name: "Cristian", role: "Software engineer · Surgeon", src: "/team/cristian.jpg", pos: "50% 22%" },
  { name: "Yessy", role: "Lawyer", src: "/team/yessy.jpg", pos: "50% 30%" },
] as const;

export function Team() {
  return (
    <div className="mk-team">
      {TEAM.map((m, i) => (
        <Reveal key={m.name} delay={i * 90}>
          <figure className="mk-member">
            <div className="ph"><img src={m.src} alt={`${m.name}, ${m.role}`} loading="lazy" decoding="async" style={{ objectPosition: m.pos }} /></div>
            <figcaption><b>{m.name}</b><span>{m.role}</span></figcaption>
          </figure>
        </Reveal>
      ))}
    </div>
  );
}
