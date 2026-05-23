const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface CsvFile {
  name: string
  size: number
  uploaded_at: string
  rows: number
  debit: number | null
  credit: number | null
  date_min: string | null
  date_max: string | null
}

export interface Summary {
  date_min: string | null
  date_max: string | null
  total_rows: number
  matching_rows: number
  files: number
}

export interface CsvContents {
  name: string
  columns: string[]
  rows: string[][]
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return res.json() as Promise<T>
}

export function listCsvs(): Promise<CsvFile[]> {
  return fetch(`${API_BASE}/csv`).then(handle<CsvFile[]>)
}

export function getCsv(name: string): Promise<CsvContents> {
  return fetch(`${API_BASE}/csv/${encodeURIComponent(name)}`).then(handle<CsvContents>)
}

export interface Schema {
  columns: string[]
}

export function getSchema(): Promise<Schema> {
  return fetch(`${API_BASE}/schema`).then(handle<Schema>)
}

export interface Rule {
  id: string
  category: string
  columns: string[]
  keywords: string[]
}

export interface RulesPayload {
  rules: Rule[]
}

export function getRules(): Promise<RulesPayload> {
  return fetch(`${API_BASE}/rules`).then(handle<RulesPayload>)
}

export function putRules(rules: Rule[]): Promise<RulesPayload> {
  return fetch(`${API_BASE}/rules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  }).then(handle<RulesPayload>)
}

export function uploadCsv(file: File): Promise<CsvFile> {
  const form = new FormData()
  form.append('file', file)
  return fetch(`${API_BASE}/csv`, { method: 'POST', body: form }).then(handle<CsvFile>)
}

export function getSummary(from?: string, to?: string): Promise<Summary> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return fetch(`${API_BASE}/summary${qs ? `?${qs}` : ''}`).then(handle<Summary>)
}

export interface TimelinePoint {
  period: string
  debit: number
  credit: number
}

export interface TimelineResponse {
  bucket: 'day' | 'month'
  items: TimelinePoint[]
}

export interface Transaction {
  date: string
  description: string
  debit: number | null
  credit: number | null
  source: string
  row_index: number
}

export function getTransactions(from?: string, to?: string): Promise<Transaction[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return fetch(`${API_BASE}/transactions${qs ? `?${qs}` : ''}`).then(handle<Transaction[]>)
}

export function getTimeline(
  from?: string,
  to?: string,
  bucket: 'day' | 'month' = 'day',
): Promise<TimelineResponse> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  params.set('bucket', bucket)
  return fetch(`${API_BASE}/timeline?${params.toString()}`).then(handle<TimelineResponse>)
}

export function renameCsv(oldName: string, newName: string): Promise<CsvFile> {
  return fetch(`${API_BASE}/csv/${encodeURIComponent(oldName)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  }).then(handle<CsvFile>)
}
