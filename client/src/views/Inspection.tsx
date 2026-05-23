import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  TextField,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  InputAdornment,
  Button,
  Menu,
  FormControlLabel,
  Checkbox,
  Divider,
  TableSortLabel,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'

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
import { listCsvs, getCsv, type CsvFile, type CsvContents } from '../api'

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

const HIDDEN_COLS_KEY = 'inspect.hiddenColumns'

function readHiddenMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(HIDDEN_COLS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeHiddenFor(file: string, hidden: string[]) {
  const map = readHiddenMap()
  if (hidden.length === 0) {
    delete map[file]
  } else {
    map[file] = hidden
  }
  localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(map))
}

export default function Inspection() {
  const { name: nameParam } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rowParam = searchParams.get('row')
  const [files, setFiles] = useState<CsvFile[]>([])
  const [contents, setContents] = useState<CsvContents | null>(null)
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

  const selected = nameParam ?? ''

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
    if (!selected) {
      setContents(null)
      return
    }
    setLoading(true)
    setError(null)
    setPage(0)
    getCsv(selected)
      .then(setContents)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [selected])

  // Load hidden-column selection for the currently selected file
  useEffect(() => {
    if (!selected) {
      setHidden(new Set())
      return
    }
    setHidden(new Set(readHiddenMap()[selected] ?? []))
    setSortCol(null)
    setSortDir('asc')
  }, [selected])

  // Jump to a specific row when ?row= is present: reset filter/sort, page to it, highlight it.
  useEffect(() => {
    if (!contents || rowParam === null) return
    const idx = parseInt(rowParam, 10)
    if (Number.isNaN(idx) || idx < 0 || idx >= contents.rows.length) return
    setSearch('')
    setSortCol(null)
    setSortDir('asc')
    setPage(Math.floor(idx / perPage))
    setHighlightedRow(idx)
  }, [contents, rowParam, perPage])

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

  const cleanedRows = useMemo(
    () => (contents ? contents.rows.map((row) => row.map(cleanCell)) : []),
    [contents],
  )

  const cleanedColumns = useMemo(
    () => (contents ? contents.columns.map(cleanCell) : []),
    [contents],
  )

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
    if (!contents || cleanedColumns.length === 0) return null
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
  }, [contents, cleanedColumns, cleanedRows, semanticCols])

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
      writeHiddenFor(selected, Array.from(next))
      return next
    })
  }

  function setAllColumns(hide: boolean) {
    const next = hide ? new Set(cleanedColumns) : new Set<string>()
    setHidden(next)
    writeHiddenFor(selected, Array.from(next))
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Typography variant="h4" gutterBottom>
        Inspect
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel>File</InputLabel>
          <Select
            value={selected}
            label="File"
            onChange={(e) => navigate(`/inspect/${encodeURIComponent(e.target.value)}`)}
            disabled={files.length === 0}
          >
            {files.length === 0 && <MenuItem value="">No files uploaded</MenuItem>}
            {files.map((f) => (
              <MenuItem key={f.name} value={f.name}>
                {f.name} ({f.rows} rows)
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
          disabled={!contents}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<ViewColumnIcon />}
          onClick={(e) => setColMenuAnchor(e.currentTarget)}
          disabled={!contents || cleanedColumns.length === 0}
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
      ) : !contents ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">
            {files.length === 0
              ? 'Upload a CSV first to inspect.'
              : 'Select a file to inspect.'}
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
                    sx={isHighlighted ? { bgcolor: '#fff8e1', transition: 'background-color 0.3s' } : undefined}
                  >
                    {visibleIndexes.map((idx) => {
                      const isDebit = semanticCols.debit.has(idx)
                      const isCredit = semanticCols.credit.has(idx)
                      const cell = row[idx]
                      const hasValue = isDebit || isCredit ? !Number.isNaN(parseAmount(cell)) : false
                      return (
                        <TableCell
                          key={idx}
                          align={isDebit || isCredit ? 'right' : 'left'}
                          sx={{
                            fontVariantNumeric: isDebit || isCredit ? 'tabular-nums' : undefined,
                            ...(isDebit && hasValue && { color: 'error.main', fontWeight: 500 }),
                            ...(isCredit && hasValue && { color: 'success.main', fontWeight: 500 }),
                          }}
                        >
                          {cell}
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

      {contents && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Summary
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
