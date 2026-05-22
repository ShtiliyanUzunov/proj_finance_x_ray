import { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import PieChartIcon from '@mui/icons-material/PieChart'
import StackedBarChartIcon from '@mui/icons-material/StackedBarChart'

type ChartType = 'bar' | 'line' | 'pie' | 'stacked'

const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Bar chart',
  line: 'Line chart',
  pie: 'Pie chart',
  stacked: 'Stacked bar',
}

function ChartPlaceholder({ type }: { type: ChartType }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: 360,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
        borderStyle: 'dashed',
      }}
    >
      <Typography variant="h6" color="text.secondary">
        {CHART_LABELS[type]} (mock)
      </Typography>
    </Paper>
  )
}

export default function Visualization() {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [range, setRange] = useState('last-3-months')

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Visualizations
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Explore spending patterns across time, categories, and accounts.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, v) => v && setChartType(v)}
          size="small"
        >
          <ToggleButton value="bar"><BarChartIcon sx={{ mr: 1 }} fontSize="small" />Bar</ToggleButton>
          <ToggleButton value="line"><ShowChartIcon sx={{ mr: 1 }} fontSize="small" />Line</ToggleButton>
          <ToggleButton value="pie"><PieChartIcon sx={{ mr: 1 }} fontSize="small" />Pie</ToggleButton>
          <ToggleButton value="stacked"><StackedBarChartIcon sx={{ mr: 1 }} fontSize="small" />Stacked</ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Date range</InputLabel>
          <Select
            value={range}
            label="Date range"
            onChange={(e) => setRange(e.target.value)}
          >
            <MenuItem value="last-month">Last month</MenuItem>
            <MenuItem value="last-3-months">Last 3 months</MenuItem>
            <MenuItem value="last-year">Last year</MenuItem>
            <MenuItem value="all-time">All time</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <ChartPlaceholder type={chartType} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, height: 360 }}>
            <Typography variant="subtitle1" gutterBottom>Summary</Typography>
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">Total inflow: —</Typography>
              <Typography variant="body2" color="text.secondary">Total outflow: —</Typography>
              <Typography variant="body2" color="text.secondary">Net: —</Typography>
              <Typography variant="body2" color="text.secondary">Top category: —</Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartPlaceholder type="pie" />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartPlaceholder type="line" />
        </Grid>
      </Grid>
    </Box>
  )
}
