const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const SOURCES_FILE = path.join(__dirname, '../sources.json');

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
        category: source.category,
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
      category: 'Cybersecurity'
    },
    {
      name: 'Cybersecurity News',
      url: 'https://cybersecuritynews.com/',
      scraper: scrapeCybersecurityNews,
      category: 'Cybersecurity'
    },
    {
      name: 'Neowin',
      url: 'https://www.neowin.net/',
      scraper: scrapeNeowin,
      category: 'Technology'
    },
    {
      name: 'AskWoody',
      url: 'https://www.askwoody.com/',
      scraper: scrapeAskWoody,
      category: 'Technology'
    }
  ];
}

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
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
        category: 'Cybersecurity',
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
        category: 'Cybersecurity',
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
        category: 'Technology',
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
        category: 'Technology',
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
        category: 'Technology',
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
          category: sourceConfig.category,
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

// Deduplicate articles by title similarity and exact link matches
function deduplicateArticles(articles) {
  const seen = new Set();
  const linksSeen = new Set();
  const titlesSeen = new Map(); // Map to track similar titles across all sources
  let duplicatesRemoved = 0;
  
  return articles.filter(article => {
    // First, check for exact link duplicates (cross-source duplicates)
    if (article.link && linksSeen.has(article.link)) {
      console.log(`[DEDUP] Removed exact link duplicate: "${article.title}" from ${article.source}`);
      duplicatesRemoved++;
      return false;
    }
    
    // Create a unique key based on normalized title and source
    const normalizedTitle = normalizeTitle(article.title);
    const sourceKey = `${normalizedTitle}::${article.source}`;
    
    // Check for exact duplicates from same source
    if (seen.has(sourceKey)) {
      console.log(`[DEDUP] Removed exact same-source duplicate: "${article.title}" from ${article.source}`);
      duplicatesRemoved++;
      return false;
    }
    
    // Check for very similar titles from same source (95% similarity)
    const sourcePrefix = `::${article.source}`;
    for (const [existingKey, existingTitle] of titlesSeen) {
      if (existingKey.endsWith(sourcePrefix)) {
        const similarity = calculateTitleSimilarity(normalizedTitle, existingTitle);
        if (similarity > 0.95) {
          console.log(`[DEDUP] Removed similar same-source article (${Math.round(similarity*100)}% match): "${article.title}" from ${article.source}`);
          duplicatesRemoved++;
          return false;
        }
      }
    }
    
    // NEW: Check for very similar titles from different sources (85% similarity)
    for (const [existingKey, existingTitle] of titlesSeen) {
      if (!existingKey.endsWith(sourcePrefix)) { // Different source
        const similarity = calculateTitleSimilarity(normalizedTitle, existingTitle);
        if (similarity > 0.85) {
          // Additional check: compare summaries if available
          const existingSource = existingKey.split('::')[1];
          const existingArticle = articles.find(a => 
            normalizeTitle(a.title) === existingTitle && a.source === existingSource
          );
          
          if (existingArticle && article.summary && existingArticle.summary) {
            const summaryNorm1 = normalizeTitle(article.summary);
            const summaryNorm2 = normalizeTitle(existingArticle.summary);
            const summarySimilarity = calculateTitleSimilarity(summaryNorm1, summaryNorm2);
            
            if (summarySimilarity > 0.7) {
              console.log(`[DEDUP] Removed cross-source duplicate (${Math.round(similarity*100)}% title, ${Math.round(summarySimilarity*100)}% summary): "${article.title}" from ${article.source} (original from ${existingSource})`);
              duplicatesRemoved++;
              return false;
            }
          } else {
            // No summaries to compare, rely on title similarity
            console.log(`[DEDUP] Removed cross-source duplicate (${Math.round(similarity*100)}% title match): "${article.title}" from ${article.source} (original from ${existingKey.split('::')[1]})`);
            duplicatesRemoved++;
            return false;
          }
        }
      }
    }
    
    // Article is unique, add to tracking sets
    seen.add(sourceKey);
    if (article.link) {
      linksSeen.add(article.link);
    }
    titlesSeen.set(sourceKey, normalizedTitle);
    
    return true;
  });
}

// Calculate similarity between two titles (simple character-based similarity)
function calculateTitleSimilarity(title1, title2) {
  if (title1 === title2) return 1.0;
  
  const longer = title1.length > title2.length ? title1 : title2;
  const shorter = title1.length > title2.length ? title2 : title1;
  
  if (longer.length === 0) return 1.0;
  
  // Calculate Levenshtein distance
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
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
        const articlesWithSummaries = articles.map(article => ({
          ...article,
          aiSummary: generateAISummary(article)
        }));
        
        allArticles.push(...articlesWithSummaries);
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

module.exports = {
  getAllNews,
  loadDynamicSources
};