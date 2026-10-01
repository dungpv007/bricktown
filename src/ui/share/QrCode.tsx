import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/** Light modules around the code, as the QR spec asks for (scanners need it). */
const QUIET = 4

/** The dark modules as one SVG path (one `h1v1h-1z` square per module), or null when `text` does not fit. */
function qrPath(text: string): { d: string; size: number } | null {
  try {
    const qr = qrcode(0, 'L')
    qr.addData(text, 'Byte')
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`
      }
    }
    return { d, size: n + QUIET * 2 }
  } catch {
    return null // too long for any QR version
  }
}

/** A QR code of `text`, drawn as SVG (offline, crisp at any size). Nothing when it does not fit. */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => qrPath(text), [text])
  if (!qr) return null
  return (
    <svg
      className="bt-qr"
      data-testid="share-qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  )
}
