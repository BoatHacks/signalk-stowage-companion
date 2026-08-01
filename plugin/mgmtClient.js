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
// Literal 127.0.0.1, not the hostname "localhost" — Node's fetch (undici)
// can resolve "localhost" to the IPv6 loopback (::1) first. If the server
// only binds IPv4, or IPv6 is firewalled by silently dropping packets
// rather than actively refusing the connection, that attempt doesn't fail
// fast — it hangs until something times it out, surfacing as "This
// operation was aborted" once checkStowageMgmtAvailable's own timeout
// fires, which looks identical to "signalk-stowage-mgmt isn't running" but
// isn't. A literal IPv4 address sidesteps the DNS resolution step (and the
// dual-stack ambiguity) entirely.
const LOOPBACK = '127.0.0.1'

function resolveMgmtBaseUrl (options, app) {
  if (options && options.mgmtBaseUrl) return options.mgmtBaseUrl

  const settings = app && app.config && app.config.settings
  if (settings && (settings.port || settings.sslport)) {
    const ssl = !!settings.ssl
    const port = ssl ? (settings.sslport || 443) : (settings.port || 3000)
    return `${ssl ? 'https' : 'http'}://${LOOPBACK}:${port}${DEFAULT_MGMT_BASE_PATH}`
  }

  // Fallback for when app.config.settings isn't available (shouldn't
  // normally happen against a real Signal K server, but keeps this
  // function usable in isolation/tests without a full fake app).
  const port = process.env.PORT || 3000
  return `http://${LOOPBACK}:${port}${DEFAULT_MGMT_BASE_PATH}`
}

async function checkStowageMgmtAvailable (baseUrl, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}/webapp-config`, { signal: controller.signal })
    // 401/403 means the request reached signalk-stowage-mgmt and its route
    // matched — Signal K's own security layer rejected it because this
    // check runs from this plugin's backend with no logged-in session, not
    // because signalk-stowage-mgmt is missing. That's expected and fine:
    // the browser calls that actually matter (SPEC.md §6.1) go through the
    // user's own session, exactly as signalk-stowage-mgmt's README already
    // documents for other same-origin callers. Anything else non-OK (404 —
    // no such route, meaning the plugin genuinely isn't installed; 5xx;
    // a network-level failure below) means it's actually unreachable.
    if (res.status === 401 || res.status === 403) {
      return { available: true, error: null, securityEnabled: true, baseUrl }
    }
    if (!res.ok) {
      return { available: false, error: `signalk-stowage-mgmt responded with HTTP ${res.status}`, baseUrl }
    }
    return { available: true, error: null, baseUrl }
  } catch (err) {
    // err.name is 'AbortError' when the timeout above fired — "the request
    // never got a response," not "the request failed outright" (e.g. an
    // immediate ECONNREFUSED throws a different, more specific message).
    // Surfacing the distinction (and the URL that hung) turns "isn't
    // reachable" from a dead end into something actually debuggable.
    const detail = err.name === 'AbortError' ? `timed out after ${timeoutMs}ms with no response` : err.message
    return { available: false, error: detail, baseUrl }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { checkStowageMgmtAvailable, resolveMgmtBaseUrl, DEFAULT_MGMT_BASE_PATH }
