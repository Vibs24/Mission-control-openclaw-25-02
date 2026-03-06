import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
const data=[{d:'Mon',v:22},{d:'Tue',v:28},{d:'Wed',v:24}];
export const AnalyticsPanel=()=> <section><h2>Admin Analytics</h2><LineChart width={300} height={160} data={data}><XAxis dataKey='d'/><YAxis/><Tooltip/><Line dataKey='v' stroke='#3b82f6'/></LineChart></section>;
