import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders a URL as a QR code image (generated in the browser, nothing is sent anywhere). */
export function QrCode({ value, size = 168, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#0b1714", light: "#ffffff" } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className={className} />;
  return <img src={src} width={size} height={size} alt={`QR code for ${value}`} className={className} />;
}
