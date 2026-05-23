import { useMemo } from 'react'
import {
  Box,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { Transaction } from '../../api'

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
  onClose: () => void
  onTransactionClick: (t: Transaction) => void
}

export default function TransactionDetailsPanel({
  title,
  subtitle,
  transactions,
  dateColumn = 'none',
  hideCredits = false,
  onClose,
  onTransactionClick,
}: Props) {
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

  const headerCount = hideCredits ? debits.length : transactions.length

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
          {(debitTotal > 0 || (!hideCredits && creditTotal > 0)) && (
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              {debitTotal > 0 && (
                <Typography variant="body2" sx={{ color: DEBIT_COLOR }}>
                  Debit {amountFmt.format(debitTotal)}
                </Typography>
              )}
              {!hideCredits && creditTotal > 0 && (
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
              onTransactionClick={onTransactionClick}
            />
          )}
          {debits.length > 0 && (
            <TransactionGroup
              label="Debit"
              color={DEBIT_COLOR}
              dateColumn={dateColumn}
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
  dateColumn,
  transactions,
  kind,
  onTransactionClick,
}: {
  label: string
  color: string
  dateColumn: DateColumnMode
  transactions: Transaction[]
  kind: 'debit' | 'credit'
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
            return (
              <TableRow
                key={i}
                hover
                onClick={() => onTransactionClick(t)}
                sx={{ cursor: 'pointer' }}
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
