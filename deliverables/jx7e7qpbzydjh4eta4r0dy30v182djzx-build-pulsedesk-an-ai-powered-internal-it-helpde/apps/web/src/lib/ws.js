export function subscribeTickets(onMessage) {
    const url = (import.meta.env.VITE_WS_URL || 'ws://localhost:4000') + '/ws';
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
    return () => ws.close();
}
