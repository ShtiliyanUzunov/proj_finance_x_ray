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
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
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
import TransactionDetailsPanel, {
  CREDIT_COLOR,
  DEBIT_COLOR,
  amountFmt,
} from './TransactionDetailsPanel'

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

// Backfill empty buckets across the [from, to] range so a day/month with zero
// transactions still renders as a gap-free zero bar. The server only emits
// buckets that have data, so without this the x-axis silently collapses days
// with no activity — confusing in day mode and inconsistent in month mode too.
// Iterates in UTC to avoid DST off-by-one when crossing daylight-saving boundaries.
function fillBucketGaps(
  from: string,
  to: string,
  bucket: 'day' | 'month',
  items: TimelinePoint[],
): TimelinePoint[] {
  if (!from || !to) return items
  const byPeriod = new Map(items.map((i) => [i.period, i]))
  const result: TimelinePoint[] = []
  if (bucket === 'day') {
    const start = new Date(`${from}T00:00:00Z`)
    const end = new Date(`${to}T00:00:00Z`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return items
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = cursor.toISOString().slice(0, 10)
      result.push(byPeriod.get(key) ?? { period: key, debit: 0, credit: 0 })
    }
  } else {
    const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
    const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return items
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      const key = cursor.toISOString().slice(0, 7)
      result.push(byPeriod.get(key) ?? { period: key, debit: 0, credit: 0 })
    }
  }
  return result
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
  month: 440,
}
const CHART_PADDING = 80
const CHART_HEIGHT = 420
const LEFT_MARGIN = 44
const RIGHT_MARGIN = 8
const PANEL_WIDTH = 440

// Encoded as `rule:<id>` or `group:<id>` so MUI Select can use a flat string value.
const FILTER_ALL = ''

function parseFilter(value: string): { type: 'rule' | 'group'; id: string } | null {
  if (!value) return null
  const idx = value.indexOf(':')
  if (idx < 0) return null
  const type = value.slice(0, idx)
  if (type !== 'rule' && type !== 'group') return null
  return { type, id: value.slice(idx + 1) }
}

// Walk a group's children to the set of leaf rule IDs it ultimately resolves to.
// Children that aren't group IDs are treated as leaves — matches server-side
// semantics in services/groups.py. The `ruleIds` filter drops ghosts so a stale
// child can't accidentally claim a rule that was deleted.
function resolveGroupLeafRuleIds(
  groupId: string,
  groupsById: Map<string, string[]>,
  ruleIds: Set<string>,
): Set<string> {
  const result = new Set<string>()
  const visited = new Set<string>()
  const walk = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const children = groupsById.get(id)
    if (!children) {
      if (ruleIds.has(id)) result.add(id)
      return
    }
    for (const child of children) walk(child)
  }
  walk(groupId)
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

  const ruleIds = useMemo(() => new Set(rules.map((r) => r.id)), [rules])
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r] as const)), [rules])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups])
  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.children] as const)),
    [groups],
  )

  const filter = parseFilter(filterValue)

  // The set of rule IDs the filter resolves to (null = no filter). Transactions
  // match the filter if any of their `matched_rule_ids` is in this set.
  const filterRuleIds = useMemo(() => {
    if (!filter) return null
    if (filter.type === 'rule') return new Set([filter.id])
    return resolveGroupLeafRuleIds(filter.id, groupsById, ruleIds)
  }, [filter?.type, filter?.id, groupsById, ruleIds])

  const filterLabel = useMemo(() => {
    if (!filter) return null
    if (filter.type === 'rule') return ruleById.get(filter.id)?.category ?? filter.id
    return groupById.get(filter.id)?.name ?? filter.id
  }, [filter?.type, filter?.id, ruleById, groupById])

  const filteredTransactions = useMemo(() => {
    if (!filterRuleIds) return transactions
    return transactions.filter((t) =>
      t.matched_rule_ids.some((id) => filterRuleIds.has(id)),
    )
  }, [transactions, filterRuleIds])

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
    let raw: TimelinePoint[]
    if (!filterRuleIds) {
      raw = items
    } else {
      const periods = [...txnsByPeriod.keys()].sort()
      raw = periods.map((period) => {
        let debit = 0
        let credit = 0
        for (const t of txnsByPeriod.get(period) ?? []) {
          if (t.debit !== null) debit += t.debit
          if (t.credit !== null) credit += t.credit
        }
        return { period, debit, credit }
      })
    }
    return fillBucketGaps(from, to, bucket, raw)
  }, [filterRuleIds, items, txnsByPeriod, from, to, bucket])

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

  const series: {
    data: number[]
    label: string
    color: string
    valueFormatter: (v: number | null) => string
  }[] = []
  const fmt = (v: number | null) => (v == null ? '' : amountFmt.format(v))
  if (showDebit)
    series.push({
      data: chartItems.map((d) => d.debit),
      label: 'Debit',
      color: DEBIT_COLOR,
      valueFormatter: fmt,
    })
  if (showCredit)
    series.push({
      data: chartItems.map((d) => d.credit),
      label: 'Credit',
      color: CREDIT_COLOR,
      valueFormatter: fmt,
    })

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
        <TransactionDetailsPanel
          title={selectedPeriod}
          transactions={txnsByPeriod.get(selectedPeriod) ?? []}
          dateColumn={bucket === 'month' ? 'short' : 'none'}
          hideDebits={!showDebit}
          hideCredits={!showCredit}
          rules={rules}
          groups={groups}
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
                <MenuItem key={`group:${g.id}`} value={`group:${g.id}`}>
                  {g.name}
                </MenuItem>
              ))}
              {rules.length > 0 && <ListSubheader>Categories</ListSubheader>}
              {[...rules]
                .sort((a, b) => a.category.localeCompare(b.category))
                .map((r) => (
                  <MenuItem key={`rule:${r.id}`} value={`rule:${r.id}`}>
                    {r.category}
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
              ? `No transactions matched “${filterLabel}” in the selected range.`
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
                slotProps={{ tooltip: { trigger: 'axis' } }}
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

