const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')

const { resolveMgmtBaseUrl, checkStowageMgmtAvailable, DEFAULT_MGMT_BASE_PATH } = require('../../plugin/mgmtClient')

test('resolveMgmtBaseUrl uses app.config.settings.port for a plain-HTTP server', () => {
  const app = { config: { settings: { port: 3001, ssl: false } } }
  assert.equal(resolveMgmtBaseUrl({}, app), `http://127.0.0.1:3001${DEFAULT_MGMT_BASE_PATH}`)
})

test('resolveMgmtBaseUrl uses https + sslport when the server has ssl enabled', () => {
  const app = { config: { settings: { port: 3000, sslport: 3443, ssl: true } } }
  assert.equal(resolveMgmtBaseUrl({}, app), `https://127.0.0.1:3443${DEFAULT_MGMT_BASE_PATH}`)
})

test('resolveMgmtBaseUrl honors an explicit mgmtBaseUrl override even when app.config is available', () => {
  const app = { config: { settings: { port: 3000 } } }
  assert.equal(
    resolveMgmtBaseUrl({ mgmtBaseUrl: 'http://192.168.1.50:3000/plugins/signalk-stowage-mgmt' }, app),
    'http://192.168.1.50:3000/plugins/signalk-stowage-mgmt'
  )
})

test('resolveMgmtBaseUrl falls back to the PORT env var when app.config.settings is unavailable', () => {
  const originalPort = process.env.PORT
  process.env.PORT = '4001'
  try {
    assert.equal(resolveMgmtBaseUrl({}), `http://127.0.0.1:4001${DEFAULT_MGMT_BASE_PATH}`)
    assert.equal(resolveMgmtBaseUrl({}, {}), `http://127.0.0.1:4001${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort === undefined) delete process.env.PORT
    else process.env.PORT = originalPort
  }
})

test('resolveMgmtBaseUrl falls back to port 3000 when neither app.config.settings nor PORT is available', () => {
  const originalPort = process.env.PORT
  delete process.env.PORT
  try {
    assert.equal(resolveMgmtBaseUrl({}), `http://127.0.0.1:3000${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort !== undefined) process.env.PORT = originalPort
  }
})

// A TCP server that accepts the connection but never sends a response —
// simulates the "hangs instead of failing fast" case (e.g. an IPv6/dual-
// stack mismatch, or a firewall silently dropping packets) that produces
// "This operation was aborted" once checkStowageMgmtAvailable's own
// timeout fires, distinct from an immediate connection failure.
async function startBlackHoleServer () {
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    // never respond
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    stop: () => new Promise((resolve) => {
      // server.close() alone only stops accepting new connections — the
      // client's already-open socket (abandoned by the aborted fetch, not
      // actually closed by it) would otherwise keep this test process's
      // event loop alive indefinitely.
      for (const socket of sockets) socket.destroy()
      server.close(resolve)
    })
  }
}

test('checkStowageMgmtAvailable reports a clear timeout message, not a raw AbortError, when the request hangs', async () => {
  const blackHole = await startBlackHoleServer()
  try {
    const result = await checkStowageMgmtAvailable(`http://127.0.0.1:${blackHole.port}`, { timeoutMs: 100 })
    assert.equal(result.available, false)
    assert.match(result.error, /timed out after 100ms/)
    assert.equal(result.baseUrl, `http://127.0.0.1:${blackHole.port}`)
  } finally {
    await blackHole.stop()
  }
})
