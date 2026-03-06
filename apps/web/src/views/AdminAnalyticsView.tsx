import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export function AdminAnalyticsView() {
  const { data = [] } = useQuery({ queryKey: ['tickets'], queryFn: () => api<any[]>('/tickets') });
  const chart = ['low','medium','high','critical'].map((p) => ({ priority: p, count: data.filter((t) => t.priority === p).length }));
  return <>
    <h1>Admin Analytics</h1>
    <div className="card" style={{height:320}}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart}><XAxis dataKey="priority"/><YAxis/><Tooltip/><Bar dataKey="count" fill="#2563eb"/></BarChart>
      </ResponsiveContainer>
    </div>
  </>;
}
