# signalk-stowage-companion Specification

## 1. Introduction

### 1.1 Purpose

`signalk-stowage-companion` is a Signal K server plugin that makes adding
items to a boat's stowage inventory fast enough to actually happen, from a
phone, in the moment an item is stowed. It is a **capture front-end**, not
its own inventory system: it captures a photo and/or barcode scan of an
item, identifies it from the barcode where possible, enriches it with a
name/category/description and, where applicable, a manufacturer's manual
PDF, and then creates it in
[`signalk-stowage-mgmt`](https://github.com/BoatHacks/signalk-stowage-mgmt)
via that plugin's REST API — the same system that already owns locations,
quantities, expiry tracking, and attachments.

The problem this solves: manually typing an item's name, picking a
category, and finding its manual is enough friction that inventories don't
get kept up to date. Point a phone at the item, scan its barcode or take a
photo, confirm a few pre-filled fields, and it's filed — including its
manual, without hunting for a PDF later when it's actually needed.

This is a **larger-crew/charter-boat** tool: multiple people are expected
to add items, not just one owner who already knows the boat.

### 1.2 Background

This plugin has one hard dependency: `signalk-stowage-mgmt`, which must be
installed and running on the same Signal K server. `signalk-stowage-mgmt`
owns the Location and Item data models and their REST API (`/plugins/
signalk-stowage-mgmt/*`) — this plugin has no database of its own for
those entities. See that project's SPEC.md/README.md for the authoritative
data model and API contract; this document only describes what's specific
to the companion's capture flow.

`signalk-stowage-mgmt` already supports scanning a printed QR label on a
storage space or container, which deep-links to
`<base-url>/plugins/signalk-stowage-mgmt/?location=<location-id>`. This
plugin reads that same label format (see §5) to pre-select a location
during capture, rather than inventing a second label scheme.

### 1.3 Terminology

- **Capture** — the phone-camera step that produces a barcode value and/or
  one or more photos of an item, before any identification has happened.
- **Identification** — the process of turning a scanned barcode into a
  candidate name, category, and description, via barcode lookup. May fail
  or return nothing usable. A capture with no barcode (photo only) has no
  identification step for MVP — see §11's photo-identification decision.
- **Draft** — an in-progress, not-yet-created item: the editable,
  pre-filled result of identification, shown on the review screen. Exists
  only in the companion app's UI state until the user confirms it.
- **Location** — a `signalk-stowage-mgmt` storage space or container, as
  defined in that plugin's SPEC.md §1.3. This plugin only reads locations
  (via `GET /locations` or a scanned location QR label); it never creates,
  renames, or moves them.

## 2. Domain Rules

- An item cannot be created without a location, unless the user explicitly
  chooses to leave it unlocated — matching `signalk-stowage-mgmt`, where
  `location_id` is optional on `POST /items`.
- A draft is never written to `signalk-stowage-mgmt` until the user
  confirms it on the review screen. Identification results (however
  confident) are proposals, not writes.
- A category suggested by identification that doesn't already exist in
  `signalk-stowage-mgmt` requires explicit user confirmation before this
  plugin creates it via `POST /categories` — identification never creates
  categories silently.
- This plugin never bypasses `signalk-stowage-mgmt`'s own invariants (e.g.
  category name uniqueness, non-negative quantities) — it only calls that
  plugin's API, which enforces them.

## 3. State / Lifecycle Model

### 3.1 State Definitions

A capture session moves through:

1. **Capturing** — user is taking a photo and/or scanning a barcode.
2. **Identifying** — companion is querying online sources (barcode lookup,
   then manual search if the item looks electric/electronic); async, may
   take a few seconds. Skipped entirely for a photo-only capture (no
   barcode) — see §11.
3. **Draft ready** — a review screen with pre-filled (possibly empty)
   fields: name, category (existing or new-pending-confirmation),
   description, location, item photo, manual attachment (if found).
4. **Created** — the user confirmed; the item now exists in
   `signalk-stowage-mgmt` (this plugin's job for that item is done — all
   further edits happen in `signalk-stowage-mgmt`'s own UI).

### 3.2 Transitions

- Capturing → Identifying: automatic once a barcode is scanned. A
  photo-only capture (no barcode) skips straight to Draft ready with
  blank fields plus the captured photo — same end state as a failed
  lookup, just without attempting one (§11).
- Identifying → Draft ready: always, whether or not identification found
  anything — a failed/empty lookup produces a draft with blank fields plus
  the captured photo (see §11, no-match handling).
- Draft ready → Draft ready: any field edit, including replacing/adding
  photos, changing location (including via a scanned location QR label),
  or removing the suggested manual attachment.
- Draft ready → Created: user taps confirm. This performs, in order:
  `POST /items` (with location, quantity defaults, category ids for
  already-existing categories), any needed `POST /categories` for
  newly-confirmed categories followed by attaching them, `PATCH /items/
  :id/thumbnail` for the item photo, and `POST /items/:id/attachments` for
  the manual PDF if one was found and kept. If any step after item
  creation fails, the item still exists in `signalk-stowage-mgmt` (partial
  success) — the review screen reports which follow-up step failed and
  lets the user retry it, rather than rolling back the created item.
- No state allows editing an item that's already Created — that's
  `signalk-stowage-mgmt`'s job from that point on.

## 4. Data Model

This plugin holds no persistent domain entities of its own (see §8). Its
only in-memory/session-lived shape is the **Draft**:

- `barcode` (string, optional — present if capture started from a scan)
- `photos` (0–4 user-taken photo blobs of the item)
- `name`, `description` (strings, editable, pre-filled by identification)
- `category` — either an existing category (`{ id, name }`) or a
  pending-new category name (string) awaiting user confirmation
- `location_id` (nullable — from `GET /locations` picker or a scanned
  location QR label)
- `manual` — an optional candidate PDF (source URL + fetched bytes) found
  via manual search, removable before create
- `identification_status` — `pending` | `matched` | `no_match` | `failed`
  (network/error), drives what the review screen shows and whether a
  retry action is offered

Once confirmed, the draft is discarded — the created Item, its thumbnail,
its attachments, and its category associations are `signalk-stowage-mgmt`
entities from that point on, per that plugin's SPEC.md §3.

## 5. Sources / Inputs

- **Phone camera** — barcode scan and item photo(s). Requires browser
  camera permission.
- **Barcode/product lookup** — [UPCItemDB](https://www.upcitemdb.com/)
  resolves a scanned barcode to a candidate name/category/description.
  Free tier: 100 lookups/day. The only automated identification path for
  MVP (§11) — a photo-only capture has no equivalent lookup.
- **Manual search** — a SerpApi web search for `"<brand> <model> manual
  filetype:pdf"`, for electric/electronic items specifically. No
  manufacturer-site-guessing step (see §11) — one search strategy, kept
  simple for MVP.
- **`signalk-stowage-mgmt` REST API** — `GET /locations` for the location
  picker; `GET /categories` for existing categories; all writes on
  confirm (§3.2). This is a same-origin, same-server dependency, not an
  internet source.
- **Scanned location QR label** — a `signalk-stowage-mgmt`-generated label
  encoding `<base-url>/plugins/signalk-stowage-mgmt/?location=<id>` (see
  that plugin's SPEC.md §5.1, §9.2). This plugin parses the `location`
  query param out of a scanned label to pre-select a location, without
  navigating away from the companion app.

If the barcode/image/manual sources are unreachable (no internet), the
Capturing → Identifying → Draft ready flow still completes: identification
degrades to `identification_status: failed`, producing a blank editable
draft with just the captured photo(s). Location picking, item photo
capture, and item creation against `signalk-stowage-mgmt` are unaffected,
since that dependency is same-server/same-LAN, not internet-dependent
(§9).

## 6. API Specification

This plugin's own server-side surface (under `/plugins/
signalk-stowage-companion/`) is limited to what needs to run
server-side: proxying the UPCItemDB/SerpApi identification lookups (to
keep API keys off the client, §9) and serving the webapp. Exact endpoint
shapes are an ARCHITECTURE-level concern (see ARCHITECTURE.md §2.1); this
plugin has no REST contract that other plugins are expected to depend on
(contrast `signalk-stowage-mgmt`'s "Known external consumers," §1.2).

### 6.1 Consumed: `signalk-stowage-mgmt` REST API

The subset of `signalk-stowage-mgmt`'s API (see that plugin's README.md
§"API") this plugin depends on:

| Method & path | Used for |
|---|---|
| `GET /locations` | Location picker |
| `GET /categories` | Existing-category matching/picker |
| `POST /categories` | Creating a new category, only after user confirmation |
| `POST /items` | Creating the item on draft confirmation |
| `PATCH /items/:id/thumbnail` | Setting the item photo |
| `POST /items/:id/attachments` | Uploading a found manual PDF |
| `POST /items/:id/categories` | Attaching category ids to the new item |

This plugin treats `signalk-stowage-mgmt`'s API as an external contract
with no version negotiation (per that plugin's own README.md note) — a
breaking change there silently breaks this integration, same caveat that
applies to `signalk-maintenance-tracker` today.

## 7. User Interface

Primary flow, phone-first:

1. **Capture** — big "scan barcode" / "take photo" actions.
2. **Identifying** — brief loading state while the barcode lookup runs
   (skipped for a photo-only capture — straight to Review).
3. **Review** (the Draft, §3/§4) — pre-filled, fully editable: name,
   category (existing chip picker + "add new" needing confirmation),
   description, location (tree/search picker, or pre-filled from a
   scanned location QR label), item photo (the captured photo), manual
   PDF (shown if found, removable). A "retry identification" action is
   available when `identification_status` is `failed`.
4. **Confirm** → creates the item in `signalk-stowage-mgmt` (§3.2); on
   success, offer "add another" to loop back to Capture.

Design constraints: phone-first (unlike `signalk-stowage-mgmt`, which also
targets MFD touchscreens — this plugin's camera-driven flow assumes a
phone). Should visually feel consistent with `signalk-stowage-mgmt`'s
webapp where reasonable, but is a separate plugin webapp, not a tab within
it.

## 8. Persistence

This plugin persists nothing durable of its own. A Draft (§4) lives only
in browser/session state until confirmed or discarded — if the user closes
the tab mid-review, the draft is lost and capture starts over. All durable
state (items, locations, categories, attachments, thumbnails) lives in
`signalk-stowage-mgmt`'s database, reached only through its REST API.

## 9. Configuration

- **`signalk-stowage-mgmt` base URL / same-origin assumption** — MVP
  assumes both plugins run on the same Signal K server and this plugin
  calls the other's API same-origin (`/plugins/signalk-stowage-mgmt/*`);
  no cross-server configuration for MVP.
- Identification provider credentials — a UPCItemDB API key and a SerpApi
  API key, both user-supplied Signal K plugin config fields. Both
  providers work on their free tier for MVP (100 barcode lookups/day,
  250 SerpApi searches/month); a boat exceeding that on either service is
  a scaling problem for a later release, not MVP's concern.
- Signal K's own security setting governs API access the same way it
  governs `signalk-stowage-mgmt` itself (see that plugin's README.md "A
  note on auth for this integration") — this plugin adds no separate auth
  layer of its own. This plugin's own startup reachability check (§3)
  runs from its backend with no logged-in session, so with security
  enabled it gets a 401/403 from `signalk-stowage-mgmt` — treated as
  "reachable, security is on" rather than "unreachable," since the
  browser calls that actually create items (§6.1) go through the user's
  own session, same as any other same-origin caller.

## 10. MVP Scope

### 10.1 MVP Features

- Barcode scan and/or item photo capture from a phone browser.
- Identification: barcode → product lookup only (§11) — a photo-only
  capture goes straight to a blank, editable draft with the captured
  photo.
- Manual PDF lookup for electric/electronic items via a single SerpApi
  web search (§11).
- Review/edit screen (Draft) before anything is written.
- Location selection via `GET /locations` picker or scanning a
  `signalk-stowage-mgmt` location QR label.
- Category assignment from existing categories, or creating a new one
  with explicit user confirmation.
- Item creation in `signalk-stowage-mgmt` (item + thumbnail + manual
  attachment + categories) on confirm.
- Graceful degradation to a blank, manually-fillable draft when
  identification fails, returns nothing, or there's no internet.

### 10.2 Post-MVP / Deferred

- **Search / "where is X"** — deferred; this is `signalk-stowage-mgmt`'s
  Inventory/Overview tabs' job, not this capture-focused plugin's.
- **Quantity / low-stock tracking beyond item creation** — deferred;
  `signalk-stowage-mgmt` already owns `actual_quantity`/`target_quantity`
  editing after creation.
- **Expiry dates** — deferred; `signalk-stowage-mgmt` supports
  `expires_at` on items already, but this plugin's MVP capture flow
  doesn't set it. Revisit once the core capture loop is solid.
- **Multi-user attribution** (who added an item) — deferred; not tracked
  by this plugin or, currently, by `signalk-stowage-mgmt`.
- **SignalK vessel-data tie-ins** (e.g. linking a spare part to a live
  system/path) — explicitly out of scope; this plugin (and
  `signalk-stowage-mgmt`) are fully independent of live Signal K data
  streams.
- **"Add another one of these" quick-restock flow** — deferred; a natural
  follow-up once the core capture-and-create loop ships.
- **Photo-based reverse image search** — deferred; SerpApi's Google Lens
  API needs a publicly-hosted image URL, which a phone photo captured on
  a boat's (typically LAN-only) Signal K server doesn't have. Revisit if
  a reasonable way to give a captured photo a temporary public URL (or a
  different provider that accepts uploaded bytes directly) turns out to
  be worth the added infrastructure — see §11.

## 11. Design Decisions

- **Capture front-end, not a second inventory store.** Considered building
  this plugin with its own item/location tables and syncing to
  `signalk-stowage-mgmt`, but rejected it — two systems of record for the
  same items invites drift, and `signalk-stowage-mgmt` already has a
  mature, tested data model and API. This plugin only ever writes through
  that API.
- **Review-before-create, not create-then-edit.** A wrong barcode match or
  a bad image-search guess is common enough that writing directly to
  `signalk-stowage-mgmt` on identification would pollute the shared
  inventory with junk items. The review screen costs one extra tap but
  keeps `signalk-stowage-mgmt`'s data trustworthy for the whole crew.
- **New categories need confirmation, never silent creation.**
  `signalk-stowage-mgmt` enforces unique category names; auto-creating
  from a noisy online guess risks near-duplicate categories
  ("Electronic" vs "Electronics") accumulating over time. A one-tap
  confirm is cheap; cleanup later isn't.
- **Reuse `signalk-stowage-mgmt`'s QR label format instead of a new one.**
  That plugin already has printed labels on lockers encoding a deep link
  with `location=<id>`. Inventing a second label/encoding for this plugin
  would mean either two sets of physical labels on the boat or this
  plugin re-deriving location ids some other way — reading the existing
  label's query param is strictly simpler.
- **No rollback on partial create failure.** If the item is created but
  the thumbnail or attachment upload fails afterward, this plugin doesn't
  delete the item — a half-filled-in item that exists is more useful and
  less surprising than one that silently vanished after the user thought
  they'd confirmed it. The review screen instead reports which step
  failed and offers retry.
- **UPCItemDB for barcode lookup, SerpApi for manual-PDF search.** Both
  have usable free tiers for MVP and neither requires scraping (unlike
  several "Google Lens API" offerings that are ToS-risky
  reverse-engineered scrapers) — SerpApi is a paid, ToS-compliant service
  that happens to also have a free tier. SerpApi was originally also
  meant to cover photo-based image search, but that's dropped for MVP —
  see the photo-identification decision below.
- **No manufacturer-site-guessing heuristic for manual search.**
  Originally considered trying to derive a manufacturer's own
  support/downloads domain from the brand name before falling back to a
  general search, but dropped for MVP — deriving a reliable domain from a
  brand string (handling subsidiaries, regional TLDs, rebrands) is a
  real design problem on its own, and a single SerpApi query for `"<brand>
  <model> manual filetype:pdf"` gets most of the same result with one
  code path instead of two. Revisit only if the plain search strategy
  turns out to miss often enough in practice to justify the complexity.
- **Photo-only capture skips identification entirely for MVP, rather than
  attempting reverse image search.** Discovered while implementing: SerpApi's
  Google Lens API requires a publicly-hosted image URL, not uploaded bytes
  or a data URI — confirmed against SerpApi's own documentation, which
  states the `url` parameter must point at an already-public image. A
  boat's Signal K server is typically LAN-only, so a phone photo captured
  there has no public URL to hand SerpApi without adding real
  infrastructure (temporary cloud hosting, or a provider that accepts
  direct uploads, e.g. Google Cloud Vision's web-detection API — heavier
  to configure than a plain API key). Barcode lookup (UPCItemDB) and
  manual-PDF search (a text-only SerpApi query) are unaffected — this
  only narrows what happens when there's no barcode to scan. See §10.2.
- **Offline degrades identification only, not the whole flow.**
  `signalk-stowage-mgmt` is explicitly designed to work with no internet;
  since this plugin talks to it same-server, there's no reason capture,
  location-picking, and item creation should require internet too — only
  the online-lookup step needs it, and it degrades to manual entry rather
  than blocking the rest of the flow.

## 12. References

- [`signalk-stowage-mgmt`](https://github.com/BoatHacks/signalk-stowage-mgmt)
  — SPEC.md (data model, terminology), README.md (full API reference,
  "Known external consumers" section, QR label deep-link contract).

## 13. Open Questions

None outstanding — the identification-provider questions this section
originally tracked were resolved during the ARCHITECTURE brainstorm (see
§11 for the choices and reasoning).
