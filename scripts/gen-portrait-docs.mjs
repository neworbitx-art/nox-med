// Generates public/crew/manifest.json and docs/CREW_PORTRAIT_PROMPTS.md for all fictional crew.
import fs from "node:fs";
const crew = [
  ["A-01","Commander",46,"M","NOX-01","man in his mid-40s, short grey-brown hair, light stubble, calm steady gaze, fair skin with faint laugh lines"],
  ["A-02","Flight Engineer",39,"F","NOX-01","woman in her late 30s, dark brown hair tied back in a low bun, olive skin, attentive expression, subtle freckles"],
  ["A-03","Science Specialist",42,"F","NOX-01","woman in her early 40s, shoulder-length black hair tucked behind one ear, warm brown skin, thoughtful half-smile, thin-framed glasses"],
  ["A-04","Medical Officer",44,"M","NOX-01","man in his mid-40s, short black hair with a little grey at the temples, East Asian features, composed and kind expression, clean-shaven"],
  ["L-01","Commander",48,"M","NOX-02","man in his late 40s, cropped silver hair, strong jaw, deep brown skin, confident calm expression, light stubble"],
  ["L-02","Pilot",41,"F","NOX-02","woman in her early 40s, short wavy auburn hair, light skin with freckles, alert direct gaze, slight smile"],
  ["L-03","Mission specialist",37,"F","NOX-02","woman in her late 30s, long dark hair in a high ponytail, South Asian features, bright relaxed expression"],
  ["E-01","Station commander",50,"M","NOX-03","man around 50, short white-grey hair and trimmed beard, tan skin, weathered friendly face, steady expression"],
  ["E-02","Flight engineer",36,"F","NOX-03","woman in her mid-30s, braided dark hair pinned up, Black woman with smooth dark skin, focused confident look"],
  ["R-01","Commander",45,"F","NOX-04","woman in her mid-40s, short silver-blonde hair, fair skin, composed authoritative expression, fine lines"],
  ["R-02","Flight engineer",40,"M","NOX-04","man around 40, short curly dark hair, Latino features, light beard shadow, relaxed friendly expression"],
];
const spec = "Photorealistic studio headshot, 85mm lens, f/4, soft even key light with gentle fill, neutral light-grey seamless background, plain navy flight suit collar visible, no mission patches, no text, no logos, natural skin texture with pores, sharp eyes, 4:5 portrait framing, head and shoulders, looking at camera.";
const file = (id) => `/crew/astronaut-${id.toLowerCase().replace("-", "")}.png`;
const manifest = {
  note: "All portraits depict FICTIONAL people. Replace each file with an approved photographic portrait (4:5, PNG, 960x1200, even soft studio light, neutral light-grey background, plain navy flight suit, no patches or real names). Never use a photo of a real person. Until a file exists the UI shows initials. See docs/CREW_PORTRAIT_PROMPTS.md.",
  portraits: crew.map(([id, role, age, sex, m, d]) => ({
    id, file: file(id), alt: `Portrait of fictional crew member ${id}, ${role}`, status: "placeholder",
    brief: `${sex === "M" ? "Man" : "Woman"}, ${age} y; ${role} (${m}). ${d}. Do not imitate any real astronaut or public figure.`,
  })),
};
fs.writeFileSync("public/crew/manifest.json", JSON.stringify(manifest, null, 1) + "\n");
let md = `# Crew portrait prompts\n\nAll 11 crew members are **fictional**. Photorealistic portraits cannot be produced inside this repository; generate them with an image model you are licensed to use (or commission them), then save each result as PNG 960x1200 at the path shown. Until a file exists the app shows the crew member's initials.\n\n**Rules:** never use a real person's likeness (including real astronauts), no patches/logos/text, keep the same lighting and background for all portraits so they look like one set.\n\nShared style suffix:\n\n> ${spec}\n\n`;
for (const [id, role, age, sex, m, d] of crew) md += `## ${id} · ${role} (${m})\n\nFile: \`public${file(id)}\`\n\nPrompt: A ${age}-year-old ${d}. ${spec}\n\n`;
fs.writeFileSync("docs/CREW_PORTRAIT_PROMPTS.md", md);
