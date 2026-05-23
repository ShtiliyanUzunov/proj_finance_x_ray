import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar as MuiToolbar,
  CssBaseline,
} from '@mui/material'
import InsightsIcon from '@mui/icons-material/Insights'
import BarChartIcon from '@mui/icons-material/BarChart'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import TableChartIcon from '@mui/icons-material/TableChart'
import LabelIcon from '@mui/icons-material/Label'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'

import Visualization from './views/Visualization'
import Upload from './views/Upload'
import Inspection from './views/Inspection'
import Categorization from './views/Categorization'

const DRAWER_WIDTH = 240

const NAV_ITEMS: { path: string; label: string; icon: React.ReactNode }[] = [
  { path: '/visualization', label: 'Visualizations', icon: <BarChartIcon /> },
  { path: '/data', label: 'Data', icon: <CloudUploadIcon /> },
  { path: '/inspect', label: 'Inspect', icon: <TableChartIcon /> },
  { path: '/categorization', label: 'Categorization', icon: <LabelIcon /> },
]

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <InsightsIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="div">
            Finance X-Ray
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <MuiToolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={location.pathname.startsWith(item.path)}
                  onClick={() => navigate(item.path)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <MuiToolbar />
        <Box sx={{ flex: 1, minHeight: 0, p: 3, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/visualization" replace />} />
          <Route path="/visualization" element={<Visualization />} />
          <Route path="/data" element={<Upload />} />
          <Route path="/inspect" element={<Inspection />} />
          <Route path="/inspect/:name" element={<Inspection />} />
          <Route path="/categorization" element={<Categorization />} />
          <Route path="*" element={<Navigate to="/visualization" replace />} />
        </Routes>
        </Box>
      </Box>
    </Box>
  )
}

export default App
