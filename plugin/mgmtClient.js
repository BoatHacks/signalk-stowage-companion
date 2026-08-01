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
// the backend needs an absolute URL. There's no documented Signal K plugin
// API to ask the host server "what's your own port," so this defaults to
// localhost + the PORT env var Signal K server itself honors, and falls
// back further to Signal K's own default port. mgmtBaseUrl (plugin config)
// overrides this outright for setups where that guess is wrong.
function resolveMgmtBaseUrl (options) {
  if (options && options.mgmtBaseUrl) return options.mgmtBaseUrl
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
