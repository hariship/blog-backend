const express = require('express');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const redis = require('redis');
const fs = require('fs');
const app = express();
const port = 3001;
const xml2js = require('xml2js'); // Add xml2js for parsing RSS feed XML

// Create a Redis client
const redisClient = redis.createClient(process.env.REDIS_URL || 'http://localhost:6379');

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis
redisClient.connect();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get('/scrape', async (req, res) => {
  try {
    const url = 'https://www.haripriya.org/blog';
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await autoScroll(page);

    const posts = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.item-link-wrapper').forEach(elem => {
        const title = elem.querySelector('.post-title')?.textContent.trim();
        const likesCount = elem.querySelector('.like-button-with-count__like-count')?.textContent.trim();
        const description = elem.querySelector('.post-description')?.textContent.trim();
        const imageUrl = elem.querySelector('.gallery-item-visible')?.src;
        items.push({ title, likesCount, description, imageUrl });
      });
      return items;
    });

    await browser.close();

    // Save each post individually in Redis
    for (const post of posts) {
      await redisClient.set(`post:${post.title}`, JSON.stringify(post));
    }

    res.json(posts);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Helper function to parse RSS XML
const parseRSS = async (xml) => {
  const parser = new xml2js.Parser({ explicitArray: false });
  const parsed = await parser.parseStringPromise(xml);
  const posts = parsed.rss.channel.item.map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.description,
    category: item.category || null,
    content: item['content:encoded'] || null,
    enclosure: item.enclosure ? item.enclosure.$.url : null,
  }));
  return posts;
};

app.get('/rss-feed', async (req, res) => {
  try {
    const postOrderData = await redisClient.get('post:order');
    let postOrder = [];

    if (postOrderData) {
      postOrder = JSON.parse(postOrderData);
    } else {
      // No order found in Redis, scrape and save data
      const response = await fetch('https://www.haripriya.org/blog-feed.xml');
      const rssData = await response.text();
      const parsedPosts = await parseRSS(rssData); // Parse the RSS feed

      postOrder = parsedPosts.map(post => post.title);
      
      // Save each post and maintain order
      for (const post of parsedPosts) {
        await redisClient.set(`post:${post.title}`, JSON.stringify(post));
      }

      await redisClient.set('post:order', JSON.stringify(postOrder)); // Save order
    }

    // Fetch posts based on the order
    const posts = [];
    for (const title of postOrder) {
      const post = await redisClient.get(`post:${title}`);
      if (post) {
        posts.push(JSON.parse(post));
      }
    }

    res.json(posts);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/post/:title', async (req, res) => {
  try {
    const title = req.params.title;
    const post = await redisClient.get(`post:${title}`);
    if (post) {
      res.json(JSON.parse(post));
    } else {
      res.status(404).send('Post not found');
    }
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).send('Internal Server Error');
  }
});

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
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

// Update likes for a post
app.post('/update-likes', async (req, res) => {
  const { title, likesCount } = req.body;
  try {
    const post = await redisClient.get(`post:${title}`);
    if (post) {
      const postData = JSON.parse(post);
      postData.likesCount = likesCount; // Update the likes count
      await redisClient.set(`post:${title}`, JSON.stringify(postData));
      res.json({ message: 'Likes count updated successfully!' });
    } else {
      res.status(404).json({ message: 'Post not found' });
    }
  } catch (error) {
    console.error('Error updating likes count:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});