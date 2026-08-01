const fs = require('fs')
const path = require('path')

// Signal K server mounts a plugin's static public/ directory and its
// registerWithRouter() routes at two genuinely different paths on the
// same server: static webapp content lives under /<plugin-id>/
// (src/interfaces/webapps.ts: app.use('/' + moduleData.module,
// express.static(webappPath))), while registerWithRouter() routes live
// under /plugins/<plugin-id>/ (per Signal K's own plugin docs). This
// module deliberately serves the scanner's .wasm binary as a
// registerWithRouter() route — reachable at /plugins/<plugin-id>/wasm/
// zxing_reader.wasm — rather than relying on it being picked up by the
// static mount at the *other* prefix, which is the mistake that caused
// this to 404 in an earlier version (barcode-detector.js was requesting
// it under /plugins/<plugin-id>/vendor/..., which is simply the wrong
// mount point for anything under public/).
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
