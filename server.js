const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs').promises;
require('dotenv').config();

const newsService = require('./services/newsService');
const aiService = require('./services/aiService');
const { validateArticle, sanitizeUrl, validateSourceUpdate } = require('./utils/sanitizer');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Prevent large payload attacks

// Static files with no-cache headers for development
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Logging middleware
app.use(logger.middleware());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'");
  next();
});

// Article cache with cleanup mechanism
let cachedNews = [];
const MAX_CACHE_SIZE = 1000;
const MAX_ARTICLE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Clean up old articles from cache
function cleanupCache() {
  const now = new Date();
  cachedNews = cachedNews.filter(article => {
    if (!article.scraped) return true;
    const articleAge = now - new Date(article.scraped);
    return articleAge < MAX_ARTICLE_AGE;
  });
  
  // Limit cache size
  if (cachedNews.length > MAX_CACHE_SIZE) {
    cachedNews = cachedNews
      .sort((a, b) => new Date(b.scraped) - new Date(a.scraped))
      .slice(0, MAX_CACHE_SIZE);
  }
  
  console.log(`Cache cleanup completed. Articles in cache: ${cachedNews.length}`);
}

app.get('/api/news', async (req, res) => {
  try {
    if (cachedNews.length === 0) {
      cachedNews = await newsService.getAllNews();
      // Validate and sanitize articles
      cachedNews = cachedNews.map(article => validateArticle(article)).filter(Boolean);
    }
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
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
    // Validate and sanitize articles
    cachedNews = cachedNews.map(article => validateArticle(article)).filter(Boolean);
    cleanupCache(); // Clean up old articles

    // Smart Hybrid: Generate AI summaries for trending/recent articles
    if (aiService.isAvailable()) {
      console.log('[AI] Starting smart hybrid summary generation...');
      try {
        cachedNews = await aiService.generateBatchSummaries(cachedNews, {
          maxArticles: 20,           // Summarize top 20 articles
          prioritizeRecent: true,
          prioritizeTrending: true,
          minDuplicates: 1           // Articles with 1+ duplicates = trending
        });
        console.log('[AI] Summary generation complete');
      } catch (aiError) {
        console.error('[AI] Batch summary generation failed:', aiError.message);
        // Continue without summaries
      }
    }

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

// AI Summary API Endpoints
app.post('/api/summary', async (req, res) => {
  try {
    const { article } = req.body;

    if (!article || !article.title) {
      return res.status(400).json({ error: 'Invalid article data' });
    }

    if (!aiService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service not available',
        message: 'ANTHROPIC_API_KEY not configured'
      });
    }

    const summary = await aiService.generateSummary(article);
    res.json({ summary });

  } catch (error) {
    console.error('[API] Error generating summary:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      details: error.message
    });
  }
});

app.get('/api/ai/status', (req, res) => {
  res.json({
    available: aiService.isAvailable(),
    cacheStats: aiService.getCacheStats()
  });
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
    
    // Validate and sanitize input
    const { name, url, category, status } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Source name is required' });
    }
    
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }
    
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    const newSource = {
      id: Date.now().toString(),
      name: name.trim().substring(0, 100), // Limit name length
      url: sanitizedUrl,
      category: category.trim().substring(0, 50), // Limit category length
      status: status === 'active' ? 'active' : 'inactive',
      selectors: req.body.selectors || null,
      created: new Date().toISOString(),
      articleCount: 0,
      lastSuccess: null,
      lastError: null,
      lastAttempt: null
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
    
    // Validate and sanitize update data to prevent prototype pollution
    const validation = validateSourceUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    sources[sourceIndex] = {
      ...sources[sourceIndex],
      ...validation.data,
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
    
    logger.info(`Deleted source: ${deletedSource.name}`);
    res.json({ message: 'Source deleted successfully', source: deletedSource });
  } catch (error) {
    logger.error('Error deleting source', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// GET /api/metrics - Get application metrics (for monitoring)
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = logger.getMetrics();
    res.json({
      ...metrics,
      cacheSize: cachedNews.length,
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    });
  } catch (error) {
    logger.error('Error fetching metrics', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/health - Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const sources = await loadSources();
    const activeSources = sources.filter(s => s.status === 'active');
    const workingSources = sources.filter(s => s.status === 'active' && s.lastSuccess && !s.lastError);
    const failingSources = sources.filter(s => s.status === 'active' && s.lastError);
    
    const healthStatus = {
      status: failingSources.length === 0 ? 'healthy' : failingSources.length < activeSources.length / 2 ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cache: {
        size: cachedNews.length,
        maxSize: MAX_CACHE_SIZE,
        lastCleanup: new Date().toISOString()
      },
      sources: {
        total: sources.length,
        active: activeSources.length,
        working: workingSources.length,
        failing: failingSources.length,
        healthPercentage: activeSources.length > 0 ? Math.round((workingSources.length / activeSources.length) * 100) : 0
      },
      lastRefresh: cachedNews.length > 0 ? cachedNews[0].scraped : null
    };
    
    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
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
    
    console.log(`Testing source: ${source.name} - ${source.url}`);
    
    // Actually test the source by attempting to scrape it
    try {
      const testArticles = await newsService.testSingleSource(source);
      const articleCount = testArticles ? testArticles.length : 0;
      
      // Update source with test results
      const sourceIndex = sources.findIndex(s => s.id === req.params.id);
      sources[sourceIndex].articleCount = articleCount;
      sources[sourceIndex].lastSuccess = articleCount > 0 ? new Date().toISOString() : sources[sourceIndex].lastSuccess;
      sources[sourceIndex].lastError = articleCount === 0 ? 'No articles found during test' : null;
      sources[sourceIndex].lastAttempt = new Date().toISOString();
      sources[sourceIndex].status = articleCount > 0 ? 'active' : 'inactive';
      
      await saveSources(sources);
      
      res.json({ 
        success: articleCount > 0, 
        articleCount: articleCount,
        message: articleCount > 0 ? `Successfully tested ${source.name}` : `Test failed for ${source.name} - no articles found`
      });
    } catch (testError) {
      // Update source with error
      const sourceIndex = sources.findIndex(s => s.id === req.params.id);
      sources[sourceIndex].lastError = testError.message;
      sources[sourceIndex].lastAttempt = new Date().toISOString();
      sources[sourceIndex].status = 'error';
      
      await saveSources(sources);
      
      res.status(400).json({ 
        success: false, 
        articleCount: 0,
        message: `Test failed for ${source.name}: ${testError.message}`
      });
    }
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

// Schedule news refresh every 2 hours
cron.schedule('0 */2 * * *', async () => {
  console.log('Refreshing news cache...');
  try {
    cachedNews = await newsService.getAllNews();
    // Validate and sanitize articles
    cachedNews = cachedNews.map(article => validateArticle(article)).filter(Boolean);
    cleanupCache(); // Clean up old articles
    console.log(`News cache refreshed with ${cachedNews.length} articles`);
  } catch (error) {
    console.error('Error refreshing news cache:', error);
  }
});

// Schedule cache cleanup every day at midnight
cron.schedule('0 0 * * *', cleanupCache);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`News Aggregator server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} locally`);
  console.log(`Access from 192.168.10.136 at http://192.168.10.136:${PORT}`);
  console.log(`Or from any IP this machine has`);
});