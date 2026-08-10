/**
 * Runtime local do Tesseract. Estes ficheiros são publicados com o frontend:
 * nenhuma imagem ou fatura é enviada a um serviço externo para ser lida.
 */
export const localOcrOptions = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/tesseract-core-lstm.wasm.js',
  langPath: '/ocr/tessdata',
  workerBlobURL: false,
  gzip: true,
} as const;
