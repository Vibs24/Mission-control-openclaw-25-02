import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  claudeApiKey: process.env.CLAUDE_API_KEY || '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  notificationMode: process.env.NOTIFICATION_MODE || 'mock'
};
