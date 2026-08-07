import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { apiBlobRequest } from '../api/client';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { receiptUrl: string };

export function AuthenticatedReceiptImage({ receiptUrl, alt, ...props }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setObjectUrl(null);
    void apiBlobRequest(receiptUrl)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setObjectUrl(url);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptUrl]);

  return objectUrl ? <img {...props} src={objectUrl} alt={alt} /> : null;
}
