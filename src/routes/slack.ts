import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import slackService from '../modules/slack-cookie-module';

const router = express.Router();

// Emoji detection helper
function detectEmoji(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Common keyword to emoji mappings
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
  
  // Check for matches
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (lowerText.includes(keyword)) {
      return emoji;
    }
  }
  
  // Default emoji if no match found
  return ':speech_balloon:';
}

// Generate chatbot-like responses
function generateChatResponse(action: string, status?: any, account?: string, success?: boolean): string {
  const responses = {
    statusUpdate: [
      `Hey! I've updated your status to "${status?.text}" ${status?.emoji || ''} ${account ? `for ${account}` : 'for all accounts'}! 🎉`,
      `All set! Your new status is now "${status?.text}" ${status?.emoji || ''} ${account ? `on ${account}` : 'everywhere'}! ✨`,
      `Done! You're now showing as "${status?.text}" ${status?.emoji || ''} ${account ? `for ${account}` : 'across all workspaces'}! 👍`,
      `Perfect! Status changed to "${status?.text}" ${status?.emoji || ''} ${account ? `on ${account}` : 'on all accounts'}! 🚀`
    ],
    statusClear: [
      `Status cleared${account ? ` for ${account}` : ' for all accounts'}! You're now status-free! 🌟`,
      `All clean! Your status has been removed${account ? ` from ${account}` : ' everywhere'}! ✨`,
      `Done! Status wiped${account ? ` on ${account}` : ' from all workspaces'}! 🧹`,
      `Status removed${account ? ` for ${account}` : ' across the board'}! Fresh start! 🆕`
    ],
    error: [
      `Oops! Something went wrong${account ? ` with ${account}` : ''}. Let me know if you'd like me to try again! 😅`,
      `Hmm, I couldn't update that${account ? ` for ${account}` : ''}. Want to give it another shot? 🤔`,
      `Sorry! Had trouble with that request${account ? ` on ${account}` : ''}. Maybe try again? 💭`
    ],
    partial: [
      `Partial success! Some accounts were updated, but a few had issues. Check the details below! ⚠️`,
      `Mixed results! Most accounts are updated, but some need attention. See the breakdown! 📊`,
      `Almost there! Got most of them, but a couple accounts had hiccups. Details included! 📋`
    ]
  };
  
  let responseArray;
  if (action === 'update') {
    responseArray = responses.statusUpdate;
  } else if (action === 'clear') {
    responseArray = responses.statusClear;
  } else if (action === 'partial') {
    responseArray = responses.partial;
  } else {
    responseArray = responses.error;
  }
  
  // Return a random response from the array
  return responseArray[Math.floor(Math.random() * responseArray.length)];
}

router.post('/status',
  [
    body('text').optional().isString().trim(),
    body('emoji').optional().isString().trim(),
    body('account').optional().isString().trim(),
    body('expiration').optional().isNumeric()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Hey! Looks like something's missing in your request. Check the fields and try again! 🤓",
        errors: errors.array() 
      });
    }

    const { text, emoji, account, expiration } = req.body;
    
    try {
      // If no text provided or empty text, clear the status
      if (!text || text.trim() === '') {
        if (account) {
          const success = await slackService.clearStatus(account);
          if (success) {
            res.json({ 
              success: true, 
              message: generateChatResponse('clear', undefined, account, true)
            });
          } else {
            res.status(400).json({ 
              success: false, 
              message: generateChatResponse('error', undefined, account, false),
              error: `Failed to clear status for ${account}` 
            });
          }
        } else {
          const results = await slackService.clearAllStatuses();
          const allSuccess = results.every(r => r);
          
          if (allSuccess) {
            res.json({ 
              success: true, 
              message: generateChatResponse('clear', undefined, undefined, true),
              accounts: slackService.getConfiguredAccounts()
            });
          } else {
            res.status(207).json({ 
              success: false, 
              message: generateChatResponse('partial'),
              results: slackService.getConfiguredAccounts().map((acc, i) => ({
                account: acc,
                success: results[i],
                status: results[i] ? '✅' : '❌'
              }))
            });
          }
        }
        return;
      }
      
      // Auto-detect emoji if not provided
      const detectedEmoji = emoji || detectEmoji(text);
      
      const statusUpdate = {
        text: text,
        emoji: detectedEmoji,
        expiration: expiration ? Math.floor(Date.now() / 1000) + expiration : undefined
      };

      if (account) {
        const success = await slackService.updateStatus(account, statusUpdate);
        if (success) {
          res.json({ 
            success: true, 
            message: generateChatResponse('update', statusUpdate, account, true),
            status: statusUpdate,
            detectedEmoji: emoji ? undefined : detectedEmoji
          });
        } else {
          res.status(400).json({ 
            success: false, 
            message: generateChatResponse('error', statusUpdate, account, false),
            error: `Failed to update status for ${account}` 
          });
        }
      } else {
        const results = await slackService.updateAllStatuses(statusUpdate);
        const allSuccess = results.every(r => r);
        const someSuccess = results.some(r => r);
        
        if (allSuccess) {
          res.json({ 
            success: true, 
            message: generateChatResponse('update', statusUpdate, undefined, true),
            status: statusUpdate,
            accounts: slackService.getConfiguredAccounts(),
            detectedEmoji: emoji ? undefined : detectedEmoji
          });
        } else if (someSuccess) {
          res.status(207).json({ 
            success: false, 
            message: generateChatResponse('partial', statusUpdate),
            results: slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i],
              status: results[i] ? '✅' : '❌'
            }))
          });
        } else {
          res.status(400).json({ 
            success: false, 
            message: generateChatResponse('error', statusUpdate),
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
        message: "Whoops! Something unexpected happened on my end. Maybe try again in a moment? 🛠️",
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
      return res.status(400).json({ 
        success: false,
        message: "Hmm, something doesn't look right with your request. Mind checking it? 🧐",
        errors: errors.array() 
      });
    }

    const { account } = req.body;
    
    try {
      if (account) {
        const success = await slackService.clearStatus(account);
        if (success) {
          res.json({ 
            success: true, 
            message: generateChatResponse('clear', undefined, account, true)
          });
        } else {
          res.status(400).json({ 
            success: false, 
            message: generateChatResponse('error', undefined, account, false),
            error: `Failed to clear status for ${account}` 
          });
        }
      } else {
        const results = await slackService.clearAllStatuses();
        const allSuccess = results.every(r => r);
        
        if (allSuccess) {
          res.json({ 
            success: true, 
            message: generateChatResponse('clear', undefined, undefined, true),
            accounts: slackService.getConfiguredAccounts()
          });
        } else {
          res.status(207).json({ 
            success: false, 
            message: generateChatResponse('partial'),
            results: slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i],
              status: results[i] ? '✅' : '❌'
            }))
          });
        }
      }
    } catch (error) {
      console.error('Error clearing Slack status:', error);
      res.status(500).json({ 
        success: false, 
        message: "Oops! Hit a snag while clearing your status. Give me another try? 🔧",
        error: 'Internal server error' 
      });
    }
  }
);

// Chat-like endpoint - just send a message
router.post('/chat',
  [
    body('message').isString().trim()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Hey! I need a message to work with. Just tell me what you're up to! 💬",
        errors: errors.array() 
      });
    }

    const { message } = req.body;
    const lowerMessage = message.toLowerCase();
    
    try {
      // Check for clear/remove commands
      if (lowerMessage.includes('clear') || lowerMessage.includes('remove') || 
          lowerMessage.includes('delete') || lowerMessage === 'x' || 
          lowerMessage === 'none' || lowerMessage === 'reset') {
        
        const results = await slackService.clearAllStatuses();
        const allSuccess = results.every(r => r);
        
        if (allSuccess) {
          res.json({ 
            success: true, 
            message: generateChatResponse('clear', undefined, undefined, true),
            action: 'cleared',
            accounts: slackService.getConfiguredAccounts()
          });
        } else {
          res.status(207).json({ 
            success: false, 
            message: generateChatResponse('partial'),
            action: 'clear_partial',
            results: slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i],
              status: results[i] ? '✅' : '❌'
            }))
          });
        }
        return;
      }
      
      // Otherwise, set status with the message
      const detectedEmoji = detectEmoji(message);
      
      const statusUpdate = {
        text: message,
        emoji: detectedEmoji,
        expiration: undefined
      };
      
      const results = await slackService.updateAllStatuses(statusUpdate);
      const allSuccess = results.every(r => r);
      const someSuccess = results.some(r => r);
      
      if (allSuccess) {
        res.json({ 
          success: true, 
          message: generateChatResponse('update', statusUpdate, undefined, true),
          status: statusUpdate,
          accounts: slackService.getConfiguredAccounts(),
          detectedEmoji: detectedEmoji,
          action: 'updated'
        });
      } else if (someSuccess) {
        res.status(207).json({ 
          success: false, 
          message: generateChatResponse('partial', statusUpdate),
          status: statusUpdate,
          action: 'update_partial',
          results: slackService.getConfiguredAccounts().map((acc, i) => ({
            account: acc,
            success: results[i],
            status: results[i] ? '✅' : '❌'
          }))
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: generateChatResponse('error', statusUpdate),
          action: 'update_failed',
          results: slackService.getConfiguredAccounts().map((acc, i) => ({
            account: acc,
            success: results[i]
          }))
        });
      }
    } catch (error) {
      console.error('Error in Slack chat:', error);
      res.status(500).json({ 
        success: false, 
        message: "Whoops! Something unexpected happened. Maybe try again? 🛠️",
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
      message: `Found ${accounts.length} configured account${accounts.length !== 1 ? 's' : ''}! 📋`,
      accounts 
    });
  } catch (error) {
    console.error('Error getting Slack accounts:', error);
    res.status(500).json({ 
      success: false, 
      message: "Had trouble fetching the accounts. Let me try that again! 🤷",
      error: 'Internal server error' 
    });
  }
});

export default router;