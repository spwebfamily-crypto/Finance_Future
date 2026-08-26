import { FileText, Image as ImageIcon } from "lucide-react";
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { apiBlobRequest } from "../api/client";
import { PdfReceiptPreview } from "./PdfReceiptPreview";

type ReceiptMimeType = "application/pdf" | "image/*" | null;
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  receiptUrl: string;
  receiptMimeType?: ReceiptMimeType;
  detailed?: boolean;
};

export function AuthenticatedReceiptImage({
  receiptUrl,
  receiptMimeType,
  alt,
  detailed = false,
  ...props
}: Props) {
  const deferDownload = !detailed;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (deferDownload) return undefined;
    let active = true;
    let url: string | null = null;
    setObjectUrl(null);
    setReceiptBlob(null);
    setStatus("loading");
    void apiBlobRequest(receiptUrl)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) {
          setReceiptBlob(blob);
          setObjectUrl(url);
          setStatus("ready");
        } else {
          URL.revokeObjectURL(url);
          url = null;
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [deferDownload, receiptUrl]);

  if (deferDownload) {
    const isPdf = receiptMimeType === "application/pdf";
    const Icon = isPdf ? FileText : ImageIcon;
    return (
      <span
        className="receipt-file-card receipt-file-card--saved"
        aria-label={`${alt || "Comprovativo"} — ${isPdf ? "PDF guardado" : "imagem guardada"}`}
      >
        <Icon aria-hidden="true" />
        <strong>{isPdf ? "PDF" : "Imagem"}</strong>
      </span>
    );
  }

  if (status === "loading" && detailed)
    return (
      <div className="receipt-viewer__inline-state" role="status">
        <FileText aria-hidden="true" />
        <span>A carregar comprovativo…</span>
      </div>
    );
  if (status === "error" && detailed)
    return (
      <div
        className="receipt-viewer__inline-state receipt-viewer__inline-state--error"
        role="alert"
      >
        <FileText aria-hidden="true" />
        <span>Não foi possível mostrar o comprovativo.</span>
      </div>
    );
  if (!objectUrl || !receiptBlob) return null;
  if (receiptBlob.type === "application/pdf") {
    return (
      <PdfReceiptPreview file={receiptBlob} href={objectUrl} title={alt || "Comprovativo PDF"} />
    );
  }
  return (
    <a
      className="receipt-preview__image-link"
      href={objectUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${alt || "Comprovativo"} — abrir imagem`}
    >
      <img {...props} src={objectUrl} alt={alt} />
    </a>
  );
}
