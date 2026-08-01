const { test } = require('node:test')
const assert = require('node:assert/strict')

const { resolveMgmtBaseUrl, DEFAULT_MGMT_BASE_PATH } = require('../../plugin/mgmtClient')

test('resolveMgmtBaseUrl defaults to localhost + PORT env var + the default path', () => {
  const originalPort = process.env.PORT
  process.env.PORT = '4001'
  try {
    assert.equal(resolveMgmtBaseUrl({}), `http://localhost:4001${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort === undefined) delete process.env.PORT
    else process.env.PORT = originalPort
  }
})

test('resolveMgmtBaseUrl falls back to port 3000 when PORT is unset', () => {
  const originalPort = process.env.PORT
  delete process.env.PORT
  try {
    assert.equal(resolveMgmtBaseUrl({}), `http://localhost:3000${DEFAULT_MGMT_BASE_PATH}`)
  } finally {
    if (originalPort !== undefined) process.env.PORT = originalPort
  }
})

test('resolveMgmtBaseUrl honors an explicit mgmtBaseUrl override', () => {
  assert.equal(
    resolveMgmtBaseUrl({ mgmtBaseUrl: 'http://192.168.1.50:3000/plugins/signalk-stowage-mgmt' }),
    'http://192.168.1.50:3000/plugins/signalk-stowage-mgmt'
  )
})
