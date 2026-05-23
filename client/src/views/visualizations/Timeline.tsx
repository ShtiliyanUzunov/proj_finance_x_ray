import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { BarChart } from '@mui/x-charts/BarChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { useAxesTooltip, type ChartsTooltipProps } from '@mui/x-charts/ChartsTooltip'
import { getTimeline, getTransactions, type TimelinePoint, type Transaction } from '../../api'

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
}

const MIN_GROUP_WIDTH = 30
const MAX_GROUP_WIDTH = 110
const CHART_PADDING = 80
const CHART_HEIGHT = 420
const LEFT_MARGIN = 44
const RIGHT_MARGIN = 8
const DEBIT_COLOR = '#d32f2f'
const CREDIT_COLOR = '#2e7d32'
const HOVER_CLOSE_DELAY = 250
const PAPER_WIDTH = 440

const amountFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function Timeline({ from, to, onMeta }: Props) {
  const [items, setItems] = useState<TimelinePoint[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bucket, setBucket] = useState<'day' | 'month'>('day')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDebit, setShowDebit] = useState(true)
  const [showCredit, setShowCredit] = useState(false)
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    Promise.all([getTimeline(from, to, bucket), getTransactions(from, to)])
      .then(([t, tx]) => {
        setItems(t.items)
        setTransactions(tx)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to, bucket])

  useEffect(() => {
    onMeta?.({ bucket, count: items.length })
  }, [bucket, items.length, onMeta])

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

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const txnsByPeriod = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of transactions) {
      const key = bucket === 'day' ? t.date : t.date.slice(0, 7)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
  }, [transactions, bucket])

  useEffect(() => {
    setHoveredPeriod(null)
  }, [bucket])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      setHoveredPeriod(null)
      closeTimerRef.current = null
    }, HOVER_CLOSE_DELAY)
  }, [cancelClose])

  // Stable callback that the in-chart hover reader pushes axis-hover updates to.
  const hoverCallbackRef = useRef<(period: string | null) => void>(() => {})
  hoverCallbackRef.current = (period) => {
    if (period) {
      cancelClose()
      setHoveredPeriod(period)
    } else {
      scheduleClose()
    }
  }

  const tooltipSlot = useMemo(() => {
    return function HoverSlot(_props: ChartsTooltipProps) {
      return <AxisHoverReader callbackRef={hoverCallbackRef} />
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const minWidth = items.length * MIN_GROUP_WIDTH + CHART_PADDING
  const maxWidth = items.length * MAX_GROUP_WIDTH + CHART_PADDING
  const chartWidth = Math.min(Math.max(containerWidth || minWidth, minWidth), maxWidth)

  const series: { data: number[]; label: string; color: string }[] = []
  if (showDebit) series.push({ data: items.map((d) => d.debit), label: 'Debit', color: DEBIT_COLOR })
  if (showCredit) series.push({ data: items.map((d) => d.credit), label: 'Credit', color: CREDIT_COLOR })

  const boundaries = bucket === 'day' ? monthBoundaries(items) : []

  const bandIndex = hoveredPeriod ? items.findIndex((d) => d.period === hoveredPeriod) : -1
  const innerWidth = Math.max(chartWidth - LEFT_MARGIN - RIGHT_MARGIN, 0)
  const bandWidth = items.length > 0 ? innerWidth / items.length : 0
  const columnCenterX = bandIndex >= 0 ? LEFT_MARGIN + (bandIndex + 0.5) * bandWidth : 0
  // Place the popup to the right of the column so the bar stays visible. Flip to the left
  // side if there isn't enough room on the right.
  const POPUP_GAP = 45
  const halfBand = bandWidth / 2
  let paperLeft = columnCenterX + halfBand + POPUP_GAP
  if (paperLeft + PAPER_WIDTH > chartWidth) {
    paperLeft = columnCenterX - halfBand - POPUP_GAP - PAPER_WIDTH
  }
  paperLeft = Math.max(0, Math.min(chartWidth - PAPER_WIDTH, paperLeft))

  return (
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
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No dated transactions in the selected range.
        </Typography>
      ) : series.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Select at least one series to display.
        </Typography>
      ) : (
        <Box ref={scrollRef} sx={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <Box sx={{ width: chartWidth, position: 'relative' }}>
            <BarChart
              height={CHART_HEIGHT}
              width={chartWidth}
              hideLegend
              xAxis={[
                {
                  data: items.map((d) => d.period),
                  scaleType: 'band',
                  tickLabelStyle: { fontSize: 11 },
                  categoryGapRatio: 0.3,
                  barGapRatio: 0.1,
                },
              ]}
              series={series}
              margin={{ left: LEFT_MARGIN, right: RIGHT_MARGIN, top: 8, bottom: 28 }}
              slots={{ tooltip: tooltipSlot }}
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
            {hoveredPeriod && bandIndex >= 0 && (
              <Paper
                elevation={6}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: paperLeft,
                  width: PAPER_WIDTH,
                  maxHeight: CHART_HEIGHT - 16,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 10,
                }}
              >
                <TimelineTooltipContent
                  period={hoveredPeriod}
                  bucket={bucket}
                  transactions={txnsByPeriod.get(hoveredPeriod) ?? []}
                />
              </Paper>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

function AxisHoverReader({
  callbackRef,
}: {
  callbackRef: React.RefObject<(period: string | null) => void>
}) {
  const axes = useAxesTooltip()
  const period = axes && axes.length > 0 ? String(axes[0].axisValue) : null
  useEffect(() => {
    callbackRef.current?.(period)
  }, [period, callbackRef])
  useEffect(() => {
    return () => {
      callbackRef.current?.(null)
    }
  }, [callbackRef])
  return null
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

function TimelineTooltipContent({
  period,
  bucket,
  transactions,
}: {
  period: string
  bucket: 'day' | 'month'
  transactions: Transaction[]
}) {
  let debitTotal = 0
  let creditTotal = 0
  for (const t of transactions) {
    if (t.debit !== null) debitTotal += t.debit
    if (t.credit !== null) creditTotal += t.credit
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
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
      {transactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 1.5 }}>
          No transactions in this period.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {bucket === 'month' && <TableCell sx={{ py: 0.5 }}>Date</TableCell>}
                <TableCell sx={{ py: 0.5 }}>Description</TableCell>
                <TableCell sx={{ py: 0.5 }} align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((t, i) => {
                const amount = t.debit !== null ? t.debit : t.credit !== null ? t.credit : null
                const color = t.debit !== null ? DEBIT_COLOR : t.credit !== null ? CREDIT_COLOR : 'inherit'
                return (
                  <TableRow key={i}>
                    {bucket === 'month' && (
                      <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap' }}>{t.date.slice(5)}</TableCell>
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
      )}
    </Box>
  )
}
