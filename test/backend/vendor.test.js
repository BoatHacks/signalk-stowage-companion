const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const { startTestServer } = require('../../test-helpers/server')

test('GET /wasm/zxing_reader.wasm serves the vendored file, byte-for-byte, with the right content type', async () => {
  const t = await startTestServer({ options: { mgmtBaseUrl: 'http://127.0.0.1:1/x' } })
  try {
    const res = await t.get('/wasm/zxing_reader.wasm')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/wasm')
    const served = Buffer.from(await res.arrayBuffer())
    const onDisk = fs.readFileSync(
      path.join(__dirname, '..', '..', 'public', 'vendor', 'barcode-detector', 'zxing_reader.wasm')
    )
    assert.ok(served.equals(onDisk))
  } finally {
    await t.stop()
  }
})
