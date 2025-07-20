import express from 'express';
import RSS from 'rss';
import { pgClient } from '../server.js';  

const rss = express.Router();

rss.get('/rss-feed', async (req, res) => {
  try {
    console.log(`Incoming Request: ${req.method} ${req.url}`);
    const result = await pgClient.query(`
      SELECT 
        title,
        description,
        link,
        pub_date,
        content,
        image_url AS enclosure,
        normalized_title
      FROM posts
      ORDER BY pub_date DESC
      LIMIT 50
    `);

    const posts = result.rows;


    const feed = new RSS({
      title: "Haripriya's Blog",
      description: "Latest updates from Haripriya's blog",
      feed_url: 'https://api.haripriya.org/rss-feed',
      site_url: 'https://blog.haripriya.org',
      language: 'en',
    });

    posts.forEach(post => { 
      const contentHtml = post.content || `<p>${post.description || ''}</p>`;

      feed.item({
        title: post.title,
        description: post.description || post.content || '',
        url: post.link || `https://blog.haripriya.org/post/${post.normalized_title}`,
        date: post.pub_date,
        enclosure: post.enclosure ? { url: post.enclosure } : undefined,
        custom_elements: [
            { 'content:encoded': { _cdata: contentHtml } }
          ]
      });
    });

    res.set('Content-Type', 'application/xml');
    res.send(feed.xml({ indent: true }));

  } catch (error) {
    console.error('Error generating RSS feed:', error);
    res.status(500).send('Failed to generate RSS feed.');
  }
});

export default rss;
