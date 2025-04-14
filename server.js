require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const redis = require('redis');
const { Client } = require('pg');
const xml2js = require('xml2js');
const app = express();
const port = 3001;
const cors = require('cors'); 

const { body, validationResult } = require('express-validator'); 
const mailHandler = require('./mailHandler'); 

app.use(express.json());

app.use(cors());


// Or use specific options to allow specific origins and methods
app.use(cors({
  origin: '*', // Replace with your frontend's origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// PostgreSQL client setup
const pgClient = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'blog',
  password: 'hari_1234_1234',
  port: 5432,
});

pgClient.connect()
  .then(() => console.log("Connected to PostgreSQL database 'blog'"))
  .catch(err => console.error("Connection error", err.stack));

// Redis client setup
const redisClient = redis.createClient(process.env.REDIS_URL || 'http://localhost:6379');
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// Helper function to normalize titles for URLs
const normalizeTitle = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '-')  // Replace all special characters with hyphens
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with a single hyphen
};

// Helper function to parse RSS XML
const parseRSS = async (xml) => {
  const parser = new xml2js.Parser({ explicitArray: false });
  const parsed = await parser.parseStringPromise(xml);
  return parsed.rss.channel.item.map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.description,
    category: item.category || null,
    content: item['content:encoded'] || null,
    enclosure: item.enclosure ? item.enclosure.$.url : null,
  }));
};

// Helper function to scroll the page in Puppeteer
const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

const delay = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

app.get('/scrape', async (req, res) => {
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
        const items = [];
        document.querySelectorAll('.item-link-wrapper').forEach(elem => {
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
          const currentYear = new Date().getFullYear();
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
            category = await postPage.$$eval('.blog-link-hover-color.blog-text-color.post-categories-list__link', els => els.map(el => el.textContent.trim()).join(', '));
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
          `;
          await pgClient.query(updateLikesQuery, [likesCount, postId]);

          console.log(`Likes count updated for post ID: ${postId}`);
        } else {
          console.log(`Inserting new post: ${title}`);

          const insertPostQuery = `
            INSERT INTO posts (title, normalized_title, description, image_url, link, pub_date, content, category, enclosure)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9)
            RETURNING id;
          `;

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

          const insertLikesQuery = `
            INSERT INTO likes (post_id, likes_count)
            VALUES ($1, $2);
          `;
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

// Endpoint to retrieve posts with likes count in descending order of pub_date
app.get('/rss-feed', async (req, res) => {
  try {
    const query = `
      SELECT p.id, p.title, p.description, p.image_url, p.link, p.pub_date, p.content, p.category, p.enclosure, 
             COALESCE(l.likes_count, 0) AS likes_count
      FROM posts p
      LEFT JOIN likes l ON p.id = l.post_id
      ORDER BY p.pub_date DESC;
    `;
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

// Endpoint to retrieve a single post by normalized title
app.get('/post/:title', async (req, res) => {
  try {
    const normalizedTitle = req.params.title;

    const postQuery = `
      SELECT p.id, p.title, p.description, p.image_url, p.link, p.pub_date, p.content, p.category, p.enclosure, 
             COALESCE(l.likes_count, 0) AS likes_count
      FROM posts p
      LEFT JOIN likes l ON p.id = l.post_id
      WHERE p.normalized_title = $1;
    `;
    const result = await pgClient.query(postQuery, [normalizedTitle]);

    if (result.rows.length === 0) {
      return res.status(404).send('Post not found');
    }

    const post = result.rows[0];
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

// Endpoint to update likes count for a specific post
app.post('/update-likes', async (req, res) => {
  const { title, likesCount } = req.body;
  try {
    const postQuery = 'SELECT id FROM posts WHERE title = $1';
    const postResult = await pgClient.query(postQuery, [title]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postId = postResult.rows[0].id;

    const updateLikesQuery = `
      INSERT INTO likes (post_id, likes_count)
      VALUES ($1, $2)
      ON CONFLICT (post_id) DO UPDATE SET likes_count = $2;
    `;
    await pgClient.query(updateLikesQuery, [postId, likesCount]);

    res.json({ message: 'Likes count updated successfully!' });
  } catch (error) {
    console.error('Error updating likes count:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/send-email-to-subscribers/:postId', async (req, res) => {
  try {
    try {
      const { postId } = req.params;
      
      if (!postId) {
        return res.status(400).json({
          error: 'Missing required parameter',
          message: 'Post ID is required'
        });
      }
      
      // Get the post details from the database
      const postQuery = `
        SELECT id, title, normalized_title, description, link, pub_date, content, category, enclosure 
        FROM posts 
        WHERE id = $1
      `;
      const postResult = await pgClient.query(postQuery, [postId]);
      
      if (postResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }
      
      const post = postResult.rows[0];
      
      // Get all active subscribers
      const subscribersQuery = `
        SELECT * FROM subscribers 
        WHERE status = 'active'
      `;
      const subscribersResult = await pgClient.query(subscribersQuery);
      const subscribers = subscribersResult.rows;
      
      if (subscribers.length === 0) {
        return res.json({
          success: false,
          message: 'No active subscribers found'
        });
      }
      
      // Send email to each subscriber
      let successCount = 0;
      let failureCount = 0;
      
      for (const subscriber of subscribers) {
        try {
          await mailHandler.sendCustomEmail({
            to: subscriber.email,
            subject: `New Post: ${post.title}`,
            content: post.content,
            subscriberName: subscriber.name || 'Reader',
            unsubscribeToken: subscriber.unsubscribe_token,
            post: post
          });
          
          successCount++;
          
          // Log the email sent in the database for tracking
          await pgClient.query(`
            INSERT INTO email_logs (subscriber_id, email, post_id, subject, sent_at, status)
            VALUES ($1, $2, $3, $4, NOW(), 'sent')
          `, [subscriber.id, subscriber.email, post.id, `New Post: ${post.title}`]);
          
        } catch (error) {
          console.error(`Failed to send email to ${subscriber.email}:`, error);
          failureCount++;
          
          // Log the failed email in the database
          await pgClient.query(`
            INSERT INTO email_logs (subscriber_id, email, post_id, subject, sent_at, status, error)
            VALUES ($1, $2, $3, $4, NOW(), 'failed', $5)
          `, [subscriber.id, subscriber.email, post.id, `New Post: ${post.title}`, error.message]);
        }
      }
      
      res.json({
        success: true,
        message: `Post notification emails sent to subscribers`,
        statistics: {
          total: subscribers.length,
          successful: successCount,
          failed: failureCount,
          postTitle: post.title
        }
      });
      
    } catch (error) {
      console.error('Error sending post emails to subscribers:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message
      });
    }
  } catch (error) {
      console.log(error)
  }
});


app.get('/force-update-posts', async (req, res) => {
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

        const insertPostQuery = `
          INSERT INTO posts (title, normalized_title, description, image_url, link, pub_date, content, category, enclosure)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, title, description, category, enclosure;
        `;

        const newPostResult = await pgClient.query(insertPostQuery, [
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

        const insertLikesQuery = `
          INSERT INTO likes (post_id, likes_count)
          VALUES ($1, $2);
        `;
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
      const subscribersQuery = `
        SELECT * FROM subscribers 
        WHERE status = 'active'
      `;
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

// Validation middleware for subscribe endpoint
const validateSubscription = [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('name').not().isEmpty().withMessage('Name is required')
];

// Subscribe endpoint
app.post('/subscribe', validateSubscription, async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name } = req.body;

  try {
    // Check if email already exists
    const existingSubscriberQuery = 'SELECT * FROM subscribers WHERE email = $1';
    const existingSubscriberResult = await pgClient.query(existingSubscriberQuery, [email]);
    const existingSubscriber = existingSubscriberResult.rows[0];
    
    if (existingSubscriber) {
      // Update existing subscriber
      const updateSubscriberQuery = `
        UPDATE subscribers 
        SET name = $1, status = 'active', updated_at = NOW()
        WHERE email = $2
        RETURNING *;
      `;
      
      const result = await pgClient.query(
        updateSubscriberQuery, 
        [name, email]
      );
      
      console.log(`Updated subscriber: ${email}`);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Subscription updated successfully',
        subscriber: result.rows[0]
      });
    }
    
    // Create new subscriber
    const insertSubscriberQuery = `
      INSERT INTO subscribers (email, name)
      VALUES ($1, $2)
      RETURNING *;
    `;
    
    const result = await pgClient.query(
      insertSubscriberQuery, 
      [email, name]
    );
    
    const newSubscriber = result.rows[0];
    console.log(`New subscriber added: ${email}`);
    
    // Send welcome email
    await mailHandler.sendWelcomeEmail({
      email,
      name
    });
    
    return res.status(201).json({ 
      success: true, 
      message: 'Subscribed successfully',
      subscriber: newSubscriber
    });
  } catch (error) {
    console.error('Error processing subscription:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your subscription' 
    });
  }
});

// Get subscriber details
app.get('/subscriber/:email', async (req, res) => {
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
    
    return res.status(200).json({
      success: true,
      subscriber: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching subscriber:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching subscriber information'
    });
  }
});

// Enhanced update subscription endpoint
app.post('/update-subscription', [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('name').not().isEmpty().withMessage('Name is required')
], async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name, categories, frequency } = req.body;

  try {
    // First check if subscriber exists
    const checkSubscriberQuery = 'SELECT * FROM subscribers WHERE email = $1';
    const checkResult = await pgClient.query(checkSubscriberQuery, [email]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscriber not found'
      });
    }
    
    // Update subscriber preferences
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
    
    const result = await pgClient.query(
      updateSubscriberQuery, 
      [name, categories, frequency, email]
    );
    
    console.log(`Updated subscription for: ${email}`);
    
    return res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      subscriber: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating your subscription'
    });
  }
});

// Unsubscribe endpoint
app.get('/unsubscribe/:email', async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: 'Subscriber not found'
      });
    }
    
    console.log(`Unsubscribed: ${email}`);
    
    return res.status(200).json({
      success: true,
      message: 'Unsubscribed successfully'
    });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your unsubscription request'
    });
  }
});

app.get('/test-email', async (req, res) => {
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
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending test email',
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
