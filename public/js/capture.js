import { html, useState, useRef, useCallback } from '../vendor/preact-htm-standalone.js'

// BarcodeDetector's live-video-stream mode (ARCHITECTURE.md §4's original
// framing) needs real getUserMedia stream lifecycle handling that's hard to
// get right without a real device/browser to test against. This MVP
// implementation instead uses a native <input type="file" capture> to snap
// a still photo (opens the phone's camera directly on mobile browsers, no
// getUserMedia permission dance of its own), then runs BarcodeDetector's
// detect() against that still image. Live-preview scanning is a reasonable
// follow-up, not required for the capture flow to work.
export const BARCODE_SUPPORTED = typeof window !== 'undefined' && 'BarcodeDetector' in window

async function detectBarcodeInFile (file) {
  const bitmap = await createImageBitmap(file)
  try {
    const detector = new window.BarcodeDetector()
    const results = await detector.detect(bitmap)
    return results.length ? results[0].rawValue : null
  } finally {
    bitmap.close && bitmap.close()
  }
}

export function CaptureView ({ onCaptured }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const barcodeInputRef = useRef(null)
  const photoInputRef = useRef(null)

  const handleBarcodeFile = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const barcode = await detectBarcodeInFile(file)
      if (!barcode) {
        setError('No barcode found in that photo — try again, or take an item photo instead.')
        return
      }
      onCaptured({ barcode, photo: file })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [onCaptured])

  const handlePhotoFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    onCaptured({ barcode: null, photo: file })
  }, [onCaptured])

  return html`
    <div class="card">
      ${error ? html`<div class="error-banner">${error}</div>` : null}
      ${BARCODE_SUPPORTED
        ? html`
          <input ref=${barcodeInputRef} type="file" accept="image/*" capture="environment"
            style="display:none" onChange=${handleBarcodeFile} />
          <p><button disabled=${busy} onClick=${() => barcodeInputRef.current.click()}>
            Scan barcode
          </button></p>
        `
        : html`<p class="muted">Barcode scanning isn't supported in this browser — take an item photo and fill in the details yourself.</p>`}
      <input ref=${photoInputRef} type="file" accept="image/*" capture="environment"
        style="display:none" onChange=${handlePhotoFile} />
      <p><button disabled=${busy} onClick=${() => photoInputRef.current.click()}>
        Take item photo (no barcode)
      </button></p>
    </div>
  `
}
