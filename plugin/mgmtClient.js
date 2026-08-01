// signalk-stowage-mgmt is a hard dependency (SPEC.md §1.2) — this plugin has
// no data model of its own and calls that plugin's REST API for everything
// durable. There's no version-negotiation contract between the two plugins
// (matching the precedent set by signalk-maintenance-tracker's integration
// with signalk-stowage-mgmt, see that plugin's README "Known external
// consumers"), so this is a presence check, not a version-compatibility
// check — see ARCHITECTURE.md §5 for why a real version check is deferred.

const DEFAULT_MGMT_BASE_PATH = '/plugins/signalk-stowage-mgmt'

// This check runs in this plugin's own Node backend (plugin.start), not the
// browser — a same-origin *relative* path (what the webapp itself uses,
// per SPEC.md's same-origin assumption) has no meaning to Node's fetch, so
// the backend needs an absolute URL.
//
// Signal K server exposes its own listening port/protocol to plugins via
// app.config.settings (port, sslport, ssl) — the same fields signalk-server
// itself reads internally (see e.g. src/mdns.js, src/interfaces/rest.js)
// and the pattern real-world community plugins use to call back into their
// own server. Prefer that over guessing from the PORT env var, which is
// only set if the server happened to be *launched* with that env var —
// not a reliable reflection of settings.json's configured port.
function resolveMgmtBaseUrl (options, app) {
  if (options && options.mgmtBaseUrl) return options.mgmtBaseUrl

  const settings = app && app.config && app.config.settings
  if (settings && (settings.port || settings.sslport)) {
    const ssl = !!settings.ssl
    const port = ssl ? (settings.sslport || 443) : (settings.port || 3000)
    return `${ssl ? 'https' : 'http'}://localhost:${port}${DEFAULT_MGMT_BASE_PATH}`
  }

  // Fallback for when app.config.settings isn't available (shouldn't
  // normally happen against a real Signal K server, but keeps this
  // function usable in isolation/tests without a full fake app).
  const port = process.env.PORT || 3000
  return `http://localhost:${port}${DEFAULT_MGMT_BASE_PATH}`
}

async function checkStowageMgmtAvailable (baseUrl, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}/webapp-config`, { signal: controller.signal })
    if (!res.ok) {
      return { available: false, error: `signalk-stowage-mgmt responded with HTTP ${res.status}` }
    }
    return { available: true, error: null }
  } catch (err) {
    return { available: false, error: err.message }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { checkStowageMgmtAvailable, resolveMgmtBaseUrl, DEFAULT_MGMT_BASE_PATH }
