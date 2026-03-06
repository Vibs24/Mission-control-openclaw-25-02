import { useEffect, useState } from 'react';
const cols=['New','Assigned','Waiting','Resolved'];
export function TicketBoard(){const [tickets,setTickets]=useState([{id:'T-1',title:'VPN failure',status:'New',priority:'high'}]);
useEffect(()=>{const ws=new WebSocket('ws://localhost:8080/ws'); ws.onmessage=e=>{const data=JSON.parse(e.data); if(data.type==='ticket:update'){setTickets(data.payload)}}; return ()=>ws.close();},[]);
return <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>{cols.map(c=><section key={c} style={{background:'#111827',border:'1px solid #1d4ed8',borderRadius:8,padding:8}}><h3>{c} <span>{tickets.filter(t=>t.status===c).length}</span></h3>{tickets.filter(t=>t.status===c).map(t=><article key={t.id}>{t.title}</article>)}</section>)}</div>}
