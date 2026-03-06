import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { ticketRouter } from './routes/tickets.js';
const app=express(); app.use(express.json()); app.use('/api/tickets', ticketRouter);
app.get('/health',(_q,r)=>r.json({ok:true}));
const server=createServer(app); const wss=new WebSocketServer({server,path:'/ws'});
wss.on('connection',ws=>ws.send(JSON.stringify({type:'hello'})));
server.listen(8080,()=>console.log('backend on 8080'));
