/**
 * Trigger a browser download of `data` as pretty-printed JSON. Shared by
 * the bulk backup (Settings → Storage) and the per-council export (sidebar
 * kebab) so the blob/anchor dance lives once.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
