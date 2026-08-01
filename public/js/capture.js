import { html, useState, useRef, useCallback } from '../vendor/preact-htm-standalone.js'
import { detectBarcode } from './barcode-detector.js'

// BarcodeDetector's live-video-stream mode (ARCHITECTURE.md §4's original
// framing) needs real getUserMedia stream lifecycle handling that's hard to
// get right without a real device/browser to test against. This
// implementation instead uses a native <input type="file" capture> to snap
// a still photo (opens the phone's camera directly on mobile browsers, no
// getUserMedia permission dance of its own), then runs the vendored
// ZXing-backed BarcodeDetector ponyfill against that still image —
// unconditionally, not just as a fallback, so it works the same way on
// every browser including Safari/iOS, which has no native implementation
// of the Shape Detection API at all. Live-preview scanning is a reasonable
// follow-up, not required for the capture flow to work.

// Common retail/product barcode formats, plus code_128 (also used on some
// spares/parts labels). Restricting formats (vs. the ponyfill's default of
// "every format it knows") cuts down on spurious matches against
// unrelated markings in a photo.
const PRODUCT_BARCODE_FORMATS = ['upc_a', 'upc_e', 'ean_8', 'ean_13', 'code_128', 'itf']

async function detectBarcodeInFile (file) {
  const results = await detectBarcode(file, { formats: PRODUCT_BARCODE_FORMATS })
  return results.length ? results[0].rawValue : null
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
      <input ref=${barcodeInputRef} type="file" accept="image/*" capture="environment"
        style="display:none" onChange=${handleBarcodeFile} />
      <p><button disabled=${busy} onClick=${() => barcodeInputRef.current.click()}>
        ${busy ? 'Scanning…' : 'Scan barcode'}
      </button></p>
      <input ref=${photoInputRef} type="file" accept="image/*" capture="environment"
        style="display:none" onChange=${handlePhotoFile} />
      <p><button disabled=${busy} onClick=${() => photoInputRef.current.click()}>
        Take item photo (no barcode)
      </button></p>
    </div>
  `
}
