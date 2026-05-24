import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import App from './App.tsx'

// Compact-mode theme. `spacing: 4` halves every `p`/`m`/`gap`/`spacing` value
// in the app (default is 8). `defaultProps` makes common widgets render in their
// small variant unless a call site overrides — keeps the UI dense without
// scattering `size="small"` everywhere.
const theme = createTheme({
  palette: { mode: 'light' },
  spacing: 6,
  components: {
    MuiButton: { defaultProps: { size: 'small' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small', margin: 'dense' } },
    MuiFormControl: { defaultProps: { size: 'small', margin: 'dense' } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiAutocomplete: { defaultProps: { size: 'small' } },
    MuiChip: { defaultProps: { size: 'small' } },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiToolbar: { defaultProps: { variant: 'dense' } },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
