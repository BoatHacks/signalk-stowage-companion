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
