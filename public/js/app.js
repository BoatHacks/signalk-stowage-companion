import { html, render, useState, useEffect } from '../vendor/preact-htm-standalone.js'
import { fetchStatus } from './status-api.js'

// Capture/identifying/draft-ready/created flow (SPEC.md §3) isn't built yet —
// this is the plugin skeleton (index.js lifecycle, config schema, the
// signalk-stowage-mgmt dependency check, and this webapp shell). The status
// check below is the one piece of real behavior: it's what SPEC.md §3.1/§5
// means by not letting the user start a capture session against a
// signalk-stowage-mgmt that isn't actually reachable.

function App () {
  const [status, setStatus] = useState({ loading: true, available: null, error: null })

  useEffect(() => {
    let cancelled = false
    fetchStatus().then((s) => {
      if (!cancelled) setStatus({ loading: false, ...s })
    }).catch((err) => {
      if (!cancelled) setStatus({ loading: false, available: false, error: err.message })
    })
    return () => { cancelled = true }
  }, [])

  return html`
    <header>Stowage Companion</header>
    <main>
      ${status.loading ? html`<p class="muted">Checking signalk-stowage-mgmt…</p>` : null}
      ${!status.loading && status.available === false ? html`
        <div class="error-banner">
          <strong>signalk-stowage-mgmt isn't reachable.</strong>
          <p>This plugin needs signalk-stowage-mgmt installed and running on
          this server to create items. ${status.error ? html`<span class="muted">(${status.error})</span>` : null}</p>
        </div>
      ` : null}
      ${!status.loading && status.available ? html`
        <div class="card">
          <p>signalk-stowage-mgmt is reachable.</p>
          <button disabled>Scan / capture an item (coming soon)</button>
        </div>
      ` : null}
    </main>
  `
}

render(html`<${App} />`, document.getElementById('app'))
