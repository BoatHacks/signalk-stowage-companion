const { lookupBarcode } = require('../providers/upcItemDb')
const { searchManual } = require('../providers/serpApi')

const MAX_MANUAL_BYTES = 50 * 1024 * 1024

module.exports = function registerIdentifyRoutes (router, getOptions) {
  router.post('/identify/barcode', async (req, res) => {
    const barcode = req.body && req.body.barcode
    if (!barcode || typeof barcode !== 'string') {
      return res.status(400).json({ error: 'barcode is required' })
    }
    const options = getOptions() || {}
    const result = await lookupBarcode(barcode, { apiKey: options.upcItemDbApiKey })
    res.json(result)
  })

  router.post('/identify/manual', async (req, res) => {
    const name = req.body && req.body.name
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' })
    }
    const brand = req.body && req.body.brand
    const query = `${brand ? brand + ' ' : ''}${name} manual filetype:pdf`
    const options = getOptions() || {}
    const result = await searchManual(query, { apiKey: options.serpApiKey })
    res.json(result)
  })

  // Proxies the actual PDF download so the browser can fetch it same-origin
  // instead of depending on the source host allowing cross-origin fetch —
  // the browser then re-uploads the bytes to signalk-stowage-mgmt's
  // POST /items/:id/attachments (SPEC.md §3.2), which itself has no way to
  // fetch a remote URL on this plugin's behalf.
  router.get('/identify/manual/fetch', async (req, res) => {
    const sourceUrl = req.query && req.query.url
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({ error: 'url query param is required' })
    }
    let parsed
    try {
      parsed = new URL(sourceUrl)
    } catch (err) {
      return res.status(400).json({ error: 'invalid url' })
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'url must be http or https' })
    }

    let upstream
    try {
      upstream = await fetch(parsed.toString())
    } catch (err) {
      return res.status(502).json({ error: err.message })
    }
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream responded with HTTP ${upstream.status}` })
    }
    const contentLength = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_MANUAL_BYTES) {
      return res.status(502).json({ error: 'manual PDF exceeds the size limit' })
    }

    const arrayBuffer = await upstream.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_MANUAL_BYTES) {
      return res.status(502).json({ error: 'manual PDF exceeds the size limit' })
    }

    const filename = (parsed.pathname.split('/').pop() || 'manual.pdf').replace(/"/g, '')
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.end(Buffer.from(arrayBuffer))
  })
}
