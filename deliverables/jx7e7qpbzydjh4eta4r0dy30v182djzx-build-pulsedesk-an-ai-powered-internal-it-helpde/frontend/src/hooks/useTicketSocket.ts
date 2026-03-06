import { useEffect, useState } from 'react';
export const useTicketSocket=()=>{ const [status,setStatus]=useState('disconnected'); useEffect(()=>{ const ws=new WebSocket(`ws://${location.hostname}:8080/ws`); ws.onopen=()=>setStatus('connected'); ws.onclose=()=>setStatus('closed'); return ()=>ws.close();},[]); return {status}; };
