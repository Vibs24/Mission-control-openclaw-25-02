import React from 'react';
import { TicketBoard } from '../components/TicketBoard';
import { AgentChat } from '../components/AgentChat';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
export const Dashboard=()=> <div className='layout'><header>PulseDesk</header><main><TicketBoard/><AgentChat/><AnalyticsPanel/></main></div>;
