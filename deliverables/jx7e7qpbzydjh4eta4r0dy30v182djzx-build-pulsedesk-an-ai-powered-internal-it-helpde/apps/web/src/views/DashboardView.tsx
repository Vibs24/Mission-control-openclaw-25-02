import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatCard } from '../components/StatCard';

export function DashboardView() {
  const { data = [] } = useQuery({ queryKey: ['tickets'], queryFn: () => api<any[]>('/tickets') });
  return <>
    <h1>Ticket Dashboard</h1>
    <div className="grid">
      <StatCard label="Open Tickets" value={data.filter((t) => t.status !== 'closed').length} />
      <StatCard label="Critical" value={data.filter((t) => t.priority === 'critical').length} />
      <StatCard label="Total" value={data.length} />
    </div>
    <div className="card">
      <h3>Recent Tickets</h3>
      {data.map((t) => <p key={t.id}>{t.title} · <span className="small">{t.status}</span></p>)}
    </div>
  </>;
}
