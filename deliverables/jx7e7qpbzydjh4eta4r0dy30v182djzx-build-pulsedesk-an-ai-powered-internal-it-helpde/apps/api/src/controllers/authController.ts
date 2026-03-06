import { Request, Response } from 'express';
import { z } from 'zod';
import { login } from '../services/authService.js';

const schema = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function postLogin(req: Request, res: Response) {
  const input = schema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.flatten() });
  const data = await login(input.data.email, input.data.password);
  if (!data) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json(data);
}
