import { useEffect, useState } from 'react';
import { subscribeTickets } from '../lib/ws';

export function ChatWorkspaceView() {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => subscribeTickets((p) => setEvents((prev) => [p, ...prev].slice(0, 20))), []);
  return <>
    <h1>Agent Chat Workspace</h1>
    <div className="card">
      <p>Live ticket stream over WebSockets:</p>
      {events.map((e, i) => <p key={i}>{e.event} · <span className="small">{e.at}</span></p>)}
    </div>
  </>;
}
