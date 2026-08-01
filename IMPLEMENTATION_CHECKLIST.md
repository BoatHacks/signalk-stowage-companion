# Implementation Checklist - Quick Reference

**Before implementing a feature, work through this in order:**

## Phase 1: Explore
- [ ] Read the relevant GitHub issue fully
- [ ] Read the relevant sections of `SPEC.md`
- [ ] Read the relevant sections of `ARCHITECTURE.md`
- [ ] If the change touches the `signalk-stowage-mgmt` integration, check
      that plugin's README.md API section against what this plugin
      currently assumes — its API has no version negotiation (SPEC.md
      §6.1), so a drift there fails silently, not loudly
- [ ] Explore existing code before writing anything — check for an
      existing pattern (e.g. `registerXRoutes` route modules,
      `act()`-style action creators) before inventing a new one

## Phase 2: Plan
- [ ] Think through the approach and alternatives
- [ ] Write a short implementation plan (see `docs/plans/plan-template.md`)
      for anything bigger than a one-file fix
- [ ] Identify test scenarios up front, including the offline/no-match
      degradation paths (SPEC.md §3.2, §9) — these are easy to forget
      since the happy path is the one that's fun to build

## Phase 3: Implement & Test
- [ ] Write the code
- [ ] Add/update tests alongside it: `test/backend/` for `/identify`
      route changes (external lookups mocked, never called for real in
      tests), `test/frontend/` for pure logic (`location-qr.js`, etc.),
      no DOM/JSDOM
- [ ] Run tests frequently while working, not just at the end
- [ ] If a test seems wrong, fix the test deliberately — don't loosen it
      just to get to green

## Phase 4: Verify
- [ ] Check edge cases, not just the happy path — especially: no
      internet during identification, a barcode/photo with no usable
      match, a partial failure after item creation (SPEC.md §3.2's
      thumbnail/attachment-step failure handling)
- [ ] Confirm the change matches `SPEC.md`
- [ ] Confirm the change follows `ARCHITECTURE.md`
- [ ] Run the full suite for real (`node --test`) before considering the
      change done

## Phase 5: Document & Commit
- [ ] Update `SPEC.md`/`ARCHITECTURE.md` if this change altered what they
      describe
- [ ] Update `CHANGELOG.md`'s `[Unreleased]` section (or add one) if this
      is user-visible
- [ ] Remove any temporal language from comments ("new", "recently
      added") — comments should read correctly a year from now
- [ ] All tests pass
- [ ] Commit with a message that explains *why*, referencing the issue

---

## Common Mistakes to Avoid

**Don't:**
- Jump straight to coding before reading SPEC/ARCHITECTURE
- Loosen a test to make it pass instead of fixing the real issue
- Leave SPEC.md/ARCHITECTURE.md stale after a change that contradicts them
- Add a runtime dependency (npm package, CDN script) when vendoring a
  single file would do — this project deliberately stays buildless,
  matching `signalk-stowage-mgmt`
- Call an identification provider directly from the browser — API keys
  stay server-side (`plugin/routes/identify.js`), per ARCHITECTURE.md §6
- Write an item to `signalk-stowage-mgmt` without going through the
  review/confirm Draft step (SPEC.md §3.2, §11) — identification results
  are proposals, never auto-committed

**Do:**
- Explore before planning, plan before coding
- Write down the plan somewhere reviewable, even briefly
- Verify against the docs, not just against your own memory of the task
- Treat `signalk-stowage-mgmt`'s API as an external contract — read
  before assuming a shape, per its own README.md "Known external
  consumers" caveat
