import { env } from '../config/env.js';

export async function triageTicket(input: { title: string; description: string }) {
  if (!env.claudeApiKey) {
    return {
      category: 'general_it',
      urgency: 'medium',
      summary: `Mock triage: ${input.title} requires standard IT workflow.`,
      recommendation: 'Route to L1 support and request logs/screenshots.'
    };
  }
  // Safe fallback; integration point for real Claude call.
  return {
    category: 'ai_triaged',
    urgency: 'high',
    summary: `AI triage placeholder for ${input.title}`,
    recommendation: 'Investigate with runbook RB-101.'
  };
}
