const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const newsService = require('./services/newsService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let cachedNews = [];

app.get('/api/news', async (req, res) => {
  try {
    if (cachedNews.length === 0) {
      cachedNews = await newsService.getAllNews();
    }
    res.json(cachedNews);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

app.get('/api/refresh', async (req, res) => {
  try {
    console.log('Starting news refresh...');
    cachedNews = await newsService.getAllNews();
    console.log(`News refresh completed with ${cachedNews.length} articles`);
    res.json({ message: 'News refreshed successfully', count: cachedNews.length });
  } catch (error) {
    console.error('Error refreshing news:', error);
    res.status(500).json({ 
      error: 'Failed to refresh news', 
      details: error.message || 'Unknown error occurred'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

cron.schedule('0 */2 * * *', async () => {
  console.log('Refreshing news cache...');
  try {
    cachedNews = await newsService.getAllNews();
    console.log(`News cache refreshed with ${cachedNews.length} articles`);
  } catch (error) {
    console.error('Error refreshing news cache:', error);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`News Aggregator server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} locally`);
  console.log(`Access from 192.168.10.136 at http://192.168.10.136:${PORT}`);
  console.log(`Or from any IP this machine has`);
});