// Thin fetch wrapper for this plugin's own /status route. Absolute path,
// not relative — a relative fetch only resolves correctly when the current
// page URL happens to end in a trailing slash, which isn't guaranteed
// (signalk-stowage-mgmt's own public/js/api.js uses the same absolute-path
// approach for exactly this reason).
const BASE = '/plugins/signalk-stowage-companion'

export async function fetchStatus () {
  const res = await fetch(BASE + '/status')
  if (!res.ok) throw new Error(`status check failed: HTTP ${res.status}`)
  return res.json()
}

export async function refreshStatus () {
  const res = await fetch(BASE + '/status/refresh', { method: 'POST' })
  if (!res.ok) throw new Error(`status refresh failed: HTTP ${res.status}`)
  return res.json()
}
