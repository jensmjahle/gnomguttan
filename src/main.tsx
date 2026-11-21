import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './App';
import { startAuthTabSync } from './services/authTabs';

// A login without "Husk meg" is borrowed from another open tab before the first render,
// so a new tab doesn't flash the login page.
void startAuthTabSync().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
