# signalk-stowage-companion Architecture

## 1. Overview

A Signal K server plugin with two halves, structurally mirroring
`signalk-stowage-mgmt`: a small stateless Node.js backend (server-provided
router) that proxies identification lookups, and a buildless Preact/htm
single-page webapp served as static files under the same mount point. This
plugin holds no database — every durable write goes through
`signalk-stowage-mgmt`'s REST API on the same server.

```
Phone browser (webapp)
  │  camera / BarcodeDetector
  │  fetch() JSON
  ▼
signalk-server ── mounts plugin router at /plugins/signalk-stowage-companion
  │
  ▼
plugin/index.js ── startup dependency check, route registration
  │
  ├── plugin/routes/identify.js ── proxies barcode/image/manual lookups
  │     │
  │     ▼
  │   external lookup provider(s) (SPEC.md §13, TBD)
  │
  └── (no local database)

Browser also calls, directly, same-origin:
  /plugins/signalk-stowage-mgmt/*  (GET /locations, GET /categories,
                                     POST /items, PATCH .../thumbnail,
                                     POST .../attachments, POST /categories,
                                     POST .../categories)
```

The webapp talks to `signalk-stowage-mgmt` directly from the browser for
reads/writes it owns (§5), and to this plugin's own backend only for the
identification proxy (§2.1) — there's no reason to double-hop identify
results through this plugin's backend before it reaches
`signalk-stowage-mgmt`, since the two calls are independent.

## 2. System Components

### 2.1 Backend plugin (`plugin/`)

- `index.js` — plugin entrypoint: `start`/`stop` lifecycle, config schema,
  registers the identification route, and runs the
  `signalk-stowage-mgmt` presence/version check (§5) before completing
  startup.
- `routes/identify.js` — one router module: `POST /identify` (barcode or
  photo in, candidate name/category/description/photos out) and
  `POST /identify/manual` (given identification results, search for a
  manual PDF). Calls out to whichever external provider(s) SPEC.md §13
  resolves to; provider credentials come from Signal K plugin config
  (§9 below), never from the client.
- `mgmtClient.js` — a thin wrapper around `fetch` calls to
  `signalk-stowage-mgmt`'s API, used only by `index.js`'s startup check
  (§5) — the webapp itself talks to `signalk-stowage-mgmt` directly, not
  through this module.
- No `db.js`, no `tx.js` — nothing here persists (SPEC.md §8).

### 2.2 Frontend SPA (`public/js/`)

- `app.js` — top-level component: capture/identifying/draft-ready/created
  flow state (SPEC.md §3), renders the current step.
- `capture.js` — camera access, `BarcodeDetector` integration and
  vendored-decoder fallback (§4), photo capture.
- `draft.js` — the Draft review screen: editable fields, location picker
  (calls `signalk-stowage-mgmt`'s `GET /locations` directly), category
  picker/new-category confirmation (`GET /categories`), manual
  attachment preview/remove.
- `location-qr.js` — parses a scanned `signalk-stowage-mgmt` location
  label's `location=<id>` query param (SPEC.md §5, §11) to pre-fill the
  Draft's location — pure logic, unit-testable without DOM, matching
  `signalk-stowage-mgmt`'s `qr-label.js` pattern for the inverse
  operation.
- `mgmt-api.js` — thin `fetch()` wrapper for the `signalk-stowage-mgmt`
  endpoints this plugin's webapp calls directly (§5); the create-on-confirm
  sequence (`POST /items` → categories → thumbnail → attachment, with
  per-step failure reporting per SPEC.md §3.2) lives here.
- `identify-api.js` — thin `fetch()` wrapper for this plugin's own
  `/identify` and `/identify/manual` endpoints.

## 3. Data Models

No persistent schema (SPEC.md §8) — see SPEC.md §4 for the Draft's
in-memory shape, held as component state in `app.js` for the duration of
one capture session and discarded on confirm or navigation away.

## 4. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | Node.js (same minimum as `signalk-stowage-mgmt`) | Consistency across the two plugins; no backend feature here needs anything newer |
| Backend framework | None — the server's own router | Matches `signalk-stowage-mgmt`; avoids an `express` runtime dependency |
| Frontend framework | Preact + htm, vendored standalone | Matches `signalk-stowage-mgmt`'s buildless approach (SPEC.md decision, §11) — no bundler, works offline for everything except identification |
| Barcode scanning | Browser `BarcodeDetector` API, with a vendored pure-JS decoder as fallback | `BarcodeDetector` (Chrome/Android) needs no vendored payload or CPU-heavy decode; a vendored fallback (e.g. a `.mjs`-packaged zxing/zbar build, license/size TBD at implementation time) covers browsers without it, keeping the "works from any phone browser" requirement without a build step |
| Testing | `node --test` | Matches `signalk-stowage-mgmt`; same rationale (built-in, no extra devDependency) |
| CI/Release | GitHub Actions, same pattern as `signalk-stowage-mgmt`'s `plugin-ci.yml` / `cut-release.yml` | Consistency; OIDC trusted publishing to npm |

## 5. Integration Points

- **Signal K server plugin API** — `registerWithRouter(router)` (routes
  mounted under `/plugins/signalk-stowage-companion/`), standard
  `plugin.schema`/`plugin.start`/`plugin.stop` lifecycle.
- **`signalk-stowage-mgmt` REST API** (hard dependency) — consumed two
  ways:
  - **Startup check**: `plugin/index.js` calls `GET /plugins/
    signalk-stowage-mgmt/webapp-config` (or another cheap existing
    endpoint) via `mgmtClient.js` when this plugin starts. If
    `signalk-stowage-mgmt` isn't installed/running, or reports an
    incompatible version, this plugin logs a clear startup error and
    does not serve its webapp as if it were usable — failing fast rather
    than letting users hit broken API calls later. Exact
    version-compatibility check (a `package.json` field lookup vs. a
    dedicated version field `signalk-stowage-mgmt` would need to add) is
    an implementation detail to settle against that plugin's actual
    startup-introspection options.
  - **Runtime calls from the browser**: `GET /locations`, `GET
    /categories`, `POST /categories`, `POST /items`, `PATCH
    /items/:id/thumbnail`, `POST /items/:id/attachments`, `POST
    /items/:id/categories` — same-origin, direct from `mgmt-api.js`
    (SPEC.md §6.1). No version check on these calls themselves; the
    startup check is the only compatibility gate.
- **Identification provider(s)** (barcode lookup, image search,
  manual-PDF search/heuristic) — external HTTP APIs, called only from
  `plugin/routes/identify.js`, never from the browser directly (keeps any
  credentials server-side). Concrete provider(s): SPEC.md §13, open.
- **npm registry** — OIDC trusted publishing, same pattern as
  `signalk-stowage-mgmt`.

## 6. Security Considerations

- **Admin-gating**: routes live under `/plugins/signalk-stowage-companion/*`,
  gated by Signal K's own security feature when enabled, same as
  `signalk-stowage-mgmt` — no separate auth layer added here.
- **Identification provider credentials**: held in this plugin's Signal K
  plugin config (§9), read server-side only; never sent to or exposed in
  the browser bundle.
- **`signalk-stowage-mgmt` calls made from the browser**: when Signal K
  security is enabled, these same-origin calls need an already-authenticated
  session, exactly as documented in `signalk-stowage-mgmt`'s README "note
  on auth for this integration" — this plugin doesn't add or bypass that.
- **Uploaded manual PDFs**: fetched server-side from an external source
  and forwarded to `signalk-stowage-mgmt`'s `POST /items/:id/attachments`
  as raw bytes with a server-determined filename/MIME type — not
  trusted/executed by this plugin itself, and `signalk-stowage-mgmt`
  already treats attachments as opaque blobs (no parsing).
- **Camera/barcode input**: `BarcodeDetector` and the vendored fallback
  decoder process image data only; no dynamic code execution from scanned
  content.
- **Input validation**: proportional to the same single-user,
  typically-security-disabled deployment context as `signalk-stowage-mgmt`
  (a boat's own local network) — no multi-tenant isolation to enforce.

## 7. File Structure

```
plugin/
  index.js         plugin entrypoint, startup dependency check, route registration
  mgmtClient.js     signalk-stowage-mgmt startup-check client
  routes/
    identify.js     POST /identify, POST /identify/manual

public/
  index.html
  style.css
  js/
    app.js          capture/identify/draft/create flow state
    capture.js       camera + barcode scanning
    draft.js         review screen
    location-qr.js   parses signalk-stowage-mgmt location deep links
    mgmt-api.js      fetch wrapper for signalk-stowage-mgmt's API
    identify-api.js  fetch wrapper for this plugin's own /identify routes
  vendor/
    preact-htm-standalone.js
    <barcode-decoder>.mjs   (fallback decoder, TBD per §4)
  assets/icons/

test/
  backend/    real HTTP requests against the mounted plugin, external
              lookups mocked
  frontend/   pure data-layer helper tests (location-qr.js, etc.), no DOM
```

No runtime data directory beyond what Signal K allocates for plugin
config — this plugin writes nothing to disk itself (SPEC.md §8).

## 8. Deployment

Installed via the Signal K Admin UI's App Store, or `npm install
signalk-stowage-companion` in the server's data directory, followed by a
restart — same as `signalk-stowage-mgmt`. Requires `signalk-stowage-mgmt`
to already be installed and running on the same server (§5's startup
check enforces this at plugin start rather than failing silently later).
Plugin config (identification provider credentials, any
`signalk-stowage-mgmt` compatibility override) persists under
`~/.signalk/plugin-config-data/signalk-stowage-companion.json`, managed by
signalk-server. No separate deployment step for the webapp — served as
static files by the same plugin process, mounted at
`/plugins/signalk-stowage-companion/`.

## 9. Configuration (implementation of SPEC.md §9)

Signal K plugin config fields:

- Identification provider API key(s) — exact fields depend on SPEC.md
  §13's resolution.
- `signalk-stowage-mgmt` base path override — defaults to same-origin
  (`/plugins/signalk-stowage-mgmt`); not expected to need overriding for
  MVP since both plugins run on the same server, but present in case a
  future deployment splits them (see §9 below, Future Considerations).

## 10. Future Considerations

- **Splitting `signalk-stowage-mgmt` off the same server.** MVP assumes
  same-origin, same-server. If that assumption ever breaks (e.g. a
  multi-server setup), this plugin's `mgmt-api.js`/`mgmtClient.js` calls
  would need a configurable base URL and CORS handling on the
  `signalk-stowage-mgmt` side — not designed now, but the config field
  placeholder above avoids a breaking change if it's needed later.
- **Caching identification results.** If lookup providers turn out to be
  slow or rate-limited in practice, `plugin/routes/identify.js` could grow
  a short-lived in-memory cache (e.g. by barcode value) without changing
  the stateless-backend framing in SPEC.md §8 — worth revisiting once
  §13's providers are chosen and real latency/rate-limit numbers exist.
- **Quick-restock flow** (SPEC.md §10.2) would reuse the same identify →
  draft → create pipeline with a pre-filled draft from an existing item,
  rather than needing new architecture.
