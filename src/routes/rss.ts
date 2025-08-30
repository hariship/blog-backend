import express from 'express';
import RSS from 'rss';
import { pgClient } from '../server';  

const rss = express.Router();

rss.get('/blog-feed.xml', async (req, res) => {
    try {
      console.log(`Incoming Request: ${req.method} ${req.url}`);
      
      // Pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Max 50 items
      const offset = (page - 1) * limit;
  
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
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
  
      const posts = result.rows;
  
      const domain = process.env.DOMAIN || 'https://blog.haripriya.org';
      const blogTitle = process.env.BLOG_TITLE || "Haripriya's Blog";
      const blogDescription = process.env.BLOG_DESCRIPTION || "Latest updates from Haripriya's blog";
      
      const feed = new RSS({
        title: blogTitle,
        description: blogDescription,
        feed_url: `${domain}/blog-feed.xml`,
        site_url: domain,
        language: 'en',
        pubDate: new Date().toUTCString(),
        ttl: 60,
      });
  
      posts.forEach(post => {
        const contentHtml = post.content || `<p>${post.description || ''}</p>`;
  
        feed.item({
          title: post.title,
          description: post.description || '',
          url: post.link || `${domain}/post/${post.normalized_title}`,
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

// JSON API for posts with pagination
rss.get('/posts', async (req, res) => {
    try {
      console.log(`Incoming Request: ${req.method} ${req.url}`);
      
      // Pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Max 50 items
      const offset = (page - 1) * limit;
      
      // Category filter
      const category = req.query.category as string;
      
      // Build where clause for category filter
      let whereClause = '';
      let queryParams: any[] = [limit, offset];
      
      if (category && category !== '') {
        whereClause = 'WHERE category = $3';
        queryParams.push(category);
      }
      
      // Get total count for pagination metadata
      const countQuery = category && category !== '' 
        ? 'SELECT COUNT(*) FROM posts WHERE category = $1'
        : 'SELECT COUNT(*) FROM posts';
      const countParams = category && category !== '' ? [category] : [];
      const countResult = await pgClient.query(countQuery, countParams);
      const totalPosts = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalPosts / limit);
      
      // Get posts
      const result = await pgClient.query(`
        SELECT 
          id,
          title,
          description,
          link,
          pub_date,
          content,
          image_url AS enclosure,
          normalized_title,
          category
        FROM posts
        ${whereClause}
        ORDER BY pub_date DESC
        LIMIT $1 OFFSET $2
      `, queryParams);
      
      const posts = result.rows;
      
      res.json({
        posts,
        pagination: {
          page,
          limit,
          totalPosts,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
      
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

// Get all categories
rss.get('/categories', async (req, res) => {
  try {
    console.log(`Incoming Request: ${req.method} ${req.url}`);
    
    const result = await pgClient.query(`
      SELECT DISTINCT category 
      FROM posts 
      WHERE category IS NOT NULL 
      ORDER BY category
    `);
    
    const categories = result.rows.map(row => row.category);
    res.json(categories);
    
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default rss;
