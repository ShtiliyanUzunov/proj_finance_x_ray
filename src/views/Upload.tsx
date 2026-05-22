import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'

export default function Upload() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Upload data
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Drop CSV exports from your bank to ingest transactions.
      </Typography>

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
        <Typography variant="h6">Drag & drop CSV files here</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          or
        </Typography>
        <Button variant="contained" startIcon={<CloudUploadIcon />}>
          Choose file
        </Button>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Recent uploads
      </Typography>
      <Paper variant="outlined">
        <List dense>
          <ListItem secondaryAction={<Chip label="324 rows" size="small" />}>
            <ListItemIcon><InsertDriveFileIcon /></ListItemIcon>
            <ListItemText primary="statement-2026-04.csv" secondary="Uploaded 2 days ago (mock)" />
          </ListItem>
          <ListItem secondaryAction={<Chip label="218 rows" size="small" />}>
            <ListItemIcon><InsertDriveFileIcon /></ListItemIcon>
            <ListItemText primary="statement-2026-03.csv" secondary="Uploaded 1 month ago (mock)" />
          </ListItem>
        </List>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Chip label="Mock data" size="small" color="warning" variant="outlined" />
      </Stack>
    </Box>
  )
}
