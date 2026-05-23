import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  CircularProgress,
  Collapse,
  Tabs,
  Tab,
  Badge,
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
  putGroups,
  putRules,
  type Group,
  type Rule,
  type TransactionConflict,
} from '../api'

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
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordDraft, setKeywordDraft] = useState('')

  // Schema
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [schemaError, setSchemaError] = useState<string | null>(null)

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
  const [keywordDraftByRule, setKeywordDraftByRule] = useState<Record<string, string>>({})

  // Which tab is active
  const [tab, setTab] = useState<'rules' | 'groups'>('rules')

  // Conflicts state
  const [conflicts, setConflicts] = useState<TransactionConflict[]>([])
  const [conflictsError, setConflictsError] = useState<string | null>(null)
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [conflictsExpanded, setConflictsExpanded] = useState(false)
  // Bumped on every rules mutation so the conflicts effect refetches.
  const [conflictsRefreshKey, setConflictsRefreshKey] = useState(0)

  useEffect(() => {
    getRules()
      .then((r) => setRules(r.rules))
      .catch((e) => setRulesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRulesLoaded(true))
  }, [])

  // Hydrate the add-rule form from navigation state (e.g. the "Categorize"
  // affordance in the Inspect view). The draft is placed in the keyword input
  // *as text*, not committed as chips, so the user can edit it (or close the
  // page) before deciding whether to create the rule. Clear the state after
  // applying so a manual refresh doesn't re-prefill.
  useEffect(() => {
    const state = location.state as { prefillKeywordDraft?: string } | null
    if (state?.prefillKeywordDraft) {
      setKeywordDraft(state.prefillKeywordDraft)
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
      .then((s) => setAvailableColumns(s.columns))
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
    if (!trimmedCategory || finalKeywords.length === 0 || ruleColumns.length === 0) return
    persistRules([
      ...rules,
      {
        id: newId(),
        category: trimmedCategory,
        columns: ruleColumns,
        keywords: finalKeywords,
        color: ruleColor,
      },
    ])
    setCategory('')
    setRuleColumns([])
    setRuleColor(DEFAULT_RULE_COLOR)
    setKeywords([])
    setKeywordDraft('')
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

  function addColumnToRule(id: string, column: string) {
    persistRules(
      rules.map((r) =>
        r.id === id && !r.columns.includes(column)
          ? { ...r, columns: [...r.columns, column] }
          : r,
      ),
    )
  }

  function removeColumnFromRule(id: string, column: string) {
    persistRules(
      rules.map((r) =>
        r.id === id ? { ...r, columns: r.columns.filter((c) => c !== column) } : r,
      ),
    )
  }

  function addKeywordToRule(id: string, keyword: string) {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return
    persistRules(
      rules.map((r) =>
        r.id === id && !r.keywords.includes(normalized)
          ? { ...r, keywords: [...r.keywords, normalized] }
          : r,
      ),
    )
    setKeywordDraftByRule((prev) => ({ ...prev, [id]: '' }))
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

  function removeKeywordFromRule(ruleId: string, keyword: string) {
    persistRules(
      rules
        .map((r) =>
          r.id === ruleId ? { ...r, keywords: r.keywords.filter((k) => k !== keyword) } : r,
        )
        .filter((r) => r.keywords.length > 0),
    )
  }

  const canAddRule =
    category.trim().length > 0 &&
    ruleColumns.length > 0 &&
    (keywords.length > 0 || keywordDraft.trim().length > 0)

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

  const groupNames = useMemo(() => groups.map((g) => g.name), [groups])

  // Map leaf category → color from the first rule that defines it. Used to
  // tint group child chips so groups visually inherit their leaves' colors.
  const colorByCategory = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rules) {
      if (r.color && !m.has(r.category)) m.set(r.category, r.color)
    }
    return m
  }, [rules])

  // What names are valid as a group's children: every leaf category + every
  // other group (groups can nest other groups).
  const childOptionsForNew = useMemo(() => {
    const trimmed = groupName.trim()
    return Array.from(
      new Set([
        ...existingCategories,
        ...groupNames.filter((n) => n !== trimmed),
      ]),
    ).sort()
  }, [existingCategories, groupNames, groupName])

  // A child reference is a "ghost" if it doesn't resolve to a leaf or another
  // group. Typically happens when a rule is deleted after a group was set up.
  const knownChildren = useMemo(
    () => new Set([...existingCategories, ...groupNames]),
    [existingCategories, groupNames],
  )

  function addGroup() {
    const trimmed = groupName.trim()
    if (!trimmed) return
    if (groups.some((g) => g.name === trimmed)) {
      setGroupsSaveError(`A group named '${trimmed}' already exists`)
      return
    }
    if (existingCategories.includes(trimmed)) {
      setGroupsSaveError(`'${trimmed}' is already a rule category — pick a different group name`)
      return
    }
    persistGroups([...groups, { name: trimmed, children: groupChildren }])
    setGroupName('')
    setGroupChildren([])
  }

  function removeGroup(name: string) {
    persistGroups(groups.filter((g) => g.name !== name))
  }

  function removeChildFromGroup(groupNameToEdit: string, child: string) {
    persistGroups(
      groups.map((g) =>
        g.name === groupNameToEdit ? { ...g, children: g.children.filter((c) => c !== child) } : g,
      ),
    )
  }

  function addChildToGroup(groupNameToEdit: string, child: string) {
    persistGroups(
      groups.map((g) =>
        g.name === groupNameToEdit && !g.children.includes(child)
          ? { ...g, children: [...g.children, child] }
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
          rule. Tighten keywords or reorder rules so the intended one wins.
          <Collapse in={conflictsExpanded}>
            <Box sx={{ mt: 2 }}>
              <Stack divider={<Divider flexItem />} spacing={0}>
                {conflicts.map((c) => (
                  <Box key={`${c.source}:${c.row_index}`} sx={{ py: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
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
      {/* Add rule                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add rule
        </Typography>
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
                placeholder={ruleColumns.length === 0 ? 'Select one or more columns' : ''}
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
            disabled={!canAddRule}
            onClick={addRule}
          >
            Add rule
          </Button>
        </Box>
      </Paper>

      {/* ------------------------------------------------------------------ */}
      {/* Rules list                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle1">
            Rules
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'} · {existingCategories.length}{' '}
            {existingCategories.length === 1 ? 'leaf' : 'leaves'}
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
                <Box sx={{ minWidth: 240 }}>
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
                  <Stack
                    direction="row"
                    spacing={0.5}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 0.75, alignItems: 'center' }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                      on
                    </Typography>
                    {rule.columns.map((col) => (
                      <Chip
                        key={col}
                        label={col}
                        size="small"
                        variant="outlined"
                        onDelete={() => removeColumnFromRule(rule.id, col)}
                      />
                    ))}
                    {availableColumns.filter((c) => !rule.columns.includes(c)).length > 0 && (
                      <Autocomplete
                        size="small"
                        options={availableColumns.filter((c) => !rule.columns.includes(c))}
                        value={null}
                        blurOnSelect
                        onChange={(_, v) => v && addColumnToRule(rule.id, v)}
                        sx={{ minWidth: 160 }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="+ add column" variant="standard" />
                        )}
                      />
                    )}
                  </Stack>
                </Box>
                <Stack
                  direction="row"
                  spacing={0.5}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ flex: 1, alignItems: 'center' }}
                >
                  {rule.keywords.map((k) => (
                    <Chip
                      key={k}
                      label={k}
                      size="small"
                      variant="outlined"
                      onDelete={() => removeKeywordFromRule(rule.id, k)}
                    />
                  ))}
                  <TextField
                    size="small"
                    variant="standard"
                    placeholder="+ add keyword"
                    value={keywordDraftByRule[rule.id] ?? ''}
                    onChange={(e) =>
                      setKeywordDraftByRule((prev) => ({ ...prev, [rule.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addKeywordToRule(rule.id, keywordDraftByRule[rule.id] ?? '')
                      }
                    }}
                    onBlur={() => {
                      const v = keywordDraftByRule[rule.id]
                      if (v && v.trim()) addKeywordToRule(rule.id, v)
                    }}
                    sx={{ minWidth: 140 }}
                  />
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
          A group bundles leaf categories or other groups for reporting. No rules attach to a group
          directly.
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
                label="Children (leaves or groups)"
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
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
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
              const childOptions = Array.from(
                new Set([
                  ...existingCategories,
                  ...groupNames.filter((n) => n !== g.name),
                ]),
              )
                .filter((opt) => !g.children.includes(opt))
                .sort()
              return (
                <Stack
                  key={g.name}
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ py: 1.5 }}
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
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ flex: 1 }}
                  >
                    {g.children.map((c) => {
                      const isGhost = !knownChildren.has(c)
                      const childColor = colorByCategory.get(c)
                      return (
                        <Tooltip
                          key={c}
                          title={isGhost ? 'This name no longer exists as a leaf or group' : ''}
                        >
                          <Chip
                            label={c}
                            size="small"
                            variant="outlined"
                            color={isGhost ? 'error' : 'default'}
                            sx={
                              !isGhost && childColor
                                ? { borderColor: childColor, color: childColor }
                                : undefined
                            }
                            onDelete={() => removeChildFromGroup(g.name, c)}
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
                        onChange={(_, v) => v && addChildToGroup(g.name, v)}
                        sx={{ minWidth: 180 }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="+ add child" variant="standard" />
                        )}
                      />
                    )}
                  </Stack>
                  <Tooltip title="Delete group">
                    <IconButton size="small" onClick={() => removeGroup(g.name)}>
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
