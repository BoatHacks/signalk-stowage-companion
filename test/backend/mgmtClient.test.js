const { test } = require('node:test')
const assert = require('node:assert/strict')

const { resolveMgmtBaseUrl, DEFAULT_MGMT_BASE_PATH } = require('../../plugin/mgmtClient')

test('resolveMgmtBaseUrl uses app.config.settings.port for a plain-HTTP server', () => {
  const app = { config: { settings: { port: 3001, ssl: false } } }
  assert.equal(resolveMgmtBaseUrl({}, app), `http://localhost:3001${DEFAULT_MGMT_BASE_PATH}`)
})

test('resolveMgmtBaseUrl uses https + sslport when the server has ssl enabled', () => {
  const app = { config: { settings: { port: 3000, sslport: 3443, ssl: true } } }
  assert.equal(resolveMgmtBaseUrl({}, app), `https://localhost:3443${DEFAULT_MGMT_BASE_PATH}`)
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
    assert.equal(resolveMgmtBaseUrl({}), `http://localhost:4001${DEFAULT_MGMT_BASE_PATH}`)
    assert.equal(resolveMgmtBaseUrl({}, {}), `http://localhost:4001${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort === undefined) delete process.env.PORT
    else process.env.PORT = originalPort
  }
})

test('resolveMgmtBaseUrl falls back to port 3000 when neither app.config.settings nor PORT is available', () => {
  const originalPort = process.env.PORT
  delete process.env.PORT
  try {
    assert.equal(resolveMgmtBaseUrl({}), `http://localhost:3000${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort !== undefined) process.env.PORT = originalPort
  }
})
