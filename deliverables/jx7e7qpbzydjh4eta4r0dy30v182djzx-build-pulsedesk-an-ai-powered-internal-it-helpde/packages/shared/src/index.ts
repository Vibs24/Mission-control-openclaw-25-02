export type TicketStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}
