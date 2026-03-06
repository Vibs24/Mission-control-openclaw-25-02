import { Router } from 'express';
import { postLogin } from '../controllers/authController.js';
import { createTicket, deleteTicket, getTicket, listTickets, updateTicket } from '../controllers/ticketController.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();
router.get('/health', (_req, res) => res.json({ ok: true }));
router.post('/auth/login', postLogin);
router.get('/tickets', requireAuth, listTickets);
router.post('/tickets', requireAuth, createTicket);
router.get('/tickets/:id', requireAuth, getTicket);
router.patch('/tickets/:id', requireAuth, updateTicket);
router.delete('/tickets/:id', requireAuth, deleteTicket);
