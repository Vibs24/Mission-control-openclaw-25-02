import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './pages/Dashboard';
import './styles/theme.css';
const qc = new QueryClient();
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={qc}><Dashboard/></QueryClientProvider>);
