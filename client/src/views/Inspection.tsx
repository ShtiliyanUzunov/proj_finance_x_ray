import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import AddIcon from '@mui/icons-material/Add'

type SortDir = 'asc' | 'desc'

function compareCells(a: string, b: string): number {
  const na = parseFloat(a.replace(',', '.'))
  const nb = parseFloat(b.replace(',', '.'))
  if (!Number.isNaN(na) && !Number.isNaN(nb) && /^-?[\d.,\s]+$/.test(a) && /^-?[\d.,\s]+$/.test(b)) {
    return na - nb
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function parseAmount(s: string | undefined): number {
  if (!s) return NaN
  const trimmed = s.replace(/\s+/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return NaN
  return parseFloat(trimmed)
}

const amountFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
import {
  listCsvs,
  getCsv,
  getCsvCategories,
  type CsvFile,
  type CsvContents,
} from '../api'

const CATEGORY_COLUMN_LABEL = 'Category'
const FILE_COLUMN_LABEL = 'File'
const UNCATEGORIZED_LABEL = 'None'

// Per-row metadata used by color lookup + categorize action. Plain string[] rows
// stay the natural shape for the existing sort/filter/search machinery; the
// metadata is kept in a side WeakMap keyed by the row reference.
interface RowMeta {
  file: string
  sourceIdx: number
}

interface RowCategory {
  category: string | null
  color: string | null
}

// Pick legible text color for a given hex background. Same luminance formula
// as the Categorization view so the color choice stays consistent across
// places that render rule colors.
function pickContrastColor(bg: string): string {
  const hex = bg.replace('#', '')
  if (hex.length !== 6) return 'rgba(0,0,0,0.87)'
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 0.6 ? 'rgba(0,0,0,0.87)' : '#fff'
}

const entityDecoder = typeof window !== 'undefined' ? document.createElement('textarea') : null

function cleanCell(s: string): string {
  if (!s) return s
  let out = s
  if (entityDecoder && /&[a-z#0-9]+;/i.test(out)) {
    entityDecoder.innerHTML = out
    out = entityDecoder.value
  }
  if (out.includes('<')) {
    out = out.replace(/<[^>]*>/g, ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

// Hidden columns are a global per-column-name preference: hiding "Описание"
// once keeps it hidden whenever it appears, regardless of which file(s) the
// user has selected. Stored as a flat string[] in localStorage. (Older versions
// of this view stored a per-file map under the same key; we treat malformed or
// non-array reads as empty to migrate gracefully.)
const HIDDEN_COLS_KEY = 'inspect.hiddenColumns'

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_COLS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function writeHidden(hidden: string[]) {
  if (hidden.length === 0) localStorage.removeItem(HIDDEN_COLS_KEY)
  else localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(hidden))
}

export default function Inspection() {
  const { name: nameParam } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rowParam = searchParams.get('row')
  const [files, setFiles] = useState<CsvFile[]>([])
  const [contentsByFile, setContentsByFile] = useState<Record<string, CsvContents>>({})
  const [categoriesByFile, setCategoriesByFile] = useState<
    Record<string, Map<number, RowCategory>>
  >({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(25)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null)
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null)

  // Route param is a comma-joined list of URL-encoded filenames, so deep links
  // from Timeline/Overview (single file) and the multi-select dropdown share
  // one routing scheme.
  const selectedFiles = useMemo<string[]>(
    () =>
      nameParam
        ? nameParam
            .split(',')
            .map((s) => decodeURIComponent(s))
            .filter(Boolean)
        : [],
    [nameParam],
  )
  const selectedKey = selectedFiles.join(',')
  const isMulti = selectedFiles.length > 1

  useEffect(() => {
    listCsvs()
      .then((fs) => {
        setFiles(fs)
        if (!nameParam && fs.length > 0) {
          navigate(`/inspect/${encodeURIComponent(fs[0].name)}`, { replace: true })
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [nameParam, navigate])

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setContentsByFile({})
      setCategoriesByFile({})
      return
    }
    setLoading(true)
    setError(null)
    setPage(0)
    Promise.all(
      selectedFiles.map((name) =>
        Promise.all([getCsv(name), getCsvCategories(name)]).then(
          ([csv, cats]) => ({ name, csv, cats }),
        ),
      ),
    )
      .then((results) => {
        const nextContents: Record<string, CsvContents> = {}
        const nextCats: Record<string, Map<number, RowCategory>> = {}
        for (const { name, csv, cats } of results) {
          nextContents[name] = csv
          const map = new Map<number, RowCategory>()
          for (const c of cats.categories) {
            map.set(c.row_index, { category: c.category, color: c.color })
          }
          nextCats[name] = map
        }
        setContentsByFile(nextContents)
        setCategoriesByFile(nextCats)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [selectedKey])

  // Load the global hidden-columns set once on mount. It's a per-column-name
  // preference, so it doesn't depend on which file(s) are selected.
  useEffect(() => {
    setHidden(new Set(readHidden()))
  }, [])

  // Selection changes invalidate the active sort (column indices differ between
  // file combos) but should NOT touch the hidden-columns preference.
  useEffect(() => {
    setSortCol(null)
    setSortDir('asc')
  }, [selectedKey])

  // Jump to a specific row when ?row= is present: only meaningful in single-file
  // mode (deep links from Timeline/Overview always target one file).
  useEffect(() => {
    if (isMulti || rowParam === null) return
    const only = selectedFiles[0]
    const csv = only ? contentsByFile[only] : undefined
    if (!csv) return
    const idx = parseInt(rowParam, 10)
    if (Number.isNaN(idx) || idx < 0 || idx >= csv.rows.length) return
    setSearch('')
    setSortCol(null)
    setSortDir('asc')
    setPage(Math.floor(idx / perPage))
    setHighlightedRow(idx)
  }, [contentsByFile, rowParam, perPage, isMulti, selectedFiles])

  // Scroll the highlighted row into view once it has rendered.
  useEffect(() => {
    if (highlightedRow === null) return
    const el = highlightedRowRef.current
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightedRow, page])

  // Clear highlight + query param after a few seconds so it doesn't stick around.
  useEffect(() => {
    if (highlightedRow === null) return
    const t = window.setTimeout(() => {
      setHighlightedRow(null)
      if (searchParams.has('row')) {
        const next = new URLSearchParams(searchParams)
        next.delete('row')
        setSearchParams(next, { replace: true })
      }
    }, 4000)
    return () => clearTimeout(t)
  }, [highlightedRow, searchParams, setSearchParams])

  // Unified columns across all selected files: File at the front, ordered union
  // of data columns (first-seen-in-first-file order, then new ones appended),
  // Category at the end. Synthetic File/Category columns participate in the
  // existing sort/filter/hide/paginate machinery just like any data column.
  const cleanedColumns = useMemo(() => {
    if (selectedFiles.length === 0) return []
    const seen = new Set<string>()
    const cols: string[] = []
    for (const name of selectedFiles) {
      const csv = contentsByFile[name]
      if (!csv) continue
      for (const c of csv.columns.map(cleanCell)) {
        if (!seen.has(c)) {
          seen.add(c)
          cols.push(c)
        }
      }
    }
    return [FILE_COLUMN_LABEL, ...cols, CATEGORY_COLUMN_LABEL]
  }, [selectedFiles, contentsByFile])

  // Per-file column→union-index mapping so each row's cells can be slotted into
  // the unified layout (gaps left as empty strings when a file lacks a column).
  // Index 0 is reserved for File, last is reserved for Category, so data column
  // indices in the union start at 1.
  const dataColumnByName = useMemo(() => {
    const m = new Map<string, number>()
    cleanedColumns.forEach((c, i) => {
      if (c !== FILE_COLUMN_LABEL && c !== CATEGORY_COLUMN_LABEL) m.set(c, i)
    })
    return m
  }, [cleanedColumns])

  // Rows + metadata. The WeakMap keys by row reference so color lookup and
  // categorize keep working after sort/filter reorder things.
  const { cleanedRows, rowMeta } = useMemo(() => {
    const rows: string[][] = []
    const meta = new WeakMap<string[], RowMeta>()
    if (cleanedColumns.length === 0) return { cleanedRows: rows, rowMeta: meta }
    for (const name of selectedFiles) {
      const csv = contentsByFile[name]
      if (!csv) continue
      const fileCols = csv.columns.map(cleanCell)
      const cats = categoriesByFile[name]
      csv.rows.forEach((srcRow, srcIdx) => {
        const out = new Array<string>(cleanedColumns.length).fill('')
        out[0] = name
        fileCols.forEach((col, ci) => {
          const targetIdx = dataColumnByName.get(col)
          if (targetIdx !== undefined) out[targetIdx] = cleanCell(srcRow[ci] ?? '')
        })
        out[cleanedColumns.length - 1] = cats?.get(srcIdx)?.category ?? UNCATEGORIZED_LABEL
        rows.push(out)
        meta.set(out, { file: name, sourceIdx: srcIdx })
      })
    }
    return { cleanedRows: rows, rowMeta: meta }
  }, [selectedFiles, contentsByFile, categoriesByFile, cleanedColumns, dataColumnByName])

  const fileColIdx = 0

  const categoryColIdx = cleanedColumns.length - 1

  const visibleIndexes = useMemo(
    () => cleanedColumns.map((c, i) => (hidden.has(c) ? -1 : i)).filter((i) => i >= 0),
    [cleanedColumns, hidden],
  )

  const filtered = useMemo(() => {
    if (!cleanedRows.length) return []
    if (!search.trim()) return cleanedRows
    const q = search.toLowerCase()
    return cleanedRows.filter((row) =>
      visibleIndexes.some((idx) => row[idx]?.toLowerCase().includes(q)),
    )
  }, [cleanedRows, search, visibleIndexes])

  const semanticCols = useMemo(() => {
    const debit = new Set<number>()
    const credit = new Set<number>()
    cleanedColumns.forEach((col, i) => {
      const lower = col.toLowerCase()
      if (lower.includes('debit') || lower.includes('дебит')) debit.add(i)
      else if (lower.includes('credit') || lower.includes('кредит')) credit.add(i)
    })
    return { debit, credit }
  }, [cleanedColumns])

  const totals = useMemo(() => {
    if (cleanedRows.length === 0 || cleanedColumns.length === 0) return null
    const debitIdxs = Array.from(semanticCols.debit)
    const creditIdxs = Array.from(semanticCols.credit)
    if (debitIdxs.length === 0 && creditIdxs.length === 0) return null
    let debit = 0
    let credit = 0
    let debitCount = 0
    let creditCount = 0
    for (const row of cleanedRows) {
      for (const i of debitIdxs) {
        const n = parseAmount(row[i])
        if (!Number.isNaN(n)) {
          debit += n
          debitCount++
        }
      }
      for (const i of creditIdxs) {
        const n = parseAmount(row[i])
        if (!Number.isNaN(n)) {
          credit += n
          creditCount++
        }
      }
    }
    return {
      debit,
      credit,
      net: credit - debit,
      debitCount,
      creditCount,
      debitCols: debitIdxs.map((i) => cleanedColumns[i]),
      creditCols: creditIdxs.map((i) => cleanedColumns[i]),
    }
  }, [cleanedColumns, cleanedRows, semanticCols])

  const sorted = useMemo(() => {
    if (sortCol === null) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => dir * compareCells(a[sortCol] ?? '', b[sortCol] ?? ''))
  }, [filtered, sortCol, sortDir])

  const paginated = sorted.slice(page * perPage, page * perPage + perPage)

  function onSortClick(idx: number) {
    setPage(0)
    if (sortCol !== idx) {
      setSortCol(idx)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
      setSortDir('asc')
    }
  }

  function toggleColumn(col: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      writeHidden(Array.from(next))
      return next
    })
  }

  // "Hide all" only hides columns present in the current union — hidden state
  // for columns from other files stays as-is. "Show all" likewise only un-hides
  // what's currently visible, preserving prior choices for absent columns.
  function setAllColumns(hide: boolean) {
    setHidden((prev) => {
      const next = new Set(prev)
      for (const c of cleanedColumns) {
        if (hide) next.add(c)
        else next.delete(c)
      }
      writeHidden(Array.from(next))
      return next
    })
  }

  // Bridge to the Categorization view: drop the source row's 2nd and 3rd
  // columns (typically the description and counterparty) into the pattern
  // input *as draft text*. We look the original cells up via rowMeta so the
  // synthetic File/Category columns and any union gaps don't shift the
  // positions we sample from.
  function handleCategorize(row: string[]) {
    const meta = rowMeta.get(row)
    const src = meta ? contentsByFile[meta.file]?.rows[meta.sourceIdx] : undefined
    const cells = src ?? row
    const draft = [cells[1], cells[2]]
      .filter((s): s is string => typeof s === 'string')
      .map((s) => cleanCell(s).toLowerCase())
      .filter((s) => s.length > 0)
      .join(', ')
    navigate('/categorization', { state: { prefillPatternDraft: draft } })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Typography variant="h4" gutterBottom>
        Inspect
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 280, maxWidth: 420 }}>
          <InputLabel>Files</InputLabel>
          <Select
            multiple
            value={selectedFiles}
            label="Files"
            onChange={(e) => {
              const value = e.target.value
              const next = typeof value === 'string' ? value.split(',') : value
              if (next.length === 0) {
                navigate('/inspect')
              } else {
                navigate(`/inspect/${next.map(encodeURIComponent).join(',')}`)
              }
            }}
            disabled={files.length === 0}
            renderValue={(selected) =>
              selected.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  (no files)
                </Typography>
              ) : (
                <Box
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem',
                  }}
                  title={selected.join(', ')}
                >
                  {selected.length === 1 ? selected[0] : `${selected.length} files`}
                </Box>
              )
            }
          >
            {files.length === 0 && <MenuItem disabled value="">No files uploaded</MenuItem>}
            {files.map((f) => (
              <MenuItem key={f.name} value={f.name} dense>
                <Checkbox size="small" checked={selectedFiles.includes(f.name)} sx={{ p: 0.5 }} />
                <ListItemText
                  primary={f.name}
                  secondary={`${f.rows} rows`}
                  slotProps={{
                    primary: { variant: 'body2' },
                    secondary: { variant: 'caption' },
                  }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          placeholder="Search across all columns…"
          size="small"
          sx={{ flex: 1 }}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          disabled={cleanedRows.length === 0}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<ViewColumnIcon />}
          onClick={(e) => setColMenuAnchor(e.currentTarget)}
          disabled={cleanedColumns.length === 0}
        >
          Columns ({visibleIndexes.length}/{cleanedColumns.length})
        </Button>
        <Menu
          anchorEl={colMenuAnchor}
          open={colMenuAnchor !== null}
          onClose={() => setColMenuAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 400 } } }}
        >
          <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}>
            <Button size="small" onClick={() => setAllColumns(false)}>Show all</Button>
            <Button size="small" onClick={() => setAllColumns(true)}>Hide all</Button>
          </Box>
          <Divider />
          {cleanedColumns.map((col) => (
            <MenuItem key={col} onClick={() => toggleColumn(col)} dense>
              <FormControlLabel
                control={<Checkbox size="small" checked={!hidden.has(col)} />}
                label={col || '(empty)'}
                onClick={(e) => e.preventDefault()}
                sx={{ m: 0, pointerEvents: 'none' }}
              />
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : cleanedRows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">
            {files.length === 0
              ? 'Upload a CSV first to inspect.'
              : selectedFiles.length === 0
                ? 'Select one or more files to inspect.'
                : 'No rows in the selected files.'}
          </Typography>
        </Paper>
      ) : visibleIndexes.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">All columns are hidden. Use the Columns menu to show some.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {visibleIndexes.map((idx) => {
                    const isDebit = semanticCols.debit.has(idx)
                    const isCredit = semanticCols.credit.has(idx)
                    return (
                      <TableCell
                        key={idx}
                        sortDirection={sortCol === idx ? sortDir : false}
                        align={isDebit || isCredit ? 'right' : 'left'}
                        sx={(theme) => ({
                          fontWeight: 600,
                          bgcolor: theme.palette.grey[100],
                          borderBottom: `2px solid ${theme.palette.divider}`,
                          ...(isDebit && {
                            color: theme.palette.error.main,
                            bgcolor: '#fdecea',
                          }),
                          ...(isCredit && {
                            color: theme.palette.success.main,
                            bgcolor: '#edf7ed',
                          }),
                        })}
                      >
                        <TableSortLabel
                          active={sortCol === idx}
                          direction={sortCol === idx ? sortDir : 'asc'}
                          onClick={() => onSortClick(idx)}
                        >
                          {cleanedColumns[idx]}
                        </TableSortLabel>
                      </TableCell>
                    )
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((row, i) => {
                  const originalIdx = page * perPage + i
                  const isHighlighted = sortCol === null && !search.trim() && originalIdx === highlightedRow
                  return (
                  <TableRow
                    key={originalIdx}
                    hover
                    ref={isHighlighted ? highlightedRowRef : undefined}
                    sx={{
                      ...(isHighlighted && { bgcolor: '#fff8e1', transition: 'background-color 0.3s' }),
                      '&:hover .categorize-action': { opacity: 1 },
                    }}
                  >
                    {visibleIndexes.map((idx) => {
                      const isDebit = semanticCols.debit.has(idx)
                      const isCredit = semanticCols.credit.has(idx)
                      const isCategory = idx === categoryColIdx
                      const isFile = idx === fileColIdx
                      const cell = row[idx]
                      const hasValue = isDebit || isCredit ? !Number.isNaN(parseAmount(cell)) : false
                      const meta = isCategory ? rowMeta.get(row) : undefined
                      const categoryColor =
                        meta ? categoriesByFile[meta.file]?.get(meta.sourceIdx)?.color : null
                      return (
                        <TableCell
                          key={idx}
                          align={isDebit || isCredit ? 'right' : 'left'}
                          sx={{
                            fontVariantNumeric: isDebit || isCredit ? 'tabular-nums' : undefined,
                            ...(isFile && { color: 'text.secondary', fontSize: '0.78rem', whiteSpace: 'nowrap' }),
                            ...(isDebit && hasValue && { color: 'error.main', fontWeight: 500 }),
                            ...(isCredit && hasValue && { color: 'success.main', fontWeight: 500 }),
                            ...(isCategory && categoryColor && {
                              bgcolor: categoryColor,
                              color: pickContrastColor(categoryColor),
                              fontWeight: 500,
                            }),
                            ...(isCategory && !categoryColor && {
                              color: 'text.secondary',
                              fontStyle: 'italic',
                            }),
                          }}
                        >
                          {isCategory && !categoryColor ? (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 1,
                              }}
                            >
                              <span>{cell}</span>
                              <Tooltip title="Create a rule from this transaction">
                                <IconButton
                                  className="categorize-action"
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCategorize(row)
                                  }}
                                  sx={{
                                    opacity: 0,
                                    transition: 'opacity 0.15s',
                                    p: 0.25,
                                  }}
                                >
                                  <AddIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            cell
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={perPage}
            onRowsPerPageChange={(e) => {
              setPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      )}

      {cleanedRows.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Summary {isMulti && `· ${selectedFiles.length} files`}
          </Typography>
          {totals === null ? (
            <Typography variant="body2" color="text.secondary">
              Could not detect debit/credit columns in this file. Expected column names containing
              "debit"/"дебит" or "credit"/"кредит".
            </Typography>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 1,
                  bgcolor: '#fdecea',
                  borderLeft: '4px solid',
                  borderLeftColor: 'error.main',
                }}
              >
                <Typography variant="caption" color="error.dark" sx={{ fontWeight: 600 }}>
                  Debit ({totals.debitCount} {totals.debitCount === 1 ? 'row' : 'rows'})
                </Typography>
                <Typography variant="h5" color="error.main" sx={{ fontWeight: 600 }}>
                  {amountFormatter.format(totals.debit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {totals.debitCols.length > 0 ? `from: ${totals.debitCols.join(', ')}` : 'no column detected'}
                </Typography>
              </Box>
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 1,
                  bgcolor: '#edf7ed',
                  borderLeft: '4px solid',
                  borderLeftColor: 'success.main',
                }}
              >
                <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
                  Credit ({totals.creditCount} {totals.creditCount === 1 ? 'row' : 'rows'})
                </Typography>
                <Typography variant="h5" color="success.main" sx={{ fontWeight: 600 }}>
                  {amountFormatter.format(totals.credit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {totals.creditCols.length > 0 ? `from: ${totals.creditCols.join(', ')}` : 'no column detected'}
                </Typography>
              </Box>
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 1,
                  bgcolor: totals.net >= 0 ? '#edf7ed' : '#fdecea',
                  borderLeft: '4px solid',
                  borderLeftColor: totals.net >= 0 ? 'success.main' : 'error.main',
                }}
              >
                <Typography
                  variant="caption"
                  color={totals.net >= 0 ? 'success.dark' : 'error.dark'}
                  sx={{ fontWeight: 600 }}
                >
                  Net (credit − debit)
                </Typography>
                <Typography
                  variant="h5"
                  color={totals.net >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontWeight: 600 }}
                >
                  {amountFormatter.format(totals.net)}
                </Typography>
              </Box>
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  )
}
