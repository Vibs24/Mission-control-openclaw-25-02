export function StatCard({ label, value }: { label: string; value: string | number }) {
  return <div className="card"><div className="small">{label}</div><h2>{value}</h2></div>;
}
