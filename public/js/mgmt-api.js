// Thin fetch wrapper for the signalk-stowage-mgmt endpoints this plugin's
// webapp calls directly, same-origin (SPEC.md §6.1, ARCHITECTURE.md §5).
// Absolute path rather than a relative one, so it resolves the same way
// regardless of exactly where within this plugin's webapp a call is made
// from — still same-origin, just not path-relative to the current page.
const MGMT_BASE = '/plugins/signalk-stowage-mgmt'

async function request (method, path, { json, raw, headers } = {}) {
  const opts = { method, headers: { ...headers } }
  if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(json)
  } else if (raw !== undefined) {
    opts.body = raw
  }
  const res = await fetch(MGMT_BASE + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

export async function listLocations () {
  return request('GET', '/locations')
}

export async function listCategories () {
  return request('GET', '/categories')
}

export async function createCategory (name) {
  return request('POST', '/categories', { json: { name } })
}

export async function createItem ({ name, locationId, categoryIds, notes }) {
  return request('POST', '/items', {
    json: {
      name,
      location_id: locationId ?? null,
      category_ids: categoryIds && categoryIds.length ? categoryIds : undefined,
      notes: notes || undefined
    }
  })
}

export async function attachCategory (itemId, categoryId) {
  return request('POST', `/items/${itemId}/categories`, { json: { category_id: categoryId } })
}

export async function setThumbnail (itemId, dataUri) {
  return request('PATCH', `/items/${itemId}/thumbnail`, { json: { thumbnail: dataUri } })
}

export async function uploadAttachment (itemId, blob, filename, mimeType) {
  return request('POST', `/items/${itemId}/attachments`, {
    raw: blob,
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'X-Filename': encodeURIComponent(filename || 'attachment')
    }
  })
}

// Runs the Draft → Created write sequence (SPEC.md §3.2): create the item
// (with location and already-existing categories inline), then attach any
// newly-confirmed categories, the item photo, and the manual PDF as
// independent best-effort follow-up steps. No rollback on a follow-up
// failure (SPEC.md §11) — the item exists either way, and each step's
// outcome is reported separately so the caller can offer a per-step retry.
export async function createItemFromDraft (draft) {
  const outcome = { itemId: null, steps: {}, errors: {} }

  let item
  try {
    item = await createItem({
      name: draft.name,
      locationId: draft.locationId,
      categoryIds: draft.existingCategoryIds
    })
    outcome.itemId = item.id
    outcome.steps.create = 'ok'
  } catch (err) {
    outcome.steps.create = 'failed'
    outcome.errors.create = err.message
    return outcome
  }

  if (draft.newCategoryNames && draft.newCategoryNames.length) {
    try {
      for (const name of draft.newCategoryNames) {
        const category = await createCategory(name)
        await attachCategory(item.id, category.id)
      }
      outcome.steps.categories = 'ok'
    } catch (err) {
      outcome.steps.categories = 'failed'
      outcome.errors.categories = err.message
    }
  }

  if (draft.thumbnailDataUri) {
    try {
      await setThumbnail(item.id, draft.thumbnailDataUri)
      outcome.steps.thumbnail = 'ok'
    } catch (err) {
      outcome.steps.thumbnail = 'failed'
      outcome.errors.thumbnail = err.message
    }
  }

  if (draft.manual && draft.manual.blob) {
    try {
      await uploadAttachment(item.id, draft.manual.blob, draft.manual.filename, draft.manual.mimeType)
      outcome.steps.attachment = 'ok'
    } catch (err) {
      outcome.steps.attachment = 'failed'
      outcome.errors.attachment = err.message
    }
  }

  return outcome
}
