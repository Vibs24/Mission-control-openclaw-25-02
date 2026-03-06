import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { db } from '../db/store.js';

export async function login(email: string, password: string) {
  const user = [...db.users.values()].find((u) => u.email === email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const token = jwt.sign({ sub: user.id, role: user.role, workspaceId: user.workspaceId }, env.jwtSecret, { expiresIn: '8h' });
  db.sessions.set(token, user.id);
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.jwtSecret);
}
