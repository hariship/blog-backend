import axios from 'axios';
import dotenv from 'dotenv';
import slackService from './slack-cookie-module';

dotenv.config();

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// Emoji detection helper (reuse from Signal)
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

class TelegramBot {
  private botToken: string;
  private apiUrl: string;
  private allowedUsers: Set<number>;
  private lastUpdateId: number = 0;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    // Parse allowed user IDs from environment
    const allowedUserIds = process.env.TELEGRAM_ALLOWED_USERS?.split(',') || [];
    this.allowedUsers = new Set(allowedUserIds.map(id => parseInt(id.trim())));

    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured in .env');
    }
  }

  async start() {
    console.log('🤖 Starting Telegram Slack Bot...');
    
    try {
      // Get bot info
      const botInfo = await this.getBotInfo();
      console.log(`🤖 Bot: @${botInfo.username} (${botInfo.first_name})`);
      console.log(`✅ Allowed users: ${Array.from(this.allowedUsers).join(', ') || 'ALL'}`);
      
      // Start polling for messages
      this.startPolling();
      
      console.log('🚀 Telegram bot started successfully!');
      console.log('💬 Send a message to @harishipbot to update your Slack status!');
      console.log('');
      console.log('Commands:');
      console.log('  • Send any text → Set as Slack status');
      console.log('  • "clear" → Clear status');
      console.log('  • "/help" → Show help');
      console.log('  • "/start" → Welcome message');
      
    } catch (error) {
      console.error('❌ Failed to start Telegram bot:', error);
      throw error;
    }
  }

  private async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return response.data.result;
    } catch (error) {
      throw new Error('Failed to get bot info. Check your bot token.');
    }
  }

  private async startPolling() {
    // Use proper sequential polling to avoid conflicts
    while (true) {
      try {
        await this.getUpdates();
      } catch (error) {
        console.error('❌ Error polling updates:', error);
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  private async getUpdates() {
    try {
      const response = await axios.get(`${this.apiUrl}/getUpdates`, {
        params: {
          offset: this.lastUpdateId + 1,
          timeout: 2
        }
      });

      const updates: TelegramUpdate[] = response.data.result;
      
      for (const update of updates) {
        this.lastUpdateId = update.update_id;
        
        if (update.message) {
          await this.handleMessage(update.message);
        }
      }
    } catch (error) {
      // Ignore timeout errors
      if (!axios.isAxiosError(error) || error.code !== 'ECONNABORTED') {
        console.error('Error getting updates:', error);
      }
    }
  }

  private async handleMessage(message: TelegramMessage) {
    const userId = message.from.id;
    const username = message.from.username || message.from.first_name;
    const text = message.text || '';
    const chatId = message.chat.id;

    // Check if user is allowed (if whitelist is configured)
    if (this.allowedUsers.size > 0 && !this.allowedUsers.has(userId)) {
      console.log(`🚫 Ignoring message from unauthorized user: ${username} (${userId})`);
      await this.sendMessage(chatId, '🚫 Unauthorized. Contact admin to get access.');
      return;
    }

    console.log(`📩 Message from @${username} (${userId}): "${text}"`);
    
    await this.processCommand(text.trim(), chatId, username);
  }

  private async processCommand(message: string, chatId: number, username: string) {
    const lowerMessage = message.toLowerCase();

    try {
      // Parse workspace targeting (@kk or @quilt)
      const { cleanMessage, targetWorkspaces } = this.parseWorkspaceTargets(message);
      
      if (targetWorkspaces.length > 0) {
        console.log(`🎯 Targeting specific workspaces: ${targetWorkspaces.join(', ')}`);
        console.log(`📝 Clean message: "${cleanMessage}"`);
      }
      // Bot commands
      if (cleanMessage.startsWith('/start')) {
        await this.sendMessage(chatId, `🤖 *Slack Status Bot*

Hi @${username}! I can update your Slack status automatically.

*Commands:*
• Send any text → Set as Slack status on all workspaces
• "clear" → Clear status on all workspaces
• "/help" → Show this message

*Workspace Targeting:*
• "@kk Coffee break" → Set status only on knowledgekeepergroup
• "@quilt In a meeting" → Set status only on quilt-corp
• "Working from home @kk" → Set status only on knowledgekeepergroup
• "clear @quilt" → Clear status only on quilt-corp

*Examples:*
• "Having coffee" → ☕ Having coffee (both workspaces)
• "@kk Debugging" → 🐛 Debugging (knowledgekeepergroup only)
• "Lunch break @quilt" → 🍽️ Lunch break (quilt-corp only)

Just send me your status and I'll take care of the rest! 🚀`, true);
        return;
      }

      if (cleanMessage.startsWith('/help')) {
        await this.sendMessage(chatId, `🤖 *Slack Status Bot Commands:*

• Send any text → Set as Slack status on all workspaces
• "clear" → Clear status on all workspaces
• "/start" → Welcome message

*Workspace Targeting:*
• "@kk [text]" → knowledgekeepergroup only
• "@quilt [text]" → quilt-corp only
• "[text] @kk" → knowledgekeepergroup only  
• "[text] @quilt" → quilt-corp only

*Examples:*
• "Having coffee" → ☕ Both workspaces
• "@kk Debugging" → 🐛 knowledgekeepergroup only
• "Meeting @quilt" → 📅 quilt-corp only
• "clear @kk" → Clear knowledgekeepergroup only

The bot automatically detects appropriate emojis! 🎯`, true);
        return;
      }

      // Clear status commands
      if (cleanMessage.toLowerCase().includes('clear') || cleanMessage.toLowerCase() === 'x' || 
          cleanMessage.toLowerCase() === 'none' || cleanMessage.toLowerCase() === 'reset') {
        
        console.log('🧹 Clearing Slack status...');
        
        if (targetWorkspaces.length > 0) {
          // Clear specific workspaces
          await this.sendMessage(chatId, `🔄 Clearing status on: ${targetWorkspaces.join(', ')}...`);
          
          const results: boolean[] = [];
          const workspaceNames: string[] = [];
          
          for (const workspace of targetWorkspaces) {
            const accountName = workspace === 'knowledgekeepergroup' ? 'account1' : 'account2';
            console.log(`Clearing status for ${accountName} (${workspace})...`);
            const result = await slackService.clearStatus(accountName);
            results.push(result);
            workspaceNames.push(workspace);
          }
          
          const allSuccess = results.every(r => r);
          const successCount = results.filter(r => r).length;
          
          if (allSuccess) {
            await this.sendMessage(chatId, `✅ Status cleared for: ${workspaceNames.join(', ')}! 🌟`);
          } else {
            await this.sendMessage(chatId, `⚠️ Status cleared for ${successCount}/${results.length} targeted workspaces`);
          }
        } else {
          // Clear all workspaces
          await this.sendMessage(chatId, '🔄 Clearing your Slack status...');
          
          const results = await slackService.clearAllStatuses();
          const allSuccess = results.every(r => r);
          const successCount = results.filter(r => r).length;
          
          if (allSuccess) {
            await this.sendMessage(chatId, '✅ Slack status cleared for all accounts! 🌟');
          } else {
            await this.sendMessage(chatId, `⚠️ Status cleared for ${successCount}/${results.length} accounts`);
          }
        }
        return;
      }

      // Set status with the message
      const detectedEmoji = detectEmoji(cleanMessage);
      console.log(`💬 Setting status: "${cleanMessage}" with emoji :${detectedEmoji}:`);
      
      const statusUpdate = {
        text: cleanMessage,
        emoji: detectedEmoji,
        expiration: undefined
      };

      if (targetWorkspaces.length > 0) {
        // Update specific workspaces
        await this.sendMessage(chatId, `🔄 Setting status on: ${targetWorkspaces.join(', ')}...`);
        
        const results: boolean[] = [];
        const workspaceNames: string[] = [];
        
        for (const workspace of targetWorkspaces) {
          const accountName = workspace === 'knowledgekeepergroup' ? 'account1' : 'account2';
          console.log(`Setting status for ${accountName} (${workspace})...`);
          const result = await slackService.updateStatus(accountName, statusUpdate);
          results.push(result);
          workspaceNames.push(workspace);
        }
        
        const allSuccess = results.every(r => r);
        const successCount = results.filter(r => r).length;
        const emojiDisplay = detectedEmoji.replace(/:/g, '');
        
        if (allSuccess) {
          await this.sendMessage(chatId, `✅ Slack status updated!

📋 Status: "${cleanMessage}" ${emojiDisplay}
👥 Workspaces: ${workspaceNames.join(', ')}`);
        } else {
          await this.sendMessage(chatId, `⚠️ Partial update: ${successCount}/${results.length} targeted workspaces`);
        }
      } else {
        // Update all workspaces
        await this.sendMessage(chatId, `🔄 Setting status: "${cleanMessage}" with emoji :${detectedEmoji.replace(/:/g, '')}: ...`);
        
        const results = await slackService.updateAllStatuses(statusUpdate);
        const allSuccess = results.every(r => r);
        const someSuccess = results.some(r => r);
        const successCount = results.filter(r => r).length;

        if (allSuccess) {
          const emojiDisplay = detectedEmoji.replace(/:/g, '');
          await this.sendMessage(chatId, `✅ Slack status updated!

📋 Status: "${cleanMessage}" ${emojiDisplay}
👥 Accounts: ${slackService.getConfiguredAccounts().join(', ')}`);
        } else if (someSuccess) {
          const emojiDisplay = detectedEmoji.replace(/:/g, '');
          await this.sendMessage(chatId, `⚠️ Partial update

📋 Status: "${cleanMessage}" ${emojiDisplay}
✅ Updated: ${successCount}/${results.length} accounts`);
        } else {
          await this.sendMessage(chatId, '❌ Failed to update Slack status. Please try again.');
        }
      }

    } catch (error) {
      console.error('❌ Error processing command:', error);
      await this.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async sendMessage(chatId: number, text: string, markdown: boolean = false) {
    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: markdown ? 'Markdown' : undefined
      });
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  }

  async stop() {
    console.log('👋 Stopping Telegram bot...');
  }

  private parseWorkspaceTargets(message: string): { cleanMessage: string, targetWorkspaces: string[] } {
    const targetWorkspaces: string[] = [];
    let cleanMessage = message;

    // Look for @kk or @quilt anywhere in the message
    const kkMatch = cleanMessage.match(/@kk\b/gi);
    const quiltMatch = cleanMessage.match(/@quilt\b/gi);

    if (kkMatch) {
      targetWorkspaces.push('knowledgekeepergroup');
      cleanMessage = cleanMessage.replace(/@kk\b/gi, '').trim();
    }

    if (quiltMatch) {
      targetWorkspaces.push('quilt-corp');
      cleanMessage = cleanMessage.replace(/@quilt\b/gi, '').trim();
    }

    // Clean up extra spaces
    cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();

    return { cleanMessage, targetWorkspaces };
  }
}

export default TelegramBot;