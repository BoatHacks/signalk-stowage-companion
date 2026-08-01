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
