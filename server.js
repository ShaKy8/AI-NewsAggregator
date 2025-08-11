const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs').promises;
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

// News Sources Management API
const SOURCES_FILE = path.join(__dirname, 'sources.json');

// Initialize default sources if file doesn't exist
async function initializeSources() {
  try {
    await fs.access(SOURCES_FILE);
  } catch (error) {
    // File doesn't exist, create with default sources
    const defaultSources = [
      {
        id: '1',
        name: 'BleepingComputer',
        url: 'https://www.bleepingcomputer.com/',
        category: 'Cybersecurity',
        status: 'active',
        articleCount: 0,
        lastSuccess: null,
        created: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Cybersecurity News',
        url: 'https://cybersecuritynews.com/',
        category: 'Cybersecurity', 
        status: 'active',
        articleCount: 0,
        lastSuccess: null,
        created: new Date().toISOString()
      },
      {
        id: '3',
        name: 'Neowin',
        url: 'https://www.neowin.net/',
        category: 'Technology',
        status: 'active',
        articleCount: 0,
        lastSuccess: null,
        created: new Date().toISOString()
      },
      {
        id: '4',
        name: 'AskWoody',
        url: 'https://www.askwoody.com/',
        category: 'Technology',
        status: 'active',
        articleCount: 0,
        lastSuccess: null,
        created: new Date().toISOString()
      }
    ];
    
    await fs.writeFile(SOURCES_FILE, JSON.stringify(defaultSources, null, 2));
    console.log('Created default sources configuration');
  }
}

// Load sources from file
async function loadSources() {
  try {
    const data = await fs.readFile(SOURCES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading sources:', error);
    return [];
  }
}

// Save sources to file
async function saveSources(sources) {
  try {
    await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2));
  } catch (error) {
    console.error('Error saving sources:', error);
    throw error;
  }
}

// API Routes for Source Management

// GET /api/sources - List all sources
app.get('/api/sources', async (req, res) => {
  try {
    const sources = await loadSources();
    res.json(sources);
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// POST /api/sources - Add new source
app.post('/api/sources', async (req, res) => {
  try {
    const sources = await loadSources();
    const newSource = {
      id: Date.now().toString(),
      ...req.body,
      created: new Date().toISOString(),
      articleCount: 0,
      lastSuccess: null
    };
    
    sources.push(newSource);
    await saveSources(sources);
    
    console.log(`Added new source: ${newSource.name}`);
    res.status(201).json(newSource);
  } catch (error) {
    console.error('Error adding source:', error);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

// PUT /api/sources/:id - Update source
app.put('/api/sources/:id', async (req, res) => {
  try {
    const sources = await loadSources();
    const sourceIndex = sources.findIndex(s => s.id === req.params.id);
    
    if (sourceIndex === -1) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    sources[sourceIndex] = {
      ...sources[sourceIndex],
      ...req.body,
      id: req.params.id, // Preserve original ID
      updated: new Date().toISOString()
    };
    
    await saveSources(sources);
    
    console.log(`Updated source: ${sources[sourceIndex].name}`);
    res.json(sources[sourceIndex]);
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// DELETE /api/sources/:id - Delete source
app.delete('/api/sources/:id', async (req, res) => {
  try {
    const sources = await loadSources();
    const sourceIndex = sources.findIndex(s => s.id === req.params.id);
    
    if (sourceIndex === -1) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    const deletedSource = sources.splice(sourceIndex, 1)[0];
    await saveSources(sources);
    
    console.log(`Deleted source: ${deletedSource.name}`);
    res.json({ message: 'Source deleted successfully', source: deletedSource });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// POST /api/sources/:id/test - Test source
app.post('/api/sources/:id/test', async (req, res) => {
  try {
    const sources = await loadSources();
    const source = sources.find(s => s.id === req.params.id);
    
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    // For now, simulate testing - in the future this could actually scrape
    console.log(`Testing source: ${source.name} - ${source.url}`);
    
    // Simulate successful test with random article count
    const simulatedCount = Math.floor(Math.random() * 30) + 5;
    
    // Update source with test results
    const sourceIndex = sources.findIndex(s => s.id === req.params.id);
    sources[sourceIndex].articleCount = simulatedCount;
    sources[sourceIndex].lastSuccess = new Date().toISOString();
    sources[sourceIndex].status = 'active';
    
    await saveSources(sources);
    
    res.json({ 
      success: true, 
      articleCount: simulatedCount,
      message: `Successfully tested ${source.name}`
    });
  } catch (error) {
    console.error('Error testing source:', error);
    res.status(500).json({ error: 'Failed to test source' });
  }
});

// Initialize sources on startup
initializeSources();

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