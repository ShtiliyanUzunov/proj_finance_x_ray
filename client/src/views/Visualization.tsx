import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Stack, TextField, Chip, Alert, Button, Tabs, Tab } from '@mui/material'
import { getSummary, type Summary } from '../api'
import Timeline, { type TimelineMeta } from './visualizations/Timeline'

export default function Visualization() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [available, setAvailable] = useState<{ min: string; max: string } | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [timelineMeta, setTimelineMeta] = useState<TimelineMeta | null>(null)

  useEffect(() => {
    setLoading(true)
    getSummary()
      .then((s) => {
        setSummary(s)
        if (s.date_min && s.date_max) {
          setAvailable({ min: s.date_min, max: s.date_max })
          setFrom(s.date_min)
          setTo(s.date_max)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!available) return
    if (!from && !to) return
    getSummary(from || undefined, to || undefined)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [from, to, available])

  const filterActive =
    available !== null && (from !== available.min || to !== available.max)

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Visualizations
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading available range…</Typography>
        ) : !available ? (
          <Typography variant="body2" color="text.secondary">
            No dated data available yet. Upload a CSV with a date column to enable filtering.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Data available from <strong>{available.min}</strong> to <strong>{available.max}</strong>
              {summary && ` · ${summary.files} ${summary.files === 1 ? 'file' : 'files'} · ${summary.total_rows} rows total`}
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="From"
                type="date"
                size="small"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: available.min, max: available.max }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: available.min, max: available.max }}
              />
              <Button
                size="small"
                onClick={() => {
                  setFrom(available.min)
                  setTo(available.max)
                }}
                disabled={!filterActive}
              >
                Reset
              </Button>
              <Box sx={{ flex: 1 }} />
              {tab === 0 && timelineMeta && (
                <Chip
                  variant="outlined"
                  label={`${timelineMeta.count} ${
                    timelineMeta.bucket === 'day'
                      ? timelineMeta.count === 1 ? 'day' : 'days'
                      : timelineMeta.count === 1 ? 'month' : 'months'
                  }`}
                />
              )}
              {summary && (
                <Chip
                  color="primary"
                  variant="outlined"
                  label={`${summary.matching_rows.toLocaleString()} ${summary.matching_rows === 1 ? 'row' : 'rows'} will be visualized`}
                />
              )}
            </Stack>
          </Stack>
        )}
      </Paper>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Timeline" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === 0 && available && <Timeline from={from} to={to} onMeta={setTimelineMeta} />}
          {tab === 0 && !available && (
            <Typography variant="body2" color="text.secondary">
              Upload a CSV with a date column to see the timeline.
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  )
}
