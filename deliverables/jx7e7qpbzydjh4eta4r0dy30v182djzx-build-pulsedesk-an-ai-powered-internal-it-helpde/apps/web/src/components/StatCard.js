import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function StatCard({ label, value }) {
    return _jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: label }), _jsx("h2", { children: value })] });
}
