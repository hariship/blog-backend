import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import slackService from '../modules/slack-cookie-module';

const router = express.Router();

router.post('/status',
  [
    body('text').isString().trim(),
    body('emoji').isString().trim(),
    body('account').optional().isString().trim(),
    body('expiration').optional().isNumeric()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { text, emoji, account, expiration } = req.body;
    
    try {
      const statusUpdate = {
        text: text || '',
        emoji: emoji || '',
        expiration: expiration ? Math.floor(Date.now() / 1000) + expiration : undefined
      };

      if (account) {
        const success = await slackService.updateStatus(account, statusUpdate);
        if (success) {
          res.json({ 
            success: true, 
            message: `Status updated for ${account}`,
            status: statusUpdate 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: `Failed to update status for ${account}` 
          });
        }
      } else {
        const results = await slackService.updateAllStatuses(statusUpdate);
        const allSuccess = results.every(r => r);
        
        if (allSuccess) {
          res.json({ 
            success: true, 
            message: 'Status updated for all accounts',
            status: statusUpdate,
            accounts: slackService.getConfiguredAccounts()
          });
        } else {
          res.status(207).json({ 
            success: false, 
            message: 'Some accounts failed to update',
            results: slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i]
            }))
          });
        }
      }
    } catch (error) {
      console.error('Error updating Slack status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

router.delete('/status',
  [
    body('account').optional().isString().trim()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { account } = req.body;
    
    try {
      if (account) {
        const success = await slackService.clearStatus(account);
        if (success) {
          res.json({ 
            success: true, 
            message: `Status cleared for ${account}` 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: `Failed to clear status for ${account}` 
          });
        }
      } else {
        const results = await slackService.clearAllStatuses();
        const allSuccess = results.every(r => r);
        
        if (allSuccess) {
          res.json({ 
            success: true, 
            message: 'Status cleared for all accounts',
            accounts: slackService.getConfiguredAccounts()
          });
        } else {
          res.status(207).json({ 
            success: false, 
            message: 'Some accounts failed to clear',
            results: slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i]
            }))
          });
        }
      }
    } catch (error) {
      console.error('Error clearing Slack status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const accounts = slackService.getConfiguredAccounts();
    res.json({ 
      success: true, 
      accounts 
    });
  } catch (error) {
    console.error('Error getting Slack accounts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

export default router;