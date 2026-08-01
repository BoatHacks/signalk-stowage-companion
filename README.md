# SignalK Stowage Companion

Capture and identify items with your phone, then file them into
[signalk-stowage-mgmt](https://github.com/BoatHacks/signalk-stowage-mgmt) —
scan a barcode or take a photo, review the pre-filled name/category/
description/manual, confirm, and it's stowed.

See [SPEC.md](SPEC.md) for what this does and why, and
[ARCHITECTURE.md](ARCHITECTURE.md) for how it's built.

## Status

Early scaffold: plugin lifecycle, config schema, and the
`signalk-stowage-mgmt` reachability check are in place; the capture →
identify → review → create flow itself isn't built yet.

## Requires

- Signal K server
- [signalk-stowage-mgmt](https://github.com/BoatHacks/signalk-stowage-mgmt)
  installed and running on the same server — this plugin has no data model
  of its own and creates items through that plugin's REST API.

## Installation

`npm install signalk-stowage-companion` in the server's data directory
(`~/.signalk`), or via the Signal K Admin UI's App Store, then restart the
server. Configure via Admin UI → Plugin Config (UPCItemDB/SerpApi API
keys — see SPEC.md §9).

## Development

```
npm test
```

Runs `node --test` against `test/backend` (real HTTP requests against the
mounted plugin, external lookups mocked) and `test/frontend` (pure
data-layer logic, no DOM).
