'use client';

import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/** Print and download controls for the QR poster. Hidden from the printed sheet by `print-hide`. */
export function PrintButton({ svgMarkup, pngDataUrl }: { svgMarkup: string; pngDataUrl: string }) {
  function downloadSvg() {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), 'outskill-challenge-qr.svg', true);
  }

  function downloadPng() {
    triggerDownload(pngDataUrl, 'outskill-challenge-qr.png', false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={downloadSvg}>
        <Download aria-hidden className="h-4 w-4" />
        SVG
      </Button>
      <Button variant="secondary" onClick={downloadPng}>
        <Download aria-hidden className="h-4 w-4" />
        PNG
      </Button>
      <Button onClick={() => window.print()}>
        <Printer aria-hidden className="h-4 w-4" />
        Print
      </Button>
    </div>
  );
}

function triggerDownload(href: string, filename: string, revoke: boolean) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) URL.revokeObjectURL(href);
}
