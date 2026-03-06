import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
export function AdminAnalyticsView() {
    const { data = [] } = useQuery({ queryKey: ['tickets'], queryFn: () => api('/tickets') });
    const chart = ['low', 'medium', 'high', 'critical'].map((p) => ({ priority: p, count: data.filter((t) => t.priority === p).length }));
    return _jsxs(_Fragment, { children: [_jsx("h1", { children: "Admin Analytics" }), _jsx("div", { className: "card", style: { height: 320 }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: chart, children: [_jsx(XAxis, { dataKey: "priority" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "count", fill: "#2563eb" })] }) }) })] });
}
