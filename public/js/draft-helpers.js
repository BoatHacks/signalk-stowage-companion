// Pure logic pulled out of draft.js so it's unit-testable without a DOM
// (matches the test/frontend convention — see IMPLEMENTATION_CHECKLIST.md).

// UPCItemDB's categoryPath (SPEC.md §4) is a Google product taxonomy split
// into segments, most-general first. The most specific (last) segment is
// usually the best candidate category name to offer the user.
export function suggestedCategoryName (categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return null
  return categoryPath[categoryPath.length - 1]
}

const ELECTRONIC_HINTS = /electronic|electrical|appliance|battery|charger/i

// Whether to bother attempting a manual-PDF search at all (SPEC.md §11's
// "electric/electronic items specifically") — a coarse heuristic over
// UPCItemDB's category taxonomy, not a hard rule. False negatives just mean
// no manual gets offered, which is the same outcome as not finding one.
export function looksElectricOrElectronic (categoryPath) {
  return Array.isArray(categoryPath) && categoryPath.some((segment) => ELECTRONIC_HINTS.test(segment))
}

// Matches an identification-suggested category name against the existing
// signalk-stowage-mgmt category list, case-insensitively — an exact
// case-insensitive match is treated as "already exists" so a re-added item
// of the same kind doesn't spawn a near-duplicate ("Electronics" vs
// "electronics") the way a case-sensitive match would.
export function findExistingCategory (categories, name) {
  if (!name) return null
  const lower = name.trim().toLowerCase()
  return (categories || []).find((c) => c.name.toLowerCase() === lower) || null
}

// GET /locations (signalk-stowage-mgmt README §"Locations") returns a flat
// array in no particular hierarchical order. The location picker needs
// each location grouped under its parent, not the API's own ordering (e.g.
// alphabetical), so a nested location reads as nested rather than as an
// arbitrarily-interleaved flat list. Returns a flat array in depth-first
// tree order, each entry annotated with `depth` (0 for a top-level
// location) so the caller can indent without recomputing ancestry itself.
export function sortLocationsAsTree (locations) {
  const list = locations || []
  const childrenByParent = new Map()
  for (const loc of list) {
    const key = loc.parent_id == null ? null : loc.parent_id
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key).push(loc)
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.name.localeCompare(b.name))
  }

  const result = []
  const seen = new Set()
  function visit (parentId, depth) {
    for (const loc of childrenByParent.get(parentId) || []) {
      if (seen.has(loc.id)) continue // defends against cyclic/bad data
      seen.add(loc.id)
      result.push({ ...loc, depth })
      visit(loc.id, depth + 1)
    }
  }
  visit(null, 0)

  // A location whose parent_id doesn't match any id in the list (a
  // dangling reference — shouldn't normally happen, but data can drift)
  // still needs to show up somewhere rather than silently vanishing from
  // the picker.
  for (const loc of list) {
    if (!seen.has(loc.id)) {
      seen.add(loc.id)
      result.push({ ...loc, depth: 0 })
    }
  }
  return result
}
