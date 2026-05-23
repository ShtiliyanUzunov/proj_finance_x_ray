import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { BarChart } from '@mui/x-charts/BarChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import {
  getGroups,
  getRules,
  getTimeline,
  getTransactions,
  type Group,
  type Rule,
  type TimelinePoint,
  type Transaction,
} from '../../api'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthBoundaries(items: TimelinePoint[]): TimelinePoint[] {
  const result: TimelinePoint[] = []
  for (let i = 1; i < items.length; i++) {
    if (items[i].period.slice(0, 7) !== items[i - 1].period.slice(0, 7)) {
      result.push(items[i])
    }
  }
  return result
}

function monthLabel(period: string): string {
  const month = parseInt(period.slice(5, 7), 10)
  return Number.isNaN(month) ? '' : MONTH_SHORT[month - 1] ?? ''
}

export interface TimelineMeta {
  bucket: 'day' | 'month'
  count: number
}

interface Props {
  from: string
  to: string
  onMeta?: (meta: TimelineMeta | null) => void
  panelTarget?: HTMLElement | null
}

const MIN_GROUP_WIDTH = 30
const MAX_GROUP_WIDTH: Record<'day' | 'month', number> = {
  day: 110,
  month: 220,
}
const CHART_PADDING = 80
const CHART_HEIGHT = 420
const LEFT_MARGIN = 44
const RIGHT_MARGIN = 8
const DEBIT_COLOR = '#d32f2f'
const CREDIT_COLOR = '#2e7d32'
const PANEL_WIDTH = 440

const amountFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Encoded as `cat:<name>` or `group:<name>` so MUI Select can use a flat string value.
const FILTER_ALL = ''

function parseFilter(value: string): { type: 'cat' | 'group'; name: string } | null {
  if (!value) return null
  const idx = value.indexOf(':')
  if (idx < 0) return null
  const type = value.slice(0, idx)
  if (type !== 'cat' && type !== 'group') return null
  return { type, name: value.slice(idx + 1) }
}

// Walk a group's children to the set of leaf category names it ultimately resolves to.
// Unknown children (not a group, not a known leaf) are treated as leaves — matches
// server-side semantics in services/groups.py.
function resolveGroupLeaves(
  name: string,
  groupsByName: Map<string, string[]>,
  leafNames: Set<string>,
): Set<string> {
  const result = new Set<string>()
  const visited = new Set<string>()
  const walk = (n: string) => {
    if (visited.has(n)) return
    visited.add(n)
    const children = groupsByName.get(n)
    if (!children) {
      result.add(n)
      return
    }
    for (const child of children) {
      if (groupsByName.has(child)) walk(child)
      else result.add(child)
    }
  }
  walk(name)
  // Drop names that don't correspond to any real category (defensive against stale group refs).
  for (const n of [...result]) if (!leafNames.has(n)) result.delete(n)
  return result
}

export default function Timeline({ from, to, onMeta, panelTarget }: Props) {
  const navigate = useNavigate()
  const [items, setItems] = useState<TimelinePoint[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [bucket, setBucket] = useState<'day' | 'month'>('day')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDebit, setShowDebit] = useState(true)
  const [showCredit, setShowCredit] = useState(false)
  const [filterValue, setFilterValue] = useState<string>(FILTER_ALL)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    Promise.all([
      getTimeline(from, to, bucket),
      getTransactions(from, to),
      getRules(),
      getGroups(),
    ])
      .then(([t, tx, r, g]) => {
        setItems(t.items)
        setTransactions(tx)
        setRules(r.rules)
        setGroups(g.groups)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to, bucket])

  useEffect(() => {
    return () => onMeta?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const leafNames = useMemo(() => new Set(rules.map((r) => r.category)), [rules])
  const groupsByName = useMemo(
    () => new Map(groups.map((g) => [g.name, g.children] as const)),
    [groups],
  )

  const filter = parseFilter(filterValue)

  // Set of leaf category names the filter resolves to. null = no filter (show everything).
  const filterLeaves = useMemo(() => {
    if (!filter) return null
    if (filter.type === 'cat') return new Set([filter.name])
    return resolveGroupLeaves(filter.name, groupsByName, leafNames)
  }, [filter?.type, filter?.name, groupsByName, leafNames])

  const filteredTransactions = useMemo(() => {
    if (!filterLeaves) return transactions
    return transactions.filter((t) => t.category !== null && filterLeaves.has(t.category))
  }, [transactions, filterLeaves])

  const txnsByPeriod = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filteredTransactions) {
      const key = bucket === 'day' ? t.date : t.date.slice(0, 7)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
  }, [filteredTransactions, bucket])

  // When a filter is active, derive bars from the filtered transactions so totals match
  // what shows in the side panel. Without a filter, keep using the server-computed series
  // (it includes uncategorized rows, which the client-side derivation would silently drop).
  const chartItems = useMemo<TimelinePoint[]>(() => {
    if (!filterLeaves) return items
    const periods = [...txnsByPeriod.keys()].sort()
    return periods.map((period) => {
      let debit = 0
      let credit = 0
      for (const t of txnsByPeriod.get(period) ?? []) {
        if (t.debit !== null) debit += t.debit
        if (t.credit !== null) credit += t.credit
      }
      return { period, debit, credit }
    })
  }, [filterLeaves, items, txnsByPeriod])

  useEffect(() => {
    onMeta?.({ bucket, count: chartItems.length })
  }, [bucket, chartItems.length, onMeta])

  // Close popup when bucket changes (period keys aren't comparable across buckets) or when
  // a filter switch removes the previously selected period from the chart.
  useEffect(() => {
    setSelectedPeriod(null)
  }, [bucket])
  useEffect(() => {
    if (selectedPeriod && !txnsByPeriod.has(selectedPeriod)) setSelectedPeriod(null)
  }, [txnsByPeriod, selectedPeriod])

  const minWidth = chartItems.length * MIN_GROUP_WIDTH + CHART_PADDING
  const maxWidth = chartItems.length * MAX_GROUP_WIDTH[bucket] + CHART_PADDING
  const chartWidth = Math.min(Math.max(containerWidth || minWidth, minWidth), maxWidth)

  const series: { data: number[]; label: string; color: string }[] = []
  if (showDebit) series.push({ data: chartItems.map((d) => d.debit), label: 'Debit', color: DEBIT_COLOR })
  if (showCredit) series.push({ data: chartItems.map((d) => d.credit), label: 'Credit', color: CREDIT_COLOR })

  const boundaries = bucket === 'day' ? monthBoundaries(chartItems) : []

  const panel = selectedPeriod ? (
      <Box
        sx={{
          width: PANEL_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          alignSelf: 'stretch',
          borderLeft: 1,
          borderColor: 'divider',
        }}
      >
        <TimelineDetails
          period={selectedPeriod}
          bucket={bucket}
          transactions={txnsByPeriod.get(selectedPeriod) ?? []}
          onClose={() => setSelectedPeriod(null)}
          onTransactionClick={(t) => {
            navigate(`/inspect/${encodeURIComponent(t.source)}?row=${t.row_index}`)
          }}
        />
      </Box>
    ) : null

  return (
    <>
      <Box>
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={bucket}
            exclusive
            size="small"
            onChange={(_, v: 'day' | 'month' | null) => v && setBucket(v)}
          >
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>
          <SeriesCheckbox
            color={DEBIT_COLOR}
            label="Debit"
            checked={showDebit}
            onChange={setShowDebit}
          />
          <SeriesCheckbox
            color={CREDIT_COLOR}
            label="Credit"
            checked={showCredit}
            onChange={setShowCredit}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="timeline-filter-label">Category / Group</InputLabel>
            <Select
              labelId="timeline-filter-label"
              label="Category / Group"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            >
              <MenuItem value={FILTER_ALL}>
                <em>All</em>
              </MenuItem>
              {groups.length > 0 && <ListSubheader>Groups</ListSubheader>}
              {groups.map((g) => (
                <MenuItem key={`group:${g.name}`} value={`group:${g.name}`}>
                  {g.name}
                </MenuItem>
              ))}
              {leafNames.size > 0 && <ListSubheader>Categories</ListSubheader>}
              {[...leafNames].sort().map((name) => (
                <MenuItem key={`cat:${name}`} value={`cat:${name}`}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : chartItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {filter
              ? `No transactions matched “${filter.name}” in the selected range.`
              : 'No dated transactions in the selected range.'}
          </Typography>
        ) : series.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Select at least one series to display.
          </Typography>
        ) : (
          <Box ref={scrollRef} sx={{ overflowX: 'auto', overflowY: 'hidden' }}>
            <Box sx={{ width: chartWidth }}>
              <BarChart
                height={CHART_HEIGHT}
                width={chartWidth}
                hideLegend
                onAxisClick={(_event, data) => {
                  if (data && typeof data.axisValue === 'string') {
                    setSelectedPeriod(data.axisValue)
                  }
                }}
                xAxis={[
                  {
                    data: chartItems.map((d) => d.period),
                    scaleType: 'band',
                    tickLabelStyle: { fontSize: 11 },
                    categoryGapRatio: 0.3,
                    barGapRatio: 0.1,
                  },
                ]}
                series={series}
                margin={{ left: LEFT_MARGIN, right: RIGHT_MARGIN, top: 8, bottom: 28 }}
                slotProps={{ tooltip: { trigger: 'none' } }}
                sx={{ cursor: 'pointer' }}
              >
                {boundaries.map((b) => (
                  <ChartsReferenceLine
                    key={b.period}
                    x={b.period}
                    label={monthLabel(b.period)}
                    labelAlign="start"
                    lineStyle={{ stroke: '#9e9e9e', strokeDasharray: '4 4', strokeWidth: 1 }}
                    labelStyle={{ fontSize: 11, fill: '#616161' }}
                  />
                ))}
              </BarChart>
            </Box>
          </Box>
        )}
      </Box>
      {panel && panelTarget ? createPortal(panel, panelTarget) : null}
    </>
  )
}

function SeriesCheckbox({
  color,
  label,
  checked,
  onChange,
}: {
  color: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ color, '&.Mui-checked': { color } }}
        />
      }
      label={<Typography variant="body2">{label}</Typography>}
      sx={{ mr: 1 }}
    />
  )
}

function TimelineDetails({
  period,
  bucket,
  transactions,
  onClose,
  onTransactionClick,
}: {
  period: string
  bucket: 'day' | 'month'
  transactions: Transaction[]
  onClose: () => void
  onTransactionClick: (t: Transaction) => void
}) {
  let debitTotal = 0
  let creditTotal = 0
  for (const t of transactions) {
    if (t.debit !== null) debitTotal += t.debit
    if (t.credit !== null) creditTotal += t.credit
  }

  const { debits, credits } = useMemo(() => {
    const debits: Transaction[] = []
    const credits: Transaction[] = []
    for (const t of transactions) {
      if (t.debit !== null) debits.push(t)
      else if (t.credit !== null) credits.push(t)
    }
    debits.sort((a, b) => (b.debit ?? 0) - (a.debit ?? 0))
    credits.sort((a, b) => (b.credit ?? 0) - (a.credit ?? 0))
    return { debits, credits }
  }, [transactions])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
      <Box sx={{ px: 1.5, pt: 1, pb: 1, display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2">
            {period} · {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
          </Typography>
          {(debitTotal > 0 || creditTotal > 0) && (
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              {debitTotal > 0 && (
                <Typography variant="body2" sx={{ color: DEBIT_COLOR }}>
                  Debit {amountFmt.format(debitTotal)}
                </Typography>
              )}
              {creditTotal > 0 && (
                <Typography variant="body2" sx={{ color: CREDIT_COLOR }}>
                  Credit {amountFmt.format(creditTotal)}
                </Typography>
              )}
            </Stack>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ ml: 1 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {transactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 1.5 }}>
          No transactions in this period.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {credits.length > 0 && (
            <TransactionGroup
              label="Credit"
              color={CREDIT_COLOR}
              bucket={bucket}
              transactions={credits}
              kind="credit"
              onTransactionClick={onTransactionClick}
            />
          )}
          {debits.length > 0 && (
            <TransactionGroup
              label="Debit"
              color={DEBIT_COLOR}
              bucket={bucket}
              transactions={debits}
              kind="debit"
              onTransactionClick={onTransactionClick}
            />
          )}
        </Box>
      )}
    </Box>
  )
}

function TransactionGroup({
  label,
  color,
  bucket,
  transactions,
  kind,
  onTransactionClick,
}: {
  label: string
  color: string
  bucket: 'day' | 'month'
  transactions: Transaction[]
  kind: 'debit' | 'credit'
  onTransactionClick: (t: Transaction) => void
}) {
  const total = transactions.reduce((acc, t) => acc + (kind === 'debit' ? t.debit ?? 0 : t.credit ?? 0), 0)
  return (
    <Box>
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          bgcolor: kind === 'debit' ? '#fdecea' : '#edf7ed',
          borderTop: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
          {label} · {transactions.length}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {amountFmt.format(total)}
        </Typography>
      </Box>
      <Table size="small">
        <TableBody>
          {transactions.map((t, i) => {
            const amount = kind === 'debit' ? t.debit : t.credit
            return (
              <TableRow
                key={i}
                hover
                onClick={() => onTransactionClick(t)}
                sx={{ cursor: 'pointer' }}
              >
                {bucket === 'month' && (
                  <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap', width: 48 }}>
                    {t.date.slice(5)}
                  </TableCell>
                )}
                <TableCell
                  sx={{
                    py: 0.5,
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={t.description}
                >
                  {t.description || '—'}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ py: 0.5, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                >
                  {amount !== null ? amountFmt.format(amount) : ''}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}
