import { describe, expect, it } from "vitest";
import { extractPdfText, linesFromItems } from "@/lib/pdftext";
import { draftFromExtraction, parseAblText } from "@/lib/ablreport";
import { ES_VENOUS } from "./fixtures/abl-reports";

/** Build a minimal uncompressed single-page PDF with one text line per row (synthetic fixture). */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "?");
  const content = "BT /F1 9 Tf 12 TL 40 780 Td\n" + lines.map((l) => `(${esc(l)}) Tj T*`).join("\n") + "\nET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("PDF text extraction", () => {
  it("groups fragments into lines left-to-right", () => {
    const mk = (s: string, x: number, y: number) => ({ str: s, transform: [1, 0, 0, 1, x, y] });
    expect(linesFromItems([mk("54.3", 200, 500), mk("pCO2", 50, 500), mk("mmHg", 260, 500), mk("pH", 50, 520)])).toEqual(["pH", "pCO2 54.3 mmHg"]);
  });
  it("extracts and parses a synthetic machine-readable PDF end to end", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const ascii = ES_VENOUS.split("\n").filter((l) => l.trim());
    const { text, pages } = await extractPdfText(makePdf(ascii), pdfjs as never);
    expect(pages).toBe(1);
    const d = draftFromExtraction(parseAblText(text));
    expect(d.fields.pH.text).toBe("7.312");
    expect(d.fields.K.text).toBe("4");
    expect(d.sampleType).toBe("venous");
    expect(d.date).toBe("2031-03-21");
    expect(d.fields.pH.checked).toBe(false);
  });
  it("returns no text for a PDF without a text layer", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect((await extractPdfText(makePdf([]), pdfjs as never)).text).toBe("");
  });
});
