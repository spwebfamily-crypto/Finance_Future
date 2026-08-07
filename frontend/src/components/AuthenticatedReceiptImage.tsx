import { ExternalLink, FileText } from 'lucide-react';
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { apiBlobRequest } from '../api/client';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { receiptUrl: string };

export function AuthenticatedReceiptImage({ receiptUrl, alt, ...props }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setObjectUrl(null);
    setIsPdf(false);
    void apiBlobRequest(receiptUrl)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) {
          setIsPdf(blob.type === 'application/pdf');
          setObjectUrl(url);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptUrl]);

  if (!objectUrl) return null;
  if (isPdf) {
    return <a className="receipt-file-card receipt-file-card--saved" href={objectUrl} target="_blank" rel="noreferrer" aria-label={`${alt || 'Comprovativo'} — abrir PDF`}><FileText aria-hidden="true" /><strong>PDF guardado</strong><span>Abrir documento <ExternalLink aria-hidden="true" /></span></a>;
  }
  return <img {...props} src={objectUrl} alt={alt} />;
}
