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
  // Null when the server couldn't pick a mapper for this file (unknown bank
  // format). UI shows it as a warning rather than a labeled chip.
  mapper: string | null
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

export interface CsvRowCategory {
  row_index: number
  category: string | null
  color: string | null
  matched_rule_ids: string[]
}

export interface CsvCategoriesResponse {
  categories: CsvRowCategory[]
}

export function getCsvCategories(name: string): Promise<CsvCategoriesResponse> {
  return fetch(`${API_BASE}/csv/${encodeURIComponent(name)}/categories`).then(
    handle<CsvCategoriesResponse>,
  )
}

export interface Schema {
  columns: string[]
  // Display-only mapping from internal field name → bank-specific column name
  // (e.g. "description" → "Основание"). Rules continue to store the internal
  // name; this is purely for what the UI shows in pickers and chips.
  labels: Record<string, string>
}

export function getSchema(): Promise<Schema> {
  return fetch(`${API_BASE}/schema`).then(handle<Schema>)
}

export interface Rule {
  id: string
  category: string
  columns: string[]
  patterns: string[]
  color?: string | null
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

export interface Group {
  id: string
  name: string
  // IDs of child references — each ID resolves to either a rule (Rule.id) or
  // another group (Group.id). References by ID, not name, so renames are safe
  // and a group may share its `name` with a rule's `category` without conflict.
  children: string[]
}

export interface GroupsPayload {
  groups: Group[]
}

export function getGroups(): Promise<GroupsPayload> {
  return fetch(`${API_BASE}/groups`).then(handle<GroupsPayload>)
}

export function putGroups(groups: Group[]): Promise<GroupsPayload> {
  return fetch(`${API_BASE}/groups`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups }),
  }).then(handle<GroupsPayload>)
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
  category: string | null
  matched_rule_ids: string[]
}

export interface TransactionConflict extends Transaction {
  matched_rules: { id: string; category: string; patterns: string[] }[]
}

export function getTransactions(from?: string, to?: string): Promise<Transaction[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return fetch(`${API_BASE}/transactions${qs ? `?${qs}` : ''}`).then(handle<Transaction[]>)
}

export function getTransactionConflicts(
  from?: string,
  to?: string,
): Promise<TransactionConflict[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return fetch(`${API_BASE}/transactions/conflicts${qs ? `?${qs}` : ''}`).then(
    handle<TransactionConflict[]>,
  )
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
