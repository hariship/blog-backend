import express from 'express';
import { pgClient } from '../server';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Social media crawler detection
const isCrawler = (userAgent: string) => {
  if (!userAgent) return false;

  const crawlerPatterns = [
    'facebookexternalhit',
    'twitterbot',
    'whatsapp',
    'slackbot',
    'linkedinbot',
    'discordbot',
    'telegrambot',
    'skypeuripreview',
    'applebot',
    'googlebot',
    'bingbot',
    'yandexbot',
    'slack',
    'teams',
    'discord'
  ];

  const ua = userAgent.toLowerCase();
  return crawlerPatterns.some(pattern => ua.includes(pattern));
};

const normalizeTitle = (title: string) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Helper function to generate HTML with meta tags
const generatePostHTML = (post: any, normalizedTitle: string) => {
  const baseURL = 'https://blog.haripriya.org';
  const postURL = `${baseURL}/post/${normalizedTitle}`;
  const fallbackImage = `${baseURL}/logo192.png`;
  const imageURL = post.enclosure || fallbackImage;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="${post.description || 'Personal Blog'}" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${postURL}" />
    <meta property="og:title" content="${post.title}" />
    <meta property="og:description" content="${post.description || 'Personal Blog'}" />
    <meta property="og:image" content="${imageURL}" />
    <meta property="og:site_name" content="Haripriya's Blog" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${postURL}" />
    <meta name="twitter:title" content="${post.title}" />
    <meta name="twitter:description" content="${post.description || 'Personal Blog'}" />
    <meta name="twitter:image" content="${imageURL}" />

    <!-- Additional meta tags -->
    <meta name="author" content="Haripriya Sridharan" />
    <meta property="article:author" content="Haripriya Sridharan" />
    <meta property="article:published_time" content="${post.pubDate}" />
    <meta property="article:section" content="${post.category || 'Blog'}" />

    <title>${post.title} - Haripriya's Blog</title>

    <link rel="apple-touch-icon" href="/logo192.png" />
    <link rel="manifest" href="/manifest.json" />
</head>
<body>
    <div id="root">
        <!-- Fallback content for crawlers that don't execute JavaScript -->
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px;">
            <h1>${post.title}</h1>
            <p>${post.description}</p>
            <p>Published: ${new Date(post.pubDate).toLocaleDateString()}</p>
            ${post.enclosure ? `<img src="${post.enclosure}" alt="${post.title}" style="max-width: 100%; height: auto;" />` : ''}
            <p><a href="${postURL}">Continue reading...</a></p>
        </div>
    </div>
</body>
</html>`;
};

// SSR route for individual posts
router.get('/post/:title', async (req, res) => {
  try {
    const { title } = req.params;
    const normalizedTitle = normalizeTitle(title);
    const userAgent = req.get('User-Agent') || '';

    // For regular users (not crawlers), redirect to React app
    if (!isCrawler(userAgent)) {
      return res.redirect(`https://blog.haripriya.org/post/${normalizedTitle}`);
    }

    // For crawlers, serve SSR content with meta tags
    const query = 'SELECT * FROM posts WHERE normalized_title = $1';
    const result = await pgClient.query(query, [normalizedTitle]);

    if (result.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Post Not Found - Haripriya's Blog</title>
            <meta name="description" content="The requested post was not found." />
        </head>
        <body>
            <h1>Post Not Found</h1>
            <p>The requested post could not be found.</p>
            <p><a href="https://blog.haripriya.org">Go back to blog</a></p>
        </body>
        </html>
      `);
    }

    const post = result.rows[0];
    const html = generatePostHTML(post, normalizedTitle);

    // Set proper headers
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    res.send(html);

  } catch (error) {
    console.error('SSR Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Error - Haripriya's Blog</title>
      </head>
      <body>
          <h1>Something went wrong</h1>
          <p><a href="https://blog.haripriya.org">Go back to blog</a></p>
      </body>
      </html>
    `);
  }
});

export default router;