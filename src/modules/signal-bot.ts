import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

export interface SignalMessage {
  to: string | string[];
  message: string;
  attachments?: string[];
}

export interface SignalConfig {
  phoneNumber?: string;
  signalCliPath?: string;
  apiUrl?: string;
  useApi?: boolean;
}

class SignalBot {
  private config: SignalConfig;
  
  constructor(config?: SignalConfig) {
    this.config = {
      phoneNumber: config?.phoneNumber || process.env.SIGNAL_PHONE_NUMBER,
      signalCliPath: config?.signalCliPath || process.env.SIGNAL_CLI_PATH || 'signal-cli',
      apiUrl: config?.apiUrl || process.env.SIGNAL_API_URL,
      useApi: config?.useApi || !!process.env.SIGNAL_API_URL
    };
  }
  
  /**
   * Send message using signal-cli command line
   */
  private async sendViaCli(message: SignalMessage): Promise<boolean> {
    if (!this.config.phoneNumber) {
      throw new Error('Signal phone number not configured');
    }
    
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    
    try {
      for (const recipient of recipients) {
        const command = `${this.config.signalCliPath} -u ${this.config.phoneNumber} send -m "${message.message.replace(/"/g, '\\"')}" ${recipient}`;
        
        console.log(`Sending Signal message to ${recipient}...`);
        const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
        
        if (stderr && !stderr.includes('INFO')) {
          console.error(`Signal CLI stderr: ${stderr}`);
        }
        
        console.log(`Message sent to ${recipient}`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send Signal message via CLI:', error);
      return false;
    }
  }
  
  /**
   * Send message using signal-cli-rest-api
   */
  private async sendViaApi(message: SignalMessage): Promise<boolean> {
    if (!this.config.apiUrl) {
      throw new Error('Signal API URL not configured');
    }
    
    if (!this.config.phoneNumber) {
      throw new Error('Signal phone number not configured');
    }
    
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    
    try {
      const response = await axios.post(
        `${this.config.apiUrl}/v2/send`,
        {
          message: message.message,
          number: this.config.phoneNumber,
          recipients: recipients,
          attachments: message.attachments || []
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
      
      console.log('Signal message sent via API:', response.data);
      return true;
    } catch (error) {
      console.error('Failed to send Signal message via API:', error);
      return false;
    }
  }
  
  /**
   * Send a Signal message
   */
  async sendMessage(message: SignalMessage): Promise<boolean> {
    try {
      if (this.config.useApi) {
        return await this.sendViaApi(message);
      } else {
        return await this.sendViaCli(message);
      }
    } catch (error) {
      console.error('Error sending Signal message:', error);
      return false;
    }
  }
  
  /**
   * Send a formatted Slack status update via Signal
   */
  async sendSlackStatusUpdate(
    statusText: string,
    emoji: string,
    accounts: string[],
    success: boolean
  ): Promise<boolean> {
    const statusEmoji = success ? '✅' : '❌';
    const accountsList = accounts.join(', ');
    
    const message = `${statusEmoji} Slack Status Update

Status: "${statusText}" ${emoji}
Accounts: ${accountsList}
Result: ${success ? 'Successfully updated' : 'Failed to update'}
Time: ${new Date().toLocaleTimeString()}`;
    
    // Get recipients from environment or use default
    const recipients = process.env.SIGNAL_RECIPIENTS?.split(',') || [];
    
    if (recipients.length === 0) {
      console.warn('No Signal recipients configured');
      return false;
    }
    
    return await this.sendMessage({
      to: recipients,
      message
    });
  }
  
  /**
   * Check if Signal is configured and ready
   */
  async isConfigured(): Promise<boolean> {
    if (!this.config.phoneNumber) {
      return false;
    }
    
    if (this.config.useApi) {
      // Check if API is reachable
      try {
        await axios.get(`${this.config.apiUrl}/v1/about`, { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    } else {
      // Check if signal-cli is available
      try {
        const { stdout } = await execAsync(`${this.config.signalCliPath} --version`);
        return stdout.includes('signal-cli');
      } catch {
        return false;
      }
    }
  }
  
  /**
   * Link device for easier setup (generates QR code URI)
   */
  async linkDevice(deviceName: string = 'Signal Bot'): Promise<string> {
    try {
      const { stdout } = await execAsync(`${this.config.signalCliPath} link -n "${deviceName}"`);
      
      // Extract the tsdevice:// URI from output
      const match = stdout.match(/tsdevice:\/\/[^\s]+/);
      if (match) {
        return match[0];
      }
      
      throw new Error('Could not extract linking URI');
    } catch (error) {
      console.error('Failed to generate linking URI:', error);
      throw error;
    }
  }
  
  /**
   * Register a new number (requires captcha)
   */
  async register(phoneNumber: string, captcha?: string): Promise<boolean> {
    try {
      const captchaArg = captcha ? `--captcha "${captcha}"` : '';
      const command = `${this.config.signalCliPath} -u ${phoneNumber} register ${captchaArg}`;
      
      const { stdout, stderr } = await execAsync(command);
      console.log('Registration output:', stdout);
      
      if (stderr && !stderr.includes('INFO')) {
        console.error('Registration error:', stderr);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to register:', error);
      return false;
    }
  }
  
  /**
   * Verify registration with SMS code
   */
  async verify(phoneNumber: string, verificationCode: string): Promise<boolean> {
    try {
      const command = `${this.config.signalCliPath} -u ${phoneNumber} verify ${verificationCode}`;
      
      const { stdout, stderr } = await execAsync(command);
      console.log('Verification output:', stdout);
      
      if (stderr && !stderr.includes('INFO')) {
        console.error('Verification error:', stderr);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to verify:', error);
      return false;
    }
  }
}

// Export singleton instance
const signalBot = new SignalBot();
export default signalBot;