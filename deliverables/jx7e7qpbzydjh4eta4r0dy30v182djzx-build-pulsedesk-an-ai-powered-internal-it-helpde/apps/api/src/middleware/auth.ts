import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService.js';

export interface AuthReq extends Request { user?: any }

export function requireAuth(req: AuthReq, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(auth.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
