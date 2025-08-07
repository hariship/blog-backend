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
        headless: false, // Set to false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
      // Click on profile/user menu - try multiple possible selectors
      const profileSelectors = [
        'button[data-qa="user-button"]',
        'button[aria-label*="User menu"]',
        'button[aria-label*="profile"]',
        '.p-ia__avatar',
        '.p-classic_nav__team_header__user__button'
      ];
      
      let profileClicked = false;
      for (const selector of profileSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          await page.click(selector);
          profileClicked = true;
          break;
        } catch {
          continue;
        }
      }
      
      if (!profileClicked) {
        throw new Error('Could not find profile button');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Click on status option - try multiple selectors
      const statusSelectors = [
        '[data-qa="status-item"]',
        '[data-qa="set-status-item"]',
        'button[data-qa-action="status"]',
        '[role="menuitem"]:has-text("status")',
        'div[role="menuitem"]'
      ];
      
      // First try data-qa selectors
      let statusClicked = false;
      for (const selector of statusSelectors.slice(0, 3)) {
        try {
          await page.click(selector);
          statusClicked = true;
          break;
        } catch {
          continue;
        }
      }
      
      // If that didn't work, look for menu items with "status" text
      if (!statusClicked) {
        const menuItems = await page.$$('div[role="menuitem"], button[role="menuitem"]');
        for (const item of menuItems) {
          const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', item);
          if (text.includes('status') || text.includes('update')) {
            await item.click();
            statusClicked = true;
            break;
          }
        }
      }
      
      let usedKeyboardShortcut = false;
      if (!statusClicked) {
        console.log('Could not find status menu item via selectors, trying keyboard shortcut');
        // Try using keyboard shortcut instead
        await page.keyboard.press('Escape'); // Close any open menu
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try Cmd+Shift+Y (Mac) or Ctrl+Shift+Y (Windows/Linux) for status
        const isMac = process.platform === 'darwin';
        if (isMac) {
          await page.keyboard.down('Meta');
          await page.keyboard.down('Shift');
        } else {
          await page.keyboard.down('Control');
          await page.keyboard.down('Shift');
        }
        await page.keyboard.press('Y');
        if (isMac) {
          await page.keyboard.up('Meta');
          await page.keyboard.up('Shift');
        } else {
          await page.keyboard.up('Control');
          await page.keyboard.up('Shift');
        }
        
        // Wait longer for dialog to open
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // When using keyboard shortcut, just clear and type directly
        console.log('Status dialog opened via keyboard shortcut');
        
        // Skip the clear button approach - directly select all and replace
        console.log('Selecting all existing text and replacing...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Take a screenshot to see the dialog state (disabled for headless mode)
        // await page.screenshot({ path: `/tmp/slack-dialog-before-typing.png` });
        
        // Multiple attempts to clear existing text
        const isMacClear = process.platform === 'darwin';
        
        // Method 1: Try Cmd+A to select all
        console.log('Method 1: Pressing Cmd+A to select all text...');
        await page.keyboard.down(isMacClear ? 'Meta' : 'Control');
        await page.keyboard.press('a');
        await page.keyboard.up(isMacClear ? 'Meta' : 'Control');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Method 2: Try multiple backspaces to clear any existing text
        console.log('Method 2: Pressing backspaces to clear existing text...');
        for (let i = 0; i < 50; i++) { // Clear up to 50 characters
          await page.keyboard.press('Backspace');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Now type the new status text (will replace the selected text)
        if (status.text && status.text.trim() !== '') {
          console.log(`About to type: "${status.text}"`);
          await page.keyboard.type(status.text, { delay: 100 });
          console.log(`Finished typing: "${status.text}"`);
          
          // Take another screenshot after typing (disabled for headless mode)
          // await page.screenshot({ path: `/tmp/slack-dialog-after-typing.png` });
          
          // Wait a bit to ensure text is registered
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('No new status text provided');
        }
        
        // Mark that we used keyboard shortcut - skip all other input handling
        usedKeyboardShortcut = true;
        
        // Jump directly to emoji and save logic
        console.log('Keyboard shortcut path complete, skipping regular input handling');
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      

      // Only look for input field if we clicked the menu (not keyboard shortcut)
      if (!usedKeyboardShortcut) {
        // Find and fill status input - try multiple approaches
        let statusInput = null;
        
        // First try: Look for visible text inputs
        const visibleInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        return inputs.map((input, index) => {
          const rect = input.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const placeholder = input.getAttribute('placeholder') || '';
          const ariaLabel = input.getAttribute('aria-label') || '';
          return {
            index,
            isVisible,
            placeholder,
            ariaLabel,
            id: input.id,
            className: input.className
          };
        }).filter(i => i.isVisible);
      });
      
      // console.log(`Found ${visibleInputs.length} visible input fields:`, visibleInputs);
      
      if (visibleInputs.length > 0) {
        // Try to find status-related input first
        const statusInputIndex = visibleInputs.findIndex(i => 
          i.placeholder.toLowerCase().includes('status') ||
          i.ariaLabel.toLowerCase().includes('status')
        );
        
        const targetIndex = statusInputIndex >= 0 ? statusInputIndex : 0;
        const allInputs = await page.$$('input[type="text"], input:not([type])');
        statusInput = allInputs[visibleInputs[targetIndex].index];
      }
      
      if (statusInput) {
        // Log what we found
        const inputInfo = await page.evaluate(el => {
          const input = el as HTMLInputElement;
          return {
            value: input.value,
            placeholder: input.placeholder,
            type: input.type,
            tagName: input.tagName
          };
        }, statusInput);
        console.log('Found input field:', inputInfo);
        
        // Focus the input first
        await statusInput.focus();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get current value length
        const valueLength = inputInfo.value ? inputInfo.value.length : 0;
        
        if (valueLength > 0) {
          console.log(`Clearing ${valueLength} characters from status field`);
          
          // Move cursor to end
          await page.keyboard.press('End');
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Delete all characters one by one
          for (let i = 0; i < valueLength; i++) {
            await page.keyboard.press('Backspace');
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Verify it's cleared
          const afterClear = await page.evaluate(el => (el as HTMLInputElement).value, statusInput);
          console.log(`After clearing: "${afterClear}"`);
        }
        
        // Type new status text
        if (status.text && status.text.trim() !== '') {
          await page.keyboard.type(status.text, { delay: 50 });
          console.log(`Typed status text: ${status.text}`);
        } else {
          console.log('No new status text to type');
        }
      } else {
        // Alternative: Just start typing if dialog is open
        console.log('Could not find input, attempting to type directly');
        
        // Wait a bit for dialog to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Clear existing text - use multiple methods
        const isMac = process.platform === 'darwin';
        
        // Method 1: Select all with Cmd/Ctrl+A and delete
        await page.keyboard.down(isMac ? 'Meta' : 'Control');
        await page.keyboard.press('a');
        await page.keyboard.up(isMac ? 'Meta' : 'Control');
        await new Promise(resolve => setTimeout(resolve, 300));
        await page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Type new status text
        if (status.text && status.text.trim() !== '') {
          await page.keyboard.type(status.text);
          console.log(`Typed status text directly: ${status.text}`);
        }
      }
      }  // End of if (!usedKeyboardShortcut) block

      if (status.emoji) {
        console.log(`Setting emoji: ${status.emoji}`);
        
        // Try clicking emoji button first
        // Click the emoji button using known Slack selector
            const emojiBtn = await page.$('button[data-qa="custom_status_input_emoji_picker"]');
            if (emojiBtn) {
                await emojiBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn('Emoji button not found');
            }

        
        // if (!emojiButtonClicked) {
          // Try Tab key to navigate to emoji button
        //   await page.keyboard.press('Tab');
        //   await new Promise(resolve => setTimeout(resolve, 500));
        //   await page.keyboard.press('Enter');
        // }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Type emoji name in search
        const emojiName = status.emoji.replace(/:/g, '');
        await page.keyboard.type(emojiName);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Press Enter to select first result
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 500));
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
    return this.accounts.map(acc => acc.name);
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