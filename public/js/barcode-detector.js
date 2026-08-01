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
//
// Served by this plugin's own backend (plugin/routes/vendor.js) at a path
// with no corresponding file under public/, rather than relying on Signal
// K's generic static-file serving of public/vendor/barcode-detector/ —
// at least one real deployment 404s specifically on this .wasm file while
// everything else under public/ (including nested .js) loads fine,
// likely an extension-based allowlist somewhere in front of Signal K that
// doesn't recognize .wasm.
const WASM_URL = '/plugins/signalk-stowage-companion/wasm/zxing_reader.wasm'

setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM_URL : prefix + path)
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
          'check that this plugin was installed/updated fully (plugin/routes/vendor.js and ' +
          'public/vendor/barcode-detector/zxing_reader.wasm should both be present).'
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
