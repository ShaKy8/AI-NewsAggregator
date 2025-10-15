/**
 * Article Deduplication Utility
 * Detects and groups similar articles using multiple similarity factors
 */

class ArticleDeduplicator {
    constructor(options = {}) {
        this.titleSimilarityThreshold = options.titleSimilarityThreshold || 0.75;
        this.timeProximityHours = options.timeProximityHours || 6;
        this.enableDeduplication = options.enableDeduplication !== false;
    }

    /**
     * Main deduplication function
     * Groups similar articles and returns deduplicated list
     */
    deduplicateArticles(articles) {
        if (!this.enableDeduplication || !articles || articles.length === 0) {
            return articles.map(article => ({
                ...article,
                isDuplicate: false,
                duplicateCount: 0,
                duplicates: [],
                allSources: [article.source]
            }));
        }

        const processed = [];
        const usedIndices = new Set();

        for (let i = 0; i < articles.length; i++) {
            if (usedIndices.has(i)) continue;

            const article = articles[i];
            const duplicates = [];
            const allSources = [article.source];

            // Find duplicates for this article
            for (let j = i + 1; j < articles.length; j++) {
                if (usedIndices.has(j)) continue;

                const candidate = articles[j];

                if (this.areDuplicates(article, candidate)) {
                    duplicates.push(candidate);
                    allSources.push(candidate.source);
                    usedIndices.add(j);
                }
            }

            // Create deduplicated article object
            processed.push({
                ...article,
                isDuplicate: false,
                duplicateCount: duplicates.length,
                duplicates: duplicates,
                allSources: [...new Set(allSources)], // Remove duplicate source names
                originalIndex: i
            });

            usedIndices.add(i);
        }

        return processed;
    }

    /**
     * Check if two articles are duplicates using multiple factors
     */
    areDuplicates(article1, article2) {
        try {
            // Factor 1: Title similarity
            const titleSimilarity = this.calculateTitleSimilarity(article1.title, article2.title);

            // Factor 2: Time proximity - try multiple timestamp fields
            const timestamp1 = article1.publishedAt || article1.scraped || article1.date;
            const timestamp2 = article2.publishedAt || article2.scraped || article2.date;
            const timeProximity = this.areTimestampsClose(timestamp1, timestamp2);

            // Factor 3: URL similarity (same domain or very similar URLs)
            const url1 = article1.url || article1.link;
            const url2 = article2.url || article2.link;
            const urlSimilarity = this.areUrlsSimilar(url1, url2);

            // Combined scoring
            if (urlSimilarity && titleSimilarity > 0.5) {
                return true; // Same URL domain + reasonable title match = duplicate
            }

            if (titleSimilarity >= this.titleSimilarityThreshold && timeProximity) {
                return true; // High title similarity + published around same time = duplicate
            }

            // Very high title similarity alone (exact or near-exact match)
            if (titleSimilarity >= 0.90) {
                return true;
            }

            return false;
        } catch (e) {
            console.warn('Error comparing articles:', e);
            return false;
        }
    }

    /**
     * Calculate similarity between two titles using multiple methods
     */
    calculateTitleSimilarity(title1, title2) {
        if (!title1 || !title2) return 0;

        // Normalize titles
        const norm1 = this.normalizeTitle(title1);
        const norm2 = this.normalizeTitle(title2);

        if (norm1 === norm2) return 1.0;

        // Calculate multiple similarity metrics and take the highest
        const levenshtein = this.levenshteinSimilarity(norm1, norm2);
        const jaccard = this.jaccardSimilarity(norm1, norm2);
        const dice = this.diceCoefficientSimilarity(norm1, norm2);

        return Math.max(levenshtein, jaccard, dice);
    }

    /**
     * Normalize title for comparison
     */
    normalizeTitle(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
    }

    /**
     * Levenshtein distance-based similarity (0-1)
     */
    levenshteinSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLen = Math.max(str1.length, str2.length);
        return maxLen === 0 ? 1 : 1 - (distance / maxLen);
    }

    /**
     * Calculate Levenshtein distance
     */
    levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Jaccard similarity using word sets
     */
    jaccardSimilarity(str1, str2) {
        const words1 = new Set(str1.split(' '));
        const words2 = new Set(str2.split(' '));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Dice coefficient similarity using bigrams
     */
    diceCoefficientSimilarity(str1, str2) {
        const bigrams1 = this.getBigrams(str1);
        const bigrams2 = this.getBigrams(str2);

        if (bigrams1.length === 0 || bigrams2.length === 0) return 0;

        const intersection = bigrams1.filter(b => bigrams2.includes(b));

        return (2 * intersection.length) / (bigrams1.length + bigrams2.length);
    }

    /**
     * Get character bigrams from string
     */
    getBigrams(str) {
        const bigrams = [];
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.push(str.substring(i, i + 2));
        }
        return bigrams;
    }

    /**
     * Check if two timestamps are within proximity threshold
     */
    areTimestampsClose(timestamp1, timestamp2) {
        if (!timestamp1 || !timestamp2) return false;

        try {
            const date1 = new Date(timestamp1);
            const date2 = new Date(timestamp2);

            // Check if dates are valid
            if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
                return false;
            }

            const diffHours = Math.abs(date1 - date2) / (1000 * 60 * 60);

            return diffHours <= this.timeProximityHours;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if URLs are similar (same domain or very similar paths)
     */
    areUrlsSimilar(url1, url2) {
        if (!url1 || !url2) return false;

        try {
            const domain1 = new URL(url1).hostname.replace('www.', '');
            const domain2 = new URL(url2).hostname.replace('www.', '');

            // Same domain (excluding www) = similar
            if (domain1 === domain2) {
                return true;
            }

            // Check if URLs are very similar (might be same article on different platforms)
            const path1 = new URL(url1).pathname;
            const path2 = new URL(url2).pathname;

            const pathSimilarity = this.levenshteinSimilarity(path1, path2);

            return pathSimilarity > 0.8;
        } catch (e) {
            // Invalid URL, can't compare
            return false;
        }
    }

    /**
     * Get statistics about deduplication
     */
    getDeduplicationStats(articles, deduplicatedArticles) {
        const totalOriginal = articles.length;
        const totalUnique = deduplicatedArticles.length;
        const totalDuplicatesRemoved = totalOriginal - totalUnique;
        const articlesWithDuplicates = deduplicatedArticles.filter(a => a.duplicateCount > 0).length;

        return {
            totalOriginal,
            totalUnique,
            totalDuplicatesRemoved,
            articlesWithDuplicates,
            reductionPercentage: ((totalDuplicatesRemoved / totalOriginal) * 100).toFixed(1)
        };
    }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticleDeduplicator;
}
