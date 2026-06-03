import { useEffect, useRef, useState } from 'react'
import { Box, Typography, Paper, Stack, TextField, Chip, Alert, Button, Tabs, Tab } from '@mui/material'
import { getSummary, type Summary } from '../api'
import Timeline, { type TimelineMeta } from './visualizations/Timeline'
import Overview from './visualizations/Overview'

export default function Visualization() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [available, setAvailable] = useState<{ min: string; max: string } | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [timelineMeta, setTimelineMeta] = useState<TimelineMeta | null>(null)
  const [timelinePanelEl, setTimelinePanelEl] = useState<HTMLDivElement | null>(null)
  const leftSideRef = useRef<HTMLDivElement>(null)
  const [leftSideHeight, setLeftSideHeight] = useState<number | null>(null)

  useEffect(() => {
    const el = leftSideRef.current
    if (!el) return
    setLeftSideHeight(el.offsetHeight)
    const ro = new ResizeObserver(([entry]) => {
      setLeftSideHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [available, tab])

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
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 1 }}>
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <TextField
                label="From"
                type="date"
                size="small"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: available.min, max: available.max },
                }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: available.min, max: available.max },
                }}
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
              {tab === 1 && timelineMeta && (
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
                  label={`${summary.matching_rows.toLocaleString()} ${summary.matching_rows === 1 ? 'transaction' : 'transactions'}`}
                />
              )}
            </Stack>
          </Stack>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'stretch' }}>
        <Box ref={leftSideRef} sx={{ flex: 1, minWidth: 0 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tab label="Overview" />
            <Tab label="Timeline" />
          </Tabs>
          <Box sx={{ p: 2 }}>
            {tab === 0 && available && (
              <Overview from={from} to={to} panelTarget={timelinePanelEl} />
            )}
            {tab === 1 && available && (
              <Timeline
                from={from}
                to={to}
                onMeta={setTimelineMeta}
                panelTarget={timelinePanelEl}
              />
            )}
            {!available && (
              <Typography variant="body2" color="text.secondary">
                Upload a CSV with a date column to see visualizations.
              </Typography>
            )}
          </Box>
        </Box>
        <Box
          ref={setTimelinePanelEl}
          sx={{
            display: 'flex',
            maxHeight: leftSideHeight ?? undefined,
          }}
        />
      </Paper>
    </Box>
  )
}
