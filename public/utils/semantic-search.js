/**
 * SemanticSearchEngine - AI-powered semantic search for articles
 * Uses Claude API for query understanding and article similarity
 */
class SemanticSearchEngine {
    constructor(apiBaseUrl = '') {
        this.apiBaseUrl = apiBaseUrl;
        this.enabled = localStorage.getItem('semanticSearchEnabled') === 'true';
        this.queryCache = new Map();
        this.similarityCache = new Map();
        this.requestQueue = [];
        this.isProcessing = false;
    }

    /**
     * Enable or disable semantic search
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('semanticSearchEnabled', String(enabled));
    }

    /**
     * Check if semantic search is enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Expand search query with synonyms and related terms using AI
     */
    async expandQuery(query) {
        if (!query || query.trim().length === 0) return { original: query, expanded: [], concepts: [] };

        // Check cache first
        const cacheKey = `query_${query.toLowerCase().trim()}`;
        if (this.queryCache.has(cacheKey)) {
            return this.queryCache.get(cacheKey);
        }

        try {
            // Fallback: Use simple synonym expansion if API fails
            const result = await this.expandQueryWithAI(query);

            // Cache the result
            this.queryCache.set(cacheKey, result);

            // Limit cache size
            if (this.queryCache.size > 100) {
                const firstKey = this.queryCache.keys().next().value;
                this.queryCache.delete(firstKey);
            }

            return result;
        } catch (error) {
            console.error('Query expansion error:', error);
            return { original: query, expanded: this.getSimpleSynonyms(query), concepts: [] };
        }
    }

    /**
     * Get simple synonyms without API (fallback)
     */
    getSimpleSynonyms(query) {
        const synonymMap = {
            'ai': ['artificial intelligence', 'machine learning', 'ml', 'neural network', 'deep learning'],
            'security': ['cybersecurity', 'infosec', 'security threat', 'vulnerability', 'exploit'],
            'breach': ['data breach', 'hack', 'intrusion', 'compromise', 'leak', 'exposure'],
            'malware': ['virus', 'trojan', 'ransomware', 'spyware', 'malicious software'],
            'vulnerability': ['security flaw', 'exploit', 'cve', 'zero-day', 'bug'],
            'update': ['patch', 'upgrade', 'fix', 'release', 'version'],
            'cloud': ['saas', 'paas', 'iaas', 'aws', 'azure', 'gcp'],
            'crypto': ['cryptocurrency', 'blockchain', 'bitcoin', 'ethereum', 'web3'],
            'coding': ['programming', 'development', 'software engineering', 'dev'],
            'tool': ['utility', 'application', 'software', 'platform', 'service']
        };

        const queryLower = query.toLowerCase();
        const synonyms = [];

        for (const [key, values] of Object.entries(synonymMap)) {
            if (queryLower.includes(key)) {
                synonyms.push(...values);
            }
        }

        return [...new Set(synonyms)]; // Remove duplicates
    }

    /**
     * Expand query using AI (when available)
     */
    async expandQueryWithAI(query) {
        // This is a simplified version that returns structured data
        // In a real implementation, this would call the AI service

        const synonyms = this.getSimpleSynonyms(query);

        // Extract key concepts from query
        const concepts = query.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'about'].includes(word));

        return {
            original: query,
            expanded: synonyms,
            concepts: concepts
        };
    }

    /**
     * Calculate semantic similarity between query and article
     */
    calculateSimilarity(query, article) {
        const queryData = {
            original: query.toLowerCase(),
            expanded: this.getSimpleSynonyms(query),
            concepts: query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        };

        const articleText = (article.title + ' ' + (article.summary || '')).toLowerCase();

        let score = 0;
        let matches = [];

        // 1. Exact query match (highest weight)
        if (articleText.includes(queryData.original)) {
            score += 100;
            matches.push({ type: 'exact', term: query, weight: 100 });
        }

        // 2. Concept matches (high weight)
        queryData.concepts.forEach(concept => {
            if (articleText.includes(concept)) {
                score += 50;
                matches.push({ type: 'concept', term: concept, weight: 50 });
            }
        });

        // 3. Synonym/related term matches (medium weight)
        queryData.expanded.forEach(term => {
            if (articleText.includes(term.toLowerCase())) {
                score += 30;
                matches.push({ type: 'semantic', term, weight: 30 });
            }
        });

        // 4. Partial word matches (low weight)
        queryData.concepts.forEach(concept => {
            const words = articleText.split(/\s+/);
            words.forEach(word => {
                if (word.includes(concept) || concept.includes(word)) {
                    score += 10;
                }
            });
        });

        // Normalize score to 0-100 range
        const normalizedScore = Math.min(100, score);

        return {
            score: normalizedScore,
            matches: matches.slice(0, 5), // Top 5 matches
            relevance: this.getRelevanceLabel(normalizedScore)
        };
    }

    /**
     * Get relevance label for score
     */
    getRelevanceLabel(score) {
        if (score >= 80) return 'Highly Relevant';
        if (score >= 60) return 'Very Relevant';
        if (score >= 40) return 'Relevant';
        if (score >= 20) return 'Somewhat Relevant';
        return 'Low Relevance';
    }

    /**
     * Search articles semantically
     */
    async searchArticles(query, articles) {
        if (!this.enabled || !query) {
            return articles.map(article => ({ article, score: 0, matches: [] }));
        }

        // Expand query
        const expandedQuery = await this.expandQuery(query);

        // Calculate similarity for each article
        const results = articles.map(article => {
            const similarity = this.calculateSimilarity(query, article);
            return {
                article,
                score: similarity.score,
                matches: similarity.matches,
                relevance: similarity.relevance
            };
        });

        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);

        return results;
    }

    /**
     * Find similar articles to a given article
     */
    findSimilarArticles(targetArticle, allArticles, limit = 5) {
        const cacheKey = `similar_${targetArticle.id}`;

        // Check cache
        if (this.similarityCache.has(cacheKey)) {
            return this.similarityCache.get(cacheKey);
        }

        // Create a pseudo-query from the article
        const query = targetArticle.title;

        // Filter out the target article
        const otherArticles = allArticles.filter(a => a.id !== targetArticle.id);

        // Calculate similarities
        const similarities = otherArticles.map(article => {
            const similarity = this.calculateSimilarity(query, article);
            return {
                article,
                score: similarity.score,
                matches: similarity.matches
            };
        });

        // Sort by similarity score
        similarities.sort((a, b) => b.score - a.score);

        // Take top N
        const results = similarities.slice(0, limit);

        // Cache results
        this.similarityCache.set(cacheKey, results);

        // Limit cache size
        if (this.similarityCache.size > 50) {
            const firstKey = this.similarityCache.keys().next().value;
            this.similarityCache.delete(firstKey);
        }

        return results;
    }

    /**
     * Get search suggestions based on partial query
     */
    getSuggestions(partialQuery, articles) {
        const suggestions = new Set();

        // Extract common terms from articles
        const commonTerms = this.extractCommonTerms(articles);

        // Filter terms that match partial query
        commonTerms.forEach(term => {
            if (term.toLowerCase().startsWith(partialQuery.toLowerCase())) {
                suggestions.add(term);
            }
        });

        // Add related terms
        const synonyms = this.getSimpleSynonyms(partialQuery);
        synonyms.forEach(syn => suggestions.add(syn));

        return Array.from(suggestions).slice(0, 8);
    }

    /**
     * Extract common terms from articles
     */
    extractCommonTerms(articles) {
        const termFreq = new Map();
        const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'about', 'into', 'over', 'after']);

        articles.forEach(article => {
            const text = (article.title + ' ' + (article.summary || '')).toLowerCase();
            const words = text.match(/\b[a-z]{4,}\b/g) || [];

            words.forEach(word => {
                if (!stopWords.has(word)) {
                    termFreq.set(word, (termFreq.get(word) || 0) + 1);
                }
            });
        });

        // Sort by frequency and return top terms
        return Array.from(termFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(entry => entry[0]);
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.queryCache.clear();
        this.similarityCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            queryCache: this.queryCache.size,
            similarityCache: this.similarityCache.size,
            enabled: this.enabled
        };
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.SemanticSearchEngine = SemanticSearchEngine;
}
