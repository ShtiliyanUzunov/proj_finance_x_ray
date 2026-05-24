import { useMemo } from 'react'
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  alpha,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { Group, Rule, Transaction } from '../../api'

export const DEBIT_COLOR = '#d32f2f'
export const CREDIT_COLOR = '#2e7d32'

export const amountFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// 'none'  → no date column (caller's title already implies the date)
// 'short' → MM-DD (caller's title is a month)
// 'full'  → YYYY-MM-DD (caller's title spans multiple months, e.g. by category)
export type DateColumnMode = 'none' | 'short' | 'full'

interface Props {
  title: string
  subtitle?: string
  transactions: Transaction[]
  dateColumn?: DateColumnMode
  hideCredits?: boolean
  hideDebits?: boolean
  // When provided, matched rows get a color tint and show "<group> <pattern>"
  // instead of the raw description. Unmatched rows fall back to the description.
  rules?: Rule[]
  groups?: Group[]
  onClose: () => void
  onTransactionClick: (t: Transaction) => void
}

export default function TransactionDetailsPanel({
  title,
  subtitle,
  transactions,
  dateColumn = 'none',
  hideCredits = false,
  hideDebits = false,
  rules,
  groups,
  onClose,
  onTransactionClick,
}: Props) {
  const ruleById = useMemo(() => {
    const m = new Map<string, Rule>()
    if (rules) for (const r of rules) m.set(r.id, r)
    return m
  }, [rules])

  // Map each rule id to the top-level group name that owns it (a top-level
  // group is one not referenced as a child by any other group). Same semantics
  // as the Overview pie chart so the labelling is consistent across views.
  // Unowned rules get no entry — render code falls back to `rule.category`.
  const groupNameByRuleId = useMemo(() => {
    const out = new Map<string, string>()
    if (!groups || groups.length === 0) return out
    const childrenById = new Map(groups.map((g) => [g.id, g.children] as const))
    const referenced = new Set<string>()
    for (const g of groups) {
      for (const c of g.children) if (childrenById.has(c)) referenced.add(c)
    }
    const topGroups = groups.filter((g) => !referenced.has(g.id))
    const resolveLeafIds = (rootId: string): Set<string> => {
      const result = new Set<string>()
      const seen = new Set<string>()
      const walk = (id: string) => {
        if (seen.has(id)) return
        seen.add(id)
        const children = childrenById.get(id)
        if (!children) {
          result.add(id)
          return
        }
        for (const c of children) walk(c)
      }
      walk(rootId)
      return result
    }
    for (const g of topGroups) {
      for (const leafId of resolveLeafIds(g.id)) {
        if (!out.has(leafId)) out.set(leafId, g.name)
      }
    }
    return out
  }, [groups])
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

  // Header count reflects only the kinds we're actually rendering, so the
  // "N transactions" label doesn't lie about what's visible below.
  const headerCount =
    hideCredits && hideDebits
      ? 0
      : hideCredits
        ? debits.length
        : hideDebits
          ? credits.length
          : transactions.length

  const showDebitTotal = !hideDebits && debitTotal > 0
  const showCreditTotal = !hideCredits && creditTotal > 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
      <Box sx={{ px: 1.5, pt: 1, pb: 1, display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap title={title}>
            {title} · {headerCount}{' '}
            {headerCount === 1 ? 'transaction' : 'transactions'}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap title={subtitle}>
              {subtitle}
            </Typography>
          )}
          {(showDebitTotal || showCreditTotal) && (
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              {showDebitTotal && (
                <Typography variant="body2" sx={{ color: DEBIT_COLOR }}>
                  Debit {amountFmt.format(debitTotal)}
                </Typography>
              )}
              {showCreditTotal && (
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
      {headerCount === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 1.5 }}>
          No transactions to show.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {!hideCredits && credits.length > 0 && (
            <TransactionGroup
              label="Credit"
              color={CREDIT_COLOR}
              dateColumn={dateColumn}
              transactions={credits}
              kind="credit"
              ruleById={ruleById}
              groupNameByRuleId={groupNameByRuleId}
              onTransactionClick={onTransactionClick}
            />
          )}
          {!hideDebits && debits.length > 0 && (
            <TransactionGroup
              label="Debit"
              color={DEBIT_COLOR}
              dateColumn={dateColumn}
              transactions={debits}
              kind="debit"
              ruleById={ruleById}
              groupNameByRuleId={groupNameByRuleId}
              onTransactionClick={onTransactionClick}
            />
          )}
        </Box>
      )}
    </Box>
  )
}

// First pattern (case-insensitive substring) of the rule found in `text`. Used
// to surface *which* keyword triggered a match; falls back to null if no pattern
// is visibly present (e.g. matched on a column not in the description join).
function findMatchedPattern(rule: Rule, text: string): string | null {
  const lower = text.toLowerCase()
  for (const p of rule.patterns) {
    if (lower.includes(p)) return p
  }
  return null
}

function TransactionGroup({
  label,
  color,
  dateColumn,
  transactions,
  kind,
  ruleById,
  groupNameByRuleId,
  onTransactionClick,
}: {
  label: string
  color: string
  dateColumn: DateColumnMode
  transactions: Transaction[]
  kind: 'debit' | 'credit'
  ruleById: Map<string, Rule>
  groupNameByRuleId: Map<string, string>
  onTransactionClick: (t: Transaction) => void
}) {
  const total = transactions.reduce(
    (acc, t) => acc + (kind === 'debit' ? t.debit ?? 0 : t.credit ?? 0),
    0,
  )
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
            const dateLabel =
              dateColumn === 'short' ? t.date.slice(5) : dateColumn === 'full' ? t.date : null
            const matchedRule = t.matched_rule_ids.length > 0
              ? ruleById.get(t.matched_rule_ids[0])
              : undefined
            const matchedPattern =
              matchedRule && t.description
                ? findMatchedPattern(matchedRule, t.description)
                : null
            const tint = matchedRule?.color
            return (
              <TableRow
                key={i}
                hover
                onClick={() => onTransactionClick(t)}
                sx={{
                  cursor: 'pointer',
                  ...(tint && {
                    bgcolor: alpha(tint, 0.1),
                    '&:hover': { bgcolor: alpha(tint, 0.18) },
                  }),
                }}
              >
                {dateLabel !== null && (
                  <TableCell
                    sx={{
                      py: 0.5,
                      whiteSpace: 'nowrap',
                      width: dateColumn === 'full' ? 90 : 48,
                    }}
                  >
                    {dateLabel}
                  </TableCell>
                )}
                <TableCell
                  sx={{
                    py: 0.5,
                    maxWidth: 240,
                    overflow: 'hidden',
                  }}
                  title={t.description}
                >
                  {matchedRule ? (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        minWidth: 0,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 500,
                          color: tint,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {groupNameByRuleId.get(matchedRule.id) ?? matchedRule.category}
                      </Box>
                      {matchedPattern && tint && (
                        <Chip
                          label={matchedPattern}
                          size="small"
                          sx={{
                            height: 18,
                            flexShrink: 0,
                            bgcolor: alpha(tint, 0.2),
                            color: tint,
                            fontSize: '0.7rem',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      )}
                    </Box>
                  ) : (
                    <Box
                      component="span"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.description || '—'}
                    </Box>
                  )}
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
