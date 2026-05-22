import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'

const MOCK_CATEGORIES = [
  { name: 'Groceries', color: 'success', rules: 4 },
  { name: 'Dining', color: 'warning', rules: 3 },
  { name: 'Transport', color: 'info', rules: 2 },
  { name: 'Utilities', color: 'secondary', rules: 5 },
  { name: 'Shopping', color: 'primary', rules: 6 },
  { name: 'Income', color: 'success', rules: 1 },
  { name: 'Uncategorized', color: 'default', rules: 0 },
] as const

const MOCK_RULES = [
  { match: 'GROCERY STORE*', category: 'Groceries' },
  { match: 'STARBUCKS', category: 'Dining' },
  { match: '*GAS STATION*', category: 'Transport' },
  { match: 'ELECTRICITY*', category: 'Utilities' },
]

export default function Categorization() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Categorization
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage categories and rules used to label transactions automatically.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Categories
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {MOCK_CATEGORIES.map((c) => (
            <Chip
              key={c.name}
              label={`${c.name} (${c.rules})`}
              color={c.color === 'default' ? undefined : c.color}
              onDelete={() => {}}
            />
          ))}
          <Chip icon={<AddIcon />} label="New category" variant="outlined" onClick={() => {}} />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1">Rules</Typography>
          <Button startIcon={<AddIcon />} size="small" variant="contained">
            Add rule
          </Button>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField label="Match pattern" size="small" sx={{ flex: 1 }} placeholder="e.g. GROCERY*" />
          <TextField label="Category" size="small" sx={{ flex: 1 }} placeholder="Groceries" />
        </Stack>
        <Divider />
        <List dense>
          {MOCK_RULES.map((r, i) => (
            <ListItem
              key={i}
              secondaryAction={
                <Stack direction="row">
                  <IconButton size="small"><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small"><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              }
            >
              <ListItemText
                primary={<code>{r.match}</code>}
                secondary={`→ ${r.category}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  )
}
