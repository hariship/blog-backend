#!/usr/bin/env node

import * as dotenv from 'dotenv';
import TelegramBot from './modules/telegram-bot';
import slackService from './modules/slack-cookie-module';

dotenv.config();

// Start the bot
const bot = new TelegramBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down Telegram bot...');
  await bot.stop();
  await slackService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.stop();
  await slackService.cleanup();
  process.exit(0);
});

// Start the bot
bot.start().catch((error: Error) => {
  console.error('Failed to start Telegram bot:', error);
  process.exit(1);
});