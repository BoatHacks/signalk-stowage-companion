import { html, useState, useEffect, useRef, useCallback, useMemo } from '../vendor/preact-htm-standalone.js'
import { listLocations, listCategories, createItemFromDraft } from './mgmt-api.js'
import { identifyBarcode, searchManual, fetchManualPdf } from './identify-api.js'
import { suggestedCategoryName, looksElectricOrElectronic, findExistingCategory, sortLocationsAsTree } from './draft-helpers.js'
import { parseLocationIdFromUrl } from './location-qr.js'
import { BarcodeDetector } from './barcode-detector.js'

function fileToDataUri (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function DraftView ({ capture, onDiscard }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [locationId, setLocationId] = useState(capture.presetLocationId || null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [pendingCategoryName, setPendingCategoryName] = useState('')
  const [manual, setManual] = useState(null) // { status, url, title } | { status: 'none' }
  const [manualBlob, setManualBlob] = useState(null)
  const [identificationStatus, setIdentificationStatus] = useState(capture.barcode ? 'pending' : 'no_barcode')
  const [identificationError, setIdentificationError] = useState(null)
  const [categoryPath, setCategoryPath] = useState([])
  const [brand, setBrand] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOutcome, setCreateOutcome] = useState(null)
  const photoInputRef = useRef(null)
  const locationScanInputRef = useRef(null)
  const [photoDataUri, setPhotoDataUri] = useState(null)

  useEffect(() => {
    listLocations().then(setLocations).catch(() => setLocations([]))
    listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    if (capture.photo) fileToDataUri(capture.photo).then(setPhotoDataUri)
  }, [capture.photo])

  const runIdentification = useCallback(async () => {
    if (!capture.barcode) return
    setIdentificationStatus('pending')
    setIdentificationError(null)
    try {
      const result = await identifyBarcode(capture.barcode)
      if (result.status === 'matched') {
        setName(result.name || '')
        setDescription(result.description || '')
        setBrand(result.brand || '')
        setCategoryPath(result.categoryPath || [])
        const suggestion = suggestedCategoryName(result.categoryPath)
        if (suggestion) {
          const existing = findExistingCategory(categories, suggestion)
          if (existing) setSelectedCategoryIds([existing.id])
          else setPendingCategoryName(suggestion)
        }
      }
      setIdentificationStatus(result.status)
    } catch (err) {
      setIdentificationStatus('failed')
      setIdentificationError(err.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.barcode, categories])

  useEffect(() => { runIdentification() }, [])

  // Manual search only once a name is known and it looks electric/
  // electronic (SPEC.md §11) — re-runs if the identified name/category
  // changes, not on every keystroke of a manually-typed name.
  useEffect(() => {
    if (!name || !looksElectricOrElectronic(categoryPath)) return
    let cancelled = false
    searchManual(name, brand).then((result) => {
      if (!cancelled) setManual(result.status === 'matched' ? result : { status: 'none' })
    }).catch(() => { if (!cancelled) setManual({ status: 'none' }) })
    return () => { cancelled = true }
  }, [name, brand, categoryPath])

  useEffect(() => {
    if (manual && manual.status === 'matched' && !manualBlob) {
      fetchManualPdf(manual.url).then(setManualBlob).catch(() => {})
    }
  }, [manual])

  const handleAddPhoto = useCallback((e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (file) fileToDataUri(file).then(setPhotoDataUri)
  }, [])

  // Scans a signalk-stowage-mgmt location QR label (SPEC.md §1.2, §5) the
  // same way capture.js scans an item barcode: snap a still photo, run
  // BarcodeDetector against it, then pull the location id out of the deep
  // link it encodes rather than requiring the location dropdown below.
  const handleLocationScan = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      const results = await detector.detect(file)
      const raw = results[0] && results[0].rawValue
      const id = raw ? parseLocationIdFromUrl(raw) : null
      if (id) setLocationId(id)
    } catch (err) {
      // Scan failed or nothing recognizable — the dropdown below still
      // works, so this is silently a no-op rather than an error banner.
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    setCreating(true)
    const draft = {
      name,
      locationId,
      existingCategoryIds: selectedCategoryIds,
      newCategoryNames: pendingCategoryName ? [pendingCategoryName] : [],
      thumbnailDataUri: photoDataUri,
      manual: manualBlob ? { blob: manualBlob.blob, filename: manualBlob.filename, mimeType: manualBlob.mimeType } : null
    }
    const outcome = await createItemFromDraft(draft)
    setCreating(false)
    setCreateOutcome(outcome)
  }, [name, locationId, selectedCategoryIds, pendingCategoryName, photoDataUri, manualBlob])

  const toggleCategory = useCallback((id) => {
    setSelectedCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }, [])

  const orderedLocations = useMemo(() => sortLocationsAsTree(locations), [locations])

  return html`
    <div class="card">
      ${identificationStatus === 'pending' ? html`<p class="muted">Looking up barcode…</p>` : null}
      ${identificationStatus === 'failed' ? html`
        <div class="error-banner">
          Barcode lookup failed${identificationError ? html` (${identificationError})` : null}.
          <button onClick=${runIdentification}>Retry</button>
        </div>
      ` : null}
      ${identificationStatus === 'no_match' ? html`<p class="muted">No match for that barcode — fill in the details below.</p>` : null}

      ${photoDataUri ? html`<p><img src=${photoDataUri} alt="Item photo" style="max-width:100%;border-radius:8px" /></p>` : null}
      <input ref=${photoInputRef} type="file" accept="image/*" capture="environment" style="display:none" onChange=${handleAddPhoto} />
      <p><button onClick=${() => photoInputRef.current.click()}>${photoDataUri ? 'Replace photo' : 'Add photo'}</button></p>

      <p>
        <label>Name<br/>
          <input value=${name} onInput=${(e) => setName(e.target.value)} style="width:100%" />
        </label>
      </p>
      <p>
        <label>Description<br/>
          <textarea value=${description} onInput=${(e) => setDescription(e.target.value)} style="width:100%" />
        </label>
      </p>

      <p>Category:</p>
      <p>
        ${categories.map((c) => html`
          <label style="margin-right:1em">
            <input type="checkbox" checked=${selectedCategoryIds.includes(c.id)} onChange=${() => toggleCategory(c.id)} />
            ${c.name}
          </label>
        `)}
      </p>
      ${pendingCategoryName ? html`
        <p>New category "<strong>${pendingCategoryName}</strong>" will be created and applied.
          <button onClick=${() => setPendingCategoryName('')}>Cancel</button>
        </p>
      ` : html`
        <p><input placeholder="Add new category…" onKeyDown=${(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            setPendingCategoryName(e.target.value.trim())
            e.target.value = ''
          }
        }} /></p>
      `}

      <p>
        <label>Location<br/>
          <select value=${locationId || ''} onChange=${(e) => setLocationId(e.target.value || null)} style="width:100%">
            <option value="">— unlocated —</option>
            ${orderedLocations.map((l) => html`
              <option value=${l.id}>${'  '.repeat(l.depth)}${l.name}</option>
            `)}
          </select>
        </label>
      </p>
      <input ref=${locationScanInputRef} type="file" accept="image/*" capture="environment" style="display:none" onChange=${handleLocationScan} />
      <p><button onClick=${() => locationScanInputRef.current.click()}>Scan location label instead</button></p>

      ${manual && manual.status === 'matched' ? html`
        <p>Manual found: <a href=${manual.url} target="_blank" rel="noopener">${manual.title || manual.url}</a>
          <button onClick=${() => setManual({ status: 'none' })}>Remove</button>
        </p>
      ` : null}

      ${createOutcome && createOutcome.steps.create === 'ok' ? html`
        <div class="card">
          <p>Item created${createOutcome.steps.categories === 'failed' ? html`<br/><span class="error-banner">Categories failed to attach: ${createOutcome.errors.categories}</span>` : null}
          ${createOutcome.steps.thumbnail === 'failed' ? html`<br/><span class="error-banner">Photo failed to attach: ${createOutcome.errors.thumbnail}</span>` : null}
          ${createOutcome.steps.attachment === 'failed' ? html`<br/><span class="error-banner">Manual failed to attach: ${createOutcome.errors.attachment}</span>` : null}
          </p>
          <button onClick=${onDiscard}>Add another</button>
        </div>
      ` : html`
        ${createOutcome && createOutcome.steps.create === 'failed' ? html`<div class="error-banner">Couldn't create the item: ${createOutcome.errors.create}</div>` : null}
        <p>
          <button disabled=${creating || !name} onClick=${handleConfirm}>${creating ? 'Creating…' : 'Confirm'}</button>
          <button disabled=${creating} onClick=${onDiscard}>Cancel</button>
        </p>
      `}
    </div>
  `
}
