import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import signalBot from '../modules/signal-bot';

const router = express.Router();

// Send a Signal message
router.post('/send',
  [
    body('to').notEmpty().withMessage('Recipient(s) required'),
    body('message').isString().trim().notEmpty().withMessage('Message required')
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request parameters',
        errors: errors.array() 
      });
    }
    
    const { to, message } = req.body;
    
    try {
      const success = await signalBot.sendMessage({ to, message });
      
      if (success) {
        res.json({
          success: true,
          message: 'Signal message sent successfully! 📤',
          recipients: Array.isArray(to) ? to : [to]
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send Signal message 😕'
        });
      }
    } catch (error) {
      console.error('Error sending Signal message:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Check Signal configuration status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isConfigured = await signalBot.isConfigured();
    
    res.json({
      success: true,
      configured: isConfigured,
      message: isConfigured 
        ? 'Signal bot is configured and ready! ✅' 
        : 'Signal bot is not configured. Please check your settings. ⚠️',
      phoneNumber: process.env.SIGNAL_PHONE_NUMBER ? 'Configured' : 'Not configured',
      useApi: !!process.env.SIGNAL_API_URL
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check Signal status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate device linking URI
router.post('/link',
  [
    body('deviceName').optional().isString().trim()
  ],
  async (req: Request, res: Response) => {
    const { deviceName } = req.body;
    
    try {
      const linkingUri = await signalBot.linkDevice(deviceName || 'Signal Bot');
      
      res.json({
        success: true,
        message: 'Device linking URI generated! Scan this in Signal app under Settings > Linked Devices',
        uri: linkingUri,
        instructions: [
          '1. Open Signal on your phone',
          '2. Go to Settings > Linked Devices',
          '3. Tap "Link New Device"',
          '4. Scan the QR code from this URI'
        ]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate linking URI',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Register a new Signal number (Step 1)
router.post('/register',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
    body('captcha').optional().isString().trim()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid phone number format',
        errors: errors.array() 
      });
    }
    
    const { phoneNumber, captcha } = req.body;
    
    try {
      const success = await signalBot.register(phoneNumber, captcha);
      
      if (success) {
        res.json({
          success: true,
          message: 'Registration initiated! Check your phone for SMS verification code.',
          nextStep: 'Call /signal/verify with the SMS code'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Registration failed. You may need a captcha.',
          captchaHelp: 'Visit https://signalcaptchas.org/registration/generate.html to get a captcha token'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to register',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Verify registration with SMS code (Step 2)
router.post('/verify',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
    body('code').isString().trim().notEmpty().withMessage('Verification code required')
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request parameters',
        errors: errors.array() 
      });
    }
    
    const { phoneNumber, code } = req.body;
    
    try {
      const success = await signalBot.verify(phoneNumber, code);
      
      if (success) {
        res.json({
          success: true,
          message: 'Phone number verified successfully! Signal bot is ready to use. 🎉',
          phoneNumber
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Verification failed. Please check the code and try again.'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to verify',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Test endpoint - send a test message
router.post('/test', async (req: Request, res: Response) => {
  const testRecipient = req.body.to || process.env.SIGNAL_TEST_RECIPIENT;
  
  if (!testRecipient) {
    return res.status(400).json({
      success: false,
      message: 'No test recipient configured. Provide "to" in request or set SIGNAL_TEST_RECIPIENT in .env'
    });
  }
  
  try {
    const success = await signalBot.sendMessage({
      to: testRecipient,
      message: `🤖 Test message from Signal Bot\nTime: ${new Date().toLocaleString()}\nStatus: Working! ✅`
    });
    
    if (success) {
      res.json({
        success: true,
        message: 'Test message sent successfully! Check your Signal app.',
        recipient: testRecipient
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test message. Check your Signal configuration.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sending test message',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;