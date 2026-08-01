# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Plugin skeleton: `plugin.start`/`stop` lifecycle, config schema
  (UPCItemDB API key, SerpApi API key, `signalk-stowage-mgmt` base URL
  override), and a startup reachability check against
  `signalk-stowage-mgmt`'s API, exposed via `GET /status` and
  `POST /status/refresh`.
- Webapp shell: checks `/status` on load and shows an error state if
  `signalk-stowage-mgmt` isn't reachable, otherwise a placeholder for the
  capture flow (not yet built).
- Capture → identify → review → create flow: scan a barcode (or take an
  item photo with no barcode) from a phone browser, look it up via
  UPCItemDB, review/edit the pre-filled name/description/category/
  location/manual on a Draft screen, optionally scan a
  `signalk-stowage-mgmt` location QR label to pre-fill the location, and
  confirm to create the item in `signalk-stowage-mgmt` (with thumbnail,
  manual attachment, and categories as independent best-effort follow-up
  steps — a failure in one doesn't roll back the created item).
- Manual-PDF lookup via SerpApi for items that look electric/electronic,
  proxied server-side through a new `GET /identify/manual/fetch` route so
  the browser can re-upload the PDF to `signalk-stowage-mgmt` without a
  cross-origin fetch.
- Photo-based reverse image search was dropped from MVP scope after
  confirming SerpApi's Google Lens API requires a publicly-hosted image
  URL, which a phone photo on a typically LAN-only Signal K server
  doesn't have — see SPEC.md §11.

### Fixed

- `status-api.js` and `identify-api.js` used a bare relative fetch path,
  which only resolves correctly when the browser's current URL happens to
  end in a trailing slash — every call could 404 depending on how Signal
  K server linked to the plugin webapp. Both now use an absolute base
  path, matching `mgmt-api.js` and `signalk-stowage-mgmt`'s own
  `public/js/api.js` convention.
- The `signalk-stowage-mgmt` startup reachability check now derives its
  target URL from this server's own `app.config.settings`
  (port/sslport/ssl) instead of guessing from the `PORT` env var, and
  treats a 401/403 response as "reachable, Signal K security is enabled"
  rather than "unreachable" — the check itself has no logged-in session,
  so a 401/403 there is expected and doesn't mean `signalk-stowage-mgmt`
  is actually missing.
- Barcode scanning now works on Safari/iOS, which never implemented the
  native Shape Detection API `capture.js` originally depended on. Both
  item-barcode and location-QR-label scanning now go through a vendored,
  MIT-licensed `barcode-detector` ponyfill (ZXing-C++ compiled to
  WebAssembly), with the `.wasm` binary served locally rather than from
  the package's jsDelivr CDN default, so scanning still works with no
  third-party network dependency.
- The location picker in the Draft review screen is now ordered to match
  the actual location tree (parent immediately followed by its children,
  siblings alphabetical) instead of whatever flat order
  `signalk-stowage-mgmt`'s `GET /locations` happens to return.
- The `signalk-stowage-mgmt` startup check now uses the literal IP
  `127.0.0.1` instead of the hostname `localhost`, which Node's fetch can
  resolve to the IPv6 loopback first — if the server only binds IPv4, or
  IPv6 is firewalled silently, that hangs instead of failing fast,
  eventually surfacing as an opaque "This operation was aborted" that
  looks identical to "signalk-stowage-mgmt isn't running." Both the
  `/status` payload and the webapp's error banner now also show the exact
  URL that was tried, with a Retry button (`POST /status/refresh`).
- Barcode/QR detection failures now run a reachability check against the
  vendored `.wasm` file before surfacing an error, so a wrong path or
  missing asset produces a specific, actionable message instead of the
  ponyfill's generic (and — deliberately, to match the native API's own
  wording — misleadingly native-sounding) "Barcode detection service
  unavailable" DOMException.
