const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { validateArticle, sanitizeUrl } = require('../utils/sanitizer');

// Rotate user agents to avoid detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

const SOURCES_FILE = path.join(__dirname, '../sources.json');
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

// Track request timing for rate limiting
let lastRequestTime = 0;

// Category mapping from old to new AI-focused categories
function mapCategory(oldCategory) {
  const categoryMap = {
    'Cybersecurity': 'AI News',
    'Technology': 'Coding Tools',
    'AI Industry': 'AI Industry',
    'AI News': 'AI News',
    'AI Research': 'AI Research',
    'Coding Tools': 'Coding Tools',
    'AI Tools': 'AI Tools'
  };
  return categoryMap[oldCategory] || oldCategory;
}

// Load sources dynamically from sources.json
async function loadDynamicSources() {
  try {
    const data = await fs.readFile(SOURCES_FILE, 'utf8');
    const sources = JSON.parse(data);
    
    // Only return active sources
    return sources
      .filter(source => source.status === 'active')
      .map(source => ({
        name: source.name,
        url: source.url,
        category: mapCategory(source.category),
        scraper: getScraperForSource(source),
        source: source // Keep original source data
      }));
  } catch (error) {
    console.error('Error loading dynamic sources, falling back to defaults:', error);
    return getDefaultSources();
  }
}

// Get appropriate scraper function for a source
function getScraperForSource(source) {
  // Map known sources to their specific scrapers
  const scraperMap = {
    'BleepingComputer': scrapeBleepingComputer,
    'Cybersecurity News': scrapeCybersecurityNews,
    'Neowin': scrapeNeowin,
    'AskWoody': scrapeAskWoody,
    'TechCrunch': scrapeTechCrunch
  };
  
  // If we have a specific scraper, use it
  if (scraperMap[source.name]) {
    return scraperMap[source.name];
  }
  
  // Otherwise use generic scraper with custom selectors
  return () => scrapeGeneric(source);
}

// Default sources fallback
function getDefaultSources() {
  return [
    {
      name: 'BleepingComputer',
      url: 'https://www.bleepingcomputer.com/',
      scraper: scrapeBleepingComputer,
      category: mapCategory('Cybersecurity')
    },
    {
      name: 'Cybersecurity News',
      url: 'https://cybersecuritynews.com/',
      scraper: scrapeCybersecurityNews,
      category: mapCategory('Cybersecurity')
    },
    {
      name: 'Neowin',
      url: 'https://www.neowin.net/',
      scraper: scrapeNeowin,
      category: mapCategory('Technology')
    },
    {
      name: 'AskWoody',
      url: 'https://www.askwoody.com/',
      scraper: scrapeAskWoody,
      category: mapCategory('Technology')
    }
  ];
}

// Get random user agent
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Sleep function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced fetch with retry logic and better headers
async function fetchPage(url, retryCount = 0) {
  try {
    // Rate limiting - ensure minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    const userAgent = getRandomUserAgent();
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 500; // Resolve only if the status code is less than 500
      }
    });
    
    // Handle different response codes
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        console.log(`Rate limited for ${url}, waiting before retry ${retryCount + 1}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
        return fetchPage(url, retryCount + 1);
      } else {
        throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
      }
    }
    
    if (response.status === 403) {
      if (retryCount < MAX_RETRIES) {
        console.log(`Access forbidden for ${url}, trying different user agent ${retryCount + 1}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY);
        return fetchPage(url, retryCount + 1);
      } else {
        throw new Error(`Access forbidden after ${MAX_RETRIES} retries`);
      }
    }
    
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.data;
  } catch (error) {
    if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('socket hang up'))) {
      console.log(`Network error for ${url}, retrying ${retryCount + 1}/${MAX_RETRIES}: ${error.message}`);
      await sleep(RETRY_DELAY * (retryCount + 1));
      return fetchPage(url, retryCount + 1);
    }
    
    console.error(`Error fetching ${url}:`, error.message);
    return null;
  }
}

async function scrapeBleepingComputer() {
  const html = await fetchPage('https://www.bleepingcomputer.com/');
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  $('.bc_latest_news_text').each((i, element) => {
    if (i >= 10) return false;
    
    const $element = $(element);
    const title = $element.find('h4 a').text().trim();
    const link = $element.find('h4 a').attr('href');
    const summary = $element.find('p').first().text().trim();
    const timeElement = $element.find('.bc_news_date');
    const publishedAt = timeElement.length ? timeElement.text().trim() : 'Recently';

    if (title && link) {
      articles.push({
        title,
        link: link.startsWith('http') ? link : `https://www.bleepingcomputer.com${link}`,
        summary: summary || 'No summary available',
        source: 'BleepingComputer',
        category: mapCategory('Cybersecurity'),
        publishedAt,
        scraped: new Date().toISOString()
      });
    }
  });

  return articles;
}

async function scrapeCybersecurityNews() {
  const html = await fetchPage('https://cybersecuritynews.com/');
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  $('.jeg_post').each((i, element) => {
    if (i >= 10) return false;
    
    const $element = $(element);
    const title = $element.find('.jeg_post_title a').text().trim();
    const link = $element.find('.jeg_post_title a').attr('href');
    const summary = $element.find('.jeg_post_excerpt p').text().trim();
    const publishedAt = $element.find('.jeg_meta_date a').text().trim() || 'Recently';

    if (title && link) {
      articles.push({
        title,
        link,
        summary: summary || 'No summary available',
        source: 'Cybersecurity News',
        category: mapCategory('Cybersecurity'),
        publishedAt,
        scraped: new Date().toISOString()
      });
    }
  });

  return articles;
}

async function scrapeNeowin() {
  const html = await fetchPage('https://www.neowin.net/');
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  $('.news-item, .featured-story').each((i, element) => {
    if (i >= 10) return false;
    
    const $element = $(element);
    const title = $element.find('h2 a, h3 a, .title a').first().text().trim();
    const link = $element.find('h2 a, h3 a, .title a').first().attr('href');
    const summary = $element.find('.summary, .excerpt, p').first().text().trim();
    const publishedAt = $element.find('.date, .time, time').first().text().trim() || 'Recently';

    if (title && link) {
      articles.push({
        title,
        link: link.startsWith('http') ? link : `https://www.neowin.net${link}`,
        summary: summary || 'No summary available',
        source: 'Neowin',
        category: mapCategory('Technology'),
        publishedAt,
        scraped: new Date().toISOString()
      });
    }
  });

  return articles;
}

async function scrapeAskWoody() {
  const html = await fetchPage('https://www.askwoody.com/');
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  $('.post, article').each((i, element) => {
    if (i >= 10) return false;
    
    const $element = $(element);
    const title = $element.find('h2 a, h3 a, .entry-title a').first().text().trim();
    const link = $element.find('h2 a, h3 a, .entry-title a').first().attr('href');
    const summary = $element.find('.entry-content p, .excerpt p, p').first().text().trim();
    const publishedAt = $element.find('.date, .entry-date, time').first().text().trim() || 'Recently';

    if (title && link) {
      articles.push({
        title,
        link: link.startsWith('http') ? link : `https://www.askwoody.com${link}`,
        summary: summary || 'No summary available',
        source: 'AskWoody',
        category: mapCategory('Technology'),
        publishedAt,
        scraped: new Date().toISOString()
      });
    }
  });

  return articles;
}

async function scrapeTechCrunch() {
  const html = await fetchPage('https://techcrunch.com/');
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  // TechCrunch uses WordPress blocks with wp-block-post-title for articles
  $('.wp-block-post-title').each((i, element) => {
    if (i >= 10) return false;
    
    const $element = $(element);
    const $link = $element.find('a').first();
    const title = $link.text().trim();
    const link = $link.attr('href');
    
    // Look for summary in nearby paragraph or use a fallback
    let summary = '';
    const $container = $element.closest('.wp-block-group, .wp-block-columns');
    if ($container.length) {
      summary = $container.find('.wp-block-paragraph').first().text().trim();
    }
    
    // Look for date information
    const publishedAt = $container.find('.wp-block-post-date, .post-date').text().trim() || 'Recently';

    if (title && link) {
      articles.push({
        title,
        link: link.startsWith('http') ? link : `https://techcrunch.com${link}`,
        summary: summary || 'No summary available',
        source: 'TechCrunch',
        category: mapCategory('Technology'),
        publishedAt,
        scraped: new Date().toISOString()
      });
    }
  });

  return articles;
}

// Generic scraper that uses custom CSS selectors
async function scrapeGeneric(sourceConfig) {
  const html = await fetchPage(sourceConfig.url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];
  
  // Default selectors if none provided
  const selectors = sourceConfig.selectors || {
    container: 'article, .post, .entry, .news-item',
    title: 'h1, h2, h3, .title, .headline',
    link: 'a',
    summary: 'p, .excerpt, .summary, .description',
    date: '.date, .time, time, .published'
  };

  try {
    $(selectors.container).each((i, element) => {
      if (i >= 10) return false;
      
      const $element = $(element);
      const $titleElement = $element.find(selectors.title).first();
      const $linkElement = $titleElement.find('a').length ? $titleElement.find('a').first() : $element.find(selectors.link).first();
      
      const title = $titleElement.text().trim();
      const link = $linkElement.attr('href');
      const summary = $element.find(selectors.summary).first().text().trim();
      const publishedAt = $element.find(selectors.date).first().text().trim() || 'Recently';

      if (title && link) {
        articles.push({
          title,
          link: link.startsWith('http') ? link : new URL(link, sourceConfig.url).href,
          summary: summary || 'No summary available',
          source: sourceConfig.name,
          category: mapCategory(sourceConfig.category),
          publishedAt,
          scraped: new Date().toISOString()
        });
      }
    });
  } catch (error) {
    console.error(`Error with generic scraper for ${sourceConfig.name}:`, error.message);
  }

  return articles;
}

// Normalize article title for better duplicate detection
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s'-]/g, '') // Keep apostrophes and hyphens for better context
    .substring(0, 150); // Increased limit for better comparison
}

// Enhanced deduplicate articles with improved performance and accuracy
function deduplicateArticles(articles) {
  const seen = new Set();
  const linksSeen = new Set();
  const titleIndex = new Map(); // Map for O(1) title lookups
  const articlesMap = new Map(); // Cache articles for quick retrieval
  let duplicatesRemoved = 0;
  
  // Pre-process articles for faster lookups
  articles.forEach((article, index) => {
    articlesMap.set(index, article);
  });
  
  return articles.filter((article, index) => {
    // First, check for exact link duplicates (most reliable)
    if (article.link && linksSeen.has(article.link)) {
      console.log(`[DEDUP] Removed exact link duplicate: "${article.title}" from ${article.source}`);
      duplicatesRemoved++;
      return false;
    }
    
    const normalizedTitle = normalizeTitle(article.title);
    const sourceKey = `${normalizedTitle}::${article.source}`;
    
    // Check for exact duplicates from same source
    if (seen.has(sourceKey)) {
      console.log(`[DEDUP] Removed exact same-source duplicate: "${article.title}" from ${article.source}`);
      duplicatesRemoved++;
      return false;
    }
    
    // Optimize similarity checking with early termination
    const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
    const titleWordSet = new Set(titleWords);
    
    // Check against existing titles with word overlap pre-filtering
    for (const [existingKey, { title: existingTitle, words: existingWords }] of titleIndex) {
      const existingSource = existingKey.split('::')[1];
      const isSameSource = existingSource === article.source;
      
      // Quick word overlap check for performance
      const wordOverlap = titleWords.filter(w => existingWords.has(w)).length;
      const maxWords = Math.max(titleWords.length, existingWords.size);
      const wordOverlapRatio = wordOverlap / maxWords;
      
      // Skip detailed comparison if word overlap is too low
      if (wordOverlapRatio < 0.4) continue;
      
      const similarity = calculateTitleSimilarity(normalizedTitle, existingTitle);
      const threshold = isSameSource ? 0.90 : 0.82; // Lower threshold for cross-source to catch more duplicates
      
      if (similarity > threshold) {
        if (isSameSource) {
          console.log(`[DEDUP] Removed similar same-source article (${Math.round(similarity*100)}% match): "${article.title}" from ${article.source}`);
          duplicatesRemoved++;
          return false;
        } else {
          // Cross-source duplicate check with summary comparison
          const existingArticle = articlesMap.get(titleIndex.get(existingKey).index);
          
          if (article.summary && existingArticle.summary && 
              article.summary.length > 50 && existingArticle.summary.length > 50) {
            const summaryNorm1 = normalizeTitle(article.summary.substring(0, 200));
            const summaryNorm2 = normalizeTitle(existingArticle.summary.substring(0, 200));
            const summarySimilarity = calculateTitleSimilarity(summaryNorm1, summaryNorm2);
            
            if (summarySimilarity > 0.65) {
              console.log(`[DEDUP] Removed cross-source duplicate (${Math.round(similarity*100)}% title, ${Math.round(summarySimilarity*100)}% summary): "${article.title}" from ${article.source} (original from ${existingSource})`);
              duplicatesRemoved++;
              return false;
            }
          } else if (similarity > 0.90) {
            // High title similarity without summaries to compare
            console.log(`[DEDUP] Removed cross-source duplicate (${Math.round(similarity*100)}% title match): "${article.title}" from ${article.source} (original from ${existingSource})`);
            duplicatesRemoved++;
            return false;
          }
        }
      }
    }
    
    // Article is unique, add to tracking structures
    seen.add(sourceKey);
    if (article.link) {
      linksSeen.add(article.link);
    }
    titleIndex.set(sourceKey, { 
      title: normalizedTitle, 
      words: titleWordSet, 
      index 
    });
    
    return true;
  });
}

// Enhanced similarity calculation with multiple algorithms
function calculateTitleSimilarity(title1, title2) {
  if (title1 === title2) return 1.0;
  if (!title1 || !title2) return 0.0;
  
  // Combine multiple similarity metrics for better accuracy
  const jaroSimilarity = calculateJaroSimilarity(title1, title2);
  const levenshteinSimilarity = calculateLevenshteinSimilarity(title1, title2);
  const wordSimilarity = calculateWordSimilarity(title1, title2);
  
  // Weighted average of different similarity measures
  return (jaroSimilarity * 0.4 + levenshteinSimilarity * 0.3 + wordSimilarity * 0.3);
}

// Levenshtein-based similarity (character level)
function calculateLevenshteinSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Jaro similarity (optimized for text comparison)
function calculateJaroSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchWindow < 0) return 0.0;
  
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Identify matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;
}

// Word-level similarity
function calculateWordSimilarity(title1, title2) {
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size; // Jaccard similarity
}

// Simple Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function generateAISummary(article) {
  const { title, summary } = article;
  
  if (summary && summary !== 'No summary available' && summary.length > 50) {
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '.' : '');
  }
  
  const keywords = title.toLowerCase();
  if (keywords.includes('breach') || keywords.includes('hack') || keywords.includes('vulnerability')) {
    return 'Security incident or vulnerability reported. Click to read full details about the threat and recommended actions.';
  } else if (keywords.includes('update') || keywords.includes('patch')) {
    return 'Software update or security patch released. Important information about new features or security fixes.';
  } else if (keywords.includes('malware') || keywords.includes('ransomware')) {
    return 'Malware or ransomware threat detected. Security advisory with prevention and mitigation strategies.';
  } else {
    return 'Latest technology or cybersecurity news. Click to read the full article for detailed information.';
  }
}

async function getAllNews() {
  // Load dynamic sources from configuration file
  const dynamicSources = await loadDynamicSources();
  const allArticles = [];
  let successfulSources = 0;
  
  console.log(`Loading ${dynamicSources.length} active sources from configuration...`);
  
  for (const source of dynamicSources) {
    try {
      console.log(`Scraping ${source.name}...`);
      const articles = await source.scraper();
      
      if (articles && articles.length > 0) {
        const articlesWithAnalysis = articles.map(article => {
          const articleWithSummary = {
            ...article,
            aiSummary: generateAISummary(article)
          };
          
          // Add sentiment analysis and priority scoring
          const analysis = analyzeArticle(articleWithSummary);
          const enrichedArticle = {
            ...articleWithSummary,
            ...analysis
          };
          
          // Validate and sanitize the article
          return validateArticle(enrichedArticle);
        }).filter(Boolean); // Remove any null articles
        
        allArticles.push(...articlesWithAnalysis);
        successfulSources++;
        console.log(`Found ${articles.length} articles from ${source.name}`);
        
        // Update source statistics in configuration if we have the original source data
        if (source.source) {
          await updateSourceStats(source.source.id, articles.length);
        }
      } else {
        console.warn(`No articles found from ${source.name}`);
      }
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error.message);
      
      // Update source as having failed if we have the original source data
      if (source.source) {
        await updateSourceStats(source.source.id, 0, error.message);
      }
    }
  }
  
  if (successfulSources === 0) {
    throw new Error(`Failed to fetch news from all sources. Check network connection and source availability.`);
  }
  
  // Deduplicate articles before returning
  const deduplicatedArticles = deduplicateArticles(allArticles);
  const duplicatesCount = allArticles.length - deduplicatedArticles.length;
  
  console.log(`Successfully scraped ${successfulSources}/${dynamicSources.length} sources with ${allArticles.length} total articles (${deduplicatedArticles.length} after deduplication, ${duplicatesCount} duplicates removed)`);
  return deduplicatedArticles.sort((a, b) => new Date(b.scraped) - new Date(a.scraped));
}

// Update source statistics after scraping
async function updateSourceStats(sourceId, articleCount, error = null) {
  try {
    const data = await fs.readFile(SOURCES_FILE, 'utf8');
    const sources = JSON.parse(data);
    
    const sourceIndex = sources.findIndex(s => s.id === sourceId);
    if (sourceIndex !== -1) {
      sources[sourceIndex].articleCount = articleCount;
      sources[sourceIndex].lastSuccess = error ? sources[sourceIndex].lastSuccess : new Date().toISOString();
      sources[sourceIndex].lastError = error || null;
      sources[sourceIndex].lastAttempt = new Date().toISOString();
      
      await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2));
    }
  } catch (err) {
    console.error('Error updating source stats:', err.message);
  }
}

// AI-powered article analysis for sentiment and priority
function analyzeArticle(article) {
  const title = (article.title || '').toLowerCase();
  const summary = (article.summary || article.aiSummary || '').toLowerCase();
  const content = title + ' ' + summary;
  
  // Calculate reading time (average 200 words per minute)
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  
  // Priority keywords for cybersecurity and tech
  const criticalKeywords = [
    'zero-day', 'critical vulnerability', 'data breach', 'ransomware attack', 'malware attack',
    'security breach', 'cyber attack', 'exploitation', 'emergency patch', 'urgent update',
    'critical flaw', 'remote code execution', 'privilege escalation', 'breaking news'
  ];
  
  const highKeywords = [
    'vulnerability', 'security', 'patch', 'update', 'exploit', 'malware', 'phishing',
    'threat', 'hack', 'breach', 'compromise', 'backdoor', 'trojan', 'virus', 'ransomware'
  ];
  
  const techKeywords = [
    'microsoft', 'windows', 'google', 'apple', 'android', 'ios', 'linux',
    'chrome', 'firefox', 'azure', 'aws', 'cloud', 'artificial intelligence', 'machine learning'
  ];
  
  // Calculate priority score
  let priorityScore = 0;
  let sentiment = 'neutral';
  let priority = 'medium';
  
  // Critical priority detection
  const hasCritical = criticalKeywords.some(keyword => content.includes(keyword));
  if (hasCritical) {
    priorityScore += 10;
    sentiment = 'critical';
    priority = 'critical';
  }
  
  // High priority detection
  const hasHigh = highKeywords.some(keyword => content.includes(keyword));
  if (hasHigh) {
    priorityScore += 5;
    if (priority !== 'critical') {
      sentiment = 'important';
      priority = 'high';
    }
  }
  
  // Tech relevance boost
  const hasTech = techKeywords.some(keyword => content.includes(keyword));
  if (hasTech) {
    priorityScore += 2;
    if (priority === 'medium') {
      priority = 'medium-high';
    }
  }
  
  // Breaking news detection
  const isBreaking = content.includes('breaking') || content.includes('urgent') || content.includes('just in');
  if (isBreaking) {
    priorityScore += 8;
    sentiment = 'breaking';
    if (priority === 'medium') priority = 'high';
  }
  
  // Recent time boost (articles from last 24 hours)
  const articleAge = new Date() - new Date(article.scraped || new Date());
  const hoursOld = articleAge / (1000 * 60 * 60);
  if (hoursOld < 24) {
    priorityScore += 3;
  }
  
  // Determine final sentiment if still neutral
  if (sentiment === 'neutral') {
    if (priorityScore >= 7) sentiment = 'important';
    else if (priorityScore >= 3) sentiment = 'moderate';
    else sentiment = 'informational';
  }
  
  return {
    priorityScore,
    sentiment,
    priority,
    readingTime,
    isBreaking,
    keywords: extractKeywords(content)
  };
}

// Extract relevant keywords from content
function extractKeywords(content) {
  const relevantTerms = [
    'cybersecurity', 'malware', 'ransomware', 'vulnerability', 'breach', 'hack',
    'microsoft', 'windows', 'google', 'apple', 'android', 'linux',
    'ai', 'artificial intelligence', 'machine learning', 'cloud', 'security'
  ];
  
  return relevantTerms.filter(term => content.includes(term));
}

// Test a single source for the API endpoint
async function testSingleSource(sourceConfig) {
  try {
    const scraper = getScraperForSource(sourceConfig);
    const articles = await scraper();
    return articles;
  } catch (error) {
    console.error(`Error testing source ${sourceConfig.name}:`, error.message);
    throw error;
  }
}

module.exports = {
  getAllNews,
  loadDynamicSources,
  testSingleSource
};