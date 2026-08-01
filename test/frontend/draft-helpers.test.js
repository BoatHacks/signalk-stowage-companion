const { test } = require('node:test')
const assert = require('node:assert/strict')

test('suggestedCategoryName picks the most specific taxonomy segment', async () => {
  const { suggestedCategoryName } = await import('../../public/js/draft-helpers.js')
  assert.equal(suggestedCategoryName(['Electronics', 'Communications', 'Mobile Phones']), 'Mobile Phones')
  assert.equal(suggestedCategoryName([]), null)
  assert.equal(suggestedCategoryName(undefined), null)
})

test('looksElectricOrElectronic matches on category taxonomy hints', async () => {
  const { looksElectricOrElectronic } = await import('../../public/js/draft-helpers.js')
  assert.equal(looksElectricOrElectronic(['Electronics', 'Cameras']), true)
  assert.equal(looksElectricOrElectronic(['Home & Garden', 'Batteries & Chargers']), true)
  assert.equal(looksElectricOrElectronic(['Marine', 'Rope & Rigging']), false)
  assert.equal(looksElectricOrElectronic([]), false)
  assert.equal(looksElectricOrElectronic(undefined), false)
})

test('findExistingCategory matches case-insensitively', async () => {
  const { findExistingCategory } = await import('../../public/js/draft-helpers.js')
  const categories = [{ id: 1, name: 'Electronics' }, { id: 2, name: 'Spares' }]
  assert.deepEqual(findExistingCategory(categories, 'electronics'), { id: 1, name: 'Electronics' })
  assert.equal(findExistingCategory(categories, 'Plumbing'), null)
  assert.equal(findExistingCategory(categories, null), null)
})

test('sortLocationsAsTree groups children under their parent, not alphabetically flat', async () => {
  const { sortLocationsAsTree } = await import('../../public/js/draft-helpers.js')
  // Deliberately alphabetical/scrambled input, like a raw API response —
  // "Aft Locker" and "Bilge" are top-level, "Port Bin" and "Starboard Bin"
  // both nest under "Bilge", "Tool Roll" nests under "Aft Locker".
  const locations = [
    { id: 1, name: 'Aft Locker', parent_id: null },
    { id: 2, name: 'Bilge', parent_id: null },
    { id: 3, name: 'Port Bin', parent_id: 2 },
    { id: 4, name: 'Starboard Bin', parent_id: 2 },
    { id: 5, name: 'Tool Roll', parent_id: 1 }
  ]
  const ordered = sortLocationsAsTree(locations)
  assert.deepEqual(ordered.map((l) => [l.name, l.depth]), [
    ['Aft Locker', 0],
    ['Tool Roll', 1],
    ['Bilge', 0],
    ['Port Bin', 1],
    ['Starboard Bin', 1]
  ])
})

test('sortLocationsAsTree sorts siblings alphabetically within each level', async () => {
  const { sortLocationsAsTree } = await import('../../public/js/draft-helpers.js')
  const locations = [
    { id: 1, name: 'Zed Locker', parent_id: null },
    { id: 2, name: 'Alpha Locker', parent_id: null }
  ]
  const ordered = sortLocationsAsTree(locations)
  assert.deepEqual(ordered.map((l) => l.name), ['Alpha Locker', 'Zed Locker'])
})

test('sortLocationsAsTree still includes a location with a dangling parent_id', async () => {
  const { sortLocationsAsTree } = await import('../../public/js/draft-helpers.js')
  const locations = [{ id: 1, name: 'Orphan Bin', parent_id: 999 }]
  const ordered = sortLocationsAsTree(locations)
  assert.deepEqual(ordered.map((l) => [l.name, l.depth]), [['Orphan Bin', 0]])
})

test('sortLocationsAsTree tolerates a cycle instead of looping forever', async () => {
  const { sortLocationsAsTree } = await import('../../public/js/draft-helpers.js')
  const locations = [
    { id: 1, name: 'A', parent_id: 2 },
    { id: 2, name: 'B', parent_id: 1 }
  ]
  const ordered = sortLocationsAsTree(locations)
  assert.equal(ordered.length, 2)
})

test('sortLocationsAsTree handles an empty or missing list', async () => {
  const { sortLocationsAsTree } = await import('../../public/js/draft-helpers.js')
  assert.deepEqual(sortLocationsAsTree([]), [])
  assert.deepEqual(sortLocationsAsTree(undefined), [])
})
