import { Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/store.js';
import { AuthReq } from '../middleware/auth.js';
import { triageTicket } from '../services/triageService.js';
import { notify } from '../services/notificationService.js';
import { searchTickets } from '../services/searchService.js';
import { publishTicketEvent } from '../services/cacheService.js';

const createSchema = z.object({ title: z.string().min(5), description: z.string().min(10), priority: z.enum(['low','medium','high','critical']).default('medium') });

export async function listTickets(req: AuthReq, res: Response) {
  const { status, assigneeId, workspaceId, q } = req.query;
  let rows = [...db.tickets.values()];
  if (status) rows = rows.filter((t) => t.status === status);
  if (assigneeId) rows = rows.filter((t) => t.assigneeId === assigneeId);
  if (workspaceId) rows = rows.filter((t) => t.workspaceId === workspaceId);
  if (q) rows = searchTickets(String(q));
  res.json(rows);
}

export async function createTicket(req: AuthReq, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const triage = await triageTicket(parsed.data);
  const now = new Date().toISOString();
  const ticket = { id: randomUUID(), workspaceId: String(req.user.workspaceId), title: parsed.data.title, description: parsed.data.description, status: 'triaged', priority: parsed.data.priority, createdBy: String(req.user.sub), createdAt: now, updatedAt: now, triageSummary: triage.summary };
  db.tickets.set(ticket.id, ticket);
  await notify('it-team@local', `New ticket ${ticket.id}`, ticket.title);
  await publishTicketEvent({ event: 'ticket.created', ticketId: ticket.id, status: ticket.status });
  res.status(201).json({ ...ticket, triage });
}

export function getTicket(req: AuthReq, res: Response) {
  const ticket = db.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  res.json(ticket);
}

export async function updateTicket(req: AuthReq, res: Response) {
  const ticket = db.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  const updated = { ...ticket, ...req.body, updatedAt: new Date().toISOString() };
  db.tickets.set(ticket.id, updated);
  await publishTicketEvent({ event: 'ticket.updated', ticketId: ticket.id, status: updated.status });
  res.json(updated);
}

export function deleteTicket(req: AuthReq, res: Response) {
  const ok = db.tickets.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}
