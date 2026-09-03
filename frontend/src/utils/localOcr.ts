/**
 * Runtime local do Tesseract. Estes ficheiros são publicados com o frontend:
 * nenhuma imagem ou fatura é enviada a um serviço externo para ser lida.
 */
export const OCR_ASSETS_UNAVAILABLE =
  "A leitura local não está disponível neste momento. Pode preencher os campos manualmente.";

export const localOcrOptions = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr",
  langPath: "/ocr/tessdata",
  workerBlobURL: false,
  gzip: true,
} as const;

const requiredOcrAssets = [
  "/ocr/worker.min.js",
  "/ocr/tesseract-core-lstm.wasm.js",
  "/ocr/tessdata/por.traineddata.gz",
  "/ocr/tessdata/eng.traineddata.gz",
];

async function assetExists(path: string) {
  try {
    const head = await fetch(path, { method: "HEAD" });
    if (head.ok) return true;
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(path, { method: "GET" });
      return get.ok;
    }
    return false;
  } catch {
    return false;
  }
}

export async function ensureLocalOcrAssets() {
  for (const path of requiredOcrAssets) {
    if (!(await assetExists(path))) {
      throw new Error(OCR_ASSETS_UNAVAILABLE);
    }
  }
}

export function isOcrAssetsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === OCR_ASSETS_UNAVAILABLE ||
    /404|Failed to fetch|NetworkError|importScripts|Failed to load TesseractCore/i.test(message)
  );
}
