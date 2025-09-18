import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createClient } from 'redis';
import { Client as PGClient } from 'pg';
import cors from 'cors';
import bodyParser from 'body-parser';
import mailRoutes from './routes/mail';
import clientRoutes from './routes/client';
import rssRoutes from './routes/rss';
import slackRoutes from './routes/slack';
import signalRoutes from './routes/signal';
import ssrRoutes from './routes/ssr';

const app = express();
const port = process.env.PORT || 3001;
const path = require('path');

app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// PostgreSQL setup
export const pgClient = new PGClient({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'blog',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});
pgClient.connect().then(() => console.log("Connected to PostgreSQL")).catch(console.error);

// Redis setup
// const redisClient = createClient({
//   url: process.env.REDIS_URL || 'redis://localhost:6379'
// });
// redisClient.on('error', (err) => console.error('Redis Client Error', err));
// redisClient.connect();

app.use(cors());  // Use the cors middleware

app.use(bodyParser.json());

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/', mailRoutes);
app.use('/', rssRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/signal', signalRoutes);

// SSR routes for social media meta tags (must be before clientRoutes to handle crawlers)
app.use('/', ssrRoutes);
app.use('/',clientRoutes);
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });