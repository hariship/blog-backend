import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createClient } from 'redis';
import { Client as PGClient } from 'pg';
import cors from 'cors';
import bodyParser from 'body-parser';
import mailRoutes from './routes/mail';
import clientRoutes from './routes/client';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// PostgreSQL setup
export const pgClient = new PGClient({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '16.171.52.187',
  database: process.env.DB_NAME || 'blog',
  password: process.env.DB_PASSWORD || 'hari_1234_1234',
  port: 5432,
});
pgClient.connect().then(() => console.log("Connected to PostgreSQL")).catch(console.error);

// Redis setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

app.use(cors());  // Use the cors middleware

app.use(bodyParser.json());

app.use(bodyParser.json());
app.use('/api', mailRoutes);
app.use('/api',clientRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });