import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setToken, api } from './lib/api';
import { DashboardView } from './views/DashboardView';
import { ChatWorkspaceView } from './views/ChatWorkspaceView';
import { AdminAnalyticsView } from './views/AdminAnalyticsView';
import './styles/theme.css';
const qc = new QueryClient();
export default function App() {
    const [view, setView] = useState('dashboard');
    useEffect(() => {
        api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@pulsedesk.local', password: 'password123' }) })
            .then((r) => setToken(r.token))
            .catch(() => { });
    }, []);
    return _jsx(QueryClientProvider, { client: qc, children: _jsxs("div", { className: "layout", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h2", { children: "PulseDesk" }), _jsx("button", { className: `nav-btn ${view === 'dashboard' ? 'active' : ''}`, onClick: () => setView('dashboard'), children: "Dashboard" }), _jsx("button", { className: `nav-btn ${view === 'chat' ? 'active' : ''}`, onClick: () => setView('chat'), children: "Agent Workspace" }), _jsx("button", { className: `nav-btn ${view === 'analytics' ? 'active' : ''}`, onClick: () => setView('analytics'), children: "Admin Analytics" })] }), _jsxs("main", { className: "content", children: [view === 'dashboard' && _jsx(DashboardView, {}), view === 'chat' && _jsx(ChatWorkspaceView, {}), view === 'analytics' && _jsx(AdminAnalyticsView, {})] })] }) });
}
