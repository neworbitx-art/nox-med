/**
 * Text extraction for machine-readable PDFs (text layer only). No OCR: a scanned PDF yields no text and
 * the caller must fall back to manual entry.
 */
interface TextItem { str: string; transform: number[]; hasEOL?: boolean }
interface PdfPage { getTextContent(): Promise<{ items: (TextItem | { type: string })[] }> }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?(): Promise<void> }
export interface PdfJs { getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDoc> } }

/** Group text fragments into visual lines by y position, then order each line left-to-right. */
export function linesFromItems(items: (TextItem | { type: string })[]): string[] {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(" "));
}

export async function extractPdfText(data: ArrayBuffer | Uint8Array, pdfjs: PdfJs): Promise<{ text: string; pages: number }> {
  const doc = await pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    out.push(...linesFromItems((await page.getTextContent()).items));
  }
  const pages = doc.numPages;
  await doc.destroy?.();
  return { text: out.join("\n"), pages };
}

/** Browser loader (dynamic import keeps pdf.js out of the initial bundle). */
export async function loadPdfJs(): Promise<PdfJs> {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return lib as unknown as PdfJs;
}
