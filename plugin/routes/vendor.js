const fs = require('fs')
const path = require('path')

// Signal K server is expected to auto-serve this plugin's whole public/
// directory as static webapp assets (and demonstrably does for
// index.html/style.css/js/*.js/vendor/preact-htm-standalone.js), but at
// least one real deployment 404s specifically on
// vendor/barcode-detector/zxing_reader.wasm while everything else under
// public/ loads fine — likely an extension-based allowlist somewhere in
// front of Signal K (a reverse proxy, or Signal K's own static layer)
// that doesn't recognize .wasm. Rather than depend on that working,
// barcode-detector.js's scanner asset is served explicitly through this
// plugin's own router instead, the same proven-working path /status and
// /identify already use — deliberately at a path with no corresponding
// file under public/, so there's nothing for a static-file handler to
// even match (and therefore no risk of it intercepting the request
// before this route ever gets a chance to run, regardless of mounting
// order between Signal K's static serving and this router).
const WASM_PATH = path.join(__dirname, '..', '..', 'public', 'vendor', 'barcode-detector', 'zxing_reader.wasm')

module.exports = function registerVendorRoutes (router) {
  router.get('/wasm/zxing_reader.wasm', (req, res) => {
    fs.readFile(WASM_PATH, (err, data) => {
      if (err) {
        res.status(404).json({ error: 'zxing_reader.wasm not found' })
        return
      }
      res.setHeader('Content-Type', 'application/wasm')
      // Content-addressed by plugin version, not by request — safe to
      // cache long-term client-side, and worth doing given the file's
      // size (~1MB).
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(data)
    })
  })
}
