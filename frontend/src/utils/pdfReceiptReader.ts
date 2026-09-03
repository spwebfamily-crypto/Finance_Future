import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { ensureLocalOcrAssets, localOcrOptions } from "./localOcr";

const MAX_TEXT_PAGES = 20;
const MAX_OCR_PAGES = 5;
const MAX_CANVAS_PIXELS = 4_000_000;

async function raceWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  let abort: (() => void) | null = null;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(signal.reason ?? new DOMException("A leitura foi cancelada.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

export interface PositionedTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPageText {
  pageNumber: number;
  text: string;
}

interface TextLine {
  y: number;
  height: number;
  parts: Array<{ x: number; width: number; value: string }>;
}

export interface PdfReadResult {
  text: string;
  pageCount: number;
  usedOcr: boolean;
}

async function fileBytes(file: File) {
  const maybeArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  const buffer = maybeArrayBuffer.arrayBuffer
    ? await maybeArrayBuffer.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o PDF."));
        reader.readAsArrayBuffer(file);
      });
  return new Uint8Array(buffer);
}

function joinLineParts(parts: TextLine["parts"]) {
  const ordered = [...parts]
    .sort((left, right) => left.x - right.x)
    .filter(
      (part, index, all) =>
        !all
          .slice(0, index)
          .some((previous) => previous.value === part.value && Math.abs(previous.x - part.x) < 1),
    );
  let result = "";
  let previousEnd = 0;
  let previousAverageWidth = 0;
  for (const part of ordered) {
    if (result) {
      const gap = part.x - previousEnd;
      const compactThreshold = Math.max(0.8, Math.min(2.5, previousAverageWidth * 0.38));
      if (gap > compactThreshold) result += " ";
    }
    result += part.value;
    previousEnd = part.x + part.width;
    previousAverageWidth = part.width > 0 ? part.width / Math.max(part.value.length, 1) : 4;
  }
  return result.replace(/\s+/g, " ").trim();
}

/** Reconstructs reading order from items already transformed into viewport coordinates. */
export function reconstructPageText(items: PositionedTextItem[]) {
  const lines: TextLine[] = [];
  for (const item of items) {
    const value = item.str.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const inferredHeight =
      item.height ?? Math.hypot(item.transform?.[2] ?? 0, item.transform?.[3] ?? 0);
    const height = Math.max(1, inferredHeight || 10);
    const tolerance = Math.max(2, Math.min(6, height * 0.36));
    let line = lines
      .filter(
        (candidate) => Math.abs(candidate.y - y) <= Math.max(tolerance, candidate.height * 0.36),
      )
      .sort((left, right) => Math.abs(left.y - y) - Math.abs(right.y - y))[0];
    if (!line) {
      line = { y, height, parts: [] };
      lines.push(line);
    } else {
      const count = line.parts.length;
      line.y = (line.y * count + y) / (count + 1);
      line.height = Math.max(line.height, height);
    }
    line.parts.push({ x, width: Math.max(0, item.width ?? 0), value });
  }

  return lines
    .sort((left, right) => left.y - right.y)
    .map((line) => joinLineParts(line.parts))
    .filter(Boolean)
    .join("\n");
}

export function composePdfPages(pages: PdfPageText[], totalPages: number) {
  return [...pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((page) => page.text.trim())
    .map((page) => `Página ${page.pageNumber} de ${totalPages}\n${page.text.trim()}`)
    .join("\n\n");
}

function textQuality(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return 0;
  const letters = compact.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  const digits = compact.match(/\d/g)?.length ?? 0;
  const words = compact.match(/[A-Za-zÀ-ÿ]{3,}/g)?.length ?? 0;
  const money = /\d{1,3}(?:[.\s,]\d{3})*[.,]\s*\d{2}/.test(compact);
  const replacementCharacters = compact.match(/[�□]/g)?.length ?? 0;
  return letters + digits * 0.7 + words * 2.5 + (money ? 75 : 0) - replacementCharacters * 20;
}

function needsOcr(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const letters = compact.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  const words = compact.match(/[A-Za-zÀ-ÿ]{3,}/g)?.length ?? 0;
  const hasMoney = /\d{1,3}(?:[.\s,]\d{3})*[.,]\s*\d{2}/.test(compact);
  const replacementCharacters = compact.match(/[�□]/g)?.length ?? 0;
  return (
    compact.length < 55 ||
    letters < 20 ||
    words < 4 ||
    replacementCharacters > Math.max(2, compact.length * 0.04) ||
    (!hasMoney && compact.length < 180)
  );
}

function pagesToExtract(pageCount: number) {
  if (pageCount <= MAX_TEXT_PAGES)
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  return [...Array.from({ length: MAX_TEXT_PAGES - 1 }, (_, index) => index + 1), pageCount];
}

function ocrPriority(page: PdfPageText, pageCount: number) {
  if (page.pageNumber === 1) return 0;
  if (page.pageNumber === pageCount) return 1;
  return 2 + page.pageNumber / Math.max(pageCount, 1);
}

function enhanceLowContrastCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  try {
    const image = context.getImageData(0, 0, width, height);
    const histogram = new Uint32Array(256);
    const sampleStride = Math.max(1, Math.floor(Math.sqrt((width * height) / 250_000)));
    let samples = 0;
    for (let y = 0; y < height; y += sampleStride) {
      for (let x = 0; x < width; x += sampleStride) {
        const offset = (y * width + x) * 4;
        const luminance = Math.round(
          image.data[offset] * 0.2126 +
            image.data[offset + 1] * 0.7152 +
            image.data[offset + 2] * 0.0722,
        );
        histogram[luminance] += 1;
        samples += 1;
      }
    }
    const percentile = (ratio: number) => {
      const target = samples * ratio;
      let count = 0;
      for (let value = 0; value < histogram.length; value += 1) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    };
    const low = percentile(0.02);
    const high = percentile(0.98);
    const span = high - low;
    if (span < 28 || span >= 145) return false;
    const scale = 235 / span;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const luminance =
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722;
      const adjusted = Math.max(8, Math.min(243, Math.round((luminance - low) * scale + 8)));
      image.data[offset] = adjusted;
      image.data[offset + 1] = adjusted;
      image.data[offset + 2] = adjusted;
    }
    context.putImageData(image, 0, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readPdfReceipt(
  file: File,
  onProgress?: (progress: number, status: string) => void,
  signal?: AbortSignal,
): Promise<PdfReadResult> {
  signal?.throwIfAborted();
  onProgress?.(0.03, "A abrir o PDF…");
  const pdfjs = await import("pdfjs-dist");
  signal?.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = await fileBytes(file);
  signal?.throwIfAborted();
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  let loadingDestroyPromise: Promise<void> | null = null;
  const destroyLoadingTask = () => {
    loadingDestroyPromise ??= loadingTask.destroy().catch(() => undefined);
    return loadingDestroyPromise;
  };
  const abortLoading = () => {
    void destroyLoadingTask();
  };
  signal?.addEventListener("abort", abortLoading, { once: true });
  let pdfDocument: PDFDocumentProxy;
  try {
    const loadedDocument = await raceWithAbort(loadingTask.promise, signal);
    if (signal?.aborted || loadingDestroyPromise) {
      await destroyLoadingTask();
      signal?.throwIfAborted();
      throw new Error("A abertura do PDF foi interrompida.");
    }
    pdfDocument = loadedDocument;
  } catch (error) {
    await destroyLoadingTask();
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortLoading);
  }

  try {
    const pageNumbers = pagesToExtract(pdfDocument.numPages);
    const pages: PdfPageText[] = [];
    for (let pageIndex = 0; pageIndex < pageNumbers.length; pageIndex += 1) {
      signal?.throwIfAborted();
      const pageNumber = pageNumbers[pageIndex];
      onProgress?.(
        0.05 + ((pageIndex + 1) / pageNumbers.length) * 0.3,
        `A ler texto da página ${pageNumber} de ${pdfDocument.numPages}…`,
      );
      const page: PDFPageProxy = await pdfDocument.getPage(pageNumber);
      signal?.throwIfAborted();
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent({ includeMarkedContent: false });
        signal?.throwIfAborted();
        const items: PositionedTextItem[] = content.items.flatMap((item) => {
          if (!("str" in item)) return [];
          const transform = pdfjs.Util.transform(viewport.transform, item.transform);
          return [
            {
              str: item.str,
              hasEOL: item.hasEOL,
              transform,
              width: Math.abs(item.width * viewport.scale),
              height: Math.max(1, Math.hypot(transform[2], transform[3])),
            },
          ];
        });
        pages.push({ pageNumber, text: reconstructPageText(items) });
      } catch {
        signal?.throwIfAborted();
        pages.push({ pageNumber, text: "" });
      } finally {
        page.cleanup();
      }
    }
    signal?.throwIfAborted();

    const pagesNeedingOcr = pages
      .filter((page) => needsOcr(page.text))
      .sort(
        (left, right) =>
          ocrPriority(left, pdfDocument.numPages) - ocrPriority(right, pdfDocument.numPages),
      )
      .slice(0, MAX_OCR_PAGES);

    if (!pagesNeedingOcr.length) {
      signal?.throwIfAborted();
      onProgress?.(1, "Texto do PDF identificado.");
      return {
        text: composePdfPages(pages, pdfDocument.numPages),
        pageCount: pdfDocument.numPages,
        usedOcr: false,
      };
    }

    onProgress?.(0.36, "A preparar o OCR local…");
    let activeOcrPage = 0;
    await ensureLocalOcrAssets();
    signal?.throwIfAborted();
    const { default: Tesseract } = await import("tesseract.js");
    signal?.throwIfAborted();
    const pendingWorker = Tesseract.createWorker("por+eng", Tesseract.OEM.LSTM_ONLY, {
      ...localOcrOptions,
      logger: ({ progress, status }) => {
        const pageFraction =
          (activeOcrPage + Math.max(0, Math.min(1, progress))) / pagesNeedingOcr.length;
        onProgress?.(0.36 + pageFraction * 0.62, status);
      },
    });
    let worker: Awaited<typeof pendingWorker>;
    try {
      worker = await raceWithAbort(pendingWorker, signal);
    } catch (error) {
      void pendingWorker.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
      throw error;
    }
    let terminationPromise: Promise<void> | null = null;
    const terminateWorker = () => {
      terminationPromise ??= worker
        .terminate()
        .then(() => undefined)
        .catch(() => undefined);
      return terminationPromise;
    };
    const abortOcr = () => {
      void terminateWorker();
    };
    signal?.addEventListener("abort", abortOcr, { once: true });
    try {
      if (signal?.aborted) void terminateWorker();
      signal?.throwIfAborted();
      for (let pageIndex = 0; pageIndex < pagesNeedingOcr.length; pageIndex += 1) {
        signal?.throwIfAborted();
        activeOcrPage = pageIndex;
        const target = pagesNeedingOcr[pageIndex];
        const page: PDFPageProxy = await pdfDocument.getPage(target.pageNumber);
        signal?.throwIfAborted();
        let canvas: HTMLCanvasElement | undefined;
        let renderTask: RenderTask | null = null;
        const abortRender = () => {
          renderTask?.cancel();
        };
        signal?.addEventListener("abort", abortRender, { once: true });
        try {
          const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
          const targetScale = Math.max(
            0.1,
            Math.min(
              2.2,
              Math.sqrt(MAX_CANVAS_PIXELS / Math.max(baseViewport.width * baseViewport.height, 1)),
            ),
          );
          const viewport = page.getViewport({ scale: targetScale, rotation: page.rotate });
          canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("O navegador não conseguiu preparar a página do PDF.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          onProgress?.(
            0.36 + (pageIndex / pagesNeedingOcr.length) * 0.62,
            `OCR local na página ${target.pageNumber} de ${pdfDocument.numPages}…`,
          );
          // PDF.js applies only the page's declared rotation; no uncertain orientation guessing is used.
          renderTask = page.render({ canvasContext: context, viewport });
          if (signal?.aborted) renderTask.cancel();
          signal?.throwIfAborted();
          await renderTask.promise;
          signal?.throwIfAborted();
          enhanceLowContrastCanvas(context, canvas.width, canvas.height);
          const result = await raceWithAbort(worker.recognize(canvas), signal);
          signal?.throwIfAborted();
          const ocrText = result.data.text.trim();
          const extractedQuality = textQuality(target.text);
          const ocrQuality = textQuality(ocrText);
          if (
            ocrText &&
            (extractedQuality === 0 || ocrQuality >= Math.max(20, extractedQuality * 0.72))
          )
            target.text = ocrText;
        } finally {
          signal?.removeEventListener("abort", abortRender);
          if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
          }
          page.cleanup();
        }
      }
    } finally {
      signal?.removeEventListener("abort", abortOcr);
      await terminateWorker();
    }

    signal?.throwIfAborted();
    onProgress?.(1, "Leitura local concluída.");
    return {
      text: composePdfPages(pages, pdfDocument.numPages),
      pageCount: pdfDocument.numPages,
      usedOcr: true,
    };
  } finally {
    await pdfDocument.destroy().catch(() => undefined);
  }
}
