#!/usr/bin/env node
/**
 * Copia worker, WASM e tessdata para frontend/public/ocr/ para a leitura
 * local de comprovativos funcionar em produção (sem CDN).
 */
import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const destRoot = join(here, "../public/ocr");

const TESSDATA_LANGS = ["por", "eng"];
const TESSDATA_VARIANT = "4.0.0_best_int";
const CORE_LSTM_FILES = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
];

function packageDir(specifier) {
  return dirname(require.resolve(specifier));
}

async function copyNamed(from, to) {
  await copyFile(from, to);
  console.log(`ocr: ${to}`);
}

async function download(url, to) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha a descarregar ${url} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(to, buffer);
  console.log(`ocr: ${to} (${url})`);
}

async function main() {
  const tesseractDir = packageDir("tesseract.js/package.json");
  const coreDir = packageDir("tesseract.js-core/package.json");
  const tessdataDir = join(destRoot, "tessdata");

  await mkdir(tessdataDir, { recursive: true });

  await copyNamed(join(tesseractDir, "dist/worker.min.js"), join(destRoot, "worker.min.js"));

  for (const file of CORE_LSTM_FILES) {
    await copyNamed(join(coreDir, file), join(destRoot, file));
  }

  const missingLangs = [];
  for (const lang of TESSDATA_LANGS) {
    const filename = `${lang}.traineddata.gz`;
    const dest = join(tessdataDir, filename);
    const sources = [
      `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/${TESSDATA_VARIANT}/${filename}`,
      `https://tessdata.projectnaptha.com/${TESSDATA_VARIANT}/${filename}`,
    ];
    let saved = false;
    let lastError = null;
    for (const url of sources) {
      try {
        await download(url, dest);
        saved = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!saved) missingLangs.push({ lang, lastError });
  }

  if (missingLangs.length) {
    console.warn(
      "ocr: não foi possível obter tessdata. A leitura local mostrará um erro recuperável até o próximo build com rede.",
    );
    for (const item of missingLangs) {
      console.warn(`ocr: ${item.lang}: ${item.lastError instanceof Error ? item.lastError.message : item.lastError}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
