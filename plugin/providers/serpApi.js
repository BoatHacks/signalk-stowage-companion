// SerpApi web search, used only for manual-PDF lookup (SPEC.md §5, §11) —
// image search was dropped for MVP since SerpApi's Google Lens engine needs
// a publicly-hosted image URL, which a phone photo on a LAN-only Signal K
// server doesn't have.
const SEARCH_URL = 'https://serpapi.com/search.json'

function isPdfResult (result) {
  return !!result && typeof result.link === 'string' && /\.pdf(?:[?#]|$)/i.test(result.link)
}

async function searchManual (query, { apiKey, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  // No key configured: nothing to call. This is a config gap, not a search
  // miss, but from the caller's point of view (SPEC.md §3's
  // identification_status) it's the same "nothing found" outcome.
  if (!apiKey) return { status: 'no_match' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = new URL(SEARCH_URL)
    url.searchParams.set('engine', 'google')
    url.searchParams.set('q', query)
    url.searchParams.set('num', '10')
    url.searchParams.set('api_key', apiKey)
    const res = await fetchImpl(url.toString(), { signal: controller.signal })
    if (!res.ok) {
      return { status: 'failed', error: `SerpApi responded with HTTP ${res.status}` }
    }
    const body = await res.json()
    const results = Array.isArray(body.organic_results) ? body.organic_results : []
    const match = results.find(isPdfResult)
    if (!match) return { status: 'no_match' }
    return { status: 'matched', url: match.link, title: match.title || '' }
  } catch (err) {
    return { status: 'failed', error: err.message }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { searchManual, isPdfResult }
