import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import slackService from '../modules/slack-cookie-module';

const router = express.Router();

// Store for tracking async operations
const operationTracker = new Map<string, any>();

// Generate unique operation ID
function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Send webhook notification
async function sendWebhookNotification(webhookUrl: string, data: any) {
  try {
    await axios.post(webhookUrl, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

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

// Chat-like endpoint with immediate response
router.post('/chat',
  [
    body('message').isString().trim(),
    body('webhook_url').optional().isURL()
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

    const { message, webhook_url } = req.body;
    const lowerMessage = message.toLowerCase();
    const operationId = generateOperationId();
    
    // Determine the action
    const isClearing = lowerMessage.includes('clear') || lowerMessage.includes('remove') || 
                      lowerMessage.includes('delete') || lowerMessage === 'x' || 
                      lowerMessage === 'none' || lowerMessage === 'reset';
    
    const detectedEmoji = isClearing ? null : detectEmoji(message);
    
    // Send immediate acknowledgment
    res.json({
      success: true,
      message: isClearing 
        ? "Got it! Clearing your status now... I'll let you know when it's done! 🧹"
        : `Roger that! Setting your status to \"${message}\" ${detectedEmoji || ''}... Working on it! ⚡`,
      operation_id: operationId,
      status: 'processing',
      webhook_url: webhook_url || null,
      estimated_time: '30-40 seconds'
    });
    
    // Process asynchronously
    (async () => {
      const startTime = Date.now();
      let result: any = {};
      
      try {
        if (isClearing) {
          const results = await slackService.clearAllStatuses();
          const allSuccess = results.every(r => r);
          
          result = {
            operation_id: operationId,
            success: allSuccess,
            message: generateChatResponse(allSuccess ? 'clear' : 'partial', undefined, undefined, allSuccess),
            action: 'cleared',
            accounts: slackService.getConfiguredAccounts(),
            results: !allSuccess ? slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i],
              status: results[i] ? '✅' : '❌'
            })) : undefined,
            processing_time: `${Date.now() - startTime}ms`
          };
        } else {
          const statusUpdate = {
            text: message,
            emoji: detectedEmoji || ':speech_balloon:',
            expiration: undefined
          };
          
          const results = await slackService.updateAllStatuses(statusUpdate);
          const allSuccess = results.every(r => r);
          const someSuccess = results.some(r => r);
          
          result = {
            operation_id: operationId,
            success: allSuccess,
            message: generateChatResponse(
              allSuccess ? 'update' : someSuccess ? 'partial' : 'error',
              statusUpdate,
              undefined,
              allSuccess
            ),
            status: statusUpdate,
            accounts: slackService.getConfiguredAccounts(),
            detectedEmoji: detectedEmoji,
            action: 'updated',
            results: !allSuccess ? slackService.getConfiguredAccounts().map((acc, i) => ({
              account: acc,
              success: results[i],
              status: results[i] ? '✅' : '❌'
            })) : undefined,
            processing_time: `${Date.now() - startTime}ms`
          };
        }
        
        // Store result for potential polling
        operationTracker.set(operationId, result);
        
        // Send webhook if provided
        if (webhook_url) {
          await sendWebhookNotification(webhook_url, result);
        }
        
        // Clean up after 5 minutes
        setTimeout(() => operationTracker.delete(operationId), 5 * 60 * 1000);
        
      } catch (error) {
        console.error('Error in async Slack chat processing:', error);
        result = {
          operation_id: operationId,
          success: false,
          message: "Whoops! Something unexpected happened. The operation failed. 🛠️",
          error: error instanceof Error ? error.message : 'Unknown error',
          processing_time: `${Date.now() - startTime}ms`
        };
        
        operationTracker.set(operationId, result);
        
        if (webhook_url) {
          await sendWebhookNotification(webhook_url, result);
        }
      }
    })();
  }
);

// Endpoint to check operation status
router.get('/chat/status/:operationId', (req: Request, res: Response) => {
  const { operationId } = req.params;
  const result = operationTracker.get(operationId);
  
  if (!result) {
    return res.status(404).json({
      success: false,
      message: "Operation not found. It may have completed more than 5 minutes ago or doesn't exist. 🔍",
      operation_id: operationId
    });
  }
  
  res.json(result);
});

// Webhook endpoint to receive status updates (for testing)
router.post('/webhook/status', (req: Request, res: Response) => {
  console.log('Received webhook notification:', req.body);
  res.json({ 
    success: true, 
    message: 'Webhook received',
    timestamp: new Date().toISOString()
  });
});

// Alternative webhook endpoint (matches common callback patterns)
router.post('/callback', (req: Request, res: Response) => {
  console.log('Received callback notification:', req.body);
  res.json({ 
    success: true, 
    message: 'Callback received',
    timestamp: new Date().toISOString(),
    received_data: req.body
  });
});

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

// Endpoint to list active operations
router.get('/operations', (req: Request, res: Response) => {
  const operations = Array.from(operationTracker.keys()).map(id => ({
    operation_id: id,
    status: operationTracker.get(id)?.success !== undefined ? 'completed' : 'processing'
  }));
  
  res.json({
    success: true,
    message: `Found ${operations.length} tracked operation${operations.length !== 1 ? 's' : ''}`,
    operations
  });
});

export default router;