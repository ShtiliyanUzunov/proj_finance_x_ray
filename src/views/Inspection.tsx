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
  Chip,
  InputAdornment,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'

const MOCK_ROWS = [
  { date: '2026-05-19', desc: 'GROCERY STORE 42', amount: -54.21, category: 'Groceries' },
  { date: '2026-05-18', desc: 'SALARY ACME CORP', amount: 3200.0, category: 'Income' },
  { date: '2026-05-17', desc: 'COFFEE SHOP', amount: -4.5, category: 'Dining' },
  { date: '2026-05-15', desc: 'ELECTRICITY BILL', amount: -89.34, category: 'Utilities' },
  { date: '2026-05-14', desc: 'ONLINE STORE', amount: -129.99, category: 'Shopping' },
  { date: '2026-05-12', desc: 'GAS STATION', amount: -45.0, category: 'Transport' },
]

export default function Inspection() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Inspect transactions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Browse, search, and review raw transactions from your uploads.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search description…"
          size="small"
          sx={{ flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }} />
        <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }} />
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {MOCK_ROWS.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.desc}</TableCell>
                <TableCell>
                  <Chip label={r.category} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right" sx={{ color: r.amount < 0 ? 'error.main' : 'success.main' }}>
                  {r.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
