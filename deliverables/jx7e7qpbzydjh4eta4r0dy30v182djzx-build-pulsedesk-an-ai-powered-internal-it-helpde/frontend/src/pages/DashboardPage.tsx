import { TicketBoard } from '../components/TicketBoard';
import { MetricsPanel } from '../components/MetricsPanel';
export function DashboardPage(){return <div style={{background:'#0f172a',color:'#dbeafe',minHeight:'100vh',padding:16,fontFamily:'Inter,system-ui'}}><h1>PulseDesk</h1><TicketBoard/><MetricsPanel/></div>}
