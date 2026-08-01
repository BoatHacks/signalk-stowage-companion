// Thin fetch wrapper for this plugin's own /status route (ARCHITECTURE.md
// §2.2's mgmt-api.js/identify-api.js split doesn't apply yet since neither
// of those exist — this is the only endpoint the webapp shell calls).
export async function fetchStatus () {
  const res = await fetch('status')
  if (!res.ok) throw new Error(`status check failed: HTTP ${res.status}`)
  return res.json()
}
