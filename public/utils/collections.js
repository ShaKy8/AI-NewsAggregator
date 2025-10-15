/**
 * CollectionManager - Manages article collections for research organization
 * Provides methods for creating, updating, and exporting collections
 */
class CollectionManager {
    constructor() {
        this.collections = this.loadCollections();
        this.migrateIfNeeded();
    }

    /**
     * Load collections from localStorage
     */
    loadCollections() {
        try {
            const stored = localStorage.getItem('collections');
            return stored ? JSON.parse(stored) : this.getDefaultCollections();
        } catch (error) {
            console.error('Error loading collections:', error);
            return this.getDefaultCollections();
        }
    }

    /**
     * Get default collections for first-time users
     */
    getDefaultCollections() {
        return [
            {
                id: this.generateId('default-reading-list'),
                name: 'Reading List',
                description: 'Articles to read later',
                color: '#667eea',
                icon: 'fa-book-open',
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                articleIds: [],
                tags: []
            }
        ];
    }

    /**
     * Save collections to localStorage
     */
    saveCollections() {
        try {
            localStorage.setItem('collections', JSON.stringify(this.collections));
            return true;
        } catch (error) {
            console.error('Error saving collections:', error);
            return false;
        }
    }

    /**
     * Generate unique ID for collections
     */
    generateId(prefix = 'collection') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create a new collection
     */
    createCollection(name, description = '', color = '#667eea', icon = 'fa-folder') {
        const collection = {
            id: this.generateId(),
            name: name.trim(),
            description: description.trim(),
            color,
            icon,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            articleIds: [],
            tags: []
        };

        this.collections.push(collection);
        this.saveCollections();
        return collection;
    }

    /**
     * Update an existing collection
     */
    updateCollection(collectionId, updates) {
        const index = this.collections.findIndex(c => c.id === collectionId);
        if (index === -1) return null;

        this.collections[index] = {
            ...this.collections[index],
            ...updates,
            updated: new Date().toISOString()
        };

        this.saveCollections();
        return this.collections[index];
    }

    /**
     * Delete a collection
     */
    deleteCollection(collectionId) {
        const index = this.collections.findIndex(c => c.id === collectionId);
        if (index === -1) return false;

        this.collections.splice(index, 1);
        this.saveCollections();
        return true;
    }

    /**
     * Get all collections
     */
    getAllCollections() {
        return [...this.collections];
    }

    /**
     * Get collection by ID
     */
    getCollection(collectionId) {
        return this.collections.find(c => c.id === collectionId);
    }

    /**
     * Add article to collection
     */
    addArticleToCollection(collectionId, articleId) {
        const collection = this.getCollection(collectionId);
        if (!collection) return false;

        if (!collection.articleIds.includes(articleId)) {
            collection.articleIds.push(articleId);
            collection.updated = new Date().toISOString();
            this.saveCollections();
        }
        return true;
    }

    /**
     * Remove article from collection
     */
    removeArticleFromCollection(collectionId, articleId) {
        const collection = this.getCollection(collectionId);
        if (!collection) return false;

        const index = collection.articleIds.indexOf(articleId);
        if (index > -1) {
            collection.articleIds.splice(index, 1);
            collection.updated = new Date().toISOString();
            this.saveCollections();
        }
        return true;
    }

    /**
     * Get collections containing an article
     */
    getCollectionsForArticle(articleId) {
        return this.collections.filter(c => c.articleIds.includes(articleId));
    }

    /**
     * Get article count for a collection
     */
    getCollectionArticleCount(collectionId) {
        const collection = this.getCollection(collectionId);
        return collection ? collection.articleIds.length : 0;
    }

    /**
     * Search collections by name
     */
    searchCollections(query) {
        const lowerQuery = query.toLowerCase().trim();
        return this.collections.filter(c =>
            c.name.toLowerCase().includes(lowerQuery) ||
            c.description.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Migrate old saved articles format if needed
     */
    migrateIfNeeded() {
        const savedArticles = localStorage.getItem('savedArticles');
        if (!savedArticles) return;

        try {
            const articles = JSON.parse(savedArticles);
            const needsMigration = articles.some(a => !a.collections);

            if (needsMigration) {
                console.log('Migrating saved articles to collections format...');
                const migratedArticles = articles.map(article => ({
                    ...article,
                    collections: article.collections || [],
                    tags: article.tags || [],
                    notes: article.notes || ''
                }));

                localStorage.setItem('savedArticles', JSON.stringify(migratedArticles));
                console.log('Migration complete!');
            }
        } catch (error) {
            console.error('Error during migration:', error);
        }
    }

    /**
     * Export collection to JSON
     */
    exportToJSON(collectionId, savedArticles) {
        const collection = this.getCollection(collectionId);
        if (!collection) return null;

        const articles = savedArticles.filter(a =>
            collection.articleIds.includes(a.id)
        );

        return {
            collection: {
                name: collection.name,
                description: collection.description,
                exported: new Date().toISOString()
            },
            articles: articles.map(a => ({
                title: a.title,
                url: a.url || a.link,
                source: a.source,
                category: a.category,
                summary: a.summary,
                savedAt: a.savedAt,
                tags: a.tags || [],
                notes: a.notes || ''
            }))
        };
    }

    /**
     * Export collection to Markdown
     */
    exportToMarkdown(collectionId, savedArticles) {
        const collection = this.getCollection(collectionId);
        if (!collection) return null;

        const articles = savedArticles.filter(a =>
            collection.articleIds.includes(a.id)
        );

        let markdown = `# ${collection.name}\n\n`;

        if (collection.description) {
            markdown += `${collection.description}\n\n`;
        }

        markdown += `**Exported:** ${new Date().toLocaleDateString()}\n`;
        markdown += `**Article Count:** ${articles.length}\n\n`;
        markdown += `---\n\n`;

        articles.forEach((article, index) => {
            markdown += `## ${index + 1}. ${article.title}\n\n`;
            markdown += `- **Source:** ${article.source}\n`;
            markdown += `- **Category:** ${article.category}\n`;
            markdown += `- **URL:** [Read Article](${article.url || article.link})\n`;

            if (article.tags && article.tags.length > 0) {
                markdown += `- **Tags:** ${article.tags.join(', ')}\n`;
            }

            if (article.savedAt) {
                markdown += `- **Saved:** ${new Date(article.savedAt).toLocaleDateString()}\n`;
            }

            markdown += `\n### Summary\n\n${article.summary || 'No summary available'}\n\n`;

            if (article.notes) {
                markdown += `### Notes\n\n${article.notes}\n\n`;
            }

            markdown += `---\n\n`;
        });

        return markdown;
    }

    /**
     * Export collection to CSV
     */
    exportToCSV(collectionId, savedArticles) {
        const collection = this.getCollection(collectionId);
        if (!collection) return null;

        const articles = savedArticles.filter(a =>
            collection.articleIds.includes(a.id)
        );

        const headers = ['Title', 'URL', 'Source', 'Category', 'Saved Date', 'Tags', 'Notes'];
        const rows = articles.map(a => [
            this.escapeCSV(a.title),
            this.escapeCSV(a.url || a.link),
            this.escapeCSV(a.source),
            this.escapeCSV(a.category),
            a.savedAt ? new Date(a.savedAt).toLocaleDateString() : '',
            this.escapeCSV((a.tags || []).join('; ')),
            this.escapeCSV(a.notes || '')
        ]);

        const csv = [headers, ...rows]
            .map(row => row.join(','))
            .join('\n');

        return csv;
    }

    /**
     * Export collection to HTML
     */
    exportToHTML(collectionId, savedArticles) {
        const collection = this.getCollection(collectionId);
        if (!collection) return null;

        const articles = savedArticles.filter(a =>
            collection.articleIds.includes(a.id)
        );

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHTML(collection.name)}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
        h1 { color: ${collection.color}; border-bottom: 3px solid ${collection.color}; padding-bottom: 10px; }
        .meta { color: #666; font-size: 0.9em; margin-bottom: 30px; }
        .article { margin-bottom: 40px; padding: 20px; border-left: 4px solid ${collection.color}; background: #f9f9f9; }
        .article h2 { margin-top: 0; color: #333; }
        .article-meta { font-size: 0.9em; color: #666; margin-bottom: 10px; }
        .tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
        .tag { background: ${collection.color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; }
        .notes { background: #fff; padding: 15px; border-radius: 8px; margin-top: 10px; border: 1px solid #ddd; }
        a { color: ${collection.color}; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1><i class="fas ${collection.icon}"></i> ${this.escapeHTML(collection.name)}</h1>
    <div class="meta">
        <p>${this.escapeHTML(collection.description)}</p>
        <p><strong>Exported:</strong> ${new Date().toLocaleDateString()} | <strong>Articles:</strong> ${articles.length}</p>
    </div>
`;

        articles.forEach((article, index) => {
            html += `
    <div class="article">
        <h2>${index + 1}. ${this.escapeHTML(article.title)}</h2>
        <div class="article-meta">
            <strong>Source:</strong> ${this.escapeHTML(article.source)} |
            <strong>Category:</strong> ${this.escapeHTML(article.category)} |
            <a href="${this.escapeHTML(article.url || article.link)}" target="_blank">Read Article →</a>
        </div>`;

            if (article.tags && article.tags.length > 0) {
                html += `
        <div class="tags">
            ${article.tags.map(tag => `<span class="tag">${this.escapeHTML(tag)}</span>`).join('')}
        </div>`;
            }

            html += `
        <p>${this.escapeHTML(article.summary || 'No summary available')}</p>`;

            if (article.notes) {
                html += `
        <div class="notes">
            <strong>Notes:</strong><br>
            ${this.escapeHTML(article.notes)}
        </div>`;
            }

            html += `
    </div>`;
        });

        html += `
</body>
</html>`;

        return html;
    }

    /**
     * Escape CSV field
     */
    escapeCSV(field) {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Escape HTML
     */
    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    /**
     * Get statistics for all collections
     */
    getStatistics() {
        return {
            totalCollections: this.collections.length,
            totalArticles: this.collections.reduce((sum, c) => sum + c.articleIds.length, 0),
            averageArticlesPerCollection: Math.round(
                this.collections.reduce((sum, c) => sum + c.articleIds.length, 0) /
                Math.max(this.collections.length, 1)
            ),
            mostPopularCollection: this.collections.reduce((prev, current) =>
                current.articleIds.length > prev.articleIds.length ? current : prev,
                this.collections[0]
            )
        };
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.CollectionManager = CollectionManager;
}
