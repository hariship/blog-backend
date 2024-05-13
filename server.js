const express = require('express');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const redis = require('redis');

const app = express();
const port = 3001;

// Create a Redis client
const redisClient = redis.createClient(process.env.REDIS_URL || 'http://localhost:6379');
// Dummy commit

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
    const cachedData = await redisClient.get('scrapedData');
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

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
    await redisClient.set('scrapedData', JSON.stringify(posts));

    res.json(posts);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/rss-feed', async (req, res) => {
  try {
    const cachedData = await redisClient.get('rssData');
    if (cachedData) {
      return res.send(cachedData);
    }

    const response = await fetch('https://www.haripriya.org/blog-feed.xml');
    const data = await response.text();
    await redisClient.set('rssData', data);

    res.send(data);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
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
        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

app.get('/refresh-data', async (req, res) => {
  try {
    // Refreshing RSS Feed data
    const rssResponse = await fetch('https://www.haripriya.org/blog-feed.xml');
    const rssData = await rssResponse.text();
    await redisClient.set('rssData', rssData);

    // Refreshing Scraped data
    const url = 'https://www.haripriya.org/blog';
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await autoScroll(page);

    const newPosts = await page.evaluate(() => {
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

    // Fetch existing data from Redis
    const cachedData = await redisClient.get('scrapedData');
    let existingPosts = [];
    if (cachedData) {
      existingPosts = JSON.parse(cachedData);
    }

    // Check for missing elements and add them to the existing data
    const updatedPosts = existingPosts.concat(newPosts.filter(newPost => !existingPosts.some(existingPost => existingPost.title === newPost.title)));

    // Update Redis with the combined data
    await redisClient.set('scrapedData', JSON.stringify(updatedPosts));

    res.json({ message: 'Data refreshed successfully!' });
  } catch (error) {
    console.error('Error refreshing data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/update-likes', async (req, res) => {
  const { title, likesCount } = req.body;
  try {
    const cachedData = await redisClient.get('scrapedData');
    if (cachedData) {
      const posts = JSON.parse(cachedData);
      // Find the post and update the likes count
      const updatedPosts = posts.map(post => {
        if (post.title === title) {
          return { ...post, likesCount: likesCount }; // Ensure likesCount is treated as a number
        }
        return post;
      });
      // Save updated posts back to Redis
      await redisClient.set('scrapedData', JSON.stringify(updatedPosts));
      res.json({ message: 'Likes count updated successfully!' });
    } else {
      res.status(404).json({ message: 'Post not found in cache' });
    }
  } catch (error) {
    console.error('Error updating likes count:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
