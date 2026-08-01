const { test } = require('node:test')
const assert = require('node:assert/strict')

test('parseLocationIdFromUrl extracts the location query param', async () => {
  const { parseLocationIdFromUrl } = await import('../../public/js/location-qr.js')
  assert.equal(
    parseLocationIdFromUrl('http://boat.local/plugins/signalk-stowage-mgmt/?location=42'),
    '42'
  )
})

test('parseLocationIdFromUrl returns null when the param is missing', async () => {
  const { parseLocationIdFromUrl } = await import('../../public/js/location-qr.js')
  assert.equal(parseLocationIdFromUrl('http://boat.local/plugins/signalk-stowage-mgmt/'), null)
})

test('parseLocationIdFromUrl returns null for an unparseable URL', async () => {
  const { parseLocationIdFromUrl } = await import('../../public/js/location-qr.js')
  assert.equal(parseLocationIdFromUrl('not a url'), null)
})

test('parseLocationIdFromUrl returns null for a blank location value', async () => {
  const { parseLocationIdFromUrl } = await import('../../public/js/location-qr.js')
  assert.equal(parseLocationIdFromUrl('http://boat.local/?location='), null)
})
