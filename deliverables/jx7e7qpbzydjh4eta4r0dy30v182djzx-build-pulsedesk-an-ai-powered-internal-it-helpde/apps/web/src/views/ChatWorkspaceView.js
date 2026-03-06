import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { subscribeTickets } from '../lib/ws';
export function ChatWorkspaceView() {
    const [events, setEvents] = useState([]);
    useEffect(() => subscribeTickets((p) => setEvents((prev) => [p, ...prev].slice(0, 20))), []);
    return _jsxs(_Fragment, { children: [_jsx("h1", { children: "Agent Chat Workspace" }), _jsxs("div", { className: "card", children: [_jsx("p", { children: "Live ticket stream over WebSockets:" }), events.map((e, i) => _jsxs("p", { children: [e.event, " \u00B7 ", _jsx("span", { className: "small", children: e.at })] }, i))] })] });
}
