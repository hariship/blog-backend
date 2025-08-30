#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import slackService from './modules/slack-cookie-module';
import axios from 'axios';

dotenv.config();

const execAsync = promisify(exec);

// Emoji detection helper
function detectEmoji(text: string): string {
  const lowerText = text.toLowerCase();
  
  const emojiMap: { [key: string]: string } = {
    'coffee': ':coffee:',
    'tea': ':tea:',
    'lunch': ':fork_and_knife:',
    'dinner': ':fork_and_knife:',
    'breakfast': ':fried_egg:',
    'meeting': ':calendar:',
    'call': ':phone:',
    'zoom': ':video_camera:',
    'break': ':coffee:',
    'workout': ':muscle:',
    'coding': ':computer:',
    'debugging': ':bug:',
    'busy': ':no_entry:',
    'away': ':away:',
    'back': ':white_check_mark:',
    'working': ':computer:',
    'focus': ':dart:',
    'sick': ':face_with_thermometer:',
    'vacation': ':palm_tree:',
    'home': ':house:',
    'office': ':office:',
    'happy': ':smile:',
    'tired': ':sleeping:',
    'morning': ':sunrise:',
    'afternoon': ':sun:',
    'evening': ':sunset:'
  };
  
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (lowerText.includes(keyword)) {
      return emoji;
    }
  }
  
  return ':speech_balloon:';
}

class SimpleSignalBot {
  private phoneNumber: string;
  private allowedNumbers: Set<string>;
  private signalCliPath: string;
  
  constructor() {
    this.phoneNumber = process.env.SIGNAL_PHONE_NUMBER || '';
    this.signalCliPath = process.env.SIGNAL_CLI_PATH || 'signal-cli';
    
    const recipients = process.env.SIGNAL_RECIPIENTS?.split(',') || [];
    this.allowedNumbers = new Set(recipients.map(n => n.trim()));
    
    if (!this.phoneNumber) {
      throw new Error('SIGNAL_PHONE_NUMBER not configured in .env');
    }
  }
  
  async start() {
    console.log('🤖 Starting Simple Signal Bot...');
    console.log(`📱 Phone: ${this.phoneNumber}`);
    console.log(`✅ Allowed: ${Array.from(this.allowedNumbers).join(', ')}`);
    
    // Poll for messages every 3 seconds
    setInterval(async () => {
      await this.checkForMessages();
    }, 3000);
    
    console.log('✅ Signal Bot started! Send yourself a Signal message!');
    console.log('💬 Try: "Having coffee", "In a meeting", "clear"');
  }
  
  async checkForMessages() {
    try {
      console.log('🔍 Checking for messages...');
      
      // Use signal-cli receive with timeout
      const { stdout } = await execAsync(
        `${this.signalCliPath} -u ${this.phoneNumber} receive --timeout 2`,
        { timeout: 5000 }
      );
      
      if (stdout.trim()) {
        console.log('📨 Raw message output:');
        console.log(stdout);
        
        // Parse messages (basic parsing for now)
        const lines = stdout.split('\\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.includes('Body:')) {
            const messageText = line.split('Body:')[1]?.trim();
            const senderMatch = line.match(/Sender: ([+\\d]+)/);
            const sender = senderMatch ? senderMatch[1] : this.phoneNumber;
            
            if (messageText && sender) {
              console.log(`📥 Message from ${sender}: "${messageText}"`);
              await this.processMessage(messageText, sender);
            }
          }
        }
      }
    } catch (error) {
      // Ignore timeouts and continue
      if (error instanceof Error && !error.message.includes('timeout')) {
        console.log('❌ Error checking messages:', error.message);
      }
    }
  }
  
  async processMessage(message: string, sender: string) {
    // Check if sender is allowed
    if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(sender)) {
      console.log(`📵 Ignoring message from ${sender}`);
      return;
    }
    
    const lowerMessage = message.toLowerCase();
    
    try {
      // Help command
      if (lowerMessage === 'help' || lowerMessage === '?') {
        await this.sendMessage(sender, `🤖 Signal Slack Bot Commands:

• Send any text → Set as Slack status
• "clear" or "x" → Clear status
• "help" → Show this message

Examples:
• "Having coffee" → ☕ Having coffee
• "In a meeting" → 📅 In a meeting`);
        return;
      }
      
      // Clear status commands
      if (lowerMessage.includes('clear') || lowerMessage === 'x' || 
          lowerMessage === 'none' || lowerMessage === 'reset') {
        
        console.log('🧹 Clearing Slack status...');
        const results = await slackService.clearAllStatuses();
        const allSuccess = results.every(r => r);
        
        const response = allSuccess 
          ? '✅ Slack status cleared for all accounts!'
          : `⚠️ Status cleared for ${results.filter(r => r).length}/${results.length} accounts`;
        
        await this.sendMessage(sender, response);
        return;
      }
      
      // Set status with the message
      const detectedEmoji = detectEmoji(message);
      console.log(`💬 Setting status: "${message}" ${detectedEmoji}`);
      
      const statusUpdate = {
        text: message,
        emoji: detectedEmoji,
        expiration: undefined
      };
      
      const results = await slackService.updateAllStatuses(statusUpdate);
      const allSuccess = results.every(r => r);
      const someSuccess = results.some(r => r);
      
      let response = '';
      if (allSuccess) {
        const emojiDisplay = detectedEmoji.replace(/:/g, '');
        response = `✅ Slack status updated!
"${message}" ${emojiDisplay}
Accounts: ${slackService.getConfiguredAccounts().join(', ')}`;
      } else if (someSuccess) {
        const successCount = results.filter(r => r).length;
        response = `⚠️ Partial update: ${successCount}/${results.length} accounts
Status: "${message}" ${detectedEmoji}`;
      } else {
        response = `❌ Failed to update Slack status. Please try again.`;
      }
      
      await this.sendMessage(sender, response);
      
    } catch (error) {
      console.error('❌ Error processing message:', error);
      await this.sendMessage(sender, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async sendMessage(to: string, message: string) {
    try {
      console.log(`📤 Sending to ${to}: "${message.substring(0, 50)}..."`);
      
      await execAsync(
        `${this.signalCliPath} -u ${this.phoneNumber} send -m "${message.replace(/"/g, '\\"')}" ${to}`,
        { timeout: 10000 }
      );
      
      console.log('✅ Message sent');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  }
}

// Start the bot
const bot = new SimpleSignalBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n👋 Shutting down Signal bot...');
  await slackService.cleanup();
  process.exit(0);
});

// Start the bot
bot.start().catch(error => {
  console.error('Failed to start bot:', error);
  process.exit(1);
});