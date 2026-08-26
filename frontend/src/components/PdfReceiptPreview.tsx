import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PREVIEW_PIXELS = 4_000_000;

interface PdfReceiptPreviewProps {
  file: Blob;
  href: string;
  title?: string;
}

export function PdfReceiptPreview({
  file,
  href,
  title = "Comprovativo PDF",
}: PdfReceiptPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const loadGenerationRef = useRef(0);
  const renderGenerationRef = useRef(0);
  const observedWidthRef = useRef(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [renderVersion, setRenderVersion] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let ownedDocument: PDFDocumentProxy | null = null;
    let destroyPromise: Promise<void> | null = null;
    let cancelLoadingWait!: () => void;
    const loadingCancelled = new Promise<null>((resolve) => {
      cancelLoadingWait = () => resolve(null);
    });
    const destroyOwnedResource = () => {
      if (destroyPromise) return destroyPromise;
      destroyPromise = (
        ownedDocument ? ownedDocument.destroy() : (loadingTask?.destroy() ?? Promise.resolve())
      ).catch(() => undefined);
      return destroyPromise;
    };
    setStatus("loading");
    setPageNumber(1);
    setPageCount(0);
    documentRef.current = null;

    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!active || generation !== loadGenerationRef.current) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!active || generation !== loadGenerationRef.current) return;
      loadingTask = pdfjs.getDocument({
        data: bytes,
        isEvalSupported: false,
        useSystemFonts: true,
      });
      const document = await Promise.race([loadingTask.promise, loadingCancelled]);
      if (!document) return;
      if (!active || generation !== loadGenerationRef.current || destroyPromise) {
        await destroyOwnedResource();
        return;
      }
      ownedDocument = document;
      documentRef.current = document;
      setPageCount(document.numPages);
      setDocumentVersion((current) => current + 1);
    })().catch(async () => {
      await destroyOwnedResource();
      if (active && generation === loadGenerationRef.current) setStatus("error");
    });

    return () => {
      active = false;
      cancelLoadingWait();
      if (loadGenerationRef.current === generation) loadGenerationRef.current += 1;
      renderGenerationRef.current += 1;
      const activeRender = renderTaskRef.current;
      activeRender?.cancel();
      if (documentRef.current === ownedDocument) documentRef.current = null;
      void destroyOwnedResource();
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (!width || Math.abs(width - observedWidthRef.current) < 1) return;
      observedWidthRef.current = width;
      setRenderVersion((current) => current + 1);
    });
    resizeObserver.observe(canvas.parentElement || canvas);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas || !pageCount) return;
    const generation = renderGenerationRef.current + 1;
    renderGenerationRef.current = generation;
    let active = true;
    setStatus("loading");
    let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
    let localRenderTask: RenderTask | null = null;

    void (async () => {
      const previousRender = renderTaskRef.current;
      if (previousRender) {
        previousRender.cancel();
        await previousRender.promise.catch(() => undefined);
      }
      if (!active || generation !== renderGenerationRef.current || document !== documentRef.current)
        return;
      page = await document.getPage(pageNumber);
      if (!active || generation !== renderGenerationRef.current || document !== documentRef.current)
        return;
      const baseViewport = page.getViewport({ scale: 1 });
      const stageWidth = canvas.parentElement?.clientWidth || 720;
      const cssWidth = Math.max(240, Math.min(stageWidth, 760));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      let renderScale = (cssWidth / baseViewport.width) * pixelRatio;
      const estimatedPixels = baseViewport.width * baseViewport.height * renderScale * renderScale;
      if (estimatedPixels > MAX_PREVIEW_PIXELS)
        renderScale *= Math.sqrt(MAX_PREVIEW_PIXELS / estimatedPixels);
      const viewport = page.getViewport({ scale: renderScale });
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas indisponível");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.round(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({ canvasContext: context, viewport });
      localRenderTask = renderTask;
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (active && generation === renderGenerationRef.current && document === documentRef.current)
        setStatus("ready");
    })()
      .catch((error: unknown) => {
        if (
          active &&
          generation === renderGenerationRef.current &&
          !(error instanceof Error && error.name === "RenderingCancelledException")
        )
          setStatus("error");
      })
      .finally(() => {
        page?.cleanup();
        if (renderTaskRef.current === localRenderTask) renderTaskRef.current = null;
      });

    return () => {
      active = false;
      if (renderGenerationRef.current === generation) renderGenerationRef.current += 1;
      localRenderTask?.cancel();
    };
  }, [documentVersion, pageCount, pageNumber, renderVersion]);

  return (
    <div className={`receipt-viewer ${status === "error" ? "receipt-viewer--error" : ""}`}>
      <div className="receipt-viewer__stage">
        {status === "loading" && (
          <div className="receipt-viewer__skeleton" aria-label="A preparar pré-visualização do PDF">
            <FileText aria-hidden="true" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="receipt-viewer__canvas"
          role="img"
          aria-label={`${title}, página ${pageNumber} de ${pageCount || 1}`}
        />
        {status === "ready" && (
          <span className="receipt-viewer__badge">
            PDF · {pageNumber}/{pageCount}
          </span>
        )}
        {status === "error" && (
          <div className="receipt-viewer__fallback">
            <FileText aria-hidden="true" />
            <strong>Não foi possível mostrar esta página.</strong>
            <span>O ficheiro continua disponível.</span>
          </div>
        )}
      </div>
      <div className="receipt-viewer__toolbar">
        <div className="receipt-viewer__pager" aria-label="Navegação das páginas do PDF">
          <button
            type="button"
            className="icon-button"
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            disabled={pageNumber <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>
            Página {pageNumber} de {pageCount || 1}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
            disabled={!pageCount || pageNumber >= pageCount}
            aria-label="Página seguinte"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <a className="text-button" href={href} target="_blank" rel="noreferrer">
          Abrir PDF <ExternalLink aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
