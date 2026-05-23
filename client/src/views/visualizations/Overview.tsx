import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  ButtonBase,
  CircularProgress,
  Divider,
  Stack,
  Typography,
  alpha,
} from '@mui/material'
import { PieChart } from '@mui/x-charts/PieChart'
import { getGroups, getTransactions, type Group, type Transaction } from '../../api'
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
// the first top-level group whose descendant leaf set contains its category.
// Slice value is debit-only (spending); credit-only transactions don't contribute
// to slice size but still appear in the side panel for the group they belong to.
function buildSlices(transactions: Transaction[], groups: Group[]): GroupSlice[] {
  const groupsByName = new Map(groups.map((g) => [g.name, g.children] as const))

  const referenced = new Set<string>()
  for (const g of groups) {
    for (const child of g.children) {
      if (groupsByName.has(child)) referenced.add(child)
    }
  }
  const topGroups = groups.filter((g) => !referenced.has(g.name))

  const resolveLeaves = (name: string): Set<string> => {
    const out = new Set<string>()
    const seen = new Set<string>()
    const walk = (n: string) => {
      if (seen.has(n)) return
      seen.add(n)
      const children = groupsByName.get(n)
      if (!children) {
        out.add(n)
        return
      }
      for (const c of children) walk(c)
    }
    walk(name)
    return out
  }

  // category → top-group name (first owner wins on overlap)
  const categoryOwner = new Map<string, string>()
  for (const g of topGroups) {
    for (const leaf of resolveLeaves(g.name)) {
      if (!categoryOwner.has(leaf)) categoryOwner.set(leaf, g.name)
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
    const owner = t.category !== null ? categoryOwner.get(t.category) : undefined
    const id = owner ?? UNCLASSIFIED_ID
    const label = owner ?? UNCLASSIFIED_LABEL
    const entry = ensure(id, label)
    entry.transactions.push(t)
    if (t.debit !== null) entry.value += t.debit
  }

  const slices: GroupSlice[] = []
  let colorIdx = 0
  for (const g of topGroups) {
    const entry = byGroup.get(g.name)
    if (!entry || entry.value === 0) continue
    slices.push({
      id: g.name,
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    Promise.all([getTransactions(from, to), getGroups()])
      .then(([tx, g]) => {
        setTransactions(tx)
        setGroups(g.groups)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to])

  const slices = useMemo(() => buildSlices(transactions, groups), [transactions, groups])
  const totalSpent = useMemo(() => slices.reduce((acc, s) => acc + s.value, 0), [slices])
  const totalTxns = useMemo(
    () => slices.reduce((acc, s) => acc + s.txnCount, 0),
    [slices],
  )

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
        subtitle={`Spent ${amountFmt.format(selectedSlice.value)} · ${
          totalSpent > 0 ? pctFmt.format(selectedSlice.value / totalSpent) : '0%'
        }`}
        transactions={selectedSlice.transactions}
        dateColumn="full"
        hideCredits
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
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ letterSpacing: 1.2 }}
              >
                Total spent
              </Typography>
              <Typography
                variant="h3"
                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, lineHeight: 1.1 }}
              >
                {amountFmt.format(totalSpent)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {totalTxns.toLocaleString()}{' '}
                {totalTxns === 1 ? 'transaction' : 'transactions'} across {slices.length}{' '}
                {slices.length === 1 ? 'group' : 'groups'}
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
                      data: slices.map((s) => ({
                        id: s.id,
                        label: s.label,
                        value: s.value,
                        color: s.color,
                      })),
                      innerRadius: 80,
                      outerRadius: 150,
                      paddingAngle: 1.5,
                      cornerRadius: 3,
                      highlightScope: { fade: 'global', highlight: 'item' },
                      valueFormatter: (item) =>
                        totalSpent > 0
                          ? `${amountFmt.format(item.value)} · ${pctFmt.format(
                              item.value / totalSpent,
                            )}`
                          : amountFmt.format(item.value),
                    },
                  ]}
                  onItemClick={(_event, _identifier, item) => {
                    setSelectedId(String(item.id))
                  }}
                  sx={{ cursor: 'pointer' }}
                />
              </Box>

              <Stack spacing={1.25}>
                {slices.map((s) => {
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
                        transition: 'background-color 120ms',
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
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}
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
                        <Typography
                          variant="body2"
                          sx={{
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 500,
                            minWidth: 88,
                            textAlign: 'right',
                          }}
                        >
                          {amountFmt.format(s.value)}
                        </Typography>
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
