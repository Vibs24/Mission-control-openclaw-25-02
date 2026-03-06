import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatCard } from '../components/StatCard';
export function DashboardView() {
    const { data = [] } = useQuery({ queryKey: ['tickets'], queryFn: () => api('/tickets') });
    return _jsxs(_Fragment, { children: [_jsx("h1", { children: "Ticket Dashboard" }), _jsxs("div", { className: "grid", children: [_jsx(StatCard, { label: "Open Tickets", value: data.filter((t) => t.status !== 'closed').length }), _jsx(StatCard, { label: "Critical", value: data.filter((t) => t.priority === 'critical').length }), _jsx(StatCard, { label: "Total", value: data.length })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Recent Tickets" }), data.map((t) => _jsxs("p", { children: [t.title, " \u00B7 ", _jsx("span", { className: "small", children: t.status })] }, t.id))] })] });
}
