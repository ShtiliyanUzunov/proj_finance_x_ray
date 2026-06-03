import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import EditIcon from '@mui/icons-material/Edit'
import { listCsvs, uploadCsv, renameCsv, type CsvFile } from '../api'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const amountFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function Upload() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<CsvFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [renameTarget, setRenameTarget] = useState<CsvFile | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setFiles(await listCsvs())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadCsv(file)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function openRename(f: CsvFile) {
    setRenameTarget(f)
    setRenameInput(f.name)
    setRenameError(null)
  }

  function closeRename() {
    if (renaming) return
    setRenameTarget(null)
    setRenameInput('')
    setRenameError(null)
  }

  async function submitRename() {
    if (!renameTarget) return
    const newName = renameInput.trim()
    if (!newName || newName === renameTarget.name) {
      closeRename()
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      await renameCsv(renameTarget.name, newName)
      setRenameTarget(null)
      setRenameInput('')
      await refresh()
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenaming(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Data
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper
        variant="outlined"
        sx={{
          p: 6,
          textAlign: 'center',
          borderStyle: 'dashed',
          bgcolor: 'action.hover',
          mb: 3,
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6">Choose a CSV to upload</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Only .csv files are accepted
        </Typography>
        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileRef}
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <Button
          variant="contained"
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Choose file'}
        </Button>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Uploaded files {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
      </Typography>
      <Paper variant="outlined">
        {files.length === 0 && !loading ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No files uploaded yet.</Typography>
          </Box>
        ) : (
          <List dense>
            {files.map((f) => (
              <ListItem
                key={f.name}
                disablePadding
                secondaryAction={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ minWidth: 110, textAlign: 'right' }}>
                      {f.debit !== null && (
                        <Chip
                          label={amountFormatter.format(f.debit)}
                          size="small"
                          sx={{
                            minWidth: 100,
                            bgcolor: '#fdecea',
                            color: 'error.main',
                            fontWeight: 500,
                            fontVariantNumeric: 'tabular-nums',
                            '& .MuiChip-label': { width: '100%', textAlign: 'right' },
                          }}
                        />
                      )}
                    </Box>
                    <Box sx={{ minWidth: 110, textAlign: 'right' }}>
                      {f.credit !== null && (
                        <Chip
                          label={amountFormatter.format(f.credit)}
                          size="small"
                          sx={{
                            minWidth: 100,
                            bgcolor: '#edf7ed',
                            color: 'success.main',
                            fontWeight: 500,
                            fontVariantNumeric: 'tabular-nums',
                            '& .MuiChip-label': { width: '100%', textAlign: 'right' },
                          }}
                        />
                      )}
                    </Box>
                    <Chip label={`${f.rows} rows · ${formatBytes(f.size)}`} size="small" />
                    <IconButton
                      size="small"
                      aria-label={`Rename ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openRename(f)
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemButton onClick={() => navigate(`/inspect/${encodeURIComponent(f.name)}`)}>
                  <ListItemIcon><InsertDriveFileIcon /></ListItemIcon>
                  <ListItemText
                    primary={f.name}
                    secondary={`Uploaded ${new Date(f.uploaded_at).toLocaleString()}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <Dialog open={renameTarget !== null} onClose={closeRename} fullWidth maxWidth="xs">
        <DialogTitle>Rename file</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="New filename"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
            }}
            disabled={renaming}
            helperText="Must end with .csv"
          />
          {renameError && <Alert severity="error" sx={{ mt: 1 }}>{renameError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRename} disabled={renaming}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitRename}
            disabled={renaming || !renameInput.trim()}
            startIcon={renaming ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {renaming ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
