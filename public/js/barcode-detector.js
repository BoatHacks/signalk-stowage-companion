// Wraps the vendored barcode-detector ponyfill (../vendor/barcode-detector/)
// and points it at the locally-vendored zxing_reader.wasm instead of its
// default jsDelivr CDN fetch, so barcode/QR scanning works with no
// third-party network dependency and on browsers with no native
// BarcodeDetector at all — notably Safari/iOS, which never implemented the
// Shape Detection API this ponyfills. Used unconditionally (no feature
// detection / native-API branch) so scanning behaves the same on every
// platform instead of silently degrading on iOS.
import { BarcodeDetector, setZXingModuleOverrides } from '../vendor/barcode-detector/ponyfill.js'

// Absolute path, not relative — see status-api.js's comment: a relative
// fetch only resolves correctly when the current page URL happens to end
// in a trailing slash.
const WASM_DIR = '/plugins/signalk-stowage-companion/vendor/barcode-detector'
const WASM_URL = `${WASM_DIR}/zxing_reader.wasm`

setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? `${WASM_DIR}/${path}` : prefix + path)
})

// If WASM module init fails for any reason (wrong path, a proxy stripping
// an unrecognized extension, a Content-Security-Policy blocking
// WebAssembly, ...), the ponyfill throws a DOMException deliberately
// worded to match Chromium's own native-BarcodeDetector error — after
// console.error()-ing the *real* underlying cause, which isn't visible
// wherever this error message ends up getting reported. Checking the wasm
// file's own reachability first turns "Barcode detection service
// unavailable" (uninformative either way) into either a specific,
// actionable error or — if the file loads fine — leaves the original
// error in place, which then really does mean something other than a
// wrong path.
let wasmReachabilityCheck = null
function checkWasmReachable () {
  if (!wasmReachabilityCheck) {
    wasmReachabilityCheck = fetch(WASM_URL, { method: 'HEAD' }).then((res) => {
      if (!res.ok) {
        throw new Error(
          `Barcode scanner assets not reachable (HTTP ${res.status} for ${WASM_URL}) — ` +
          'check that public/vendor/barcode-detector/ was installed with the rest of the plugin.'
        )
      }
    }).catch((err) => {
      wasmReachabilityCheck = null // let a transient failure be retried on the next scan
      throw err
    })
  }
  return wasmReachabilityCheck
}

// Use this instead of `new BarcodeDetector(...)` directly so a failure
// gets the reachability check above applied first.
export async function detectBarcode (input, options) {
  await checkWasmReachable()
  const detector = new BarcodeDetector(options)
  return detector.detect(input)
}
