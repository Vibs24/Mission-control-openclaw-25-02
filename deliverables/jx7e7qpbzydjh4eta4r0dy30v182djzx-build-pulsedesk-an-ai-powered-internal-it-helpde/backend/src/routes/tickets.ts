import { Router } from 'express';
import { triageTicket } from '../services/claudeTriage.js';
export const ticketRouter=Router();
let tickets=[{id:1,title:'VPN issue',description:'cannot connect',priority:'high',status:'new'}];
ticketRouter.get('/',(_q,r)=>r.json(tickets));
ticketRouter.post('/', async (q,r)=>{const t=q.body; const triage=await triageTicket(t.title,t.description); const saved={id:Date.now(),...t,...triage}; tickets.push(saved); r.status(201).json(saved);});
ticketRouter.patch('/:id',(q,r)=>{tickets=tickets.map(t=>t.id===Number(q.params.id)?{...t,...q.body}:t); r.json({ok:true});});
