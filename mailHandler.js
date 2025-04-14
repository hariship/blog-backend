const nodemailer = require('nodemailer');

class MailHandler {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 587,
      secure: false,
      auth: {
        user: 'resend', // fixed username for Resend SMTP
        pass: process.env.RESEND_API_KEY,
      },
    });
  }

  // Send welcome email to new subscribers
  async sendWelcomeEmail(subscriber) {
    try {
      const { email, name } = subscriber;

      const unsubscribeLink = `https://haripriya.org/manage-subscription/${encodeURIComponent(email)}`;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@haripriya.org',
        to: email,
        subject: 'Welcome to Haripriya.org Newsletter',
        html: `
          <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Newsletter Welcome</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  line-height: 1.6;
                  color: #333333;
                  margin: 0;
                  padding: 0;
                  background-color: #f9f9f9;
                }
                .container {
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 30px;
                  background-color: #ffffff;
                  border-radius: 6px;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
                .header {
                  margin-bottom: 25px;
                  border-bottom: 1px solid #eeeeee;
                  padding-bottom: 15px;
                }
                h2 {
                  color: #2c3e50;
                  margin-top: 0;
                  font-weight: 600;
                }
                p {
                  margin-bottom: 18px;
                }
                .footer {
                  margin-top: 30px;
                  padding-top: 15px;
                  border-top: 1px solid #eeeeee;
                  font-size: 14px;
                  color: #666666;
                }
                a {
                  color: #3498db;
                  text-decoration: none;
                }
                a:hover {
                  text-decoration: underline;
                }
                .button {
                  display: inline-block;
                  padding: 10px 18px;
                  background-color: #f8f9fa;
                  border: 1px solid #dadce0;
                  border-radius: 4px;
                  color: #3c4043;
                  font-size: 14px;
                  text-align: center;
                  margin-top: 5px;
                  transition: background-color 0.2s;
                }
                .button:hover {
                  background-color: #f1f3f4;
                  text-decoration: none;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h2>Welcome, ${name}!</h2>
                </div>
                
                <p>I am glad you've joined my newsletter. You will now receive updates on my blog posts.</p>
                
                <p>If you ever wish to update your preferences or unsubscribe, you can do so using the link below:</p>
                
                <a href="${unsubscribeLink}" class="button">Manage your subscription</a>
                
                <div class="footer">
                  <p>Thank you for subscribing. I look forward to sharing content with you.</p>
                </div>
              </div>
            </body>
            </html>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Welcome email sent to ${email}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  // Send notification about new posts to subscribers
  async sendNewPostsNotification(subscriber, posts) {
    try {
      const { email, name, categories } = subscriber;

      const unsubscribeLink = `https://blog.haripriya.org/manage-subscription/${encodeURIComponent(email)}`;

      let filteredPosts = posts;
      if (categories.length > 0 && !categories.includes('all')) {
        filteredPosts = posts.filter(post =>
          categories.some(category => post.category && post.category.includes(category))
        );
      }

      if (filteredPosts.length === 0) {
        console.log(`No relevant posts for subscriber ${email}, skipping email`);
        return true;
      }

      const postsHTML = filteredPosts.map(post => `
        <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
          <h3 style="margin-top: 0;">
            <a href="https://blog.haripriya.org/post/${post.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-')}" style="color: #35495E; text-decoration: none;">
              ${post.title}
            </a>
          </h3>
          ${post.enclosure ? `<img src="${post.enclosure}" alt="${post.title}" style="max-width: 100%; height: auto; margin-bottom: 10px;">` : ''}
          <p style="color: #555; margin-bottom: 10px;">${post.description}</p>
          <p style="margin: 0;">
            <a href="https://blog.haripriya.org/post/${post.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-')}" style="color: #35495E; text-decoration: none; font-weight: bold;">
              Read more →
            </a>
          </p>
        </div>
      `).join('');

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@haripriya.org',
        to: email,
        subject: `New Posts on Haripriya.org`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #35495E;">Hello, ${name}!</h2>
            <p>Check out the latest posts from Haripriya.org:</p>

            <div style="margin: 30px 0;">
              ${postsHTML}
            </div>

            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 30px;">
              <p style="margin-top: 0;">You're receiving this email because you subscribed to the Haripriya.org newsletter.</p>
              <p style="margin-bottom: 0;">
                <a href="${unsubscribeLink}" style="color: #35495E;">Manage your subscription</a> or 
                <a href="${unsubscribeLink}" style="color: #35495E;">unsubscribe</a>.
              </p>
            </div>
          </div>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`New posts notification sent to ${email}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Error sending new posts notification:', error);
      return false;
    }
  }

/**
 * Sends a custom email for a specific post to a subscriber using Nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.content - Email content (HTML format)
 * @param {string} options.subscriberName - Name of the subscriber
 * @param {string} options.unsubscribeToken - Token for unsubscribe functionality
 * @param {Object} options.post - Post data object
 * @returns {Promise<boolean>} - Success status
 */
async sendCustomEmail ({ to, subject, content, subscriberName, unsubscribeToken, post }) {
  try {
    // Create a post excerpt (first few paragraphs) for the email preview
    let postExcerpt = post.description || '';
    
    // If there's content and it's HTML, extract a clean excerpt
    if (content) {
      // Simple HTML stripping for excerpt - you might want a more sophisticated approach
      const cleanContent = content.replace(/<[^>]*>/g, ' ').trim();
      const words = cleanContent.split(/\s+/).slice(0, 50).join(' ');
      postExcerpt = words + (cleanContent.split(/\s+/).length > 50 ? '...' : '');
    }
    
    // Format the publication date
    const pubDate = post.pub_date ? new Date(post.pub_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '';

    // A replace function that replaces URL link
    console.log(post.link)
    post = {
      ...post,
      link: post.link.replace(/https?:\/\/(www\.)?haripriya\.org/g, "https://blog.haripriya.org")
    };
    console.log(post.link)
    // Build email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hello ${subscriberName},</h2>
        <p>A new post has been published on the blog:</p>
        
        <div style="margin: 25px 0; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #333;">${post.title}</h3>
          <p style="color: #666; font-size: 14px;">${pubDate}</p>
          
          ${post.category ? `<p style="color: #0066cc; font-size: 14px;">Category: ${post.category}</p>` : ''}
          
          <div style="margin: 15px 0;">
            ${postExcerpt}
          </div>
          
          <a href="${post.link}" style="display: inline-block; margin-top: 10px; padding: 8px 15px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 3px;">
            Read Full Post
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
          <p>If you no longer wish to receive these emails, you can 
            <a href="https://blog.haripriya.org/unsubscribe?token=${unsubscribeToken}" style="color: #999;">unsubscribe here</a>.
          </p>
        </div>
      </div>
    `;
    
    // Send email using Nodemailer with Resend
    const mailOptions = {
      from: 'Haripriya\'s Blog <newsletter@haripriya.org>',
      to: to,
      subject: subject,
      html: emailHtml
    };
    
    const info = await this.transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('Error sending custom email:', error);
    throw error;
  }
  }
};

module.exports = new MailHandler();
