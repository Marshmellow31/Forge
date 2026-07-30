import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme';
import { AppProviders } from './providers/AppProviders';
import { validateEnv } from '@config/env';
import App from './App';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

/**
 * A misconfigured deploy must say so. `@config/env` throws at import time on a
 * missing key, so catch it here and render the reason instead of a blank page.
 */
function boot() {
  validateEnv();
  createRoot(el!).render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppProviders>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppProviders>
      </ThemeProvider>
    </StrictMode>,
  );
}

try {
  boot();
} catch (err) {
  el.innerHTML = `
    <div style="font-family:Figtree,system-ui,sans-serif;background:#FDF8EC;color:#1D1B13;
                min-height:100vh;display:grid;place-items:center;padding:24px">
      <div style="max-width:560px">
        <h1 style="font-size:24px;margin:0 0 12px">Configuration error</h1>
        <pre style="white-space:pre-wrap;background:#F9DEDC;color:#410E0B;padding:16px;
                    border-radius:16px;font-size:13px;line-height:1.5;margin:0">${
                      err instanceof Error ? err.message : String(err)
                    }</pre>
      </div>
    </div>`;
}
