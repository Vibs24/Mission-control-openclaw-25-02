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
db.users.set(adminId, { id: adminId, email: 'admin@pulsedesk.local', name: 'Admin', passwordHash: '$2a$10$eXxGxY9bfbGSsF01XYBPMu8w/oF/QU8N74NeUVahulSG4K040BJve', role: 'admin', workspaceId: 'default' }); // password: password123
