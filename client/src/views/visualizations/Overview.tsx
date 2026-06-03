import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  ButtonBase,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
  alpha,
} from '@mui/material'
import { PieChart } from '@mui/x-charts/PieChart'
import {
  getGroups,
  getRules,
  getTransactions,
  type Group,
  type Rule,
  type Transaction,
} from '../../api'
import TransactionDetailsPanel, { amountFmt } from './TransactionDetailsPanel'

interface Props {
  from: string
  to: string
  panelTarget?: HTMLElement | null
}

const UNCLASSIFIED_ID = '__unclassified__'
const UNCLASSIFIED_LABEL = 'Unclassified'
const UNCLASSIFIED_COLOR = '#9e9e9e'
const PANEL_WIDTH = 440
const CHART_HEIGHT = 320

const GROUP_PALETTE = [
  '#1976d2',
  '#9c27b0',
  '#00897b',
  '#ef6c00',
  '#5d4037',
  '#c2185b',
  '#0097a7',
  '#7cb342',
  '#fbc02d',
  '#455a64',
]

interface GroupSlice {
  id: string
  label: string
  color: string
  value: number // spending only (sum of debits)
  txnCount: number
  transactions: Transaction[]
}

// Top-level groups are those not referenced as a child by any other group — these
// are the roots the user wants to see on the pie. A transaction is attributed to
// the first top-level group whose descendant rule-id set contains the rule that
// matched it (`matched_rule_ids[0]`, mirroring the server's first-match priority).
// Slice value is debit-only (spending); credit-only transactions don't contribute
// to slice size but still appear in the side panel for the group they belong to.
function buildSlices(transactions: Transaction[], groups: Group[]): GroupSlice[] {
  const groupsById = new Map(groups.map((g) => [g.id, g.children] as const))

  const referenced = new Set<string>()
  for (const g of groups) {
    for (const child of g.children) {
      if (groupsById.has(child)) referenced.add(child)
    }
  }
  const topGroups = groups.filter((g) => !referenced.has(g.id))

  // Expand a group to the set of leaf rule IDs it covers (children that aren't
  // groups are treated as rule IDs; ghosts will simply never match a transaction).
  const resolveLeafIds = (rootId: string): Set<string> => {
    const out = new Set<string>()
    const seen = new Set<string>()
    const walk = (id: string) => {
      if (seen.has(id)) return
      seen.add(id)
      const children = groupsById.get(id)
      if (!children) {
        out.add(id)
        return
      }
      for (const c of children) walk(c)
    }
    walk(rootId)
    return out
  }

  // rule id → top-group id (first owner wins on overlap)
  const ruleOwner = new Map<string, string>()
  for (const g of topGroups) {
    for (const leafId of resolveLeafIds(g.id)) {
      if (!ruleOwner.has(leafId)) ruleOwner.set(leafId, g.id)
    }
  }

  const byGroup = new Map<
    string,
    { label: string; transactions: Transaction[]; value: number }
  >()
  const ensure = (id: string, label: string) => {
    let entry = byGroup.get(id)
    if (!entry) {
      entry = { label, transactions: [], value: 0 }
      byGroup.set(id, entry)
    }
    return entry
  }

  for (const t of transactions) {
    let ownerId: string | undefined
    for (const ruleId of t.matched_rule_ids) {
      const owner = ruleOwner.get(ruleId)
      if (owner) {
        ownerId = owner
        break
      }
    }
    const bucketId = ownerId ?? UNCLASSIFIED_ID
    const label = ownerId
      ? topGroups.find((g) => g.id === ownerId)?.name ?? UNCLASSIFIED_LABEL
      : UNCLASSIFIED_LABEL
    const entry = ensure(bucketId, label)
    entry.transactions.push(t)
    if (t.debit !== null) entry.value += t.debit
  }

  const slices: GroupSlice[] = []
  let colorIdx = 0
  for (const g of topGroups) {
    const entry = byGroup.get(g.id)
    if (!entry || entry.value === 0) continue
    slices.push({
      id: g.id,
      label: g.name,
      color: GROUP_PALETTE[colorIdx++ % GROUP_PALETTE.length],
      value: entry.value,
      txnCount: entry.transactions.length,
      transactions: entry.transactions,
    })
  }
  slices.sort((a, b) => b.value - a.value)

  const unclassified = byGroup.get(UNCLASSIFIED_ID)
  if (unclassified && unclassified.value > 0) {
    slices.push({
      id: UNCLASSIFIED_ID,
      label: UNCLASSIFIED_LABEL,
      color: UNCLASSIFIED_COLOR,
      value: unclassified.value,
      txnCount: unclassified.transactions.length,
      transactions: unclassified.transactions,
    })
  }
  return slices
}

export default function Overview({ from, to, panelTarget }: Props) {
  const navigate = useNavigate()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    Promise.all([getTransactions(from, to), getGroups(), getRules()])
      .then(([tx, g, r]) => {
        setTransactions(tx)
        setGroups(g.groups)
        setRules(r.rules)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to])

  const slices = useMemo(() => buildSlices(transactions, groups), [transactions, groups])

  // Groups the user has toggled off via the breakdown checkboxes. They stay
  // visible in the breakdown (so the checkbox is reachable to re-enable them)
  // but are removed from the pie chart and from the totals/averages so the
  // analysis reflects only the groups currently of interest.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  // When on, every displayed amount (hero total, per-group rows, pie tooltips)
  // is divided by the number of months in the range so the view reads as a
  // monthly-average analysis instead of an absolute total. Percentages and pie
  // slice proportions are invariant (same constant divisor everywhere), so the
  // chart shape looks identical — only the magnitudes shift.
  const [showMonthlyAvg, setShowMonthlyAvg] = useState(false)
  const visibleSlices = useMemo(
    () => slices.filter((s) => !excludedIds.has(s.id)),
    [slices, excludedIds],
  )

  // Breakdown render order: non-excluded first (preserving the existing value /
  // Unclassified-last order from buildSlices), then excluded items at the
  // bottom. Stable sort keeps the relative order within each group intact.
  const orderedSlices = useMemo(
    () =>
      [...slices].sort(
        (a, b) => Number(excludedIds.has(a.id)) - Number(excludedIds.has(b.id)),
      ),
    [slices, excludedIds],
  )

  // Prune stale exclusions: if a slice disappears (e.g., range change removes
  // a group entirely), drop it from the excluded set so the size stays bounded
  // and re-fetching with the same group later doesn't surprise the user.
  useEffect(() => {
    setExcludedIds((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(slices.map((s) => s.id))
      const next = new Set<string>()
      for (const id of prev) if (valid.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    })
  }, [slices])

  const totalSpent = useMemo(
    () => visibleSlices.reduce((acc, s) => acc + s.value, 0),
    [visibleSlices],
  )
  // Count of distinct calendar months touched by [from, to] (inclusive). Used
  // to derive a monthly-average spend per slice. Falls back to 1 so a one-day
  // range still shows a meaningful (non-divide-by-zero) average.
  const monthsInRange = useMemo(() => {
    if (!from || !to) return 1
    const f = new Date(`${from}T00:00:00Z`)
    const t = new Date(`${to}T00:00:00Z`)
    if (isNaN(f.getTime()) || isNaN(t.getTime())) return 1
    const months =
      (t.getUTCFullYear() - f.getUTCFullYear()) * 12 +
      (t.getUTCMonth() - f.getUTCMonth()) +
      1
    return Math.max(1, months)
  }, [from, to])

  const divisor = showMonthlyAvg && monthsInRange > 1 ? monthsInRange : 1
  const valueLabel = divisor > 1 ? 'Monthly average' : 'Total spent'

  const pctFmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [],
  )

  const selectedSlice = selectedId ? slices.find((s) => s.id === selectedId) ?? null : null

  useEffect(() => {
    if (selectedId && !slices.some((s) => s.id === selectedId)) setSelectedId(null)
  }, [slices, selectedId])

  const panel = selectedSlice ? (
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
        title={selectedSlice.label}
        subtitle={`${divisor > 1 ? 'Avg/mo' : 'Spent'} ${amountFmt.format(
          selectedSlice.value / divisor,
        )} · ${
          totalSpent > 0 ? pctFmt.format(selectedSlice.value / totalSpent) : '0%'
        }`}
        transactions={selectedSlice.transactions}
        dateColumn="full"
        hideCredits
        rules={rules}
        groups={groups}
        onClose={() => setSelectedId(null)}
        onTransactionClick={(t) => {
          navigate(`/inspect/${encodeURIComponent(t.source)}?row=${t.row_index}`)
        }}
      />
    </Box>
  ) : null

  return (
    <>
      <Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No groups defined. Add one in the Categorization view to see the overview.
          </Typography>
        ) : slices.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No spending in the selected range.
          </Typography>
        ) : (
          <Stack spacing={3}>
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  minHeight: 28,
                }}
              >
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ letterSpacing: 1.2 }}
                >
                  {valueLabel}
                </Typography>
                {monthsInRange > 1 && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={showMonthlyAvg}
                        onChange={(e) => setShowMonthlyAvg(e.target.checked)}
                        sx={{ p: 0.5 }}
                      />
                    }
                    label={
                      <Typography variant="caption" color="text.secondary">
                        Monthly averages
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                )}
              </Box>
              <Typography
                variant="h3"
                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, lineHeight: 1.1 }}
              >
                {amountFmt.format(totalSpent / divisor)}
              </Typography>
            </Box>

            <Divider />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
                columnGap: 4,
                rowGap: 3,
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <PieChart
                  height={CHART_HEIGHT}
                  width={320}
                  hideLegend
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  series={[
                    {
                      data: visibleSlices.map((s) => ({
                        id: s.id,
                        label: s.label,
                        value: s.value / divisor,
                        color: s.color,
                      })),
                      innerRadius: 80,
                      outerRadius: 150,
                      paddingAngle: 1.5,
                      cornerRadius: 3,
                      highlightScope: { fade: 'global', highlight: 'item' },
                      valueFormatter: (item) => {
                        const displayedTotal = totalSpent / divisor
                        return displayedTotal > 0
                          ? `${amountFmt.format(item.value)} · ${pctFmt.format(
                              item.value / displayedTotal,
                            )}`
                          : amountFmt.format(item.value)
                      },
                    },
                  ]}
                  onItemClick={(_event, _identifier, item) => {
                    setSelectedId(String(item.id))
                  }}
                  sx={{ cursor: 'pointer' }}
                />
              </Box>

              <Stack spacing={1.25}>
                {orderedSlices.map((s) => {
                  const isExcluded = excludedIds.has(s.id)
                  const pct = totalSpent > 0 ? s.value / totalSpent : 0
                  const isSelected = selectedId === s.id
                  return (
                    <ButtonBase
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      focusRipple
                      sx={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        px: 1.5,
                        py: 1,
                        borderRadius: 1,
                        transition: 'background-color 120ms, opacity 120ms',
                        opacity: isExcluded ? 0.45 : 1,
                        bgcolor: isSelected ? alpha(s.color, 0.08) : 'transparent',
                        '&:hover': { bgcolor: alpha(s.color, 0.06) },
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 1,
                          mb: 0.75,
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={!isExcluded}
                          // Stop propagation so toggling exclusion doesn't also
                          // open the side panel — they're independent actions.
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setExcludedIds((prev) => {
                              const next = new Set(prev)
                              if (checked) next.delete(s.id)
                              else next.add(s.id)
                              return next
                            })
                          }}
                          sx={{
                            p: 0,
                            mr: 0.5,
                            color: alpha(s.color, 0.5),
                            '&.Mui-checked': { color: s.color },
                          }}
                          slotProps={{ input: { 'aria-label': `Include ${s.label}` } }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            flex: 1,
                            minWidth: 0,
                            textDecoration: isExcluded ? 'line-through' : 'none',
                          }}
                          noWrap
                        >
                          {s.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {s.txnCount}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            minWidth: 88,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
                          >
                            {amountFmt.format(s.value / divisor)}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 48,
                            textAlign: 'right',
                          }}
                        >
                          {pctFmt.format(pct)}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha(s.color, 0.15),
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            width: `${Math.max(pct * 100, 1)}%`,
                            bgcolor: s.color,
                            borderRadius: 3,
                            transition: 'width 200ms',
                          }}
                        />
                      </Box>
                    </ButtonBase>
                  )
                })}
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
      {panel && panelTarget ? createPortal(panel, panelTarget) : null}
    </>
  )
}
