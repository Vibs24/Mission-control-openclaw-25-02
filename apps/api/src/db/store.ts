import { randomUUID } from 'crypto';

export interface User { id: string; email: string; name: string; passwordHash: string; role: 'agent'|'admin'; workspaceId: string }
export interface Ticket { id: string; workspaceId: string; title: string; description: string; status: string; priority: string; assigneeId?: string; createdBy: string; createdAt: string; updatedAt: string; triageSummary?: string }

export const db = {
  users: new Map<string, User>(),
  tickets: new Map<string, Ticket>(),
  sessions: new Map<string, string>(),
  messages: [] as any[]
};

const adminId = randomUUID();
db.users.set(adminId, { id: adminId, email: 'admin@pulsedesk.local', name: 'Admin', passwordHash: '$2a$10$uY2fV9jP0Qq8QVfN7M6wQeCXf2SWEYQunlslqY5T2r8j04YfJmRo2', role: 'admin', workspaceId: 'default' }); // password: password123
