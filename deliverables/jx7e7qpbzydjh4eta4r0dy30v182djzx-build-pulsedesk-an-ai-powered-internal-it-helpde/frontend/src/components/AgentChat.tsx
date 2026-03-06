import React from 'react';
import { useTicketSocket } from '../hooks/useTicketSocket';
export const AgentChat=()=>{ const {status}=useTicketSocket(); return <section><h2>Agent Workspace</h2><p>Socket: {status}</p></section>; };
