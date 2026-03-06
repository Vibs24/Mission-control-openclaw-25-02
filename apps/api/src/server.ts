import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { attachWs } from './ws/websocket.js';

const server = createServer(app);
attachWs(server);
server.listen(env.port, () => logger.info({ port: env.port }, 'PulseDesk API running'));
