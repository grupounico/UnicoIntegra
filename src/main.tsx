import React from 'react';
import ReactDOM from 'react-dom/client';

import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import App from './pages/Main/App';
import LegacyDocsRedirect from './components/LegacyDocsRedirect';
import './globals.css';
import { installSessionGuard } from './services/sessionGuard';

installSessionGuard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/docs/*" element={<LegacyDocsRedirect />} />
        <Route path="/main/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
