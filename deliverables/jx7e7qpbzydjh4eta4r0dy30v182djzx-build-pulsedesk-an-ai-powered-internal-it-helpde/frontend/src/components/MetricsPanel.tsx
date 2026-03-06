import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
const data=[{d:'Mon',v:18},{d:'Tue',v:22},{d:'Wed',v:15},{d:'Thu',v:30},{d:'Fri',v:24}];
export function MetricsPanel(){return <div style={{height:260,marginTop:16,background:'#111827',padding:12,borderRadius:8}}><h3>Ticket Throughput</h3><ResponsiveContainer width='100%' height='85%'><LineChart data={data}><XAxis dataKey='d'/><YAxis/><Tooltip/><Line dataKey='v' stroke='#3b82f6'/></LineChart></ResponsiveContainer></div>}
