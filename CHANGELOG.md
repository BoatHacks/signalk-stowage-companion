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
