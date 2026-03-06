import { db } from '../db/store.js';

export function searchTickets(term: string) {
  const q = term.toLowerCase();
  return [...db.tickets.values()].filter((t) =>
    [t.title, t.description, t.triageSummary || ''].some((v) => v.toLowerCase().includes(q))
  );
}
