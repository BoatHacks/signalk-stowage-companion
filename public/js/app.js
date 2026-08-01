import { html, render, useState, useEffect } from '../vendor/preact-htm-standalone.js'
import { fetchStatus } from './status-api.js'
import { CaptureView } from './capture.js'
import { DraftView } from './draft.js'
import { parseLocationIdFromUrl } from './location-qr.js'

// Capturing -> Identifying -> Draft ready -> Created (SPEC.md §3). The
// Identifying step lives inside DraftView itself (it needs the same
// component lifecycle as the fields it fills in), so this top level only
// tracks Capturing vs. everything-after-a-capture.
function App () {
  const [status, setStatus] = useState({ loading: true, available: null, error: null })
  const [capture, setCapture] = useState(null)
  const [presetLocationId] = useState(() => parseLocationIdFromUrl(window.location.href))

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
      ${!status.loading && status.available && status.securityEnabled ? html`
        <p class="muted">Signal K security is enabled — make sure you're logged in, since item creation calls signalk-stowage-mgmt with your browser session.</p>
      ` : null}
      ${!status.loading && status.available && !capture ? html`
        <${CaptureView} onCaptured=${(c) => setCapture({ ...c, presetLocationId })} />
      ` : null}
      ${!status.loading && status.available && capture ? html`
        <${DraftView} capture=${capture} onDiscard=${() => setCapture(null)} />
      ` : null}
    </main>
  `
}

render(html`<${App} />`, document.getElementById('app'))
