const { test } = require('node:test')
const assert = require('node:assert/strict')

const { startTestServer } = require('../../test-helpers/server')

// Routes call the providers' default `fetch` (no injection point at the
// route layer, unlike the provider unit tests in providers.test.js) — so
// these tests monkey-patch global.fetch for the duration of the test and
// restore it afterward. Each test file is its own process under
// `node --test`, so this doesn't leak between files.
//
// The test harness (test-helpers/server.js) also calls fetch, to talk to
// the real local test server — those calls must pass through untouched, or
// the harness itself breaks. Only requests to something other than the
// local test server are handed to `impl`.
function withFakeFetch (impl, fn) {
  const original = global.fetch
  global.fetch = (url, opts) => {
    if (typeof url === 'string' && /^https?:\/\/127\.0\.0\.1[:/]/.test(url)) {
      return original(url, opts)
    }
    return impl(url, opts)
  }
  return fn().finally(() => { global.fetch = original })
}

test('POST /identify/barcode returns a mapped match', async () => {
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ title: 'Bilge Pump', category: 'Marine > Pumps' }] })
    }),
    async () => {
      const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
      try {
        const res = await t.post('/identify/barcode', { barcode: '012345678905' })
        assert.equal(res.status, 200)
        const body = await res.json()
        assert.equal(body.status, 'matched')
        assert.equal(body.name, 'Bilge Pump')
      } finally {
        await t.stop()
      }
    }
  )
})

test('POST /identify/barcode requires a barcode', async () => {
  const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
  try {
    const res = await t.post('/identify/barcode', {})
    assert.equal(res.status, 400)
  } finally {
    await t.stop()
  }
})

test('POST /identify/manual skips the search with no SerpApi key configured', async () => {
  const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
  try {
    const res = await t.post('/identify/manual', { name: 'Bilge Pump', brand: 'Rule' })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'no_match')
  } finally {
    await t.stop()
  }
})

test('POST /identify/manual finds a manual when SerpApi is configured', async () => {
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ organic_results: [{ link: 'https://example.com/rule-pump.pdf', title: 'Rule Pump Manual' }] })
    }),
    async () => {
      const t = await startTestServer({
        options: { mgmtBaseUrl: 'http://127.0.0.1:1/x', serpApiKey: 'k' }
      })
      try {
        const res = await t.post('/identify/manual', { name: 'Bilge Pump', brand: 'Rule' })
        const body = await res.json()
        assert.equal(body.status, 'matched')
        assert.equal(body.url, 'https://example.com/rule-pump.pdf')
      } finally {
        await t.stop()
      }
    }
  )
})

test('GET /identify/manual/fetch proxies the PDF bytes', async () => {
  await withFakeFetch(
    async (url) => {
      assert.equal(url, 'https://example.com/manual.pdf')
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/pdf'], ['content-length', '4']]),
        // Buffer.from(string).buffer would expose Node's whole shared pool
        // (small allocations are slices into it), not just these 4 bytes —
        // TextEncoder always allocates its own exact-sized ArrayBuffer.
        arrayBuffer: async () => new TextEncoder().encode('%PDF').buffer
      }
    },
    async () => {
      const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
      try {
        const res = await t.get('/identify/manual/fetch?url=' + encodeURIComponent('https://example.com/manual.pdf'))
        assert.equal(res.status, 200)
        assert.equal(res.headers.get('content-type'), 'application/pdf')
        const buf = Buffer.from(await res.arrayBuffer())
        assert.equal(buf.toString(), '%PDF')
      } finally {
        await t.stop()
      }
    }
  )
})

test('GET /identify/manual/fetch rejects a missing url', async () => {
  const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
  try {
    const res = await t.get('/identify/manual/fetch')
    assert.equal(res.status, 400)
  } finally {
    await t.stop()
  }
})

test('GET /identify/manual/fetch rejects a non-http(s) url', async () => {
  const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
  try {
    const res = await t.get('/identify/manual/fetch?url=' + encodeURIComponent('file:///etc/passwd'))
    assert.equal(res.status, 400)
  } finally {
    await t.stop()
  }
})
