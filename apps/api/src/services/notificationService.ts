import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface Adapter { send(recipient: string, subject: string, body: string): Promise<void> }

class MockAdapter implements Adapter {
  async send(recipient: string, subject: string, body: string) {
    logger.info({ recipient, subject, body }, 'mock notification sent');
  }
}
class SlackAdapter implements Adapter {
  async send(recipient: string, subject: string, body: string) {
    logger.info({ recipient, subject, body, webhook: !!env.slackWebhookUrl }, 'slack adapter invoked');
  }
}

const adapter: Adapter = env.notificationMode === 'slack' ? new SlackAdapter() : new MockAdapter();
export const notify = (recipient: string, subject: string, body: string) => adapter.send(recipient, subject, body);
