const mongoose = require('mongoose');
const Redis = require('ioredis');

// ── MongoDB ───────────────────────────────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/airport_db';
  await mongoose.connect(uri);
}

// ── Redis GEO ─────────────────────────────────────────────────────────────────
const redisGeo = new Redis({
  host: process.env.REDIS_GEO_HOST || 'localhost',
  port: Number(process.env.REDIS_GEO_PORT) || 6379,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redisGeo.on('error', (err) => console.error('Redis GEO error:', err.message));

// ── Redis POP ─────────────────────────────────────────────────────────────────
const redisPop = new Redis({
  host: process.env.REDIS_POP_HOST || 'localhost',
  port: Number(process.env.REDIS_POP_PORT) || 6379,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redisPop.on('error', (err) => console.error('Redis POP error:', err.message));

module.exports = { connectMongo, redisGeo, redisPop };
