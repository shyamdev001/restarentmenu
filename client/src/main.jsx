import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CustomerApp from './features/customer/CustomerApp.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { registerWorker } from './lib/notify.js';
import { initTheme } from './lib/theme.js';
import './styles/base.css';

initTheme();
registerWorker();

// The admin panel is loaded only when someone opens /admin, so customers
// on mobile data never download it.
const AdminApp = lazy(() => import('./features/admin/AdminApp.jsx'));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<div className="boot">Loading…</div>}><AdminApp /></Suspense>} />
        <Route path="*" element={<CustomerApp />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
