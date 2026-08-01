// Parses the `location=<id>` query param out of a signalk-stowage-mgmt
// location QR label's deep link (SPEC.md §1.2, §5; that plugin's SPEC.md
// §5.1, §9.2). Pure logic, no DOM — unit-testable without a browser,
// matching signalk-stowage-mgmt's qr-label.js pattern for the inverse
// operation (building that same link).
export function parseLocationIdFromUrl (rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch (err) {
    return null
  }
  const id = url.searchParams.get('location')
  return id && id.trim() ? id.trim() : null
}
