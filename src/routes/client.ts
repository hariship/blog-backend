import express from 'express';
import { body, validationResult } from 'express-validator';
import mailHandler from '../modules/mail-module';
import { Client as PGCClient } from 'pg';
import { pgClient } from '../server';
import puppeteer from 'puppeteer';
import xml2js from 'xml2js';
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');


const router = express.Router();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const parseRSS = async (xml: string) => {
  const parser = new xml2js.Parser({ explicitArray: false });
  const parsed = await parser.parseStringPromise(xml);
  return parsed.rss.channel.item.map((item: any) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.description,
    category: item.category || null,
    content: item['content:encoded'] || null,
    enclosure: item.enclosure ? item.enclosure.$.url : null,
  }));
};

const normalizeTitle = (title:any) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '-')  // Replace all special characters with hyphens
      .replace(/\s+/g, '-')      // Replace spaces with hyphens
      .replace(/-+/g, '-')       // Replace multiple hyphens with a single hyphen
  };

const validateSubscription = [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('name').not().isEmpty().withMessage('Name is required')
];

router.post('/subscribe', validateSubscription, async (req:any, res:any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name } = req.body;

  try {
    const existingSubscriberQuery = 'SELECT * FROM subscribers WHERE email = $1';
    const existingSubscriberResult = await pgClient.query(existingSubscriberQuery, [email]);
    const existingSubscriber = existingSubscriberResult.rows[0];

    if (existingSubscriber) {
      const updateSubscriberQuery = `
        UPDATE subscribers 
        SET name = $1, status = 'active', updated_at = NOW()
        WHERE email = $2
        RETURNING *;
      `;
      const result = await pgClient.query(updateSubscriberQuery, [name, email]);
      return res.status(200).json({ 
        success: true, 
        message: 'Subscription updated successfully',
        subscriber: result.rows[0]
      });
    }

    const insertSubscriberQuery = `
      INSERT INTO subscribers (email, name)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await pgClient.query(insertSubscriberQuery, [email, name]);
    const newSubscriber = result.rows[0];
    await mailHandler.sendWelcomeEmail({ email, name, categories:[] });

    return res.status(201).json({ 
      success: true, 
      message: 'Subscribed successfully',
      subscriber: newSubscriber
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your subscription' 
    });
  }
});

router.get('/post/:title', async (req, res) => {
    try {
      const normalizedTitle = req.params.title;
  
      const postQuery = 
        `SELECT p.id, p.title, p.description, p.image_url, p.link, p.pub_date, p.content, p.category, p.enclosure, 
               COALESCE(l.likes_count, 0) AS likes_count
        FROM posts p
        LEFT JOIN likes l ON p.id = l.post_id
        WHERE p.normalized_title = $1;`
      ;
      const result = await pgClient.query(postQuery, [normalizedTitle]);
  
      if (result.rows.length === 0) {
        return res.status(404).send('Post not found');
      }
  
      const post:any = result.rows[0];
      res.json({
        title: post.title,
        description: post.description,
        imageUrl: post.image_url,
        link: post.link,
        pubDate: post.pub_date,
        content: post.content,
        category: post.category,
        enclosure: post.enclosure,
        likesCount: post.likes_count,
      });
    } catch (error) {
      console.error('Error fetching post:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  const autoScroll = async (page: any): Promise<void> => {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  };

router.get('/scrape', async (req, res) => {
  try {
    const baseURL = 'https://www.haripriya.org/blog';
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    let pageNum = 1;

    while (true) {
      const url = pageNum === 1 ? baseURL : `${baseURL}/page/${pageNum}`;
      const page = await browser.newPage();
      console.log(`Navigating to page: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });
      await autoScroll(page);

      console.log(`Page ${pageNum} loaded successfully, starting to scrape posts`);

      const posts = await page.evaluate(() => {
        const items:any = [];
        document.querySelectorAll('.item-link-wrrouterer').forEach((elem:any) => {
          const title = elem.querySelector('.post-title')?.textContent.trim();
          const likesCount = elem.querySelector('.like-button-with-count__like-count')?.textContent.trim();
          const description = elem.querySelector('.post-description')?.textContent.trim();
          const imageUrl = elem.querySelector('.gallery-item-visible')?.src;
          const link = elem.querySelector('a')?.href;
          const pubDateText = elem.querySelector('.post-metadata__date.time-ago')?.textContent.trim();

          items.push({
            title,
            likesCount: likesCount ? parseInt(likesCount) : 0,
            description,
            imageUrl,
            link,
            pubDateText
          });
        });
        return items;
      });

      console.log(`Found ${posts.length} posts on page ${pageNum}`);
      await page.close();

      if (posts.length === 0) {
        console.log('No more posts found, ending pagination.');
        break;
      }

      for (const post of posts) {
        const { title, description, imageUrl, likesCount, link, pubDateText } = post;
        const normalizedTitle = normalizeTitle(title);

        console.log(`Processing post: ${title}`);

        // Handle date parsing for "Mar 29" format
        let parsedPubDate = null;
        if (pubDateText) {
          const currentYear:any = new Date().getFullYear();
          const dateStr = `${pubDateText} ${currentYear}`; // Format as "Mar 29 2024"
          const date = new Date(dateStr);
          parsedPubDate = isNaN(date.getTime()) ? null : date;
        }

        let content = null;
        let category = null;
        let enclosure = null;

        if (link) {
          console.log(`Opening post page: ${link}`);
          const postPage = await browser.newPage();
          await postPage.goto(link, { waitUntil: 'networkidle2' });
          await autoScroll(postPage);
          await delay(3000);

          try {
            await postPage.waitForSelector('.post-content__body', { timeout: 5000 });
            content = await postPage.$eval('.post-content__body', el => el.innerHTML.trim());
          } catch (error) {
            console.log(`Content not found for post: ${title}`);
          }

          // Category extraction with updated selector
          try {
            await postPage.waitForSelector('.blog-link-hover-color.blog-text-color.post-categories-list__link', { timeout: 5000 });
            category = await postPage.$$eval('.blog-link-hover-color.blog-text-color.post-categories-list__link', els => els.map((el:any) => el.textContent.trim()).join(', '));
          } catch (error) {
            console.log(`Category not found for post: ${title}`);
          }

          try {
            await postPage.waitForSelector('figure[data-hook="imageViewer"] img', { timeout: 5000 });
            enclosure = await postPage.$eval('figure[data-hook="imageViewer"] img', el => el.src);
          } catch (error) {
            console.log(`Enclosure not found for post: ${title}`);
          }

          await postPage.close();
        } else {
          console.log(`No link found for post: ${title}`);
        }

        if (!content) {
          console.log(`Skipping post: ${title} due to missing content`);
          continue;
        }

        const postCheckQuery = 'SELECT id FROM posts WHERE normalized_title = $1';
        const postResult = await pgClient.query(postCheckQuery, [normalizedTitle]);
        const postId = postResult.rows[0]?.id;

        if (postId) {
          console.log(`Post already exists, only updating likes count for post ID: ${postId}`);

          const updateLikesQuery = `
            UPDATE likes
            SET likes_count = $1
            WHERE post_id = $2;
            `
          ;
          await pgClient.query(updateLikesQuery, [likesCount, postId]);

          console.log(`Likes count updated for post ID: ${postId}`);
        } else {
          console.log(`Inserting new post: ${title}`);

          const insertPostQuery = 
            `INSERT INTO posts (title, normalized_title, description, image_url, link, pub_date, content, category, enclosure)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9)
            RETURNING id;`
          ;

          const newPostResult = await pgClient.query(insertPostQuery, [
            title,
            normalizedTitle,
            description,
            imageUrl,
            link,
            parsedPubDate, // Use parsed date or fallback to NOW() in the query
            content,
            category,
            enclosure
          ]);
          const newPostId = newPostResult.rows[0]?.id;

          console.log(`Inserted new post with ID: ${newPostId}`);

          const insertLikesQuery = 
            `INSERT INTO likes (post_id, likes_count)
            VALUES ($1, $2);`
          ;
          await pgClient.query(insertLikesQuery, [newPostId, likesCount]);

          console.log(`Likes inserted for new post ID: ${newPostId}`);
        }
      }

      pageNum += 1;  // Move to the next page
    }

    await browser.close();
    console.log('All pages processed successfully');
    res.json({ message: 'All pages scraped and stored in PostgreSQL successfully.' });
  } catch (error) {
    console.error('Error during scraping process:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/rss-feed', async (req, res) => {
    try {
      const query = 
        `SELECT p.id, p.title, p.description, p.image_url, p.link, p.pub_date, p.content, p.category, p.enclosure, 
               COALESCE(l.likes_count, 0) AS likes_count
        FROM posts p
        LEFT JOIN likes l ON p.id = l.post_id
        ORDER BY p.pub_date DESC;`
      ;
      const result = await pgClient.query(query);
  
      const posts = result.rows.map(post => ({
        title: post.title,
        description: post.description,
        imageUrl: post.image_url,
        link: post.link,
        pubDate: post.pub_date,
        content: post.content,
        category: post.category,
        enclosure: post.enclosure,
        likesCount: post.likes_count,
      }));
  
      res.json(posts);
    } catch (error) {
      console.error('Error fetching RSS feed:', error);
      res.status(500).send('Internal Server Error');
    }
  });

router.post('/update-likes', async (req, res) => {
  const { title, likesCount } = req.body;
  try {
    const postQuery = 'SELECT id FROM posts WHERE title = $1';
    const postResult = await pgClient.query(postQuery, [title]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postId = postResult.rows[0].id;

    const updateLikesQuery = 
      `INSERT INTO likes (post_id, likes_count)
      VALUES ($1, $2)
      ON CONFLICT (post_id) DO UPDATE SET likes_count = $2;`
    ;
    await pgClient.query(updateLikesQuery, [postId, likesCount]);

    res.json({ message: 'Likes count updated successfully!' });
  } catch (error) {
    console.error('Error updating likes count:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/force-update-posts', async (req, res) => {
  try {
    const response = await fetch('https://www.haripriya.org/blog-feed.xml');
    const rssData = await response.text();
    const parsedPosts = await parseRSS(rssData);

    let newPostsAdded = false;
    const newPosts = []; // Array to store newly added posts

    for (const post of parsedPosts) {
      const { title, link, pubDate, description, category, content, enclosure } = post;

      // Check if post already exists in the database
      const normalizedTitle = normalizeTitle(title);
      const postCheckQuery = 'SELECT id FROM posts WHERE normalized_title = $1';
      const postResult = await pgClient.query(postCheckQuery, [normalizedTitle]);
      const postId = postResult.rows[0]?.id;

      if (!postId) {
        console.log(`Inserting new post: ${title}`);

        const insertPostQuery = 
          `INSERT INTO posts (title, normalized_title, description, image_url, link, pub_date, content, category, enclosure)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, title, description, category, enclosure;`
        ;

        const newPostResult:any = await pgClient.query(insertPostQuery, [
          title,
          normalizedTitle,
          description,
          null, // imageUrl can be null if not available
          link,
          pubDate ? new Date(pubDate) : new Date(), // Default to current date if pubDate is not provided
          content,
          category,
          enclosure
        ]);
        const newPostId = newPostResult.rows[0]?.id;

        console.log(`Inserted new post with ID: ${newPostId}`);

        const insertLikesQuery = 
          `INSERT INTO likes (post_id, likes_count)
          VALUES ($1, $2);`
        ;
        await pgClient.query(insertLikesQuery, [newPostId, 0]); // Start with 0 likes for new posts

        console.log(`Likes inserted for new post ID: ${newPostId}`);
        
        // Add the new post to our array for notifications
        newPosts.push({
          title: newPostResult.rows[0].title,
          description: newPostResult.rows[0].description,
          category: newPostResult.rows[0].category,
          enclosure: newPostResult.rows[0].enclosure
        });
        
        newPostsAdded = true;
      }
    }

    // If we've added new posts, send notifications to subscribers
    if (newPostsAdded && newPosts.length > 0) {
      console.log(`Sending notifications about ${newPosts.length} new posts`);
      
      // Get active subscribers
      const subscribersQuery = 
        `SELECT * FROM subscribers 
        WHERE status = 'active'`
      ;
      const subscribersResult = await pgClient.query(subscribersQuery);
      const subscribers = subscribersResult.rows;
      
      if (subscribers.length > 0) {
        console.log(`Found ${subscribers.length} active subscribers to notify`);
        
        // Send notifications to each subscriber
        let notificationsSent = 0;
        for (const subscriber of subscribers) {
          const success = await mailHandler.sendNewPostsNotification(subscriber, newPosts);
          if (success) notificationsSent++;
        }
        
        console.log(`Sent notifications to ${notificationsSent} subscribers`);
      } else {
        console.log("No active subscribers found for notifications");
      }
    }

    res.json({
      message: newPostsAdded ? `${newPosts.length} new posts added and notifications sent.` : 'No new posts found.',
      newPosts: newPosts.length > 0 ? newPosts : []
    });
  } catch (error) {
    console.error('Error fetching and updating posts:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/subscriber/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const subscriberQuery = 'SELECT * FROM subscribers WHERE email = $1';
    const result = await pgClient.query(subscriberQuery, [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscriber not found'
      });
    }
    return res.status(200).json({ success: true, subscriber: result.rows[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching subscriber information'
    });
  }
});

router.post('/update-subscription', [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('name').not().isEmpty().withMessage('Name is required')
], async (req:any, res:any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name, categories, frequency } = req.body;

  try {
    const checkSubscriberQuery = 'SELECT * FROM subscribers WHERE email = $1';
    const checkResult = await pgClient.query(checkSubscriberQuery, [email]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    const updateSubscriberQuery = `
      UPDATE subscribers 
      SET name = $1, 
          categories = $2, 
          frequency = $3, 
          status = 'active',
          updated_at = NOW()
      WHERE email = $4
      RETURNING *;
    `;
    const result = await pgClient.query(updateSubscriberQuery, [name, categories, frequency, email]);
    return res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      subscriber: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating your subscription'
    });
  }
});

router.get('/unsubscribe/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const updateStatusQuery = `
      UPDATE subscribers
      SET status = 'inactive', updated_at = NOW()
      WHERE email = $1
      RETURNING *;
    `;
    const result = await pgClient.query(updateStatusQuery, [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }
    return res.status(200).json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'An error occurred while processing your unsubscription request' });
  }
});

router.get('/test-email', async (req, res) => {
  try {
    const testSubscriber = {
      email: 'haripriya@q-u-i-l-t.com',
      name: 'Test User',
      categories: ['Technology'],
      frequency: 'weekly'
    };
    const result = await mailHandler.sendWelcomeEmail(testSubscriber);
    res.json({
      success: result,
      message: result ? 'Test email sent successfully!' : 'Failed to send test email'
    });
  } catch (error:any) {
    res.status(500).json({
      success: false,
      message: 'Error sending test email',
      error: error.message
    });
  }
});

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-jwt-key';

router.post('/admin/auth', async (req, res) => {
    const { password } = req.body;  // This is AES-encrypted from frontend
  
    if (!password) {
      return res.status(400).json({ message: 'Password is required.' });
    }
  
    try {
      // Decrypt password
      const bytes = CryptoJS.AES.decrypt(password, "your-secret-key-change-this");
      const decryptedPassword = bytes.toString(CryptoJS.enc.Utf8);
  
      if (!decryptedPassword) {
        return res.status(400).json({ message: 'Failed to decrypt password.' });
      }
  
      // Fetch first admin user (assuming single admin)
      const adminQuery = 'SELECT * FROM admin_users LIMIT 1';
      const result = await pgClient.query(adminQuery);
  
      if (result.rows.length === 0) {
        return res.status(500).json({ message: 'Admin user not configured.' });
      }
  
      const adminUser = result.rows[0];
  
      // Compare decrypted password to stored bcrypt hash
      const isMatch = await bcrypt.compare(decryptedPassword, adminUser.password_hash);
  
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password.' });
      }
  
      const token = jwt.sign({ adminId: adminUser.id }, SECRET_KEY, { expiresIn: '2h' });
  
      res.json({
        success: true,
        token,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000  // 2 hours ahead
      });
  
    } catch (err) {
      console.error('Error in /admin/auth:', err);
      res.status(500).json({ message: 'Internal server error.' });
    }
  });

router.post('/admin/post', async (req, res) => {
      const { title, description, image_url, content, category,enclosure } = req.body;
  
      // Validation
      if (!title || !content) {
        return res.status(400).json({
          error: 'Title and content are required fields'
        });
      }
  
      const normalized_title = normalizeTitle(title);
      const pub_date = new Date();
  
      // PostgreSQL Implementation
      const insertQuery = `
        INSERT INTO posts (title, normalized_title, description, image_url, content, category, pub_date, enclosure)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const values = [title, normalized_title, description, image_url, content, category, pub_date, enclosure];
      const result = await pgClient.query(insertQuery, values);
      
      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: result.rows[0]
      });
    });

export default router;

