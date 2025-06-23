import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';

type Subscriber = {
  email: string;
  name: string;
  categories: string[];
};

type Post = {
  title: string;
  category?: string;
  enclosure?: string;
  pub_date?: string;
};

type CustomEmailOptions = {
  to: string;
  subject: string;
  subscriberName: string;
  unsubscribeToken: string;
  post: Post;
  fullPostHtml: string;
};

class MailHandler {
    private transporter: Mail;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 587,
      secure: false,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
    });
  }

  async fetchPostContentWithPuppeteer(url: string, selector = '.post-content'): Promise<string | null> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForSelector(selector, { timeout: 5000 });
      const content = await page.$eval(selector, el => el.innerHTML);
      await browser.close();
      return content;
    } catch (err: any) {
      console.error(`Puppeteer error for ${url}:`, err.message);
      await browser.close();
      return null;
    }
  }

  async sendWelcomeEmail(subscriber: Subscriber): Promise<boolean> {
    try {
      const { email, name } = subscriber;
      const unsubscribeLink = `https://blog.haripriya.org/manage-subscription/${encodeURIComponent(email)}`;
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@haripriya.org',
        to: email,
        subject: 'Welcome to Haripriya.org Newsletter',
        html: `<html>...${name}...${unsubscribeLink}...</html>`, // Trimmed for brevity
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Welcome email sent to ${email}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  async sanitizeEmailHTML(html: string): Promise<string> {
    const $ = cheerio.load(html);
    $('img').each((_, el) => {
      $(el).attr('style', 'width:100%;max-width:480px;height:auto;display:block;margin:24px auto;border-radius:6px;object-fit:contain;');
    });
    return $('body').html() || $.html();
  }

  async sendNewPostsNotification(subscriber: Subscriber, posts: Post[]): Promise<boolean> {
    try {
      const { email, name, categories } = subscriber;
      const unsubscribeLink = `https://blog.haripriya.org/manage-subscription/${encodeURIComponent(email)}`;
      let filteredPosts = posts;

      if (categories.length > 0 && !categories.includes('all')) {
        filteredPosts = posts.filter(post =>
          categories.some(category => post.category?.includes(category))
        );
      }

      if (filteredPosts.length === 0) {
        console.log(`No relevant posts for subscriber ${email}, skipping email`);
        return true;
      }

      const postsHTML = await Promise.all(
        filteredPosts.map(async post => {
          const slug = post.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-');
          const postUrl = `https://blog.haripriya.org/post/${slug}`;
          let fullContent = '';
          try {
            const res = await axios.get(postUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(res.data);
            fullContent = $('.post-body').html() || '<p>(Could not load content)</p>';
          } catch (err) {
            console.error(`Failed to fetch post content for ${postUrl}:`, err);
            fullContent = '<p>(Error fetching content)</p>';
          }
          return `<div><h3>${post.title}</h3>${post.enclosure ? `<img src="${post.enclosure}" />` : ''}<div>${fullContent}</div></div>`;
        })
      );

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@haripriya.org',
        to: email,
        subject: `New Posts on Haripriya.org`,
        html: `<div>Hi ${name},<div>${postsHTML.join('')}</div><a href="${unsubscribeLink}">Unsubscribe</a></div>`
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Full post content sent to ${email}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Error sending full post email:', error);
      return false;
    }
  }

  async sendCustomEmail(options: CustomEmailOptions): Promise<boolean> {
    try {
      const { to, subject, subscriberName, unsubscribeToken, post, fullPostHtml } = options;
      const pubDate = post.pub_date ? new Date(post.pub_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      }) : '';

      const emailHtml = `
        <div>
            Hi ${subscriberName},
            <h3>${post.title}</h3>
            <p>${pubDate}</p>
            <div>${fullPostHtml}</div>
            <hr/>
            <p style="font-size: 12px;">
            <i>
            If you ever wish to update your preferences or unsubscribe, click
             <a href="https://blog.haripriya.org/manage-subscription/${encodeURIComponent(to)}" style="color: #888; text-decoration: none;">
                here
            </a></i> 
            </p>
        </div>
        `;


      const mailOptions = {
        from: 'Haripriya\'s Blog <newsletter@haripriya.org>',
        to,
        subject,
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
}

export default new MailHandler();
