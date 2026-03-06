import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './routes/index.js';
import { env } from './config/env.js';
import { register } from './metrics.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: env.allowedOrigin }));
app.use(express.json());
app.use('/api', router);
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
