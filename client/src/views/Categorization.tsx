import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Button,
  TextField,
  IconButton,
  Autocomplete,
  Divider,
  Tooltip,
  Alert,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { getRules, getSchema, putRules, type Rule } from '../api'

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function Categorization() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loaded, setLoaded] = useState(false)
  const [category, setCategory] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordDraft, setKeywordDraft] = useState('')
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getRules()
      .then((r) => setRules(r.rules))
      .catch((e) => setRulesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    getSchema()
      .then((s) => setAvailableColumns(s.columns))
      .catch((e) => setSchemaError(e instanceof Error ? e.message : String(e)))
  }, [])

  function persist(next: Rule[]) {
    setRules(next)
    setSaveError(null)
    putRules(next).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)))
  }

  const existingCategories = useMemo(
    () => Array.from(new Set(rules.map((r) => r.category))).sort(),
    [rules],
  )

  function commitKeywordDraft(): string[] {
    const tokens = keywordDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (tokens.length === 0) return keywords
    const next = Array.from(new Set([...keywords, ...tokens.map((t) => t.toLowerCase())]))
    setKeywords(next)
    setKeywordDraft('')
    return next
  }

  function addRule() {
    const finalKeywords = commitKeywordDraft()
    const trimmedCategory = category.trim()
    if (!trimmedCategory || finalKeywords.length === 0 || columns.length === 0) return
    persist([
      ...rules,
      { id: newId(), category: trimmedCategory, columns, keywords: finalKeywords },
    ])
    setCategory('')
    setColumns([])
    setKeywords([])
    setKeywordDraft('')
  }

  function removeRule(id: string) {
    persist(rules.filter((r) => r.id !== id))
  }

  function moveRule(id: string, direction: -1 | 1) {
    const idx = rules.findIndex((r) => r.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= rules.length) return
    const next = [...rules]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    persist(next)
  }

  function removeKeywordFromRule(ruleId: string, keyword: string) {
    persist(
      rules
        .map((r) =>
          r.id === ruleId ? { ...r, keywords: r.keywords.filter((k) => k !== keyword) } : r,
        )
        .filter((r) => r.keywords.length > 0),
    )
  }

  const canAdd =
    category.trim().length > 0 &&
    columns.length > 0 &&
    (keywords.length > 0 || keywordDraft.trim().length > 0)

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Categorization
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Define rules to classify transactions. Each rule matches a category when any of its keywords
        appears (case-insensitive) in any of the chosen columns. Rules are evaluated top-to-bottom —
        the first match wins. Unmatched transactions fall into <em>Uncategorized</em>.
      </Typography>

      {rulesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load rules: {rulesError}
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
          Failed to save rules: {saveError}
        </Alert>
      )}
      {schemaError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load columns: {schemaError}
        </Alert>
      )}
      {loaded && !schemaError && availableColumns.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No columns available yet. Upload a CSV first to detect columns.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add rule
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <Autocomplete
            freeSolo
            options={existingCategories}
            value={category}
            onChange={(_, v) => setCategory(v ?? '')}
            onInputChange={(_, v) => setCategory(v)}
            sx={{ flex: 1, minWidth: 200 }}
            renderInput={(params) => (
              <TextField {...params} label="Category" size="small" placeholder="e.g. Groceries" />
            )}
          />
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={availableColumns}
            value={columns}
            onChange={(_, v) => setColumns(v)}
            disabled={availableColumns.length === 0}
            sx={{ flex: 2, minWidth: 260 }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index })
                return <Chip key={key} label={option} size="small" {...tagProps} />
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Match against columns"
                size="small"
                placeholder={columns.length === 0 ? 'Select one or more columns' : ''}
              />
            )}
          />
        </Stack>
        <TextField
          label="Keywords"
          size="small"
          fullWidth
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commitKeywordDraft()
            } else if (e.key === 'Backspace' && !keywordDraft && keywords.length > 0) {
              setKeywords(keywords.slice(0, -1))
            }
          }}
          onBlur={() => commitKeywordDraft()}
          placeholder="Type a keyword and press Enter (e.g. fantastico, billa)"
          helperText="Substring match, case-insensitive. Separate with Enter or comma."
        />
        {keywords.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {keywords.map((k) => (
              <Chip
                key={k}
                label={k}
                size="small"
                onDelete={() => setKeywords(keywords.filter((x) => x !== k))}
              />
            ))}
          </Stack>
        )}
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            size="small"
            disabled={!canAdd}
            onClick={addRule}
          >
            Add rule
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle1">
            Rules{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              (priority order — first match wins)
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'} · {existingCategories.length}{' '}
            {existingCategories.length === 1 ? 'category' : 'categories'}
          </Typography>
        </Stack>

        {rules.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              No rules yet. Add one above to start categorizing transactions.
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider flexItem />}>
            {rules.map((rule, i) => (
              <Stack
                key={rule.id}
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ py: 1.5 }}
              >
                <Box sx={{ width: 32, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 200 }}>
                  <Chip label={rule.category} color="primary" size="small" />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 0.5 }}
                  >
                    on {rule.columns.join(', ')}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
                  {rule.keywords.map((k) => (
                    <Chip
                      key={k}
                      label={k}
                      size="small"
                      variant="outlined"
                      onDelete={() => removeKeywordFromRule(rule.id, k)}
                    />
                  ))}
                </Stack>
                <Stack direction="row">
                  <Tooltip title="Move up">
                    <span>
                      <IconButton size="small" disabled={i === 0} onClick={() => moveRule(rule.id, -1)}>
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        disabled={i === rules.length - 1}
                        onClick={() => moveRule(rule.id, 1)}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Delete rule">
                    <IconButton size="small" onClick={() => removeRule(rule.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  )
}
