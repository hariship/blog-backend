#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import slackService from './modules/slack-cookie-module';
import signalBot from './modules/signal-bot';
import axios from 'axios';

dotenv.config();

interface SignalMessage {
  envelope: {
    source: string;
    sourceNumber: string;
    sourceUuid: string;
    sourceName: string;
    sourceDevice: number;
    timestamp: number;
    syncMessage?: {
      sentMessage?: {
        message: string;
      };
    };
    dataMessage?: {
      message: string;
      timestamp: number;
    };
  };
}

// Emoji detection helper (reuse from slack routes)
function detectEmoji(text: string): string {
  const lowerText = text.toLowerCase();
  
  const emojiMap: { [key: string]: string } = {
    // Food & Drinks
    'coffee': ':coffee:',
    'tea': ':tea:',
    'lunch': ':fork_and_knife:',
    'dinner': ':fork_and_knife:',
    'breakfast': ':fried_egg:',
    'pizza': ':pizza:',
    'beer': ':beer:',
    'wine': ':wine_glass:',
    'water': ':droplet:',
    
    // Activities
    'meeting': ':calendar:',
    'call': ':phone:',
    'zoom': ':video_camera:',
    'break': ':coffee:',
    'workout': ':muscle:',
    'gym': ':muscle:',
    'running': ':running:',
    'walking': ':walking:',
    'coding': ':computer:',
    'programming': ':computer:',
    'debugging': ':bug:',
    'testing': ':test_tube:',
    
    // Status
    'busy': ':no_entry:',
    'away': ':away:',
    'back': ':white_check_mark:',
    'working': ':computer:',
    'focus': ':dart:',
    'thinking': ':thinking_face:',
    'sick': ':face_with_thermometer:',
    'vacation': ':palm_tree:',
    'holiday': ':palm_tree:',
    'home': ':house:',
    'office': ':office:',
    'remote': ':house_with_garden:',
    
    // Emotions
    'happy': ':smile:',
    'sad': ':disappointed:',
    'excited': ':star-struck:',
    'tired': ':sleeping:',
    'stressed': ':face_with_spiral_eyes:',
    
    // Time of day
    'morning': ':sunrise:',
    'afternoon': ':sun:',
    'evening': ':sunset:',
    'night': ':moon:',
    
    // Default statuses
    'available': ':white_check_mark:',
    'unavailable': ':x:',
    'brb': ':hourglass:',
    'afk': ':away:'
  };
  
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (lowerText.includes(keyword)) {
      return emoji;
    }
  }
  
  return ':speech_balloon:';
}

class SignalDaemon {
  private process: ChildProcess | null = null;
  private phoneNumber: string;
  private signalCliPath: string;
  private allowedNumbers: Set<string>;
  
  constructor() {
    this.phoneNumber = process.env.SIGNAL_PHONE_NUMBER || '';
    this.signalCliPath = process.env.SIGNAL_CLI_PATH || 'signal-cli';
    
    // Parse allowed numbers from environment
    const recipients = process.env.SIGNAL_RECIPIENTS?.split(',') || [];
    this.allowedNumbers = new Set(recipients.map(n => n.trim()));
    
    if (!this.phoneNumber) {
      throw new Error('SIGNAL_PHONE_NUMBER not configured in .env');
    }
  }
  
  async start() {
    console.log('🤖 Starting Signal Bot Daemon...');
    console.log(`📱 Using phone number: ${this.phoneNumber}`);
    console.log(`✅ Allowed numbers: ${Array.from(this.allowedNumbers).join(', ')}`);
    
    // Use Docker REST API instead of signal-cli daemon
    console.log('🔍 Checking SIGNAL_API_URL:', process.env.SIGNAL_API_URL);
    if (process.env.SIGNAL_API_URL) {
      console.log('📡 Using Signal REST API mode...');
      this.startRestApiMode();
      return;
    }
    
    console.log('⚠️ No SIGNAL_API_URL found, falling back to signal-cli daemon...');
    
    // Fallback to signal-cli daemon (without --json flag)
    this.process = spawn(this.signalCliPath, [
      '-u', this.phoneNumber,
      'daemon'
    ]);
    
    if (!this.process.stdout || !this.process.stderr) {
      throw new Error('Failed to start signal-cli daemon');
    }
    
    // Handle incoming messages
    this.process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as SignalMessage;
          this.handleMessage(message);
        } catch (error) {
          // Not JSON, might be status message
          if (line.includes('INFO') || line.includes('WARN')) {
            console.log(`signal-cli: ${line}`);
          }
        }
      }
    });
    
    // Handle errors
    this.process.stderr.on('data', (data) => {
      console.error(`signal-cli error: ${data}`);
    });
    
    // Handle process exit
    this.process.on('exit', (code) => {
      console.log(`signal-cli daemon exited with code ${code}`);
      // Restart after 5 seconds
      setTimeout(() => {
        console.log('Restarting daemon...');
        this.start();
      }, 5000);
    });
    
    console.log('✅ Signal Bot Daemon started successfully!');
    console.log('📨 Send me a message on Signal to update your Slack status!');
    console.log('\nCommands:');
    console.log('  - Send any text to set as status (emoji auto-detected)');
    console.log('  - Send "clear", "x", or "none" to clear status');
    console.log('  - Send "status" to check current status');
    console.log('  - Send "help" for this message');
  }
  
  private async startRestApiMode() {
    console.log('🔄 Starting REST API polling mode...');
    const apiUrl = process.env.SIGNAL_API_URL;
    const encodedNumber = encodeURIComponent(this.phoneNumber);
    
    console.log(`🔍 Polling endpoint: ${apiUrl}/v1/receive/${encodedNumber}`);
    
    // First try to receive messages once
    try {
      console.log('🔄 Initial message receive...');
      const response = await axios.get(`${apiUrl}/v1/receive/${encodedNumber}`, { timeout: 2000 });
      console.log('✅ Initial receive successful');
    } catch (error) {
      console.log('⚠️ Initial receive failed, continuing...');
    }
    
    // Use a longer interval with shorter timeout to avoid blocking
    setInterval(async () => {
      try {
        // Try different endpoints
        let response;
        try {
          response = await axios.get(`${apiUrl}/v1/receive/${encodedNumber}`, { timeout: 2000 });
        } catch (error) {
          // Try without encoding
          response = await axios.get(`${apiUrl}/v1/receive/+918939407232`, { timeout: 2000 });
        }
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          console.log('📥 Received', response.data.length, 'messages');
          for (const message of response.data) {
            console.log('📨 Processing message:', JSON.stringify(message, null, 2));
            await this.handleRestApiMessage(message);
          }
        }
      } catch (error) {
        // Silently continue on timeout/errors
      }
    }, 1500);
    
    console.log('✅ REST API polling started!');
    console.log('📨 Send me a message on Signal to update your Slack status!');
  }
  
  private async handleRestApiMessage(message: any) {
    const messageText = message.envelope?.dataMessage?.message;
    const sender = message.envelope?.source || message.envelope?.sourceNumber;
    
    if (!messageText || !sender) {
      return;
    }
    
    // Check if sender is allowed
    if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(sender)) {
      console.log(`📵 Ignoring message from unauthorized number: ${sender}`);
      return;
    }
    
    console.log(`\n📩 Received message from ${sender}: "${messageText}"`);
    await this.processCommand(messageText.trim(), sender);
  }
  
  private async handleMessage(msg: SignalMessage) {
    // Extract message text and sender
    const messageText = msg.envelope.dataMessage?.message || 
                       msg.envelope.syncMessage?.sentMessage?.message;
    const sender = msg.envelope.sourceNumber || msg.envelope.source;
    
    if (!messageText || !sender) {
      return;
    }
    
    // Check if sender is allowed
    if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(sender)) {
      console.log(`📵 Ignoring message from unauthorized number: ${sender}`);
      return;
    }
    
    console.log(`\n📩 Received message from ${sender}: "${messageText}"`);
    
    // Process the command
    await this.processCommand(messageText.trim(), sender);
  }
  
  private async processCommand(message: string, sender: string) {
    const lowerMessage = message.toLowerCase();
    
    try {
      // Help command
      if (lowerMessage === 'help' || lowerMessage === '?') {
        await this.sendReply(sender, `🤖 Signal Slack Bot Commands:

• Send any text → Set as Slack status
• "clear" or "x" → Clear status
• "status" → Check current status
• "help" → Show this message

Examples:
• "Having coffee" → ☕ Having coffee
• "In a meeting" → 📅 In a meeting
• "Working from home" → 🏠 Working from home`);
        return;
      }
      
      // Status check command
      if (lowerMessage === 'status' || lowerMessage === 'check') {
        await this.sendReply(sender, `📊 Status check feature coming soon!\nFor now, check your Slack directly.`);
        return;
      }
      
      // Clear status commands
      if (lowerMessage.includes('clear') || lowerMessage.includes('remove') || 
          lowerMessage === 'x' || lowerMessage === 'none' || 
          lowerMessage === 'reset' || lowerMessage === 'delete') {
        
        console.log('🧹 Clearing Slack status...');
        const results = await slackService.clearAllStatuses();
        const allSuccess = results.every(r => r);
        
        if (allSuccess) {
          await this.sendReply(sender, `✅ Slack status cleared for all accounts!`);
        } else {
          const successCount = results.filter(r => r).length;
          await this.sendReply(sender, `⚠️ Status cleared for ${successCount}/${results.length} accounts`);
        }
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
      
      if (allSuccess) {
        const emojiDisplay = detectedEmoji.replace(/:/g, '');
        await this.sendReply(sender, `✅ Slack status updated!
"${message}" ${emojiDisplay}
Updated: ${slackService.getConfiguredAccounts().join(', ')}`);
      } else if (someSuccess) {
        const successCount = results.filter(r => r).length;
        await this.sendReply(sender, `⚠️ Partial update: ${successCount}/${results.length} accounts
Status: "${message}" ${detectedEmoji}`);
      } else {
        await this.sendReply(sender, `❌ Failed to update Slack status. Please try again.`);
      }
      
      // Send webhook notification if configured
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await axios.post(webhookUrl, {
            source: 'signal',
            sender,
            message,
            status: statusUpdate,
            success: allSuccess,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Failed to send webhook:', error);
        }
      }
      
    } catch (error) {
      console.error('Error processing command:', error);
      await this.sendReply(sender, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async sendReply(to: string, message: string) {
    try {
      console.log(`📤 Sending reply to ${to}: "${message.substring(0, 50)}..."`);
      
      // Use REST API if available
      if (process.env.SIGNAL_API_URL) {
        console.log('📤 Sending via REST API...');
        await axios.post(`${process.env.SIGNAL_API_URL}/v1/send`, {
          message: message,
          number: this.phoneNumber,
          recipients: [to]
        });
        console.log('✅ Message sent successfully');
      } else {
        // Fallback to signal-cli
        await signalBot.sendMessage({ to, message });
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  }
  
  async stop() {
    if (this.process) {
      console.log('Stopping Signal daemon...');
      this.process.kill();
      this.process = null;
    }
  }
}

// Start the daemon
const daemon = new SignalDaemon();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down Signal daemon...');
  await daemon.stop();
  await slackService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await daemon.stop();
  await slackService.cleanup();
  process.exit(0);
});

// Start the daemon
daemon.start().catch(error => {
  console.error('Failed to start daemon:', error);
  process.exit(1);
});