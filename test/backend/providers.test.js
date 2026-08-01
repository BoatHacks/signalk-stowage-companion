const { test } = require('node:test')
const assert = require('node:assert/strict')

const { lookupBarcode, parseCategoryPath } = require('../../plugin/providers/upcItemDb')
const { searchManual, isPdfResult } = require('../../plugin/providers/serpApi')

function fakeJsonResponse (status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('parseCategoryPath splits a Google product taxonomy string', () => {
  assert.deepEqual(
    parseCategoryPath('Electronics > Communications > Telephony > Mobile Phones'),
    ['Electronics', 'Communications', 'Telephony', 'Mobile Phones']
  )
  assert.deepEqual(parseCategoryPath(''), [])
  assert.deepEqual(parseCategoryPath(undefined), [])
})

test('lookupBarcode maps a matched item', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /trial\/lookup\?upc=012345/)
    return fakeJsonResponse(200, {
      items: [{
        title: 'Spare Impeller',
        description: 'Rubber impeller for raw water pump',
        brand: 'Jabsco',
        category: 'Marine > Engine Parts',
        images: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
      }]
    })
  }
  const result = await lookupBarcode('012345', { fetchImpl })
  assert.equal(result.status, 'matched')
  assert.equal(result.name, 'Spare Impeller')
  assert.equal(result.brand, 'Jabsco')
  assert.deepEqual(result.categoryPath, ['Marine', 'Engine Parts'])
  assert.deepEqual(result.images, ['https://example.com/a.jpg', 'https://example.com/b.jpg'])
})

test('lookupBarcode reports no_match when items is empty', async () => {
  const fetchImpl = async () => fakeJsonResponse(200, { items: [] })
  const result = await lookupBarcode('000000', { fetchImpl })
  assert.equal(result.status, 'no_match')
})

test('lookupBarcode reports failed on a non-OK HTTP response', async () => {
  const fetchImpl = async () => fakeJsonResponse(500, {})
  const result = await lookupBarcode('000000', { fetchImpl })
  assert.equal(result.status, 'failed')
  assert.match(result.error, /HTTP 500/)
})

test('lookupBarcode uses the paid endpoint and auth headers when an apiKey is given', async () => {
  const fetchImpl = async (url, opts) => {
    assert.match(url, /prod\/v1\/lookup/)
    assert.equal(opts.headers.user_key, 'secret')
    assert.equal(opts.headers.key_type, '3scale')
    return fakeJsonResponse(200, { items: [] })
  }
  await lookupBarcode('000000', { apiKey: 'secret', fetchImpl })
})

test('isPdfResult only matches links ending in .pdf', () => {
  assert.equal(isPdfResult({ link: 'https://example.com/manual.pdf' }), true)
  assert.equal(isPdfResult({ link: 'https://example.com/manual.pdf?x=1' }), true)
  assert.equal(isPdfResult({ link: 'https://example.com/page.html' }), false)
  assert.equal(isPdfResult({}), false)
})

test('searchManual returns no_match without hitting the network when no apiKey is configured', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return fakeJsonResponse(200, {}) }
  const result = await searchManual('some query', { fetchImpl })
  assert.equal(result.status, 'no_match')
  assert.equal(called, false)
})

test('searchManual finds the first PDF among organic_results', async () => {
  const fetchImpl = async () => fakeJsonResponse(200, {
    organic_results: [
      { link: 'https://example.com/page.html', title: 'Not a PDF' },
      { link: 'https://example.com/manual.pdf', title: 'The Manual' }
    ]
  })
  const result = await searchManual('brand model manual filetype:pdf', { apiKey: 'k', fetchImpl })
  assert.equal(result.status, 'matched')
  assert.equal(result.url, 'https://example.com/manual.pdf')
  assert.equal(result.title, 'The Manual')
})

test('searchManual reports no_match when nothing looks like a PDF', async () => {
  const fetchImpl = async () => fakeJsonResponse(200, { organic_results: [{ link: 'https://example.com/x.html' }] })
  const result = await searchManual('q', { apiKey: 'k', fetchImpl })
  assert.equal(result.status, 'no_match')
})
