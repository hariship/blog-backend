import express from 'express';
import mailHandler from '../modules/mail-module';
import { pgClient } from '../server';

const router = express.Router();

router.post('/api/send-email-to-subscribers/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId) {
      return res.status(400).json({ error: 'Missing required parameter', message: 'Post ID is required' });
    }

    const postQuery = `
      SELECT id, title, normalized_title, description, link, pub_date, content, category, enclosure 
      FROM posts 
      WHERE id = $1
    `;
    const postResult = await pgClient.query(postQuery, [postId]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const post = postResult.rows[0];
    const slug = post.normalized_title;
    const postUrl = `https://blog.haripriya.org/post/${slug}`;

    let fullPostHtml = '<p>(Content unavailable)</p>';
    try {
      const rawHtml = await mailHandler.fetchPostContentWithPuppeteer(postUrl);
      if (rawHtml) {
        fullPostHtml = await mailHandler.sanitizeEmailHTML(rawHtml);
      }
    } catch (err) {
      console.error('Error fetching or sanitizing post content:', err);
    }

    const subscribersQuery = `SELECT * FROM subscribers WHERE status = 'active'`;
    const subscribersResult = await pgClient.query(subscribersQuery);
    const subscribers = subscribersResult.rows;

    if (subscribers.length === 0) {
      return res.json({ success: false, message: 'No active subscribers found' });
    }

    let successCount = 0;
    let failureCount = 0;

    for (const subscriber of subscribers) {
      if (subscriber.id === 3) {
        try {
          await mailHandler.sendCustomEmail({
            to: subscriber.email,
            subject: `${post.title}`,
            subscriberName: subscriber.name || 'Reader',
            unsubscribeToken: subscriber.unsubscribe_token,
            post,
            fullPostHtml
          });

          successCount++;
          await pgClient.query(`
            INSERT INTO email_logs (subscriber_id, email, post_id, subject, sent_at, status)
            VALUES ($1, $2, $3, $4, NOW(), 'sent')
          `, [subscriber.id, subscriber.email, post.id, `New Post: ${post.title}`]);
        } catch (error:any) {
          failureCount++;
          await pgClient.query(`
            INSERT INTO email_logs (subscriber_id, email, post_id, subject, sent_at, status, error)
            VALUES ($1, $2, $3, $4, NOW(), 'failed', $5)
          `, [subscriber.id, subscriber.email, post.id, `New Post: ${post.title}`, error.message]);
        }
      }
    }

    res.json({
      success: true,
      message: 'Post notification emails sent to subscribers',
      statistics: {
        total: subscribers.length,
        successful: successCount,
        failed: failureCount,
        postTitle: post.title
      }
    });
  } catch (error:any) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

export default router;
