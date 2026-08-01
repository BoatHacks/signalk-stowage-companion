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
