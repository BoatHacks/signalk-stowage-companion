// A minimal stand-in for express.json() so this plugin doesn't need its own
// `express` dependency — copied from signalk-stowage-mgmt's plugin/jsonBody.js
// (same rationale: the router Signal K server hands the plugin already
// behaves like an Express router for .get/.post/.use, so express itself was
// only ever needed for JSON body parsing).
function jsonBodyParser ({ limit = 1024 * 1024 } = {}) {
  return function (req, res, next) {
    if (req.body !== undefined) return next()

    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
      req.body = {}
      return next()
    }

    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      req.body = {}
      return next()
    }

    let received = 0
    const chunks = []
    let aborted = false

    const timeout = setTimeout(() => {
      if (aborted) return
      aborted = true
      res.status(408).json({ error: 'timed out waiting for request body' })
      req.destroy()
    }, 30000)

    req.on('data', (chunk) => {
      if (aborted) return
      received += chunk.length
      if (received > limit) {
        aborted = true
        clearTimeout(timeout)
        res.status(413).json({ error: 'request body too large' })
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (aborted) return
      clearTimeout(timeout)
      if (!chunks.length) {
        req.body = {}
        return next()
      }
      try {
        req.body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        next()
      } catch (err) {
        res.status(400).json({ error: 'invalid JSON body' })
      }
    })

    req.on('error', (err) => {
      clearTimeout(timeout)
      next(err)
    })
  }
}

module.exports = { jsonBodyParser }
