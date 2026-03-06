import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setToken, api } from './lib/api';
import { DashboardView } from './views/DashboardView';
import { ChatWorkspaceView } from './views/ChatWorkspaceView';
import { AdminAnalyticsView } from './views/AdminAnalyticsView';
import './styles/theme.css';

const qc = new QueryClient();

export default function App() {
  const [view, setView] = useState<'dashboard'|'chat'|'analytics'>('dashboard');

  useEffect(() => {
    api<{token:string}>('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@pulsedesk.local', password: 'password123' }) })
      .then((r:any)=>setToken(r.token))
      .catch(() => {});
  }, []);

  return <QueryClientProvider client={qc}>
    <div className="layout">
      <aside className="sidebar">
        <h2>PulseDesk</h2>
        <button className={`nav-btn ${view==='dashboard'?'active':''}`} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={`nav-btn ${view==='chat'?'active':''}`} onClick={() => setView('chat')}>Agent Workspace</button>
        <button className={`nav-btn ${view==='analytics'?'active':''}`} onClick={() => setView('analytics')}>Admin Analytics</button>
      </aside>
      <main className="content">
        {view === 'dashboard' && <DashboardView />}
        {view === 'chat' && <ChatWorkspaceView />}
        {view === 'analytics' && <AdminAnalyticsView />}
      </main>
    </div>
  </QueryClientProvider>;
}
