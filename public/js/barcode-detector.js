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

setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? `${WASM_DIR}/${path}` : prefix + path)
})

export { BarcodeDetector }
