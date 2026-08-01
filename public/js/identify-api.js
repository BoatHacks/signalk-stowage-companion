// Thin fetch wrapper for this plugin's own /identify routes
// (ARCHITECTURE.md §2.2). Barcode lookup and manual-PDF search only — no
// image-search endpoint, dropped for MVP (SPEC.md §11).
//
// Absolute base path, not relative — see status-api.js's comment: a
// relative fetch only resolves correctly when the current page URL happens
// to end in a trailing slash.
const BASE = '/plugins/signalk-stowage-companion'

async function postJson (path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function identifyBarcode (barcode) {
  return postJson('/identify/barcode', { barcode })
}

export async function searchManual (name, brand) {
  return postJson('/identify/manual', { name, brand })
}

// Downloads the candidate manual PDF (via this plugin's own proxy route,
// same-origin, avoiding any CORS issue with the original host) as a Blob,
// ready to hand to signalk-stowage-mgmt's attachment upload.
export async function fetchManualPdf (url) {
  const res = await fetch(BASE + '/identify/manual/fetch?url=' + encodeURIComponent(url))
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const filenameMatch = /filename="([^"]*)"/.exec(res.headers.get('content-disposition') || '')
  return {
    blob: await res.blob(),
    filename: filenameMatch ? filenameMatch[1] : 'manual.pdf',
    mimeType: res.headers.get('content-type') || 'application/pdf'
  }
}
