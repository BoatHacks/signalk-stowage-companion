// UPCItemDB barcode lookup (SPEC.md §5, §11) — the only automated
// identification path for MVP. The trial endpoint needs no key (free tier:
// 100 lookups/day); a configured apiKey switches to the paid endpoint using
// the header auth UPCItemDB documents for that tier.
const TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup'
const PAID_URL = 'https://api.upcitemdb.com/prod/v1/lookup'

// UPCItemDB's `category` field is a Google product taxonomy string
// ("Electronics > Communications > Telephony > Mobile Phones"); split it
// into segments so the frontend can offer the most specific segment as a
// candidate category without this module needing to know anything about
// signalk-stowage-mgmt's actual category list.
function parseCategoryPath (category) {
  if (typeof category !== 'string' || !category.trim()) return []
  return category.split('>').map((s) => s.trim()).filter(Boolean)
}

async function lookupBarcode (barcode, { apiKey, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = new URL(apiKey ? PAID_URL : TRIAL_URL)
    url.searchParams.set('upc', barcode)
    const headers = apiKey ? { user_key: apiKey, key_type: '3scale' } : {}
    const res = await fetchImpl(url.toString(), { headers, signal: controller.signal })
    if (!res.ok) {
      return { status: 'failed', error: `UPCItemDB responded with HTTP ${res.status}` }
    }
    const body = await res.json()
    const item = Array.isArray(body.items) ? body.items[0] : undefined
    if (!item) return { status: 'no_match' }
    return {
      status: 'matched',
      name: item.title || '',
      description: item.description || '',
      brand: item.brand || '',
      categoryPath: parseCategoryPath(item.category),
      images: Array.isArray(item.images) ? item.images.slice(0, 4) : []
    }
  } catch (err) {
    return { status: 'failed', error: err.message }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { lookupBarcode, parseCategoryPath }
