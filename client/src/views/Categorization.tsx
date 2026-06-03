import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  getGroups,
  getRules,
  getSchema,
  getTransactionConflicts,
  getTransactions,
  putGroups,
  putRules,
  type Group,
  type Rule,
  type Transaction,
  type TransactionConflict,
} from '../api'
import { amountFmt } from './visualizations/TransactionDetailsPanel'

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const DEFAULT_RULE_COLOR = '#1976d2'

// Pick a legible text color for the given background hex. Uses the standard
// perceived-luminance formula so the threshold matches what a human reads.
function pickContrastColor(bg: string): string {
  const hex = bg.replace('#', '')
  if (hex.length !== 6) return 'rgba(0,0,0,0.87)'
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 0.6 ? 'rgba(0,0,0,0.87)' : '#fff'
}

function colorSwatchStyle(size = 24): React.CSSProperties {
  return {
    width: size,
    height: size,
    padding: 0,
    border: '1px solid rgba(0,0,0,0.23)',
    borderRadius: 4,
    cursor: 'pointer',
    background: 'transparent',
  }
}

export default function Categorization() {
  const location = useLocation()
  const navigate = useNavigate()

  // Rules state
  const [rules, setRules] = useState<Rule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [rulesSaveError, setRulesSaveError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [ruleColumns, setRuleColumns] = useState<string[]>([])
  const [ruleColor, setRuleColor] = useState<string>(DEFAULT_RULE_COLOR)
  const [patterns, setPatterns] = useState<string[]>([])
  const [patternDraft, setPatternDraft] = useState('')

  // Schema — `availableColumns` is the canonical list of internal field names
  // a rule may target; `columnLabels` translates each to the bank-specific
  // column name the user actually recognizes (e.g. "description" → "Основание").
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({})
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const labelFor = (col: string) => columnLabels[col] ?? col

  // Groups state
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [groupsSaveError, setGroupsSaveError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupChildren, setGroupChildren] = useState<string[]>([])

  // Inline rule editing state
  const [editingCategoryRuleId, setEditingCategoryRuleId] = useState<string | null>(null)
  const [categoryDraft, setCategoryDraft] = useState('')
  // Set true momentarily on Escape so the imminent blur knows to skip the commit.
  const cancelCategoryEditRef = useRef(false)

  // Which tab is active
  const [tab, setTab] = useState<'rules' | 'groups'>('rules')

  // Conflicts state
  const [conflicts, setConflicts] = useState<TransactionConflict[]>([])
  const [conflictsError, setConflictsError] = useState<string | null>(null)
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [conflictsExpanded, setConflictsExpanded] = useState(false)
  // Bumped on every rules mutation so the conflicts/stats effects refetch.
  const [conflictsRefreshKey, setConflictsRefreshKey] = useState(0)

  // Stats panel: total transactions and how many remain uncategorized. Refetches
  // whenever rules change (via conflictsRefreshKey) so the count reflects the
  // latest categorization without the user reloading.
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    getRules()
      .then((r) => setRules(r.rules))
      .catch((e) => setRulesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRulesLoaded(true))
  }, [])

  // Hydrate the add-rule form from navigation state (e.g. the "Categorize"
  // affordance in the Inspect view). The draft is placed in the pattern input
  // *as text*, not committed as chips, so the user can edit it (or close the
  // page) before deciding whether to create the rule. Clear the state after
  // applying so a manual refresh doesn't re-prefill.
  useEffect(() => {
    const state = location.state as { prefillPatternDraft?: string } | null
    if (state?.prefillPatternDraft) {
      setPatternDraft(state.prefillPatternDraft)
      setTab('rules')
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    getGroups()
      .then((g) => setGroups(g.groups))
      .catch((e) => setGroupsError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    getSchema()
      .then((s) => {
        setAvailableColumns(s.columns)
        setColumnLabels(s.labels ?? {})
      })
      .catch((e) => setSchemaError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    setConflictsLoading(true)
    setConflictsError(null)
    getTransactionConflicts()
      .then(setConflicts)
      .catch((e) => setConflictsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setConflictsLoading(false))
  }, [conflictsRefreshKey])

  useEffect(() => {
    // Best-effort: stats panel falls back to "—" on failure.
    getTransactions()
      .then(setTransactions)
      .catch(() => {})
  }, [conflictsRefreshKey])

  const uncategorizedTxns = useMemo(
    () => transactions.filter((t) => t.category === null),
    [transactions],
  )
  const uncategorizedCount = uncategorizedTxns.length

  // Sampler: one random uncategorized transaction is surfaced so the user can
  // build rules without bouncing to the Inspect view. Holding a reference (not
  // an index) lets the sampler survive list reorders; if the held transaction
  // becomes categorized after a rule edit, the effect below auto-refreshes.
  const [uncatPreview, setUncatPreview] = useState<Transaction | null>(null)
  // Form-section anchor so "Use" can scroll the pattern input into view after
  // it pre-fills the draft.
  const patternInputRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (uncategorizedTxns.length === 0) {
      if (uncatPreview !== null) setUncatPreview(null)
      return
    }
    if (!uncatPreview || !uncategorizedTxns.includes(uncatPreview)) {
      setUncatPreview(
        uncategorizedTxns[Math.floor(Math.random() * uncategorizedTxns.length)],
      )
    }
  }, [uncategorizedTxns, uncatPreview])

  function pickNextUncategorized() {
    if (uncategorizedTxns.length === 0) return
    // Bias against picking the same one again when there's choice.
    const pool =
      uncatPreview && uncategorizedTxns.length > 1
        ? uncategorizedTxns.filter((t) => t !== uncatPreview)
        : uncategorizedTxns
    setUncatPreview(pool[Math.floor(Math.random() * pool.length)])
  }

  function useUncategorizedAsDraft(t: Transaction) {
    // Match the Inspect view's prefill shape: lowercased, comma-separated tokens
    // derived from the server-built description (which joins the first two
    // non-amount/non-date columns with " · ").
    const tokens = t.description
      .split(' · ')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    setPatternDraft(tokens.join(', '))
    patternInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // -- Rules: persistence and mutations ---------------------------------------

  function persistRules(next: Rule[]) {
    setRules(next)
    setRulesSaveError(null)
    putRules(next)
      .then(() => setConflictsRefreshKey((k) => k + 1))
      .catch((e) => setRulesSaveError(e instanceof Error ? e.message : String(e)))
  }

  const existingCategories = useMemo(
    () => Array.from(new Set(rules.map((r) => r.category))).sort(),
    [rules],
  )

  function commitPatternDraft(): string[] {
    const tokens = patternDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (tokens.length === 0) return patterns
    const next = Array.from(new Set([...patterns, ...tokens.map((t) => t.toLowerCase())]))
    setPatterns(next)
    setPatternDraft('')
    return next
  }

  function addRule() {
    const finalPatterns = commitPatternDraft()
    const trimmedCategory = category.trim()
    if (!trimmedCategory || finalPatterns.length === 0 || ruleColumns.length === 0) return
    persistRules([
      ...rules,
      {
        id: newId(),
        category: trimmedCategory,
        columns: ruleColumns,
        patterns: finalPatterns,
        color: ruleColor,
      },
    ])
    setCategory('')
    setRuleColumns([])
    setRuleColor(DEFAULT_RULE_COLOR)
    setPatterns([])
    setPatternDraft('')
  }

  function updateRuleColor(id: string, color: string) {
    persistRules(rules.map((r) => (r.id === id ? { ...r, color } : r)))
  }

  // -- Inline rule edits ------------------------------------------------------

  function startEditCategory(rule: Rule) {
    setEditingCategoryRuleId(rule.id)
    setCategoryDraft(rule.category)
  }

  function commitCategoryEdit() {
    if (!editingCategoryRuleId) return
    const trimmed = categoryDraft.trim()
    const current = rules.find((r) => r.id === editingCategoryRuleId)
    if (trimmed && current && trimmed !== current.category) {
      persistRules(
        rules.map((r) => (r.id === editingCategoryRuleId ? { ...r, category: trimmed } : r)),
      )
    }
    setEditingCategoryRuleId(null)
    setCategoryDraft('')
  }

  function cancelCategoryEdit() {
    cancelCategoryEditRef.current = true
    setEditingCategoryRuleId(null)
    setCategoryDraft('')
  }

  function updateRuleColumns(id: string, columns: string[]) {
    persistRules(rules.map((r) => (r.id === id ? { ...r, columns } : r)))
  }

  function addPatternToRule(id: string, pattern: string) {
    const normalized = pattern.trim().toLowerCase()
    if (!normalized) return
    persistRules(
      rules.map((r) =>
        r.id === id && !r.patterns.includes(normalized)
          ? { ...r, patterns: [...r.patterns, normalized] }
          : r,
      ),
    )
  }

  function removeRule(id: string) {
    persistRules(rules.filter((r) => r.id !== id))
  }

  function moveRule(id: string, direction: -1 | 1) {
    const idx = rules.findIndex((r) => r.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= rules.length) return
    const next = [...rules]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    persistRules(next)
  }

  function removePatternFromRule(ruleId: string, pattern: string) {
    persistRules(
      rules
        .map((r) =>
          r.id === ruleId ? { ...r, patterns: r.patterns.filter((p) => p !== pattern) } : r,
        )
        .filter((r) => r.patterns.length > 0),
    )
  }

  const canAddRule =
    category.trim().length > 0 &&
    ruleColumns.length > 0 &&
    (patterns.length > 0 || patternDraft.trim().length > 0)

  // -- Groups: persistence and mutations --------------------------------------

  function persistGroups(next: Group[]) {
    // Optimistic update; revert if the server rejects (e.g. cycle, name collision)
    const prev = groups
    setGroups(next)
    setGroupsSaveError(null)
    putGroups(next).catch((e) => {
      setGroups(prev)
      setGroupsSaveError(e instanceof Error ? e.message : String(e))
    })
  }

  // Lookups for resolving child IDs → human-readable info. Children are stored
  // as IDs (rule.id or group.id) so renames/reuse of category names are safe.
  const ruleById = useMemo(() => {
    const m = new Map<string, Rule>()
    for (const r of rules) m.set(r.id, r)
    return m
  }, [rules])
  const groupById = useMemo(() => {
    const m = new Map<string, Group>()
    for (const g of groups) m.set(g.id, g)
    return m
  }, [groups])

  // IDs already referenced as a child in some group. The "add child" pickers
  // exclude these so the user only sees leaves/groups that aren't yet placed
  // anywhere — keeps the option list focused on real candidates.
  const usedChildren = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const c of g.children) s.add(c)
    return s
  }, [groups])

  // Picker options: rule IDs not yet used as a child anywhere. The Autocomplete
  // renders these by looking up `rule.category`, so the picker displays category
  // names while binding rule IDs as the actual selection value.
  const childOptionsForNew = useMemo(
    () =>
      rules
        .filter((r) => !usedChildren.has(r.id))
        .map((r) => r.id)
        .sort((a, b) =>
          (ruleById.get(a)?.category ?? '').localeCompare(ruleById.get(b)?.category ?? ''),
        ),
    [rules, usedChildren, ruleById],
  )

  // A child reference is a "ghost" if its ID doesn't resolve to a rule or group.
  // Typically happens when a rule/group is deleted while still referenced.
  function resolveChild(id: string): { label: string; color?: string; kind: 'rule' | 'group' | 'ghost' } {
    const r = ruleById.get(id)
    if (r) return { label: r.category, color: r.color ?? undefined, kind: 'rule' }
    const g = groupById.get(id)
    if (g) return { label: g.name, kind: 'group' }
    return { label: id, kind: 'ghost' }
  }

  function addGroup() {
    const trimmed = groupName.trim()
    if (!trimmed) return
    if (groups.some((g) => g.name === trimmed)) {
      setGroupsSaveError(`A group named '${trimmed}' already exists`)
      return
    }
    persistGroups([...groups, { id: newId(), name: trimmed, children: groupChildren }])
    setGroupName('')
    setGroupChildren([])
  }

  function removeGroup(id: string) {
    persistGroups(groups.filter((g) => g.id !== id))
  }

  function removeChildFromGroup(groupId: string, childId: string) {
    persistGroups(
      groups.map((g) =>
        g.id === groupId ? { ...g, children: g.children.filter((c) => c !== childId) } : g,
      ),
    )
  }

  function addChildToGroup(groupId: string, childId: string) {
    persistGroups(
      groups.map((g) =>
        g.id === groupId && !g.children.includes(childId)
          ? { ...g, children: [...g.children, childId] }
          : g,
      ),
    )
  }

  const canAddGroup = groupName.trim().length > 0

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 1 }}>
      <Typography variant="h4" gutterBottom>
        Categorization
      </Typography>

      {/* Shared alerts (apply regardless of which tab is active) */}
      {schemaError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load columns: {schemaError}
        </Alert>
      )}
      {rulesLoaded && !schemaError && availableColumns.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No columns available yet. Upload a CSV first to detect columns.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as 'rules' | 'groups')}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab
          value="rules"
          label={
            <Badge
              badgeContent={conflicts.length}
              color="warning"
              max={99}
              invisible={conflicts.length === 0}
              sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}
            >
              Rules
            </Badge>
          }
        />
        <Tab value="groups" label="Groups" />
      </Tabs>

      {tab === 'rules' && (
        <>
          {rulesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load rules: {rulesError}
            </Alert>
          )}
          {rulesSaveError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRulesSaveError(null)}>
              Failed to save rules: {rulesSaveError}
            </Alert>
          )}

      {/* ------------------------------------------------------------------ */}
      {/* Conflicts banner                                                    */}
      {/* ------------------------------------------------------------------ */}
      {conflictsError ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load conflicts: {conflictsError}
        </Alert>
      ) : conflicts.length > 0 ? (
        <Alert
          icon={<WarningAmberIcon />}
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button
              size="small"
              color="inherit"
              endIcon={conflictsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setConflictsExpanded((v) => !v)}
            >
              {conflictsExpanded ? 'Hide' : 'View'}
            </Button>
          }
        >
          <strong>{conflicts.length}</strong>{' '}
          {conflicts.length === 1 ? 'transaction matches' : 'transactions match'} more than one
          rule. Tighten patterns or reorder rules so the intended one wins.
          <Collapse in={conflictsExpanded}>
            <Box sx={{ mt: 2 }}>
              <Stack divider={<Divider flexItem />} spacing={0}>
                {conflicts.map((c) => (
                  <Box key={`${c.source}:${c.row_index}`} sx={{ py: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {c.date}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
                        {c.description || <em>(no description)</em>}
                      </Typography>
                      {c.matched_rules.map((m) => (
                        <Chip key={m.id} label={m.category} size="small" color="warning" />
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {c.source} · row {c.row_index}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </Alert>
      ) : null}
      {conflictsLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add rule (60%) + Stats panel (40%)                                  */}
      {/* ------------------------------------------------------------------ */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' },
          gap: 2,
          mb: 3,
          alignItems: 'stretch',
        }}
      >
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <Tooltip title="Rule color">
            <input
              type="color"
              value={ruleColor}
              onChange={(e) => setRuleColor(e.target.value)}
              aria-label="Rule color"
              style={colorSwatchStyle(40)}
            />
          </Tooltip>
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
            value={ruleColumns}
            onChange={(_, v) => setRuleColumns(v)}
            getOptionLabel={labelFor}
            disabled={availableColumns.length === 0}
            sx={{ flex: 2, minWidth: 260 }}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...itemProps } = getItemProps({ index })
                return <Chip key={key} label={labelFor(option)} size="small" {...itemProps} />
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Match against columns"
                size="small"
                placeholder={ruleColumns.length === 0 ? 'Select one or more columns' : ''}
              />
            )}
          />
        </Stack>
        <Box ref={patternInputRef} />
        <TextField
          label="Patterns"
          size="small"
          fullWidth
          value={patternDraft}
          onChange={(e) => setPatternDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commitPatternDraft()
            } else if (e.key === 'Backspace' && !patternDraft && patterns.length > 0) {
              setPatterns(patterns.slice(0, -1))
            }
          }}
          onBlur={() => commitPatternDraft()}
          placeholder="Type a pattern and press Enter (e.g. fantastico, bgr sofia billa) - Substring match, case-insensitive. Patterns may contain spaces. Separate with Enter or comma."
        />
        {patterns.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
            {patterns.map((p) => (
              <Chip
                key={p}
                label={p}
                size="small"
                onDelete={() => setPatterns(patterns.filter((x) => x !== p))}
              />
            ))}
          </Stack>
        )}
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            size="small"
            disabled={!canAddRule}
            onClick={addRule}
          >
            Add rule
          </Button>
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.2 }}>
            Rules
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, lineHeight: 1.1 }}
          >
            {rules.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {existingCategories.length}{' '}
            {existingCategories.length === 1 ? 'category' : 'categories'} ·{' '}
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </Typography>
        </Box>
        <Divider flexItem />
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.2 }}>
            Uncategorized
          </Typography>
          <Typography
            variant="h4"
            sx={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
              lineHeight: 1.1,
              color: uncategorizedCount > 0 ? 'warning.main' : 'success.main',
            }}
          >
            {transactions.length === 0 ? '—' : uncategorizedCount.toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            of {transactions.length.toLocaleString()}{' '}
            {transactions.length === 1 ? 'transaction' : 'transactions'} unmatched
          </Typography>
        </Box>
      </Paper>
      </Box>

      {/* ------------------------------------------------------------------ */}
      {/* Uncategorized sampler — random uncategorized txn + Next/Use         */}
      {/* ------------------------------------------------------------------ */}
      {uncategorizedTxns.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1.5 }}
          >
            One random uncategorized transaction at a time. Click <strong>Use</strong> to
            seed the pattern input above, or <strong>Next</strong> to skip.
          </Typography>
          {uncatPreview && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={uncatPreview.description}>
                  {uncatPreview.description || <em>(no description)</em>}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {uncatPreview.date} · {uncatPreview.source}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  color:
                    uncatPreview.debit !== null
                      ? 'error.main'
                      : uncatPreview.credit !== null
                        ? 'success.main'
                        : 'text.secondary',
                }}
              >
                {uncatPreview.debit !== null
                  ? amountFmt.format(uncatPreview.debit)
                  : uncatPreview.credit !== null
                    ? amountFmt.format(uncatPreview.credit)
                    : '—'}
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => useUncategorizedAsDraft(uncatPreview)}
              >
                Use
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={pickNextUncategorized}
                disabled={uncategorizedTxns.length < 2}
              >
                Next
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rules list                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">
            Rules
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
                sx={{ alignItems: 'center', py: 1.5 }}
              >
                <Box sx={{ width: 32, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </Typography>
                </Box>
                <Box sx={{ width: 280, flexShrink: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Tooltip title="Change color">
                      <input
                        type="color"
                        key={rule.color ?? DEFAULT_RULE_COLOR}
                        defaultValue={rule.color ?? DEFAULT_RULE_COLOR}
                        onBlur={(e) => {
                          const v = e.currentTarget.value
                          if (v !== (rule.color ?? DEFAULT_RULE_COLOR)) {
                            updateRuleColor(rule.id, v)
                          }
                        }}
                        aria-label={`Color for ${rule.category}`}
                        style={colorSwatchStyle(20)}
                      />
                    </Tooltip>
                    {editingCategoryRuleId === rule.id ? (
                      <TextField
                        autoFocus
                        size="small"
                        variant="standard"
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        onBlur={() => {
                          if (cancelCategoryEditRef.current) {
                            cancelCategoryEditRef.current = false
                            return
                          }
                          commitCategoryEdit()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitCategoryEdit()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelCategoryEdit()
                          }
                        }}
                        sx={{ minWidth: 140 }}
                      />
                    ) : (
                      <Tooltip title="Click to rename">
                        <Chip
                          label={rule.category}
                          size="small"
                          onClick={() => startEditCategory(rule)}
                          sx={
                            rule.color
                              ? {
                                  bgcolor: rule.color,
                                  color: pickContrastColor(rule.color),
                                  cursor: 'pointer',
                                }
                              : { cursor: 'pointer' }
                          }
                          color={rule.color ? undefined : 'primary'}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                  <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      on
                    </Typography>
                    <FormControl size="small" variant="standard" sx={{ flex: 1, minWidth: 0 }}>
                      <Select
                        multiple
                        displayEmpty
                        value={rule.columns}
                        onChange={(e) => {
                          const v = e.target.value
                          updateRuleColumns(rule.id, typeof v === 'string' ? v.split(',') : v)
                        }}
                        disabled={availableColumns.length === 0}
                        renderValue={(selected) => {
                          const labels = selected.map(labelFor)
                          return selected.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              (no columns)
                            </Typography>
                          ) : (
                            <Box
                              sx={{
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '0.875rem',
                              }}
                              title={labels.join(', ')}
                            >
                              {selected.length} · {labels.join(', ')}
                            </Box>
                          )
                        }}
                      >
                        {availableColumns.map((col) => (
                          <MenuItem key={col} value={col} dense>
                            <Checkbox
                              checked={rule.columns.includes(col)}
                              size="small"
                              sx={{ p: 0.5 }}
                            />
                            <ListItemText primary={labelFor(col)} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>
                <PatternEditor
                  patterns={rule.patterns}
                  onAdd={(p) => addPatternToRule(rule.id, p)}
                  onRemove={(p) => removePatternFromRule(rule.id, p)}
                />
                <Stack direction="row" sx={{ ml: 'auto', flexShrink: 0 }}>
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
        </>
      )}

      {tab === 'groups' && (
        <>
          {groupsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load groups: {groupsError}
            </Alert>
          )}
          {groupsSaveError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGroupsSaveError(null)}>
              {groupsSaveError}
            </Alert>
          )}

      {/* ------------------------------------------------------------------ */}
      {/* Add group                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add group
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          A group bundles leaf categories for reporting. No rules attach to a group directly.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Group name"
            size="small"
            sx={{ flex: 1, minWidth: 200 }}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Food"
          />
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={childOptionsForNew}
            value={groupChildren}
            onChange={(_, v) => setGroupChildren(v)}
            getOptionLabel={(id) => resolveChild(id).label}
            sx={{ flex: 2, minWidth: 260 }}
            renderValue={(value, getItemProps) =>
              value.map((id, index) => {
                const { key, ...itemProps } = getItemProps({ index })
                return <Chip key={key} label={resolveChild(id).label} size="small" {...itemProps} />
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Children (categories)"
                size="small"
                placeholder={
                  childOptionsForNew.length === 0
                    ? 'Create rules or groups first'
                    : groupChildren.length === 0
                      ? 'Pick categories to combine'
                      : ''
                }
              />
            )}
          />
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            size="small"
            disabled={!canAddGroup}
            onClick={addGroup}
            sx={{ alignSelf: { md: 'center' } }}
          >
            Add group
          </Button>
        </Stack>
      </Paper>

      {/* ------------------------------------------------------------------ */}
      {/* Groups list                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">Groups</Typography>
          <Typography variant="caption" color="text.secondary">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </Typography>
        </Stack>

        {groups.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              No groups yet. Use groups to combine leaves (e.g. <em>Food</em> = [LIDL, Kaufland]).
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider flexItem />}>
            {groups.map((g) => {
              const childOptions = rules
                .filter((r) => !usedChildren.has(r.id))
                .map((r) => r.id)
                .sort((a, b) =>
                  (ruleById.get(a)?.category ?? '').localeCompare(
                    ruleById.get(b)?.category ?? '',
                  ),
                )
              return (
                <Stack
                  key={g.id}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'center', py: 1.5 }}
                >
                  <Box sx={{ minWidth: 160 }}>
                    <Chip label={g.name} color="secondary" size="small" />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5, display: 'block' }}
                    >
                      {g.children.length}{' '}
                      {g.children.length === 1 ? 'child' : 'children'}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    useFlexGap
                    sx={{ flex: 1, flexWrap: 'wrap' }}
                  >
                    {g.children.map((childId) => {
                      const resolved = resolveChild(childId)
                      const isGhost = resolved.kind === 'ghost'
                      return (
                        <Tooltip
                          key={childId}
                          title={
                            isGhost ? 'This reference no longer points to a rule or group' : ''
                          }
                        >
                          <Chip
                            label={resolved.label}
                            size="small"
                            variant="outlined"
                            color={isGhost ? 'error' : 'default'}
                            sx={
                              !isGhost && resolved.color
                                ? { borderColor: resolved.color, color: resolved.color }
                                : undefined
                            }
                            onDelete={() => removeChildFromGroup(g.id, childId)}
                          />
                        </Tooltip>
                      )
                    })}
                    {childOptions.length > 0 && (
                      <Autocomplete
                        size="small"
                        options={childOptions}
                        value={null}
                        blurOnSelect
                        onChange={(_, v) => v && addChildToGroup(g.id, v)}
                        getOptionLabel={(id) => resolveChild(id).label}
                        sx={{ minWidth: 180 }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="+ add child" variant="standard" />
                        )}
                      />
                    )}
                  </Stack>
                  <Tooltip title="Delete group">
                    <IconButton
                      size="small"
                      onClick={() => removeGroup(g.id)}
                      sx={{ flexShrink: 0 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )
            })}
          </Stack>
        )}
      </Paper>
        </>
      )}
    </Box>
  )
}

function PatternEditor({
  patterns,
  onAdd,
  onRemove,
}: {
  patterns: string[]
  onAdd: (p: string) => void
  onRemove: (p: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  function commit() {
    const v = draft.trim()
    if (v) onAdd(v)
    setDraft('')
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', width: 280, flexShrink: 0 }}
    >
      <TextField
        size="small"
        variant="standard"
        placeholder="+ add pattern"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
        onBlur={commit}
        sx={{ flex: 1, minWidth: 140 }}
      />
      <Button
        size="small"
        variant="text"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={patterns.length === 0}
        sx={{ textTransform: 'none', whiteSpace: 'nowrap', minWidth: 0 }}
      >
        {patterns.length} {patterns.length === 1 ? 'pattern' : 'patterns'}
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, maxWidth: 480 }}>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {patterns.map((p) => (
              <Chip
                key={p}
                label={p}
                size="small"
                variant="outlined"
                onDelete={() => onRemove(p)}
                sx={{
                  '& .MuiChip-label': { userSelect: 'text', cursor: 'text' },
                }}
              />
            ))}
          </Stack>
        </Box>
      </Popover>
    </Stack>
  )
}
