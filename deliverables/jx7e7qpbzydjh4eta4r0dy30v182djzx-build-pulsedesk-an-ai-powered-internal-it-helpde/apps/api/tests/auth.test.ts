import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';

describe('auth', () => {
  it('rejects bad login', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'badbadbad' });
    expect(res.status).toBe(401);
  });
});
