import 'server-only';
import QRCode from 'qrcode';

/**
 * QR generation, done on the server.
 *
 * Rendering to an SVG string server-side keeps the QR library out of the browser bundle — it is
 * pointless weight on a phone — and means the LED display shows a crisp vector at any size.
 *
 * The encoded URL is always the participant landing page. It must never point at /admin.
 */

/** Error correction level M: readable from a distance and tolerant of a scuffed printed poster. */
const OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 1,
  color: { dark: '#070807', light: '#ffffff' },
} as const;

export async function qrSvg(url: string, width = 512): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: 'svg', width });
}

export async function qrDataUrl(url: string, width = 512): Promise<string> {
  return QRCode.toDataURL(url, { ...OPTIONS, width });
}

/**
 * The URL a QR code should point at.
 * Kiosk mode is intentionally excluded: a visitor scanning with their own phone is not a kiosk.
 */
export function participantUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, '') || 'http://localhost:3000';
}
