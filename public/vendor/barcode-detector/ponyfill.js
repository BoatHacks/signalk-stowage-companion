/*!
 * Vendored, unmodified build: barcode-detector v3.2.1 (ponyfill.js) +
 * zxing-wasm v3.1.1 (zxing-exported.js), used together as a Barcode
 * Detection API ponyfill backed by ZXing-C++ compiled to WebAssembly.
 * MIT licensed (c) 2023 Ze-Zheng Wu - see ./LICENSE. The underlying
 * ZXing-C++ core embedded in zxing_reader.wasm is Apache-2.0 licensed
 * (https://github.com/zxing-cpp/zxing-cpp).
 * Vendored (not loaded from jsDelivr, the packages' own default) so
 * barcode/QR scanning works without any third-party network dependency -
 * see plugin/../public/js/barcode-detector.js, which points the reader at
 * the local zxing_reader.wasm file instead.
 * To update: npm install barcode-detector in a scratch dir, then copy
 * node_modules/barcode-detector/dist/es/{ponyfill,zxing-exported}.js and
 * node_modules/barcode-detector/node_modules/zxing-wasm/dist/reader/
 * zxing_reader.wasm over these files (use barcode-detector's OWN nested
 * zxing-wasm dependency, not a top-level install, since the JS glue
 * embeds a SHA-256 pin of one exact zxing-wasm build).
 */
import { a as e, i as t, n, o as r, r as i, s as a, t as o } from "./zxing-exported.js";
export { o as BarcodeDetector, a as ZXING_CPP_COMMIT, i as ZXING_WASM_SHA256, r as ZXING_WASM_VERSION, n as prepareZXingModule, t as purgeZXingModule, e as setZXingModuleOverrides };
