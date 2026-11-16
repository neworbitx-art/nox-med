/** Minimalist NOX MED schematics (illustrative, not data). */

export function DriftSchema() {
  const pts: [number, number][] = [[30, 204], [110, 204], [190, 200], [270, 196], [360, 160], [500, 106], [606, 66]];
  return (
    <figure className="sch" aria-label="Schematic: NOX MED flags drift from a personal baseline long before a conventional alarm">
      <svg viewBox="0 0 640 380" role="img" aria-label="A measurement line drifts away from the personal baseline band while still inside the population range. NOX MED flags the change early; a conventional range alarm fires much later.">
        {/* population range */}
        <rect x="30" y="60" width="580" height="230" className="sch-pop" />
        <line x1="30" y1="60" x2="610" y2="60" className="sch-popline" /><line x1="30" y1="290" x2="610" y2="290" className="sch-popline" />
        <text x="30" y="46" className="sch-lbl">POPULATION RANGE</text>
        {/* personal baseline */}
        <rect x="30" y="180" width="580" height="44" className="sch-base" />
        <line x1="30" y1="202" x2="610" y2="202" className="sch-baseline" />
        <text x="30" y="246" className="sch-lbl sch-cy">YOUR BASELINE</text>
        {/* drift line */}
        <path className="sch-line" d="M30 204 C60 196 80 212 110 204 S160 210 190 200 S240 206 270 196 S320 178 360 160 S440 128 500 106 S570 78 606 66" fill="none" />
        <g className="sch-dots">{pts.map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.2" />)}</g>
        {/* NOX MED flag */}
        <g className="sch-flag">
          <circle cx="360" cy="160" r="14" className="sch-pulse" /><circle cx="360" cy="160" r="6" className="sch-flagdot" />
          <line x1="360" y1="144" x2="360" y2="104" className="sch-leader" />
          <text x="360" y="94" textAnchor="middle" className="sch-lbl sch-cy sch-b">NOX MED FLAGS THE CHANGE</text>
        </g>
        {/* conventional alarm */}
        <g className="sch-late">
          <circle cx="606" cy="62" r="7" className="sch-ring" />
          <text x="610" y="30" textAnchor="end" className="sch-lbl">CONVENTIONAL ALARM</text>
        </g>
        {/* time gained */}
        <g className="sch-gain">
          <line x1="360" y1="165" x2="360" y2="322" className="sch-guide" /><line x1="606" y1="72" x2="606" y2="322" className="sch-guide" />
          <line x1="360" y1="322" x2="606" y2="322" className="sch-span" /><path d="M360 316v12M606 316v12" className="sch-span" />
          <text x="483" y="348" textAnchor="middle" className="sch-lbl sch-cy">TIME GAINED</text>
        </g>
      </svg>
      <figcaption>Illustrative schematic. Every value can stay inside the population range while the astronaut has already left their own normal.</figcaption>
    </figure>
  );
}

const FLOW = [
  { k: "Measure", t: "Laboratory, wearable and environmental measurements." },
  { k: "Analyze", t: "Each result against the astronaut's own baseline and trend." },
  { k: "Understand", t: "Explainable observations with measurement quality and uncertainty." },
  { k: "Review", t: "Astronaut self-assessment and crew medical officer review." },
];

export function FlowSchema() {
  return (
    <ol className="sch-flow" aria-label="Clinical information flow: measure, analyze, understand, review">
      {FLOW.map((s, i) => (
        <li key={s.k}>
          <span className="sch-node" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <b>{s.k}</b>
          <p>{s.t}</p>
        </li>
      ))}
    </ol>
  );
}
