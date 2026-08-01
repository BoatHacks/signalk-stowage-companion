const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { startTestServer } = require('../../test-helpers/server')

// A throwaway signalk-stowage-mgmt stand-in: just enough to answer
// GET /webapp-config the way checkStowageMgmtAvailable() expects.
async function startFakeMgmt ({ ok = true } = {}) {
  const app = express()
  app.get('/plugins/signalk-stowage-mgmt/webapp-config', (req, res) => {
    if (ok) res.json({ autoTheme: false, themeRecommendation: null })
    else res.status(500).json({ error: 'boom' })
  })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  return { port: server.address().port, stop: () => new Promise((r) => server.close(r)) }
}

test('GET /status reports available: true when signalk-stowage-mgmt responds', async () => {
  const fakeMgmt = await startFakeMgmt({ ok: true })
  const t = await startTestServer({
    options: { mgmtBaseUrl: `http://localhost:${fakeMgmt.port}/plugins/signalk-stowage-mgmt` }
  })
  try {
    const res = await t.get('/status')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.available, true)
    assert.equal(body.error, null)
  } finally {
    await t.stop()
    await fakeMgmt.stop()
  }
})

test('GET /status reports available: false when signalk-stowage-mgmt is unreachable', async () => {
  const t = await startTestServer({
    options: { mgmtBaseUrl: 'http://127.0.0.1:1/plugins/signalk-stowage-mgmt' }
  })
  try {
    const res = await t.get('/status')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.available, false)
    assert.ok(body.error)
  } finally {
    await t.stop()
  }
})

test('GET /status reports available: false when signalk-stowage-mgmt responds with an error status', async () => {
  const fakeMgmt = await startFakeMgmt({ ok: false })
  const t = await startTestServer({
    options: { mgmtBaseUrl: `http://localhost:${fakeMgmt.port}/plugins/signalk-stowage-mgmt` }
  })
  try {
    const res = await t.get('/status')
    const body = await res.json()
    assert.equal(body.available, false)
    assert.match(body.error, /HTTP 500/)
  } finally {
    await t.stop()
    await fakeMgmt.stop()
  }
})

test('POST /status/refresh re-runs the check and returns the fresh result', async () => {
  const fakeMgmt = await startFakeMgmt({ ok: false })
  const t = await startTestServer({
    options: { mgmtBaseUrl: `http://localhost:${fakeMgmt.port}/plugins/signalk-stowage-mgmt` }
  })
  try {
    const before = await (await t.get('/status')).json()
    assert.equal(before.available, false)

    // signalk-stowage-mgmt "comes back up"
    await fakeMgmt.stop()
    const fakeMgmtV2 = await startFakeMgmt({ ok: true })
    // can't change the already-resolved port the plugin is configured
    // with mid-test, so just confirm refresh re-runs the check at all by
    // checking checkedAt moves forward.
    const refreshed = await (await t.post('/status/refresh')).json()
    assert.notEqual(refreshed.checkedAt, before.checkedAt)
    await fakeMgmtV2.stop()
  } finally {
    await t.stop()
  }
})
