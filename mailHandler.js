const nodemailer = require('nodemailer');

class MailHandler {
  constructor() {
    // Create nodemailer transporter
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }
  
    // Send welcome email to new subscribers
    async sendWelcomeEmail(subscriber) {
      try {
        const { email, name, categories, frequency } = subscriber;
        
        // Generate unsubscribe link
        const unsubscribeLink = `https://haripriya.org/manage-subscription/${encodeURIComponent(email)}`;
        
        // Email content
        const msg = {
          to: email,
          from: process.env.EMAIL_FROM || 'noreply@haripriya.org', // Use a verified sender in SendGrid
          subject: 'Welcome to Haripriya.org Newsletter',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <!-- Same email template as before -->
              <h2>Welcome to Our Newsletter, ${name}!</h2>
              <!-- ... rest of your email HTML ... -->
            </div>
          `
        };
        
        // Send email
        await sgMail.send(msg);
        console.log(`Welcome email sent to ${email}`);
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
      
      // Generate unsubscribe link
      const unsubscribeLink = `https://haripriya.org/manage-subscription/${encodeURIComponent(email)}`;
      
      // Filter posts based on subscriber categories if they're not subscribed to 'all'
      let filteredPosts = posts;
      if (categories.length > 0 && !categories.includes('all')) {
        filteredPosts = posts.filter(post => 
          categories.some(category => post.category && post.category.includes(category))
        );
      }
      
      // If no relevant posts for this subscriber, don't send an email
      if (filteredPosts.length === 0) {
        console.log(`No relevant posts for subscriber ${email}, skipping email`);
        return true;
      }
      
      // Create the HTML for posts
      const postsHTML = filteredPosts.map(post => `
        <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
          <h3 style="margin-top: 0;">
            <a href="https://haripriya.org/post/${post.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-')}" style="color: #35495E; text-decoration: none;">
              ${post.title}
            </a>
          </h3>
          ${post.enclosure ? `<img src="${post.enclosure}" alt="${post.title}" style="max-width: 100%; height: auto; margin-bottom: 10px;">` : ''}
          <p style="color: #555; margin-bottom: 10px;">${post.description}</p>
          <p style="margin: 0;">
            <a href="https://haripriya.org/post/${post.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-')}" style="color: #35495E; text-decoration: none; font-weight: bold;">
              Read more →
            </a>
          </p>
        </div>
      `).join('');
      
      // Email content
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
        `
      };
      
      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`New posts notification sent to ${email}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Error sending new posts notification:', error);
      return false;
    }
  }
}

module.exports = new MailHandler();