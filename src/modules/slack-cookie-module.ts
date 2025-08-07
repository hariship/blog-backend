import puppeteer, { Browser, Page } from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

interface SlackAccount {
  name: string;
  workspace: string;
  dCookie: string;
}

interface StatusUpdate {
  text: string;
  emoji: string;
  clearAfterMinutes?: number;
}

class SlackCookieService {
  private browser: Browser | null = null;
  private accounts: SlackAccount[] = [];

  constructor() {
    this.initializeAccounts();
  }

  private initializeAccounts() {
    const account1Cookie = process.env.SLACK_D_COOKIE_1;
    const account1Workspace = process.env.SLACK_WORKSPACE_1;
    
    const account2Cookie = process.env.SLACK_D_COOKIE_2;
    const account2Workspace = process.env.SLACK_WORKSPACE_2;

    if (account1Cookie && account1Workspace) {
      this.accounts.push({
        name: 'account1',
        workspace: account1Workspace,
        dCookie: account1Cookie
      });
    }

    if (account2Cookie && account2Workspace) {
      this.accounts.push({
        name: 'account2',
        workspace: account2Workspace,
        dCookie: account2Cookie
      });
    }
  }

  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      try {
        // Check if browser is still connected
        await this.browser.version();
      } catch {
        // Browser disconnected, close and recreate
        try {
          await this.browser.close();
        } catch {}
        this.browser = null;
      }
    }
    
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true, // Set to false for debugging
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--single-process', // Helps on Linux servers
          '--no-zygote' // Helps on Linux servers
        ]
      });
    }
    return this.browser;
  }

  async updateStatus(accountName: string, status: StatusUpdate): Promise<boolean> {
    const account = this.accounts.find(acc => acc.name === accountName);
    if (!account) {
      console.error(`Account ${accountName} not configured`);
      return false;
    }

    const browser = await this.initBrowser();
    const page = await browser.newPage();

    // Add stealth measures
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    // Set viewport to common size
    await page.setViewport({ width: 1366, height: 768 });
    

    try {
      await page.setCookie({
        name: 'd',
        value: account.dCookie,
        domain: '.slack.com',
        path: '/',
        httpOnly: true,
        secure: true
      });

      await page.goto(`https://${account.workspace}.slack.com`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 4000));

      const isLoggedIn = await page.evaluate(() => {
        return !window.location.pathname.includes('/signin');
      });

      if (!isLoggedIn) {
        console.error(`Cookie expired for ${accountName}. Please update the d cookie.`);
        return false;
      }
      
      console.log(`Successfully logged into ${accountName} (${account.workspace})`);
      await new Promise(resolve => setTimeout(resolve, 300));
      // Click on profile using the known working selector
      console.log('🎯 Clicking profile with .c-avatar selector...');
      try {
        await page.waitForSelector('.c-avatar', { timeout: 5000 });
        await page.click('.c-avatar');
        console.log('✅ Successfully clicked profile');
      } catch (error) {
        throw new Error('Could not find profile button (.c-avatar selector failed)');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Use keyboard shortcut (known to work) - skip menu clicking entirely
      console.log('🎯 Using keyboard shortcut to open status dialog...');
      await page.keyboard.press('Escape'); // Close any open menu
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Use Ctrl+Shift+Y (Linux) for status shortcut
      await page.keyboard.down('Control');
      await page.keyboard.down('Shift');
      await page.keyboard.press('Y');
      await page.keyboard.up('Control');
      await page.keyboard.up('Shift');
      
      // Wait for dialog to open
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('✅ Status dialog opened');
      
      // Clear existing text and type new status
      console.log('🧹 Clearing existing text...');
      await page.keyboard.down('Control');
      await page.keyboard.press('a'); // Select all
      await page.keyboard.up('Control');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Clear with backspaces for safety
      for (let i = 0; i < 50; i++) {
        await page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      
      // Type new status text
      if (status.text && status.text.trim() !== '') {
        console.log(`✍️ Typing: "${status.text}"`);
        await page.keyboard.type(status.text, { delay: 80 });
        await new Promise(resolve => setTimeout(resolve, 800));
        console.log('✅ Text entered');
      }
      
      // Handle emoji (set or clear)
      try {
        console.log('🎯 Handling emoji...');
        
        // Click the emoji button to open emoji picker
        const emojiBtn = await page.$('button[data-qa="custom_status_input_emoji_picker"]');
        if (emojiBtn) {
          await emojiBtn.click();
          await new Promise(r => setTimeout(r, 1000));
          console.log('✅ Emoji picker opened');
          
          if (status.emoji && status.emoji.trim() !== '') {
            console.log(`✍️ Setting emoji: ${status.emoji}`);
            
            // Type emoji name in search
            const emojiName = status.emoji.replace(/:/g, '');
            await page.keyboard.type(emojiName);
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Press Enter to select first result
            await page.keyboard.press('Enter');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('✅ Emoji set');
          } else {
            console.log('🧹 Clearing emoji (removing any existing emoji)');
            
            // Clear any existing emoji by clearing search and closing picker
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Close emoji picker without selecting (removes emoji)
            await page.keyboard.press('Escape');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('✅ Emoji cleared');
          }
        } else {
          console.warn('❌ Emoji button not found - skipping emoji handling');
        }
      } catch (emojiError) {
        console.error('❌ Error handling emoji:', emojiError);
        // Continue with saving even if emoji fails
      }

      try {
        await page.click('button[data-qa="save-status"]');
      } catch {
        const buttons = await page.$$('button');
        for (const button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (text && (text.includes('Save') || text.includes('Set'))) {
            await button.click();
            break;
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`Status updated for ${accountName}: ${status.text} ${status.emoji}`);
      return true;
      
    } catch (error) {
      console.error(`Error updating status for ${accountName}:`, error);
      return false;
    } finally {
      await page.close();
    }
  }

  async updateAllStatuses(status: StatusUpdate): Promise<boolean[]> {
    const results: boolean[] = [];
    
    // Process accounts sequentially to avoid browser session conflicts
    for (const account of this.accounts) {
      console.log(`Updating status for ${account.name} (${account.workspace})...`);
      
      // Close any existing browser to ensure clean state for each account
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {}
        this.browser = null;
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const success = await this.updateStatus(account.name, status);
      results.push(success);
      
      console.log(`Account ${account.name} result: ${success ? 'SUCCESS' : 'FAILED'}`);
      
      // Delay between accounts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }

  async clearStatus(accountName: string): Promise<boolean> {
    return this.updateStatus(accountName, { text: '', emoji: '' });
  }

  async clearAllStatuses(): Promise<boolean[]> {
    const results: boolean[] = [];
    
    // Process accounts sequentially to avoid browser session conflicts  
    for (const account of this.accounts) {
      console.log(`Clearing status for ${account.name} (${account.workspace})...`);
      const success = await this.clearStatus(account.name);
      results.push(success);
      
      // Small delay between accounts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }

  getConfiguredAccounts(): string[] {
    return this.accounts.map(acc => acc.workspace);
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

const slackCookieService = new SlackCookieService();

// Cleanup on process termination
process.on('SIGINT', async () => {
  await slackCookieService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await slackCookieService.cleanup();
  process.exit(0);
});

export default slackCookieService;