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
  ├── plugin/routes/identify.js ── proxies barcode + manual-PDF lookups
  │     │
  │     ▼
  │   UPCItemDB and SerpApi (SPEC.md §5, §11)
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
- `routes/identify.js` — one router module: `POST /identify/barcode`
  (barcode in, candidate name/category/description out — the only
  automated identification path for MVP, per SPEC.md §11) and
  `POST /identify/manual` (given a name/model, search for a manual PDF).
  Calls UPCItemDB (barcode lookups) and SerpApi (manual-PDF web search)
  — see §4, §5. Provider credentials come from Signal K plugin config
  (§9 below), never from the client. No photo/image-search endpoint —
  dropped for MVP (SPEC.md §11).
- `mgmtClient.js` — a thin wrapper around `fetch` calls to
  `signalk-stowage-mgmt`'s API, used only by `index.js`'s startup check
  (§5) — the webapp itself talks to `signalk-stowage-mgmt` directly, not
  through this module.
- No `db.js`, no `tx.js` — nothing here persists (SPEC.md §8).

### 2.2 Frontend SPA (`public/js/`)

- `app.js` — top-level component: capture/identifying/draft-ready/created
  flow state (SPEC.md §3), renders the current step.
- `capture.js` — camera access via a snapped still photo, barcode
  detection via `barcode-detector.js` (§4), item photo capture.
- `barcode-detector.js` — wraps the vendored `barcode-detector` ponyfill,
  pointing its ZXing-wasm reader at the locally-vendored `.wasm` file
  instead of the package's jsDelivr CDN default (§4, §6). Used by both
  `capture.js` (item barcode) and `draft.js` (location QR label).
- `draft.js` — the Draft review screen: editable fields, location picker
  ordered to match the actual location tree (`sortLocationsAsTree` in
  `draft-helpers.js`, calls `signalk-stowage-mgmt`'s `GET /locations`
  directly), category picker/new-category confirmation
  (`GET /categories`), manual attachment preview/remove, and a
  location-QR-label scan (via `barcode-detector.js`) as an alternative
  to the dropdown.
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
| Barcode scanning | [`barcode-detector`](https://github.com/Sec-ant/barcode-detector) (MIT), a Barcode Detection API ponyfill backed by ZXing-C++ compiled to WebAssembly, vendored standalone; used against a snapped still photo (`<input type="file" capture>`), not live video | Used unconditionally, not as a native-API fallback — Safari/iOS never implemented the native Shape Detection API at all, so relying on it would mean no barcode scanning on iOS. Snap-and-decode still needs no `getUserMedia` stream lifecycle handling. The `.wasm` binary is vendored and pointed at locally (not the package's own jsDelivr CDN default) to keep the "no third-party network dependency" property; see `public/js/barcode-detector.js` |
| Barcode/product lookup | [UPCItemDB](https://www.upcitemdb.com/) | Usable free tier (100 lookups/day) for MVP; no scraping/ToS risk. The only automated identification path for MVP — no photo-based path (SPEC.md §11) |
| Manual-PDF search | [SerpApi](https://serpapi.com/) (Google web search) | ToS-compliant, non-scraping; usable free tier (250 searches/month) for MVP. Not used for image search — SerpApi's Google Lens engine requires a publicly-hosted image URL, which a phone photo on a LAN-only Signal K server doesn't have (SPEC.md §11) |
| Testing | `node --test` | Matches `signalk-stowage-mgmt`; same rationale (built-in, no extra devDependency) |
| CI/Release | GitHub Actions, same pattern as `signalk-stowage-mgmt`'s `plugin-ci.yml` / `cut-release.yml` | Consistency; OIDC trusted publishing to npm |

## 5. Integration Points

- **Signal K server plugin API** — `registerWithRouter(router)` (routes
  mounted under `/plugins/signalk-stowage-companion/`), standard
  `plugin.schema`/`plugin.start`/`plugin.stop` lifecycle.
- **`signalk-stowage-mgmt` REST API** (hard dependency) — consumed two
  ways:
  - **Startup check**: `plugin/index.js` calls `GET /plugins/
    signalk-stowage-mgmt/webapp-config` via `mgmtClient.js` when this
    plugin starts. This request carries no Signal K session (it runs
    from this plugin's own backend, not a logged-in browser), so with
    Signal K security enabled it gets a 401/403 back — `mgmtClient.js`
    treats that as "reachable, security is on," not "unreachable,"
    since it proves `signalk-stowage-mgmt`'s route matched and only its
    own security layer intervened (SPEC.md §9). Only a connection
    failure, a 404 (no such route — genuinely not installed), or another
    error status counts as unreachable. Exact
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
- **UPCItemDB** (barcode lookup) and **SerpApi** (manual-PDF web
  search) — external HTTP APIs, called only from
  `plugin/routes/identify.js`, never from the browser directly (keeps
  credentials server-side). See SPEC.md §5, §11 for the choice and
  reasoning, including why photo-based image search isn't part of this.
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
- **Camera/barcode input**: the vendored ZXing-wasm-backed detector
  processes image data only; no dynamic code execution from scanned
  content.
- **Input validation**: proportional to the same single-user,
  typically-security-disabled deployment context as `signalk-stowage-mgmt`
  (a boat's own local network) — no multi-tenant isolation to enforce.

## 7. File Structure

```
plugin/
  index.js               plugin entrypoint, startup dependency check, route registration
  mgmtClient.js           signalk-stowage-mgmt startup-check client
  jsonBody.js             minimal JSON body parser (no express runtime dep, copied from signalk-stowage-mgmt)
  providers/
    upcItemDb.js           barcode lookup (fetchImpl-injectable for tests)
    serpApi.js              manual-PDF web search (fetchImpl-injectable for tests)
  routes/
    status.js               GET /status, POST /status/refresh
    identify.js              POST /identify/barcode, POST /identify/manual, GET /identify/manual/fetch

public/
  package.json            {"type":"module"} — scopes ESM resolution to this
                          directory only, so the CJS plugin/test code is unaffected
  index.html
  style.css
  js/
    app.js                Capturing vs. everything-after-a-capture state
    capture.js             snap-a-photo barcode scan + item photo capture
    draft.js                review screen: identification, category/location pickers, confirm
    draft-helpers.js        pure logic pulled out of draft.js for unit testing
                            (category suggestions, location tree ordering)
    location-qr.js          parses signalk-stowage-mgmt location deep links
    barcode-detector.js     wraps the vendored ponyfill, points it at the
                            local .wasm instead of jsDelivr
    mgmt-api.js             fetch wrapper + create-on-confirm sequence for signalk-stowage-mgmt's API
    identify-api.js         fetch wrapper for this plugin's own /identify routes
    status-api.js           fetch wrapper for this plugin's own /status route
  vendor/
    preact-htm-standalone.js
    barcode-detector/
      ponyfill.js            barcode-detector v3.2.1 (MIT)
      zxing-exported.js      zxing-wasm v3.1.1 JS glue (MIT), bundled by barcode-detector
      zxing_reader.wasm      matching compiled ZXing-C++ reader (Apache-2.0 core)
      LICENSE
  assets/icons/             (not yet populated)

test/
  backend/    real HTTP requests against the mounted plugin; external
              lookups mocked (providers.test.js unit-tests the provider
              modules directly, identify.test.js monkey-patches global.fetch
              for the route-level integration tests)
  frontend/   pure data-layer helper tests (location-qr.js, draft-helpers.js), no DOM
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

- UPCItemDB API key.
- SerpApi API key.
- `signalk-stowage-mgmt` base URL override (`mgmtBaseUrl`) — used only by
  this plugin's own backend for its startup reachability check (§5);
  defaults to `http(s)://localhost:<port>/plugins/signalk-stowage-mgmt`,
  derived from this server's own `app.config.settings.port`/`sslport`/
  `ssl` (the same fields signalk-server itself reads internally, and the
  pattern real-world community plugins use to call back into their own
  server) since a Node backend can't resolve a same-origin relative path
  the way a browser can. Falls back to the `PORT` env var, then port
  3000, only if `app.config.settings` is ever unavailable. The
  browser-side webapp is unaffected by this setting and always calls
  `signalk-stowage-mgmt`
  same-origin/relative, per SPEC.md's same-origin assumption.

## 10. Future Considerations

- **Splitting `signalk-stowage-mgmt` off the same server.** MVP assumes
  same-origin, same-server. If that assumption ever breaks (e.g. a
  multi-server setup), this plugin's `mgmt-api.js`/`mgmtClient.js` calls
  would need a configurable base URL and CORS handling on the
  `signalk-stowage-mgmt` side — not designed now, but the config field
  placeholder above avoids a breaking change if it's needed later.
- **Caching identification results.** UPCItemDB's 100/day and SerpApi's
  250/month free-tier limits are tight enough that a short-lived
  in-memory cache in `plugin/routes/identify.js` (e.g. by barcode value)
  may be worth adding once real usage patterns are known, without
  changing the stateless-backend framing in SPEC.md §8.
- **Manufacturer-site-guessing heuristic for manual search.** Dropped for
  MVP in favor of a single SerpApi query (SPEC.md §11) — revisit only if
  that plain search strategy misses often enough in practice.
- **Quick-restock flow** (SPEC.md §10.2) would reuse the same identify →
  draft → create pipeline with a pre-filled draft from an existing item,
  rather than needing new architecture.
- **Photo-based reverse image search** (SPEC.md §10.2, §11). If pursued
  later: either give a captured photo a temporary public URL before
  calling SerpApi's Google Lens engine, or switch to a provider that
  accepts uploaded bytes directly (e.g. Google Cloud Vision's
  web-detection API) at the cost of a heavier credential setup than a
  plain API key.
- **Live-video barcode scanning.** §4 originally called for
  `getUserMedia`-driven live scanning; still uses snap-a-photo instead
  (now via the vendored `barcode-detector` ponyfill rather than the
  native API, so this applies uniformly across browsers) since live
  video needs real device/browser testing to get stream lifecycle
  handling right, which wasn't practical to do blind. Worth revisiting
  against a real device if snap-and-decode turns out to be too slow a
  loop in practice.
- **Recursive location tree UI.** `draft.js`'s location picker is a flat,
  indented `<select>` (SPEC.md §7's "tree/search picker" scoped down to
  the simplest thing that shows hierarchy at all), now at least ordered
  to match the actual location tree (`sortLocationsAsTree` in
  `draft-helpers.js`) rather than `signalk-stowage-mgmt`'s actual
  recursive tree component with search. Fine for boats with a modest
  location count; revisit if that turns out to not scale.
