/**
 * AI Summary Service using Anthropic Claude
 * Generates intelligent summaries for news articles
 */

const Anthropic = require('@anthropic-ai/sdk');

class AIService {
    constructor() {
        this.apiKey = process.env.ANTHROPIC_API_KEY;
        this.client = null;
        this.summaryCache = new Map(); // In-memory cache
        this.requestQueue = [];
        this.isProcessing = false;
        this.rateLimitDelay = 1000; // 1 second between requests

        if (this.apiKey) {
            this.client = new Anthropic({ apiKey: this.apiKey });
            console.log('[AI Service] Initialized with Claude Haiku');
        } else {
            console.warn('[AI Service] ANTHROPIC_API_KEY not found in environment variables');
            console.warn('[AI Service] AI summaries will be disabled until API key is configured');
        }
    }

    /**
     * Check if AI service is available
     */
    isAvailable() {
        return this.client !== null;
    }

    /**
     * Generate a summary for an article
     * @param {Object} article - Article object with title, summary, url
     * @returns {Promise<Object>} - Summary result with keyPoints and fullSummary
     */
    async generateSummary(article) {
        if (!this.isAvailable()) {
            throw new Error('AI service not available - API key not configured');
        }

        // Check cache first
        const cacheKey = this.getCacheKey(article);
        if (this.summaryCache.has(cacheKey)) {
            console.log('[AI Service] Returning cached summary for:', article.title.substring(0, 50));
            return this.summaryCache.get(cacheKey);
        }

        try {
            const prompt = this.buildSummaryPrompt(article);

            const message = await this.client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 300,
                temperature: 0.3,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const response = message.content[0].text;
            const summary = this.parseSummaryResponse(response);

            // Cache the result
            this.summaryCache.set(cacheKey, summary);

            console.log('[AI Service] Generated summary for:', article.title.substring(0, 50));
            return summary;

        } catch (error) {
            console.error('[AI Service] Error generating summary:', error.message);
            throw error;
        }
    }

    /**
     * Generate summaries for multiple articles (Smart Hybrid approach)
     * Prioritizes recent, trending, and high-priority articles
     * @param {Array} articles - Array of article objects
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} - Array of articles with summaries
     */
    async generateBatchSummaries(articles, options = {}) {
        if (!this.isAvailable()) {
            console.warn('[AI Service] Batch summaries skipped - API key not configured');
            return articles;
        }

        const {
            maxArticles = 20,           // Max articles to summarize per batch
            prioritizeRecent = true,    // Prioritize recent articles
            prioritizeTrending = true,  // Prioritize articles with duplicates
            minDuplicates = 1          // Minimum duplicates to be considered "trending"
        } = options;

        // Smart selection logic
        let selectedArticles = [...articles];

        // Filter to prioritize
        if (prioritizeTrending) {
            const trending = selectedArticles.filter(a => (a.duplicateCount || 0) >= minDuplicates);
            const nonTrending = selectedArticles.filter(a => (a.duplicateCount || 0) < minDuplicates);
            selectedArticles = [...trending, ...nonTrending];
        }

        // Sort by recency if enabled
        if (prioritizeRecent) {
            selectedArticles.sort((a, b) => {
                const dateA = new Date(a.scraped || a.publishedAt || 0);
                const dateB = new Date(b.scraped || b.publishedAt || 0);
                return dateB - dateA;
            });
        }

        // Limit to maxArticles
        selectedArticles = selectedArticles.slice(0, maxArticles);

        console.log(`[AI Service] Generating summaries for ${selectedArticles.length} articles...`);

        // Process articles with rate limiting
        const results = [];
        for (const article of selectedArticles) {
            try {
                const summary = await this.generateSummary(article);
                results.push({
                    ...article,
                    aiSummary: summary
                });

                // Rate limiting delay
                await this.sleep(this.rateLimitDelay);

            } catch (error) {
                console.error('[AI Service] Failed to summarize:', article.title.substring(0, 50), error.message);
                results.push(article); // Return original article if summary fails
            }
        }

        console.log(`[AI Service] Batch complete: ${results.length} articles processed`);
        return results;
    }

    /**
     * Build prompt for Claude
     */
    buildSummaryPrompt(article) {
        const content = article.summary || article.description || article.title;

        return `Summarize this news article in a clear, concise format.

Article Title: ${article.title}
Content: ${content}

Provide:
1. A one-sentence overview (30 words max)
2. 3-4 key points as bullet points (each 10-15 words)

Format your response as:
OVERVIEW: [one sentence]
KEY POINTS:
- [point 1]
- [point 2]
- [point 3]
- [point 4 if applicable]

Be factual, objective, and focus on the most important information.`;
    }

    /**
     * Parse Claude's response into structured format
     */
    parseSummaryResponse(response) {
        const lines = response.split('\n').filter(line => line.trim());

        let overview = '';
        const keyPoints = [];

        for (const line of lines) {
            if (line.startsWith('OVERVIEW:')) {
                overview = line.replace('OVERVIEW:', '').trim();
            } else if (line.startsWith('- ') || line.startsWith('• ')) {
                const point = line.replace(/^[-•]\s*/, '').trim();
                if (point) keyPoints.push(point);
            }
        }

        return {
            overview: overview || response.substring(0, 150) + '...',
            keyPoints: keyPoints.length > 0 ? keyPoints : null,
            fullSummary: response,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate cache key for an article
     */
    getCacheKey(article) {
        return `${article.source}_${article.title}`.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
    }

    /**
     * Clear summary cache
     */
    clearCache() {
        this.summaryCache.clear();
        console.log('[AI Service] Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.summaryCache.size,
            keys: Array.from(this.summaryCache.keys()).slice(0, 10)
        };
    }

    /**
     * Sleep utility for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
module.exports = new AIService();
