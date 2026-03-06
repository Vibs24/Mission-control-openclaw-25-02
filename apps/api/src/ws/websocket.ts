import { WebSocketServer } from 'ws';
import { Server } from 'http';

export function attachWs(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const interval = setInterval(() => {
    const payload = JSON.stringify({ event: 'ticket.updated', at: new Date().toISOString() });
    wss.clients.forEach((client) => client.send(payload));
  }, 5000);
  wss.on('close', () => clearInterval(interval));
  return wss;
}
