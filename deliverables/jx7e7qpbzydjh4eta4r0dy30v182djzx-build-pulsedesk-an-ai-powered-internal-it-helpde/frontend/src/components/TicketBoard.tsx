import React from 'react';
const cols=['todo','in_progress','review','done'];
export const TicketBoard=()=> <section><h2>Ticket Dashboard</h2><div className='grid'>{cols.map(c=><div key={c} className='lane'><h3>{c}</h3><span className='badge'>0</span></div>)}</div></section>;
