import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage';
const qc=new QueryClient();
ReactDOM.createRoot(document.getElementById('root')!).render(<QueryClientProvider client={qc}><DashboardPage/></QueryClientProvider>);
