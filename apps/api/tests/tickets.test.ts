import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';

async function token() {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@pulsedesk.local', password: 'password123' });
  return login.body.token;
}

describe('tickets', () => {
  it('creates and lists ticket', async () => {
    const t = await token();
    const create = await request(app).post('/api/tickets').set('Authorization', `Bearer ${t}`).send({ title: 'VPN broken on mac', description: 'Cannot connect from office device after update', priority: 'high' });
    expect(create.status).toBe(201);
    const list = await request(app).get('/api/tickets').set('Authorization', `Bearer ${t}`);
    expect(list.body.length).toBeGreaterThan(0);
  });
});
