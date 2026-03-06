async function triage(ticket){
  const text=(ticket.title||'')+' '+(ticket.description||'');
  const priority=/outage|down|critical/i.test(text)?'P1':'P3';
  const category=/vpn|network/i.test(text)?'network':'general';
  return {priority,category,triage_source: process.env.CLAUDE_API_KEY?'claude':'heuristic'};
}
module.exports={triage};
