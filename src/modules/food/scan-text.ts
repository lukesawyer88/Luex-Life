// Text recognition on the phone itself (Tesseract): nothing is sent to a server and nothing costs money.
// Used for scanning cookbook pages (recipes) and receipts (stock). The library loads only when someone scans.
// Printed text works well; handwriting and very small or crumpled print usually won't.

type Progress = (fraction: number) => void;

/** Shrink and brighten a photo so recognition is quicker and more accurate */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser can't read pictures");
  ctx.filter = "grayscale(1) contrast(1.4) brightness(1.05)";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/**
 * Read the text in a photo, line by line (empty lines removed).
 * `onProgress` gets 0..1 while the reader loads and works.
 */
export async function recognise(file: File, onProgress?: Progress): Promise<string[]> {
  const canvas = await prepare(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (!onProgress) return;
      // loading the reader is the first half of the bar, reading the page the second
      const p = m.status === "recognizing text" ? 0.5 + m.progress / 2 : Math.min(0.5, m.progress / 2);
      onProgress(Math.max(0, Math.min(1, p)));
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 1);
  } catch {
    throw new Error("Couldn't read that picture. Try a clearer, straighter photo in good light");
  } finally {
    await worker.terminate();
  }
}
