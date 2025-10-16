class NewsAggregator {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.currentFilter = 'all';
        this.currentAgeFilter = 'all';
        this.savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
        this.readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        this.isDarkTheme = localStorage.getItem('darkTheme') === 'true';
        this.autoRefreshEnabled = localStorage.getItem('autoRefresh') === 'true';
        this.autoRefreshInterval = null;
        this.searchQuery = '';
        this.trendingTopics = [];
        // Temporary legacy properties to prevent runtime errors during cleanup
        this.excludedKeywords = [];
        this.includedKeywords = [];
        this.showHiddenArticles = false;
        this.showOnlyIncluded = false;
        this.hiddenArticlesCount = 0;
        this.includedArticlesCount = 0;

        // Deduplication settings
        this.deduplicationEnabled = localStorage.getItem('deduplicationEnabled') !== 'false'; // Default true
        this.deduplicator = new ArticleDeduplicator({
            titleSimilarityThreshold: 0.75,
            timeProximityHours: 6,
            enableDeduplication: this.deduplicationEnabled
        });
        this.expandedDuplicates = new Set(); // Track which duplicate groups are expanded

        // Collections manager
        this.collectionManager = new CollectionManager();
        this.currentViewingCollection = null; // Track which collection is currently being viewed
        this.editingCollection = null; // Track which collection is being edited

        // Semantic search engine
        this.semanticSearch = new SemanticSearchEngine();

        // Reading analytics
        this.analytics = new ReadingAnalytics();

        // AI Summary settings
        this.expandedAISummaries = new Set(); // Track which AI summaries are expanded
        this.generatingAISummaries = new Set(); // Track which summaries are being generated

        // Pagination settings
        this.currentPage = 1;
        this.articlesPerPage = 20;

        // Pre-compile regex patterns for better performance
        this.phraseRegex = /"([^"]+)"/g;
        this.categoryRegex = /category:(\w+)/g;
        this.registerServiceWorker();
        this.init();
    }
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
                
                // Listen for service worker messages
                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data.type === 'news-refreshed') {
                        console.log('News refreshed in background');
                        this.showNotification('News updated', 'Latest articles have been refreshed');
                        this.loadNews(); // Reload news from cache
                    }
                });
                
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    init() {
        this.bindEventListeners();
        this.applyTheme();
        this.updateSavedCount();
        this.updateCollectionsCount();
        this.setupAutoRefresh();
        this.updateSourcesCount();
        this.startRealTimeClock();
        this.setupStickyHeader();
        this.cleanupLegacyStorage();
        this.loadNews();
        this.loadDynamicSources();
    }

    cleanupLegacyStorage() {
        // Remove old localStorage keys from legacy filtering system
        localStorage.removeItem('excludedKeywords');
        localStorage.removeItem('includedKeywords');
    }

    bindEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshNews());
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterNews(e.target.dataset.filter));
        });
        
        // Desktop controls
        const themeToggle = document.getElementById('themeToggle');
        const autoRefreshToggle = document.getElementById('autoRefreshToggle');
        const aboutBtn = document.getElementById('aboutBtn');
        
        if (themeToggle) themeToggle.addEventListener('click', () => this.toggleTheme());
        if (autoRefreshToggle) autoRefreshToggle.addEventListener('click', () => this.toggleAutoRefresh());
        if (aboutBtn) aboutBtn.addEventListener('click', () => this.showAboutModal());
        
        document.getElementById('analyticsBtn').addEventListener('click', () => this.showAnalyticsDashboard());
        document.getElementById('savedArticlesBtn').addEventListener('click', () => this.showSavedArticles());
        document.getElementById('collectionsBtn').addEventListener('click', () => this.showCollectionsManager());

        // Collections modal event listeners
        document.getElementById('createCollectionBtn').addEventListener('click', () => this.openCollectionEditor());
        document.getElementById('collectionEditForm').addEventListener('submit', (e) => this.saveCollection(e));
        document.getElementById('exportCollectionBtn').addEventListener('click', () => this.toggleExportOptions());

        // Color and icon picker event listeners
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectColor(e.target.dataset.color));
        });
        document.querySelectorAll('.icon-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectIcon(e.target.closest('.icon-option').dataset.icon));
        });

        // Export format event listeners
        document.querySelectorAll('.export-format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.exportCollection(btn.dataset.format));
        });

        // Mobile menu controls
        document.getElementById('mobileMenuToggle').addEventListener('click', () => this.showMobileMenu());
        document.getElementById('closeMobileMenu').addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('mobileThemeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('mobileAutoRefreshToggle').addEventListener('click', () => this.toggleAutoRefresh());
        document.getElementById('mobileAboutBtn').addEventListener('click', () => {
            this.closeMobileMenu();
            this.showAboutModal();
        });
        
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        searchInput.addEventListener('focus', () => {
            this.isSearchFocused = true;
            if (searchInput.value && !this.parseSmartSearch(searchInput.value).hasOperators) {
                const helpDiv = document.getElementById('searchHelp');
                if (helpDiv) helpDiv.style.display = 'block';
            }
        });
        searchInput.addEventListener('blur', () => {
            this.isSearchFocused = false;
            setTimeout(() => {
                const helpDiv = document.getElementById('searchHelp');
                if (helpDiv) helpDiv.style.display = 'none';
            }, 200);
        });
        clearSearch.addEventListener('click', () => this.clearSearch());

        // Semantic search toggle
        const semanticToggle = document.getElementById('semanticToggle');
        if (semanticToggle) {
            // Set initial state
            if (this.semanticSearch.isEnabled()) {
                semanticToggle.classList.add('active');
            }

            semanticToggle.addEventListener('click', () => this.toggleSemanticSearch());
        }

        // Add search preset functionality
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('search-preset')) {
                const query = e.target.dataset.query;
                searchInput.value = query;
                this.handleSearch(query);
                document.getElementById('searchHelp').style.display = 'none';
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSavedModal();
                this.closeAboutModal();
                this.closeArticlePreview();
                this.closeMobileMenu();
            }
            
            // Keyboard navigation for article cards
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                this.handleArticleNavigation(e.key);
                e.preventDefault();
            }
        });
        
        // Close mobile menu on overlay click
        document.getElementById('mobileMenuOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'mobileMenuOverlay') {
                this.closeMobileMenu();
            }
        });
        
        // Age filter event listener
        document.getElementById('ageFilter').addEventListener('change', (e) => {
            this.filterByAge(e.target.value);
        });
        
    }

    async loadNews() {
        this.showLoading(true);
        try {
            const response = await fetch('/api/news');
            if (!response.ok) throw new Error('Failed to fetch news');
            
            this.articles = await response.json();
            this.processArticles();
            this.applyCurrentFilters();
            this.renderNews();
            this.updateStats();
            this.updateFilterCounts();
            this.generateTrendingTopics();
        } catch (error) {
            console.error('Error loading news:', error);
            this.showError('Failed to load news. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    async refreshNews() {
        const refreshBtn = document.getElementById('refreshBtn');
        const icon = refreshBtn.querySelector('i');
        const progressBar = document.getElementById('progressBar');
        const progressFill = progressBar.querySelector('.progress-fill');
        
        refreshBtn.classList.add('loading');
        icon.classList.add('fa-spin');
        refreshBtn.disabled = true;
        progressBar.classList.add('active');
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            progressFill.style.width = progress + '%';
        }, 200);
        
        try {
            const response = await fetch('/api/refresh');
            if (!response.ok) {
                console.error('Refresh failed with status:', response.status);
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    console.error('Failed to parse error response:', e);
                    errorData = { details: `HTTP ${response.status} ${response.statusText}` };
                }
                throw new Error(errorData.details || 'Failed to refresh news');
            }
            
            const result = await response.json();
            clearInterval(progressInterval);
            progressFill.style.width = '100%';
            
            await this.loadNews();
            this.updateSourcesCount();
            this.showNotification(`News refreshed successfully! Found ${result.count} articles.`);
        } catch (error) {
            console.error('Error refreshing news:', error);
            console.error('Error type:', error.name);
            console.error('Error stack:', error.stack);
            
            let errorMessage;
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error: Unable to connect to the server. Please check your connection.';
            } else if (error.message.includes('network') || error.message.includes('source')) {
                errorMessage = 'Network or source error. Some news sources may be temporarily unavailable.';
            } else {
                errorMessage = error.message || 'Failed to refresh news. Please try again.';
            }
            this.showError(errorMessage);
        } finally {
            clearInterval(progressInterval);
            setTimeout(() => {
                refreshBtn.classList.remove('loading');
                icon.classList.remove('fa-spin');
                refreshBtn.disabled = false;
                progressBar.classList.remove('active');
                progressFill.style.width = '0%';
            }, 500);
        }
    }

    filterNews(filter) {
        this.currentFilter = filter;
        this.currentPage = 1; // Reset to first page when filtering

        document.querySelectorAll('.filter-btn').forEach(btn => {
            const isActive = btn.dataset.filter === filter;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();

        // Announce filter change to screen readers
        this.announceToScreenReader(`Filtered to ${filter === 'all' ? 'all articles' : filter + ' articles'}. Showing ${this.filteredArticles.length} articles.`);
    }

    renderNews() {
        const newsGrid = document.getElementById('newsGrid');
        const noArticles = document.getElementById('noArticles');
        const skeletonLoader = document.getElementById('skeletonLoader');

        skeletonLoader.style.display = 'none';

        if (this.filteredArticles.length === 0) {
            newsGrid.style.display = 'none';
            noArticles.style.display = 'block';
            this.renderPagination();
            return;
        }

        newsGrid.style.display = 'grid';
        noArticles.style.display = 'none';

        // Calculate pagination
        const totalPages = Math.ceil(this.filteredArticles.length / this.articlesPerPage);
        const startIndex = (this.currentPage - 1) * this.articlesPerPage;
        const endIndex = startIndex + this.articlesPerPage;
        const paginatedArticles = this.filteredArticles.slice(startIndex, endIndex);

        // Use safer DOM manipulation instead of innerHTML
        const articlesHTML = paginatedArticles.map(article => this.createArticleCard(article)).join('');
        const sanitizedHTML = window.Sanitizer ? window.Sanitizer.sanitizeHtml(articlesHTML) : articlesHTML;
        newsGrid.innerHTML = sanitizedHTML;

        newsGrid.querySelectorAll('.news-card').forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            card.classList.add('fade-in');
        });

        this.bindCardEventListeners();
        this.renderPagination();

        // Scroll to top when changing pages
        if (startIndex > 0) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    createArticleCard(article) {
        const categoryIcon = this.getCategoryIcon(article.category);
        const timeAgo = this.getTimeAgo(article.scraped);
        const isSaved = this.savedArticles.some(saved => saved.id === article.id);
        const isRead = this.readArticles.includes(article.id);
        const readingTime = this.calculateReadingTime(article.summary || '');
        
        // Combine AI summary with regular summary for simplified display
        // aiSummary is an object {overview, keyPoints}, so extract the overview string
        const combinedSummary = (article.aiSummary?.overview) || article.summary || '';
        
        return `
            <article class="news-card ${isSaved ? 'saved' : ''} ${isRead ? 'read' : ''} ${article.priority ? 'priority-' + article.priority : ''}" data-article-id="${article.id}" role="article" aria-labelledby="title-${article.id}">
                <!-- Save button (always visible on mobile) -->
                <div class="card-actions">
                    <button class="action-btn save-btn ${isSaved ? 'saved' : ''}" 
                            aria-label="${isSaved ? 'Remove from saved articles' : 'Save article for later'}"
                            title="${isSaved ? 'Remove from saved' : 'Save article'}">
                        <i class="${isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'}" aria-hidden="true"></i>
                    </button>
                </div>
                
                <!-- 1. Source and Category -->
                <div class="card-header-simple">
                    <span class="source-badge" aria-label="Source: ${article.source}">${article.source}</span>
                    <span class="category-badge" aria-label="Category: ${article.category}">
                        <i class="${categoryIcon}" aria-hidden="true"></i>
                        ${article.category}
                    </span>
                    ${this.renderPriorityBadges(article)}
                    ${this.renderDuplicateBadge(article)}
                </div>
                
                <!-- 2. Article Title (Primary CTA) -->
                <h3 class="news-title" id="title-${article.id}">
                    <a href="${article.url || article.link}"
                       class="article-title-link"
                       data-article-id="${article.id}"
                       target="_blank"
                       rel="noopener noreferrer"
                       aria-describedby="summary-${article.id} meta-${article.id}">
                        ${this.escapeHtml(article.title)}
                    </a>
                </h3>
                
                <!-- 3. Summary Text -->
                <div class="news-summary" id="summary-${article.id}">
                    ${this.escapeHtml(this.truncateText(combinedSummary, 120))}
                </div>
                
                <!-- 4. Time and Reading Estimate -->
                <div class="card-footer-simple" id="meta-${article.id}">
                    <span class="article-meta" aria-label="Published ${timeAgo}, estimated ${readingTime} minute read">
                        <i class="fas fa-clock" aria-hidden="true"></i>
                        ${timeAgo} • ${readingTime} min read
                    </span>
                    <button class="similar-articles-btn"
                            data-article-id="${article.id}"
                            title="Find similar articles"
                            aria-label="Find articles similar to this one">
                        <i class="fas fa-project-diagram" aria-hidden="true"></i>
                        Find Similar
                    </button>
                </div>

                <!-- 5. AI Summary Section -->
                ${this.renderAISummarySection(article)}

                <!-- 6. Duplicate Articles Section -->
                ${this.renderDuplicatesSection(article)}
            </article>
        `;
    }

    getCategoryIcon(category) {
        const icons = {
            'AI Industry': 'fas fa-industry',
            'AI News': 'fas fa-newspaper', 
            'AI Research': 'fas fa-flask',
            'Coding Tools': 'fas fa-code',
            'AI Tools': 'fas fa-robot',
            'Cybersecurity': 'fas fa-shield-alt',
            'Technology': 'fas fa-microchip'
        };
        return icons[category] || 'fas fa-newspaper';
    }
    
    renderPriorityBadges(article) {
        let badges = '';
        
        // Breaking news flash indicator
        if (article.isBreaking) {
            badges += '<span class="priority-badge breaking"><i class="fas fa-bolt"></i> BREAKING</span>';
        }
        
        // Priority level badge
        if (article.priority && article.priority !== 'medium') {
            const priorityConfig = {
                'critical': { icon: 'fas fa-exclamation-triangle', text: 'CRITICAL', class: 'critical' },
                'high': { icon: 'fas fa-exclamation-circle', text: 'HIGH', class: 'high' },
                'medium-high': { icon: 'fas fa-info-circle', text: 'IMPORTANT', class: 'medium-high' }
            };
            
            const config = priorityConfig[article.priority];
            if (config) {
                badges += `<span class="priority-badge ${config.class}"><i class="${config.icon}"></i> ${config.text}</span>`;
            }
        }
        
        // Sentiment indicator
        if (article.sentiment && article.sentiment !== 'neutral' && article.sentiment !== 'informational') {
            const sentimentConfig = {
                'critical': { icon: 'fas fa-shield-alt', class: 'sentiment-critical' },
                'important': { icon: 'fas fa-star', class: 'sentiment-important' },
                'moderate': { icon: 'fas fa-thumbs-up', class: 'sentiment-moderate' }
            };
            
            const config = sentimentConfig[article.sentiment];
            if (config && !article.isBreaking && article.priority !== 'critical') {
                badges += `<span class="sentiment-badge ${config.class}"><i class="${config.icon}"></i></span>`;
            }
        }
        
        return badges;
    }

    renderDuplicateBadge(article) {
        if (!article.duplicateCount || article.duplicateCount === 0) {
            return '';
        }

        const isExpanded = this.expandedDuplicates.has(article.id);
        const sourcesText = article.allSources.join(', ');

        return `
            <button class="duplicate-badge"
                    data-article-id="${article.id}"
                    title="This story is covered by ${article.duplicateCount + 1} sources: ${sourcesText}"
                    aria-label="${article.duplicateCount} similar ${article.duplicateCount === 1 ? 'story' : 'stories'} from other sources">
                <i class="fas fa-copy"></i>
                ${article.duplicateCount} similar
                <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
            </button>
        `;
    }

    renderDuplicatesSection(article) {
        if (!article.duplicateCount || article.duplicateCount === 0) {
            return '';
        }

        const isExpanded = this.expandedDuplicates.has(article.id);
        if (!isExpanded) {
            return '';
        }

        const duplicatesList = article.duplicates.map(dup => {
            const timeAgo = this.getTimeAgo(dup.scraped || dup.publishedAt || dup.date);
            const url = dup.url || dup.link || '#';
            return `
                <div class="duplicate-item">
                    <div class="duplicate-source-badge">${this.escapeHtml(dup.source)}</div>
                    <div class="duplicate-info">
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="duplicate-title">
                            ${this.escapeHtml(dup.title)}
                        </a>
                        <span class="duplicate-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="duplicates-section" data-article-id="${article.id}">
                <div class="duplicates-header">
                    <i class="fas fa-layer-group"></i>
                    <span>Same story from ${article.duplicateCount} other ${article.duplicateCount === 1 ? 'source' : 'sources'}:</span>
                </div>
                <div class="duplicates-list">
                    ${duplicatesList}
                </div>
            </div>
        `;
    }

    toggleDuplicates(articleId) {
        console.log('Toggling duplicates for article:', articleId);
        if (this.expandedDuplicates.has(articleId)) {
            this.expandedDuplicates.delete(articleId);
            console.log('Collapsed duplicates for:', articleId);
        } else {
            this.expandedDuplicates.add(articleId);
            console.log('Expanded duplicates for:', articleId);
        }
        this.renderNews();
    }

    renderAISummarySection(article) {
        const hasSummary = article.aiSummary && article.aiSummary.overview;
        const isExpanded = this.expandedAISummaries?.has(article.id);
        const isGenerating = this.generatingAISummaries?.has(article.id);

        if (!hasSummary && !isGenerating) {
            // Show "Generate Summary" button
            return `
                <div class="ai-summary-section">
                    <button class="ai-summary-button generate"
                            data-article-id="${article.id}"
                            title="Generate AI summary with Claude">
                        <i class="fas fa-sparkles"></i>
                        AI Summary
                    </button>
                </div>
            `;
        }

        if (isGenerating) {
            // Show loading state
            return `
                <div class="ai-summary-section">
                    <div class="ai-summary-button loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        Generating...
                    </div>
                </div>
            `;
        }

        // Show summary badge and expandable content
        return `
            <div class="ai-summary-section">
                <button class="ai-summary-button has-summary ${isExpanded ? 'expanded' : ''}"
                        data-article-id="${article.id}"
                        title="Click to ${isExpanded ? 'collapse' : 'expand'} AI summary">
                    <i class="fas fa-robot"></i>
                    AI Summary
                    <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                </button>
                ${isExpanded ? this.renderAISummaryContent(article) : ''}
            </div>
        `;
    }

    renderAISummaryContent(article) {
        console.log('[AI] renderAISummaryContent called for:', article.title);
        if (!article.aiSummary) {
            console.log('[AI] No aiSummary found');
            return '';
        }

        console.log('[AI] aiSummary object:', article.aiSummary);
        const { overview, keyPoints } = article.aiSummary;
        console.log('[AI] overview:', overview);
        console.log('[AI] keyPoints:', keyPoints);

        const keyPointsList = keyPoints && keyPoints.length > 0
            ? keyPoints.map(point => `<li>${this.escapeHtml(point)}</li>`).join('')
            : '';

        const html = `
            <div class="ai-summary-content">
                <div class="ai-summary-overview">
                    <i class="fas fa-lightbulb"></i>
                    <span>${this.escapeHtml(overview)}</span>
                </div>
                ${keyPointsList ? `
                    <div class="ai-summary-points">
                        <strong>Key Points:</strong>
                        <ul>
                            ${keyPointsList}
                        </ul>
                    </div>
                ` : ''}
                <div class="ai-summary-footer">
                    <i class="fas fa-check-circle"></i>
                    Summary generated by Claude AI
                </div>
            </div>
        `;

        console.log('[AI] Generated HTML length:', html.length);
        return html;
    }

    async toggleAISummary(articleId) {
        console.log('[AI] toggleAISummary called for:', articleId);
        console.log('[AI] Total articles:', this.articles.length);
        console.log('[AI] Filtered articles:', this.filteredArticles.length);

        const article = this.filteredArticles.find(a => a.id === articleId);
        if (!article) {
            console.error('[AI] Article not found in filteredArticles:', articleId);
            // Try looking in all articles
            const allArticle = this.articles.find(a => a.id === articleId);
            if (!allArticle) {
                console.error('[AI] Article not found in articles either:', articleId);
                this.showError('Article not found. Please refresh the page.');
                return;
            }
            console.log('[AI] Found article in all articles, using that');
            article = allArticle;
        }

        console.log('[AI] Found article:', article.title);

        // Initialize tracking sets if needed
        if (!this.expandedAISummaries) this.expandedAISummaries = new Set();
        if (!this.generatingAISummaries) this.generatingAISummaries = new Set();

        // If summary exists, just toggle expand/collapse
        if (article.aiSummary) {
            console.log('[AI] Article already has summary, toggling expand/collapse');
            if (this.expandedAISummaries.has(articleId)) {
                this.expandedAISummaries.delete(articleId);
                console.log('[AI] Collapsed summary');
            } else {
                this.expandedAISummaries.add(articleId);
                console.log('[AI] Expanded summary');
            }
            this.renderNews();
            return;
        }

        // Generate new summary
        console.log('[AI] Generating new summary...');
        this.generatingAISummaries.add(articleId);
        this.renderNews();

        try {
            console.log('[AI] Sending request to /api/summary');
            const response = await fetch('/api/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ article })
            });

            console.log('[AI] Response status:', response.status);

            if (!response.ok) {
                const error = await response.json();
                console.error('[AI] API error:', error);
                throw new Error(error.message || 'Failed to generate summary');
            }

            const { summary } = await response.json();
            console.log('[AI] Summary received:', summary);

            // Update article with summary in both arrays
            article.aiSummary = summary;
            const mainArticle = this.articles.find(a => a.id === articleId);
            if (mainArticle) {
                mainArticle.aiSummary = summary;
            }

            this.expandedAISummaries.add(articleId);

            this.showNotification('AI summary generated successfully!');
            console.log('[AI] Summary generation complete');

        } catch (error) {
            console.error('[AI] Error generating AI summary:', error);
            this.showError(`Failed to generate summary: ${error.message}`);
        } finally {
            this.generatingAISummaries.delete(articleId);
            this.renderNews();
        }
    }

    getTimeAgo(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
            
            if (diffInHours < 1) return 'Just now';
            if (diffInHours < 24) return `${diffInHours}h ago`;
            const diffInDays = Math.floor(diffInHours / 24);
            if (diffInDays < 7) return `${diffInDays}d ago`;
            const diffInWeeks = Math.floor(diffInDays / 7);
            return `${diffInWeeks}w ago`;
        } catch {
            return 'Recently';
        }
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        // Ensure text is a string
        if (typeof text !== 'string') {
            console.warn('truncateText received non-string:', typeof text, text);
            text = String(text);
        }
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    escapeHtml(text) {
        // Use the global Sanitizer utility
        return window.Sanitizer ? window.Sanitizer.escapeHtml(text) : this.fallbackEscapeHtml(text);
    }
    
    fallbackEscapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStats() {
        const total = this.filteredArticles.length;
        let totalText = total.toString();
        
        // Show filtered vs total count when smart search is active  
        if (total !== this.articles.length) {
            totalText = `${total} of ${this.articles.length}`;
        }
        
        document.getElementById('totalArticles').textContent = totalText;
        
        const lastUpdate = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = lastUpdate;
    }

    updateFilterCounts() {
        const allCount = this.articles.length;
        const aiIndustryCount = this.articles.filter(article => article.category === 'AI Industry').length;
        const aiNewsCount = this.articles.filter(article => article.category === 'AI News').length;
        const aiResearchCount = this.articles.filter(article => article.category === 'AI Research').length;
        const codingToolsCount = this.articles.filter(article => article.category === 'Coding Tools').length;
        const aiToolsCount = this.articles.filter(article => article.category === 'AI Tools').length;

        // Update button text with counts
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const filter = btn.dataset.filter;
            const icon = btn.querySelector('i');
            const text = btn.childNodes[btn.childNodes.length - 1];
            
            let count = 0;
            let label = '';
            
            switch (filter) {
                case 'all':
                    count = allCount;
                    label = 'All';
                    break;
                case 'AI Industry':
                    count = aiIndustryCount;
                    label = 'Industry';
                    break;
                case 'AI News':
                    count = aiNewsCount;
                    label = 'News';
                    break;
                case 'AI Research':
                    count = aiResearchCount;
                    label = 'Research';
                    break;
                case 'Coding Tools':
                    count = codingToolsCount;
                    label = 'Tools';
                    break;
                case 'AI Tools':
                    count = aiToolsCount;
                    label = 'AI Tools';
                    break;
            }
            
            // Update the text content while preserving the icon
            if (text && text.nodeType === Node.TEXT_NODE) {
                text.textContent = ` ${label} (${count})`;
            }
        });
    }

    async updateSourcesCount() {
        try {
            const response = await fetch('/api/sources');
            if (response.ok) {
                const sources = await response.json();
                const activeSources = sources.filter(source => source.status === 'active');
                document.getElementById('totalSources').textContent = activeSources.length;
                
                // Update source icons with source-specific icons
                const sourceIconsContainer = document.getElementById('sourceIcons');
                const sourceIconMap = {
                    'BleepingComputer': 'fas fa-bug',
                    'Cybersecurity News': 'fas fa-shield-alt', 
                    'Neowin': 'fas fa-window-maximize',
                    'AskWoody': 'fas fa-question-circle',
                    'TechCrunch': 'fas fa-rocket',
                    'The Hacker News': 'fas fa-user-secret',
                    'Dark Reading': 'fas fa-eye',
                    'SecurityWeek': 'fas fa-calendar-week',
                    'Krebs on Security': 'fas fa-search',
                    'The Verge': 'fas fa-border-all',
                    'Ars Technica': 'fas fa-cogs',
                    'Wired': 'fas fa-bolt',
                    'Engadget': 'fas fa-mobile-alt'
                };
                
                const sourceIcons = activeSources.map(source => {
                    const icon = sourceIconMap[source.name] || 'fas fa-globe';
                    return `<i class="${icon}" title="${source.name}"></i>`;
                }).join('');
                sourceIconsContainer.innerHTML = sourceIcons;
            }
        } catch (error) {
            console.error('Error updating sources count:', error);
            // Fallback with source-specific icons
            document.getElementById('totalSources').textContent = '13';
            document.getElementById('sourceIcons').innerHTML = '<i class="fas fa-bug" title="BleepingComputer"></i><i class="fas fa-shield-alt" title="Cybersecurity News"></i><i class="fas fa-window-maximize" title="Neowin"></i><i class="fas fa-question-circle" title="AskWoody"></i><i class="fas fa-rocket" title="TechCrunch"></i><i class="fas fa-user-secret" title="The Hacker News"></i><i class="fas fa-eye" title="Dark Reading"></i><i class="fas fa-calendar-week" title="SecurityWeek"></i><i class="fas fa-search" title="Krebs on Security"></i><i class="fas fa-border-all" title="The Verge"></i><i class="fas fa-cogs" title="Ars Technica"></i><i class="fas fa-bolt" title="Wired"></i><i class="fas fa-mobile-alt" title="Engadget"></i>';
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const newsGrid = document.getElementById('newsGrid');
        const noArticles = document.getElementById('noArticles');
        const skeletonLoader = document.getElementById('skeletonLoader');
        
        if (show) {
            loading.style.display = 'none';
            skeletonLoader.style.display = 'grid';
            newsGrid.style.display = 'none';
            noArticles.style.display = 'none';
        } else {
            loading.style.display = 'none';
            skeletonLoader.style.display = 'none';
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff6b6b' : '#51cf66'};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 500;
            animation: slideInRight 0.3s ease;
            max-width: 400px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
    
    processArticles() {
        // First add IDs to all articles
        this.articles = this.articles.map(article => ({
            ...article,
            id: article.id || this.generateId(article)
        }));

        // Then apply deduplication with error handling
        if (this.deduplicationEnabled) {
            try {
                const originalCount = this.articles.length;
                console.log('Starting deduplication on', originalCount, 'articles...');
                const startTime = performance.now();

                this.articles = this.deduplicator.deduplicateArticles(this.articles);

                const endTime = performance.now();
                console.log('Deduplication completed in', (endTime - startTime).toFixed(2), 'ms');

                // Log deduplication stats
                const stats = this.deduplicator.getDeduplicationStats(originalCount, this.articles);
                console.log('Deduplication stats:', stats);
            } catch (error) {
                console.error('Error during deduplication:', error);
                console.error('Disabling deduplication and continuing...');
                // Mark all articles as having no duplicates if deduplication fails
                this.articles = this.articles.map(article => ({
                    ...article,
                    isDuplicate: false,
                    duplicateCount: 0,
                    duplicates: [],
                    allSources: [article.source]
                }));
            }
        }
    }
    
    generateId(article) {
        // Use title + source + link for stable IDs that don't change on refresh
        const uniqueString = article.title + article.source + (article.link || '');
        return btoa(encodeURIComponent(uniqueString)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
    
    async applyCurrentFilters() {
        let filtered = [...this.articles];
        let excluded = [];

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(article => article.category === this.currentFilter);
        }

        if (this.currentAgeFilter !== 'all') {
            filtered = filtered.filter(article => this.isArticleInAgeRange(article, this.currentAgeFilter));
        }

        if (this.searchQuery) {
            if (this.semanticSearch.isEnabled()) {
                // Use semantic search
                const results = await this.semanticSearch.searchArticles(this.searchQuery, filtered);
                // Filter out articles with very low relevance (score < 20)
                filtered = results
                    .filter(result => result.score >= 20)
                    .map(result => ({
                        ...result.article,
                        _semanticScore: result.score,
                        _semanticMatches: result.matches
                    }));
            } else {
                // Use traditional keyword search
                const searchTerms = this.parseSmartSearch(this.searchQuery);
                filtered = filtered.filter(article => this.matchesSmartSearch(article, searchTerms));
            }
        }

        this.filteredArticles = filtered;
    }
    
    isAIRelated(article) {
        const aiKeywords = [
            'claude code', 'claude', 'anthropic',
            'ai', 'artificial intelligence', 'machine learning', 'ml',
            'chatgpt', 'gpt', 'openai', 'generative ai',
            'neural network', 'deep learning', 'llm', 'large language model',
            'automation', 'robot', 'robotics', 'autonomous',
            'computer vision', 'natural language processing', 'nlp',
            'algorithm', 'predictive', 'intelligent', 'smart ai',
            'copilot', 'assistant ai', 'ai assistant'
        ];
        
        const searchText = (article.title + ' ' + (article.summary || '')).toLowerCase();
        
        return aiKeywords.some(keyword => searchText.includes(keyword));
    }

    isArticleExcluded(article) {
        if (this.excludedKeywords.length === 0) return false;
        
        const searchText = (article.title + ' ' + (article.summary || '') + ' ' + (article.aiSummary || '')).toLowerCase();
        
        return this.excludedKeywords.some(keyword => {
            const keywordLower = keyword.toLowerCase().trim();
            
            // Handle exact phrases (quoted terms)
            if (keywordLower.startsWith('"') && keywordLower.endsWith('"')) {
                const phrase = keywordLower.slice(1, -1);
                return searchText.includes(phrase);
            }
            
            // Handle wildcards
            if (keywordLower.includes('*')) {
                const regex = new RegExp(keywordLower.replace(/\*/g, '.*'), 'i');
                return regex.test(searchText);
            }
            
            // Simple keyword matching
            return searchText.includes(keywordLower);
        });
    }

    isArticleIncluded(article) {
        if (this.includedKeywords.length === 0) return true; // No include filters = include all
        
        const searchText = (article.title + ' ' + (article.summary || '') + ' ' + (article.aiSummary || '')).toLowerCase();
        
        return this.includedKeywords.some(keyword => {
            const keywordLower = keyword.toLowerCase().trim();
            
            // Handle exact phrases (quoted terms)
            if (keywordLower.startsWith('"') && keywordLower.endsWith('"')) {
                const phrase = keywordLower.slice(1, -1);
                return searchText.includes(phrase);
            }
            
            // Handle wildcards
            if (keywordLower.includes('*')) {
                const regex = new RegExp(keywordLower.replace(/\*/g, '.*'), 'i');
                return regex.test(searchText);
            }
            
            // Simple keyword matching
            return searchText.includes(keywordLower);
        });
    }

    addExclusionKeyword(keyword = null) {
        const input = document.getElementById('exclusionInput');
        const keywordToAdd = keyword || input.value.trim();
        
        if (!keywordToAdd) return;
        
        // Parse multiple keywords separated by commas
        const keywords = keywordToAdd.split(',').map(k => k.trim()).filter(k => k);
        
        keywords.forEach(kw => {
            if (!this.excludedKeywords.includes(kw)) {
                this.excludedKeywords.push(kw);
            }
        });
        
        input.value = '';
        this.saveExclusionKeywords();
        this.renderExclusionTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        const addedCount = keywords.length;
        this.announceToScreenReader(`Added ${addedCount} exclusion filter${addedCount > 1 ? 's' : ''}. Now hiding articles containing: ${keywords.join(', ')}`);
    }

    removeExclusionKeyword(keyword) {
        this.excludedKeywords = this.excludedKeywords.filter(k => k !== keyword);
        this.saveExclusionKeywords();
        this.renderExclusionTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        this.announceToScreenReader(`Removed exclusion filter: ${keyword}`);
    }

    saveExclusionKeywords() {
        localStorage.setItem('excludedKeywords', JSON.stringify(this.excludedKeywords));
    }

    renderExclusionTags() {
        const container = document.getElementById('exclusionTags');
        
        if (this.excludedKeywords.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = this.excludedKeywords.map(keyword => `
            <span class="exclusion-tag">
                <span class="exclusion-keyword">${this.escapeHtml(keyword)}</span>
                <button class="remove-exclusion" onclick="newsAggregator.removeExclusionKeyword('${this.escapeHtml(keyword)}')" 
                        aria-label="Remove ${this.escapeHtml(keyword)} exclusion">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </span>
        `).join('');
    }

    updateHiddenControls() {
        const showHiddenBtn = document.getElementById('showHiddenBtn');
        const clearExclusionsBtn = document.getElementById('clearExclusionsBtn');
        const hiddenCountSpan = document.getElementById('hiddenCount');
        
        if (this.excludedKeywords.length > 0) {
            showHiddenBtn.style.display = 'inline-flex';
            clearExclusionsBtn.style.display = 'inline-flex';
            hiddenCountSpan.textContent = this.hiddenArticlesCount;
            
            const hiddenText = this.showHiddenArticles ? 'Hide Excluded' : 'Show Hidden';
            const hiddenIcon = this.showHiddenArticles ? 'fa-eye-slash' : 'fa-eye';
            showHiddenBtn.innerHTML = `<i class="fas ${hiddenIcon}"></i> ${hiddenText} (${this.hiddenArticlesCount})`;
        } else {
            showHiddenBtn.style.display = 'none';
            clearExclusionsBtn.style.display = 'none';
        }
    }

    toggleHiddenArticles() {
        this.showHiddenArticles = !this.showHiddenArticles;
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        
        const action = this.showHiddenArticles ? 'Showing' : 'Hiding';
        this.announceToScreenReader(`${action} excluded articles`);
    }

    clearAllExclusions() {
        const count = this.excludedKeywords.length;
        this.excludedKeywords = [];
        this.showHiddenArticles = false;
        this.saveExclusionKeywords();
        this.renderExclusionTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        this.announceToScreenReader(`Cleared all ${count} exclusion filters`);
    }

    addIncludeKeyword(keyword = null) {
        const input = document.getElementById('includeInput');
        const keywordToAdd = keyword || input.value.trim();
        
        if (!keywordToAdd) return;
        
        // Parse multiple keywords separated by commas
        const keywords = keywordToAdd.split(',').map(k => k.trim()).filter(k => k);
        
        keywords.forEach(kw => {
            if (!this.includedKeywords.includes(kw)) {
                this.includedKeywords.push(kw);
            }
        });
        
        input.value = '';
        this.saveIncludeKeywords();
        this.renderIncludeTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        const addedCount = keywords.length;
        this.announceToScreenReader(`Added ${addedCount} include filter${addedCount > 1 ? 's' : ''}. Now showing only articles containing: ${keywords.join(', ')}`);
    }

    removeIncludeKeyword(keyword) {
        this.includedKeywords = this.includedKeywords.filter(k => k !== keyword);
        this.saveIncludeKeywords();
        this.renderIncludeTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        this.announceToScreenReader(`Removed include filter: ${keyword}`);
    }

    saveIncludeKeywords() {
        localStorage.setItem('includedKeywords', JSON.stringify(this.includedKeywords));
    }

    renderIncludeTags() {
        const container = document.getElementById('includeTags');
        
        if (this.includedKeywords.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = this.includedKeywords.map(keyword => `
            <span class="include-tag">
                <span class="include-keyword">${this.escapeHtml(keyword)}</span>
                <button class="remove-include" onclick="newsAggregator.removeIncludeKeyword('${this.escapeHtml(keyword)}')" 
                        aria-label="Remove ${this.escapeHtml(keyword)} include filter">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </span>
        `).join('');
    }

    updateIncludeControls() {
        const showOnlyBtn = document.getElementById('showOnlyIncludedBtn');
        const clearIncludesBtn = document.getElementById('clearIncludesBtn');
        const includedCountSpan = document.getElementById('includedCount');
        
        if (this.includedKeywords.length > 0) {
            showOnlyBtn.style.display = 'inline-flex';
            clearIncludesBtn.style.display = 'inline-flex';
            includedCountSpan.textContent = this.includedArticlesCount;
            
            const onlyText = this.showOnlyIncluded ? 'Show All' : 'Show Only Included';
            const onlyIcon = this.showOnlyIncluded ? 'fa-list' : 'fa-filter';
            showOnlyBtn.innerHTML = `<i class="fas ${onlyIcon}"></i> ${onlyText} (${this.includedArticlesCount})`;
        } else {
            showOnlyBtn.style.display = 'none';
            clearIncludesBtn.style.display = 'none';
        }
    }

    toggleOnlyIncluded() {
        this.showOnlyIncluded = !this.showOnlyIncluded;
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        
        const action = this.showOnlyIncluded ? 'Showing only included' : 'Showing all filtered';
        this.announceToScreenReader(`${action} articles`);
    }

    clearAllIncludes() {
        const count = this.includedKeywords.length;
        this.includedKeywords = [];
        this.showOnlyIncluded = false;
        this.saveIncludeKeywords();
        this.renderIncludeTags();
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        this.announceToScreenReader(`Cleared all ${count} include filters`);
    }
    
    toggleSemanticSearch() {
        const isEnabled = !this.semanticSearch.isEnabled();
        this.semanticSearch.setEnabled(isEnabled);

        const toggleBtn = document.getElementById('semanticToggle');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', isEnabled);
        }

        // Re-apply search if there's an active query
        if (this.searchQuery) {
            this.applyCurrentFilters();
            this.renderNews();
        }

        const mode = isEnabled ? 'Semantic (AI-powered)' : 'Keyword';
        this.showNotification(`Search mode: ${mode}`);
        this.announceToScreenReader(`Switched to ${mode} search mode`);
    }

    async handleSearch(query) {
        this.searchQuery = window.Sanitizer ? window.Sanitizer.sanitizeSearchInput(query) : this.fallbackSanitizeSearchInput(query);
        const clearBtn = document.getElementById('clearSearch');
        const helpDiv = document.getElementById('searchHelp');

        clearBtn.style.display = query ? 'block' : 'none';

        // Show/hide search help based on focus and query
        if (query && this.isSearchFocused && !this.parseSmartSearch(query).hasOperators && helpDiv) {
            helpDiv.style.display = 'block';
        }

        await this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();

        // Track search in analytics
        if (query && query.trim().length > 0) {
            this.analytics.trackEvent('search', {
                query: query,
                resultsCount: this.filteredArticles.length,
                semanticEnabled: this.semanticSearch.isEnabled()
            });
        }

        // Announce search results to screen readers
        if (query) {
            setTimeout(() => {
                this.announceToScreenReader(`Search for "${query}" found ${this.filteredArticles.length} articles`);
            }, 500);
        }
    }

    parseSmartSearch(query) {
        const result = {
            includeTerms: [],
            excludeTerms: [],
            exactPhrases: [],
            categoryFilter: null,
            hasOperators: false
        };

        if (!query) return result;

        // Reset regex patterns for fresh execution
        this.phraseRegex.lastIndex = 0;
        this.categoryRegex.lastIndex = 0;
        
        // Extract quoted phrases first
        let match;
        while ((match = this.phraseRegex.exec(query)) !== null) {
            result.exactPhrases.push(match[1].toLowerCase());
            result.hasOperators = true;
        }
        
        // Remove quoted phrases from query for further processing
        let cleanQuery = query.replace(this.phraseRegex, ' ');
        
        // Extract category filters
        while ((match = this.categoryRegex.exec(cleanQuery)) !== null) {
            const category = match[1].toLowerCase();
            switch(category) {
                case 'industry':
                    result.categoryFilter = 'AI Industry';
                    break;
                case 'news':
                    result.categoryFilter = 'AI News';
                    break;
                case 'research':
                    result.categoryFilter = 'AI Research';
                    break;
                case 'tools':
                    result.categoryFilter = 'Coding Tools';
                    break;
                case 'aitools':
                    result.categoryFilter = 'AI Tools';
                    break;
                default:
                    result.categoryFilter = category;
            }
            result.hasOperators = true;
        }
        
        // Remove category filters from query
        cleanQuery = cleanQuery.replace(this.categoryRegex, ' ');
        
        // Split remaining query into words and process + and - operators
        const words = cleanQuery.split(/\s+/).filter(word => word.trim());
        
        for (const word of words) {
            if (word.startsWith('+')) {
                result.includeTerms.push(word.substring(1).toLowerCase());
                result.hasOperators = true;
            } else if (word.startsWith('-')) {
                result.excludeTerms.push(word.substring(1).toLowerCase());
                result.hasOperators = true;
            } else if (word.trim()) {
                // Regular search terms are treated as "should include"
                result.includeTerms.push(word.toLowerCase());
            }
        }

        return result;
    }

    matchesSmartSearch(article, searchTerms) {
        if (!searchTerms || (!searchTerms.includeTerms.length && !searchTerms.excludeTerms.length && 
            !searchTerms.exactPhrases.length && !searchTerms.categoryFilter)) {
            return true;
        }

        const searchText = `${article.title} ${article.summary || ''} ${article.content || ''}`.toLowerCase();
        
        // Category filter
        if (searchTerms.categoryFilter && article.category !== searchTerms.categoryFilter) {
            return false;
        }
        
        // Exclude terms (any match excludes the article)
        for (const term of searchTerms.excludeTerms) {
            if (searchText.includes(term)) {
                return false;
            }
        }
        
        // Exact phrases (all must match)
        for (const phrase of searchTerms.exactPhrases) {
            if (!searchText.includes(phrase)) {
                return false;
            }
        }
        
        // Include terms (all must match if any are specified)
        if (searchTerms.includeTerms.length > 0) {
            for (const term of searchTerms.includeTerms) {
                if (!searchText.includes(term)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    sanitizeSearchInput(input) {
        return window.Sanitizer ? window.Sanitizer.sanitizeSearchInput(input) : this.fallbackSanitizeSearchInput(input);
    }
    
    fallbackSanitizeSearchInput(input) {
        if (typeof input !== 'string') return '';
        // Remove potentially dangerous characters while preserving search operators
        return input.replace(/[<>]/g, '').trim().substring(0, 200);
    }
    
    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearch').style.display = 'none';
        this.searchQuery = '';
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        // Announce clearing of search
        this.announceToScreenReader(`Search cleared. Showing all ${this.filteredArticles.length} articles`);
    }
    
    filterByAge(ageFilter) {
        this.currentAgeFilter = ageFilter;
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
    }
    
    isArticleInAgeRange(article, ageFilter) {
        if (!article.scraped) return true;
        
        try {
            const articleDate = new Date(article.scraped);
            const now = new Date();
            const diffInHours = (now - articleDate) / (1000 * 60 * 60);
            
            switch (ageFilter) {
                case '1h':
                    return diffInHours <= 1;
                case '4h':
                    return diffInHours <= 4;
                case 'today':
                    const today = new Date();
                    return articleDate.toDateString() === today.toDateString();
                case '1d':
                    return diffInHours <= 24;
                case '2d':
                    return diffInHours <= 48;
                case 'all':
                default:
                    return true;
            }
        } catch (error) {
            console.warn('Error parsing article date:', error);
            return true;
        }
    }
    
    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
        localStorage.setItem('darkTheme', this.isDarkTheme);
        this.applyTheme();
    }
    
    applyTheme() {
        const body = document.body;
        const themeBtn = document.getElementById('themeToggle');
        
        if (this.isDarkTheme) {
            body.classList.add('dark-theme');
            if (themeBtn) {
                const themeIcon = themeBtn.querySelector('i');
                themeIcon.className = 'fas fa-sun';
                themeBtn.classList.add('active');
            }
        } else {
            body.classList.remove('dark-theme');
            if (themeBtn) {
                const themeIcon = themeBtn.querySelector('i');
                themeIcon.className = 'fas fa-moon';
                themeBtn.classList.remove('active');
            }
        }
    }
    
    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        localStorage.setItem('autoRefresh', this.autoRefreshEnabled);
        this.setupAutoRefresh();
        
        const autoRefreshBtn = document.getElementById('autoRefreshToggle');
        if (autoRefreshBtn) {
            autoRefreshBtn.classList.toggle('active', this.autoRefreshEnabled);
        }
        
        this.showNotification(
            `Auto-refresh ${this.autoRefreshEnabled ? 'enabled' : 'disabled'}`,
            this.autoRefreshEnabled ? 'success' : 'info'
        );
    }
    
    setupAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        
        const autoRefreshBtn = document.getElementById('autoRefreshToggle');
        if (autoRefreshBtn) {
            autoRefreshBtn.classList.toggle('active', this.autoRefreshEnabled);
        }
        
        if (this.autoRefreshEnabled) {
            this.autoRefreshInterval = setInterval(() => {
                this.refreshNews();
            }, 15 * 60 * 1000);
        }
    }

    setupStickyHeader() {
        let lastScrollY = 0;
        let isHeaderVisible = true;
        const header = document.querySelector('.header');
        
        // Only apply on mobile devices
        const checkMobile = () => window.innerWidth <= 768;
        
        const handleScroll = () => {
            if (!checkMobile()) return;
            
            const currentScrollY = window.scrollY;
            const scrollDiff = currentScrollY - lastScrollY;
            
            // Show header when scrolling up or at top
            if (scrollDiff < -5 || currentScrollY < 100) {
                if (!isHeaderVisible) {
                    header.classList.remove('header-hidden');
                    isHeaderVisible = true;
                }
            }
            // Hide header when scrolling down significantly
            else if (scrollDiff > 5 && currentScrollY > 150) {
                if (isHeaderVisible) {
                    header.classList.add('header-hidden');
                    isHeaderVisible = false;
                }
            }
            
            lastScrollY = currentScrollY;
        };
        
        // Throttle scroll events for better performance
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(handleScroll, 10);
        });
        
        // Reset header visibility on resize
        window.addEventListener('resize', () => {
            if (!checkMobile() && header.classList.contains('header-hidden')) {
                header.classList.remove('header-hidden');
                isHeaderVisible = true;
            }
        });
    }
    
    saveArticle(articleId) {
        const article = this.articles.find(a => a.id === articleId);
        if (!article) return;
        
        const existingIndex = this.savedArticles.findIndex(saved => saved.id === articleId);
        if (existingIndex > -1) {
            this.savedArticles.splice(existingIndex, 1);
            this.showNotification('Article removed from saved', 'info');
            this.announceToScreenReader(`Removed "${article.title}" from saved articles`);
        } else {
            this.savedArticles.push({
                ...article,
                savedAt: new Date().toISOString()
            });
            this.showNotification('Article saved successfully');
            this.announceToScreenReader(`Saved "${article.title}" for later reading`);

            // Track in analytics
            this.analytics.trackEvent('article_saved', {
                articleId: article.id,
                category: article.category,
                source: article.source
            });
        }
        
        localStorage.setItem('savedArticles', JSON.stringify(this.savedArticles));
        this.updateSavedCount();
        this.renderNews();
    }
    
    updateSavedCount() {
        document.getElementById('savedCount').textContent = this.savedArticles.length;
    }
    
    markAsRead(articleId) {
        if (!this.readArticles.includes(articleId)) {
            this.readArticles.push(articleId);
            localStorage.setItem('readArticles', JSON.stringify(this.readArticles));

            // Track in analytics
            const article = this.articles.find(a => a.id === articleId);
            if (article) {
                const readingTime = this.calculateReadingTime(article.summary || '') * 60; // Convert to seconds
                this.analytics.trackEvent('article_read', {
                    articleId: article.id,
                    category: article.category,
                    source: article.source,
                    readingTime: readingTime
                });
            }
        }
    }
    
    calculateReadingTime(text) {
        const wordsPerMinute = 200;
        const words = text.split(' ').length;
        return Math.max(1, Math.ceil(words / wordsPerMinute));
    }
    
    getReliabilityScore(source) {
        const scores = {
            'BleepingComputer': 5,
            'Cybersecurity News': 4,
            'Neowin': 4,
            'AskWoody': 3
        };
        return scores[source] || 3;
    }
    
    getRelatedArticles(article) {
        return this.articles
            .filter(a => a.id !== article.id && a.category === article.category)
            .slice(0, 2);
    }
    
    bindCardEventListeners() {
        document.querySelectorAll('.save-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const articleId = e.target.closest('.news-card').dataset.articleId;
                this.saveArticle(articleId);
            });
        });

        document.querySelectorAll('.share-btn.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.target.closest('.news-card');
                this.toggleShareMenu(card);
            });
        });

        // Duplicate badge click handlers
        document.querySelectorAll('.duplicate-badge').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const articleId = btn.dataset.articleId;
                this.toggleDuplicates(articleId);
            });
        });

        // AI Summary button click handlers
        document.querySelectorAll('.ai-summary-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const articleId = btn.dataset.articleId;
                console.log('AI Summary button clicked for article:', articleId);
                if (articleId) {
                    this.toggleAISummary(articleId);
                } else {
                    console.error('No article ID found on button');
                }
            });
        });

        // Article title link click handlers - mark as read when clicked
        document.querySelectorAll('.article-title-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const articleId = link.dataset.articleId;
                if (articleId) {
                    this.markAsRead(articleId);
                }
            });
        });

        // Find Similar Articles button click handlers
        document.querySelectorAll('.similar-articles-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const articleId = btn.dataset.articleId;
                if (articleId) {
                    this.showSimilarArticles(articleId);
                }
            });
        });

        // Close share menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.share-buttons') && !e.target.closest('.share-btn.action-btn')) {
                this.closeAllShareMenus();
            }
        });
    }
    
    showSavedArticles() {
        const modal = document.getElementById('savedModal');
        const articlesList = document.getElementById('savedArticlesList');

        if (this.savedArticles.length === 0) {
            articlesList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No saved articles yet</p>';
        } else {
            articlesList.innerHTML = this.savedArticles.map(article => {
                const articleCollections = this.collectionManager.getCollectionsForArticle(article.id);
                const collectionBadges = articleCollections.map(col =>
                    `<span class="article-collection-badge" style="background: ${col.color};" title="${this.escapeHtml(col.name)}">
                        <i class="fas ${col.icon}"></i> ${this.escapeHtml(col.name)}
                    </span>`
                ).join('');

                return `
                    <div class="saved-article-item" onclick="window.open('${article.url || article.link}', '_blank')">
                        <div class="saved-article-info">
                            <h4>${this.escapeHtml(article.title)}</h4>
                            <p>${this.escapeHtml(this.truncateText(article.summary || '', 100))}</p>
                            <div class="saved-article-meta">
                                <span><i class="fas fa-tag"></i> ${article.category}</span>
                                <span><i class="fas fa-globe"></i> ${article.source}</span>
                                <span><i class="fas fa-bookmark"></i> ${this.getTimeAgo(article.savedAt)}</span>
                            </div>
                            ${collectionBadges ? `<div class="article-collections">${collectionBadges}</div>` : ''}
                        </div>
                        <div class="saved-article-actions">
                            <button class="icon-btn add-to-collection" onclick="event.stopPropagation(); newsAggregator.showCollectionSelectorForArticle('${article.id}')" title="Add to collection">
                                <i class="fas fa-folder-plus"></i>
                            </button>
                            <button class="remove-saved" onclick="event.stopPropagation(); newsAggregator.removeSavedArticle('${article.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        modal.style.display = 'flex';
    }
    
    closeSavedModal() {
        document.getElementById('savedModal').style.display = 'none';
    }
    
    removeSavedArticle(articleId) {
        this.savedArticles = this.savedArticles.filter(article => article.id !== articleId);
        localStorage.setItem('savedArticles', JSON.stringify(this.savedArticles));
        this.updateSavedCount();
        this.showSavedArticles();
        this.renderNews();
    }

    showSimilarArticles(articleId) {
        // Find the target article
        const targetArticle = this.articles.find(a => a.id === articleId);
        if (!targetArticle) {
            this.showNotification('Article not found', 'error');
            return;
        }

        // Find similar articles using semantic search
        const similarArticles = this.semanticSearch.findSimilarArticles(
            targetArticle,
            this.articles.filter(a => a.id !== articleId),
            8 // Get top 8 similar articles
        );

        // Filter to only show articles with a meaningful similarity score
        const relevantSimilar = similarArticles.filter(result => result.score >= 30);

        // Create modal HTML
        const modalHTML = `
            <div class="similar-articles-overlay" onclick="this.remove()">
                <div class="similar-articles-modal" onclick="event.stopPropagation()">
                    <div class="similar-articles-header">
                        <h3><i class="fas fa-project-diagram"></i> Similar Articles</h3>
                        <button class="close-modal-btn" onclick="this.closest('.similar-articles-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="similar-articles-reference">
                        <div class="reference-label">Finding articles similar to:</div>
                        <div class="reference-article">
                            <strong>${this.escapeHtml(this.truncateText(targetArticle.title, 80))}</strong>
                            <div class="reference-meta">
                                <span>${targetArticle.source}</span>
                                <span>•</span>
                                <span>${targetArticle.category}</span>
                            </div>
                        </div>
                    </div>

                    <div class="similar-articles-list">
                        ${relevantSimilar.length === 0 ? `
                            <div class="no-similar-articles">
                                <i class="fas fa-search"></i>
                                <p>No similar articles found</p>
                                <small>Try enabling semantic search for better results</small>
                            </div>
                        ` : relevantSimilar.map((result, index) => {
                            const article = result.article;
                            const isSaved = this.savedArticles.some(saved => saved.id === article.id);
                            const isRead = this.readArticles.includes(article.id);

                            return `
                                <div class="similar-article-item ${isRead ? 'read' : ''}"
                                     data-article-id="${article.id}">
                                    <div class="similar-article-number">${index + 1}</div>
                                    <div class="similar-article-content">
                                        <div class="similar-article-header">
                                            <a href="${article.url || article.link}"
                                               target="_blank"
                                               rel="noopener noreferrer"
                                               onclick="newsAggregator.markAsRead('${article.id}')"
                                               class="similar-article-title">
                                                ${this.escapeHtml(article.title)}
                                            </a>
                                            <div class="similar-article-badges">
                                                <span class="similarity-score" title="Similarity: ${result.score}%">
                                                    ${result.score}% match
                                                </span>
                                            </div>
                                        </div>
                                        <div class="similar-article-meta">
                                            <span><i class="fas fa-globe"></i> ${article.source}</span>
                                            <span><i class="fas fa-tag"></i> ${article.category}</span>
                                            <span><i class="fas fa-clock"></i> ${this.getTimeAgo(article.scraped)}</span>
                                        </div>
                                        <div class="similar-article-summary">
                                            ${this.escapeHtml(this.truncateText(article.summary || '', 120))}
                                        </div>
                                    </div>
                                    <button class="similar-article-save ${isSaved ? 'saved' : ''}"
                                            onclick="event.stopPropagation(); newsAggregator.saveArticle('${article.id}'); this.classList.toggle('saved');"
                                            title="${isSaved ? 'Remove from saved' : 'Save article'}">
                                        <i class="${isSaved ? 'fas' : 'far'} fa-bookmark"></i>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    ${relevantSimilar.length > 0 ? `
                        <div class="similar-articles-footer">
                            <small>Powered by semantic search • ${relevantSimilar.length} relevant results</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Announce to screen readers
        this.announceToScreenReader(`Found ${relevantSimilar.length} similar articles`);
    }

    generateTrendingTopics() {
        const wordFreq = {};
        
        // Comprehensive stop words list
        const commonWords = [
            // Basic English stop words
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'do', 'does', 'did', 'a', 'an', 'this', 'that', 'these', 'those',
            // Additional common words causing issues
            'more', 'from', 'about', 'than', 'also', 'into', 'over', 'after', 'under', 'through', 'during', 'before', 'between', 'up', 'down', 'out', 'off', 'above', 'below',
            // Web/news specific terms
            'comments', 'comment', 'article', 'news', 'read', 'reading', 'write', 'written', 'post', 'posted', 'share', 'shared', 'like', 'likes', 'view', 'views', 'click', 'clicks',
            // Temporal words
            'hours', 'hour', 'minutes', 'minute', 'days', 'day', 'weeks', 'week', 'months', 'month', 'years', 'year', 'today', 'yesterday', 'tomorrow', 'now', 'then', 'when', 'time', 'times',
            // Action/state words
            'said', 'says', 'saying', 'told', 'tell', 'telling', 'show', 'shows', 'showing', 'get', 'gets', 'getting', 'make', 'makes', 'making', 'take', 'takes', 'taking', 'using', 'used', 'use', 'uses',
            // Generic descriptors
            'very', 'much', 'many', 'some', 'any', 'all', 'most', 'few', 'little', 'big', 'small', 'large', 'good', 'bad', 'best', 'better', 'new', 'old', 'first', 'last', 'next', 'other', 'same', 'different'
        ];
        
        // Tech/cybersecurity priority keywords (get score boost)
        const priorityKeywords = [
            'security', 'cyber', 'cybersecurity', 'malware', 'ransomware', 'phishing', 'breach', 'hack', 'hacker', 'vulnerability', 'exploit', 'patch', 'update', 'firewall',
            'microsoft', 'windows', 'google', 'apple', 'android', 'linux', 'chrome', 'firefox', 'safari', 'edge',
            'artificial', 'intelligence', 'machine', 'learning', 'blockchain', 'cryptocurrency', 'bitcoin', 'ethereum',
            'cloud', 'server', 'database', 'network', 'encryption', 'password', 'authentication', 'privacy'
        ];
        
        this.articles.forEach(article => {
            const text = (article.title + ' ' + (article.summary || '')).toLowerCase();
            // Increase minimum word length to 5 to filter more noise
            const words = text.match(/\b[a-z]{5,}\b/g) || [];
            
            words.forEach(word => {
                if (!commonWords.includes(word)) {
                    let score = 1;
                    
                    // Boost score for priority tech/cyber keywords
                    if (priorityKeywords.includes(word)) {
                        score = 3;
                    }
                    
                    // Boost score for capitalized words in original text (proper nouns)
                    const originalText = article.title + ' ' + (article.summary || '');
                    const capitalizedPattern = new RegExp('\\b' + word.charAt(0).toUpperCase() + word.slice(1) + '\\b');
                    if (capitalizedPattern.test(originalText)) {
                        score *= 1.5;
                    }
                    
                    wordFreq[word] = (wordFreq[word] || 0) + score;
                }
            });
        });
        
        // Filter out words that appear in too many articles (overly common)
        const totalArticles = this.articles.length;
        const filteredWordFreq = {};
        
        Object.entries(wordFreq).forEach(([word, freq]) => {
            // Only include if word appears in less than 80% of articles OR is a priority keyword
            const priorityKeywords = [
                'security', 'cyber', 'cybersecurity', 'malware', 'ransomware', 'phishing', 'breach', 'hack', 'hacker', 'vulnerability', 'exploit', 'patch', 'update', 'firewall',
                'microsoft', 'windows', 'google', 'apple', 'android', 'linux', 'chrome', 'firefox', 'safari', 'edge'
            ];
            
            const articleAppearanceRate = freq / totalArticles;
            if (articleAppearanceRate < 0.8 || priorityKeywords.includes(word)) {
                filteredWordFreq[word] = freq;
            }
        });
        
        this.trendingTopics = Object.entries(filteredWordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8)
            .map(([word, count]) => ({ word, count }));
            
        this.renderTrendingTopics();
    }
    
    renderTrendingTopics() {
        const trendingSection = document.getElementById('trendingSection');
        const trendingTags = document.getElementById('trendingTags');
        
        if (this.trendingTopics.length === 0) {
            trendingSection.style.display = 'none';
            return;
        }
        
        trendingSection.style.display = 'block';
        trendingTags.innerHTML = this.trendingTopics.map(topic => {
            const isHot = topic.count > 3;
            return `<span class="trending-tag ${isHot ? 'hot' : ''}" onclick="newsAggregator.searchTrending('${topic.word}')">${topic.word} (${topic.count})</span>`;
        }).join('');
    }
    
    searchTrending(word) {
        document.getElementById('searchInput').value = word;
        this.handleSearch(word);
    }
    
    shareArticle(articleId, platform) {
        const article = this.articles.find(a => a.id === articleId);
        if (!article) return;
        
        const title = encodeURIComponent(article.title);
        const url = encodeURIComponent(article.link);
        const text = encodeURIComponent(`Check out this article: ${article.title}`);
        
        let shareUrl = '';
        switch (platform) {
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
                break;
            case 'linkedin':
                shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
                break;
            case 'email':
                shareUrl = `mailto:?subject=${title}&body=${text}%0A%0A${url}`;
                break;
        }
        
        if (shareUrl) {
            window.open(shareUrl, '_blank');
        }
    }
    
    toggleShareMenu(card) {
        // Close all other share menus first
        this.closeAllShareMenus();
        
        const shareButtons = card.querySelector('.share-buttons');
        if (shareButtons) {
            shareButtons.classList.toggle('active');
        }
    }
    
    closeAllShareMenus() {
        document.querySelectorAll('.share-buttons.active').forEach(menu => {
            menu.classList.remove('active');
        });
    }
    
    scrollToArticle(articleId) {
        const card = document.querySelector(`[data-article-id="${articleId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.animation = 'pulse 1s ease';
        }
    }

    async loadDynamicSources() {
        try {
            const response = await fetch('/api/sources');
            if (response.ok) {
                const sources = await response.json();
                const activeSources = sources.filter(source => source.status === 'active');
                const sourceNames = activeSources.map(source => source.name);
                
                const dynamicSourcesElement = document.getElementById('dynamicSources');
                if (sourceNames.length > 0) {
                    dynamicSourcesElement.textContent = `Sources: ${sourceNames.join(', ')}`;
                } else {
                    dynamicSourcesElement.textContent = 'Sources: None active';
                }
            }
        } catch (error) {
            console.error('Error loading dynamic sources for footer:', error);
            // Fallback to default sources
            document.getElementById('dynamicSources').textContent = 'Sources: BleepingComputer, Cybersecurity News, Neowin, AskWoody';
        }
    }

    startRealTimeClock() {
        const updateClock = () => {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            const date = now.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            document.getElementById('currentTime').textContent = time;
            document.getElementById('currentDate').textContent = date;
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }

    showAboutModal() {
        const modal = document.getElementById('aboutModal');
        
        // Update total processed articles count
        const totalProcessed = document.getElementById('totalProcessed');
        totalProcessed.textContent = this.articles.length > 0 ? `${this.articles.length}+` : 'Loading...';
        
        modal.style.display = 'flex';
    }

    closeAboutModal() {
        document.getElementById('aboutModal').style.display = 'none';
    }

    showMobileMenu() {
        const overlay = document.getElementById('mobileMenuOverlay');
        overlay.style.display = 'flex';
        
        // Update mobile menu button states to match current settings
        const mobileThemeBtn = document.getElementById('mobileThemeToggle');
        const mobileAutoRefreshBtn = document.getElementById('mobileAutoRefreshToggle');
        
        // Update theme toggle text
        const themeIcon = mobileThemeBtn.querySelector('i');
        const themeText = mobileThemeBtn.querySelector('span');
        if (this.isDarkTheme) {
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = 'Light Mode';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = 'Dark Mode';
        }
        
        // Update auto-refresh toggle text
        const autoRefreshText = mobileAutoRefreshBtn.querySelector('span');
        autoRefreshText.textContent = this.autoRefreshEnabled ? 'Auto Refresh: ON' : 'Auto Refresh: OFF';
    }

    closeMobileMenu() {
        document.getElementById('mobileMenuOverlay').style.display = 'none';
    }

    showArticlePreview(articleId) {
        const article = this.articles.find(a => a.id === articleId);
        if (!article) return;

        // Update modal content
        document.getElementById('previewSource').textContent = article.source;
        document.getElementById('previewCategory').textContent = article.category;
        document.getElementById('previewTime').textContent = this.getTimeAgo(article.scraped);
        document.getElementById('previewTitle').textContent = article.title;
        
        // Use AI summary if available, otherwise use regular summary, with fallback
        const content = article.aiSummary || article.summary || 'No summary available for this article.';
        document.getElementById('previewContent').textContent = content;

        // Update save button state
        const saveBtn = document.getElementById('previewSaveBtn');
        const isSaved = this.savedArticles.some(saved => saved.id === articleId);
        
        if (isSaved) {
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Remove from Saved';
        } else {
            saveBtn.classList.remove('saved');
            saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Save Article';
        }

        // Set up event listeners for modal actions
        saveBtn.onclick = () => {
            this.saveArticle(articleId);
            // Update button state after saving
            const newIsSaved = this.savedArticles.some(saved => saved.id === articleId);
            if (newIsSaved) {
                saveBtn.classList.add('saved');
                saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Remove from Saved';
            } else {
                saveBtn.classList.remove('saved');
                saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Save Article';
            }
        };

        document.getElementById('previewReadBtn').onclick = () => {
            this.markAsRead(articleId);
            window.open(article.url || article.link, '_blank', 'noopener,noreferrer');
            this.closeArticlePreview();
        };

        // Show modal
        document.getElementById('articlePreviewModal').style.display = 'flex';
    }

    closeArticlePreview() {
        document.getElementById('articlePreviewModal').style.display = 'none';
    }

    announceToScreenReader(message) {
        // Create or use existing aria-live region for announcements
        let announcer = document.getElementById('sr-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'sr-announcer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
            document.body.appendChild(announcer);
        }
        
        // Clear and set new message
        announcer.textContent = '';
        setTimeout(() => {
            announcer.textContent = message;
        }, 100);
    }

    handleArticleNavigation(direction) {
        const articles = document.querySelectorAll('.news-card a[href="javascript:void(0)"]');
        if (articles.length === 0) return;
        
        const currentFocus = document.activeElement;
        let currentIndex = -1;
        
        // Find current focused article
        articles.forEach((article, index) => {
            if (article === currentFocus) {
                currentIndex = index;
            }
        });
        
        // Navigate to next/previous article
        if (direction === 'ArrowDown') {
            const nextIndex = (currentIndex + 1) % articles.length;
            articles[nextIndex].focus();
        } else if (direction === 'ArrowUp') {
            const prevIndex = currentIndex <= 0 ? articles.length - 1 : currentIndex - 1;
            articles[prevIndex].focus();
        }
    }

    // ==================== COLLECTIONS MANAGEMENT ====================

    updateCollectionsCount() {
        const count = this.collectionManager.getAllCollections().length;
        document.getElementById('collectionsCount').textContent = count;
    }

    showCollectionsManager() {
        this.renderCollectionsList();
        document.getElementById('collectionsModal').style.display = 'flex';
    }

    closeCollectionsManager() {
        document.getElementById('collectionsModal').style.display = 'none';
    }

    // Analytics Dashboard Methods
    showAnalyticsDashboard() {
        this.renderAnalyticsDashboard();
        document.getElementById('analyticsModal').style.display = 'flex';
    }

    closeAnalytics() {
        document.getElementById('analyticsModal').style.display = 'none';
        // Destroy charts to prevent memory leaks
        if (this.analyticsCharts) {
            Object.values(this.analyticsCharts).forEach(chart => {
                if (chart) chart.destroy();
            });
            this.analyticsCharts = {};
        }
    }

    renderAnalyticsDashboard() {
        const analytics = this.analytics;

        // Get all analytics data
        const stats = analytics.data.stats;
        const streaks = analytics.data.streaks;
        const todayReads = analytics.getArticlesReadToday();
        const goals = analytics.data.goals;

        // Update overview cards
        document.getElementById('totalReads').textContent = stats.totalArticlesRead;
        document.getElementById('todayReads').textContent = todayReads;
        document.getElementById('currentStreak').textContent = streaks.current;

        // Format time spent
        const totalMinutes = Math.floor(stats.totalTimeSpent / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const timeText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        document.getElementById('totalTime').textContent = timeText;

        // Update goal progress
        const goalProgress = (todayReads / goals.dailyArticles) * 100;
        document.getElementById('goalProgressBar').style.width = `${Math.min(goalProgress, 100)}%`;
        document.getElementById('goalText').textContent = `${todayReads} / ${goals.dailyArticles} articles`;

        // Update reading patterns
        const timePatterns = analytics.getTimePatterns();
        document.getElementById('peakHour').textContent = timePatterns.peakHour || '-';
        document.getElementById('mostActiveDay').textContent = timePatterns.mostActiveDay || '-';
        document.getElementById('avgDaily').textContent = timePatterns.averagePerDay.toFixed(1);
        document.getElementById('longestStreak').textContent = `${streaks.longest} days`;

        // Render insights
        this.renderInsights();

        // Initialize charts
        this.initializeAnalyticsCharts();
    }

    renderInsights() {
        const insights = this.analytics.getInsights();
        const container = document.getElementById('insightsContainer');
        const section = document.getElementById('insightsSection');

        if (insights.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = insights.map(insight => `
            <div class="insight-card insight-${insight.type}">
                <span class="insight-icon">${insight.icon}</span>
                <div class="insight-content">
                    <div class="insight-title">${insight.title}</div>
                    <div class="insight-message">${insight.message}</div>
                </div>
            </div>
        `).join('');
    }

    initializeAnalyticsCharts() {
        // Destroy existing charts if any
        if (this.analyticsCharts) {
            Object.values(this.analyticsCharts).forEach(chart => {
                if (chart) chart.destroy();
            });
        }

        this.analyticsCharts = {};

        // Activity chart (line chart - last 30 days)
        const activityData = this.analytics.getActivityByDate(30);
        const activityCtx = document.getElementById('activityChart');
        if (activityCtx) {
            this.analyticsCharts.activity = new Chart(activityCtx, {
                type: 'line',
                data: {
                    labels: activityData.map(d => d.date),
                    datasets: [{
                        label: 'Articles Read',
                        data: activityData.map(d => d.count),
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                font: {
                                    size: 10
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                font: {
                                    size: 11
                                }
                            }
                        }
                    }
                }
            });
        }

        // Category distribution (doughnut chart)
        const categoryData = this.analytics.getCategoryDistribution();
        const categoryCtx = document.getElementById('categoryChart');
        if (categoryCtx && categoryData.length > 0) {
            this.analyticsCharts.category = new Chart(categoryCtx, {
                type: 'doughnut',
                data: {
                    labels: categoryData.map(c => c.name),
                    datasets: [{
                        data: categoryData.map(c => c.count),
                        backgroundColor: [
                            '#667eea',
                            '#764ba2',
                            '#f093fb',
                            '#4facfe',
                            '#43e97b',
                            '#fa709a',
                            '#feca57'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: {
                                    size: 11
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    exportAnalytics(format) {
        const data = this.analytics.exportData(format);
        const blob = new Blob([data], {
            type: format === 'json' ? 'application/json' : 'text/csv'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reading-analytics-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification(`Analytics exported as ${format.toUpperCase()}`, 'success');
    }

    clearAnalytics() {
        if (!confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
            return;
        }

        this.analytics.clearAllData();
        this.renderAnalyticsDashboard();
        this.showNotification('All analytics data cleared', 'success');
    }

    renderCollectionsList() {
        const collections = this.collectionManager.getAllCollections();
        const container = document.getElementById('collectionsList');

        if (collections.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>No collections yet</p>
                    <p class="empty-state-hint">Create your first collection to organize articles</p>
                </div>
            `;
            return;
        }

        container.innerHTML = collections.map(collection => {
            const articleCount = collection.articleIds.length;
            return `
                <div class="collection-card" style="border-left-color: ${collection.color};">
                    <div class="collection-card-header">
                        <div class="collection-card-title">
                            <i class="fas ${collection.icon}" style="color: ${collection.color};"></i>
                            <h4>${this.escapeHtml(collection.name)}</h4>
                        </div>
                        <div class="collection-card-actions">
                            <button class="icon-btn" onclick="newsAggregator.openCollectionEditor('${collection.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="icon-btn" onclick="newsAggregator.deleteCollectionConfirm('${collection.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <p class="collection-card-description">${this.escapeHtml(collection.description || 'No description')}</p>
                    <div class="collection-card-footer">
                        <span class="collection-article-count">
                            <i class="fas fa-file-alt"></i>
                            ${articleCount} article${articleCount !== 1 ? 's' : ''}
                        </span>
                        <button class="btn-view-collection" onclick="newsAggregator.viewCollection('${collection.id}')">
                            View <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openCollectionEditor(collectionId = null) {
        this.editingCollection = collectionId;
        const modal = document.getElementById('collectionEditModal');
        const form = document.getElementById('collectionEditForm');
        const modeText = document.getElementById('collectionEditMode');

        if (collectionId) {
            // Edit mode
            const collection = this.collectionManager.getCollection(collectionId);
            if (!collection) return;

            modeText.textContent = 'Edit';
            document.getElementById('editingCollectionId').value = collectionId;
            document.getElementById('collectionName').value = collection.name;
            document.getElementById('collectionDescription').value = collection.description;
            document.getElementById('collectionColor').value = collection.color;
            document.getElementById('collectionIcon').value = collection.icon;

            // Update UI selections
            this.selectColor(collection.color);
            this.selectIcon(collection.icon);
        } else {
            // Create mode
            modeText.textContent = 'Create';
            form.reset();
            document.getElementById('editingCollectionId').value = '';
            this.selectColor('#667eea');
            this.selectIcon('fa-folder');
        }

        modal.style.display = 'flex';
    }

    closeCollectionEditor() {
        document.getElementById('collectionEditModal').style.display = 'none';
        this.editingCollection = null;
    }

    selectColor(color) {
        document.getElementById('collectionColor').value = color;
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.color === color);
        });
    }

    selectIcon(icon) {
        document.getElementById('collectionIcon').value = icon;
        document.querySelectorAll('.icon-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.icon === icon);
        });
    }

    saveCollection(event) {
        event.preventDefault();

        const name = document.getElementById('collectionName').value.trim();
        const description = document.getElementById('collectionDescription').value.trim();
        const color = document.getElementById('collectionColor').value;
        const icon = document.getElementById('collectionIcon').value;
        const editingId = document.getElementById('editingCollectionId').value;

        if (!name) {
            this.showNotification('Please enter a collection name', 'error');
            return;
        }

        if (editingId) {
            // Update existing collection
            this.collectionManager.updateCollection(editingId, {
                name,
                description,
                color,
                icon
            });
            this.showNotification('Collection updated successfully');
        } else {
            // Create new collection
            this.collectionManager.createCollection(name, description, color, icon);
            this.showNotification('Collection created successfully');
        }

        this.closeCollectionEditor();
        this.renderCollectionsList();
        this.updateCollectionsCount();
    }

    deleteCollectionConfirm(collectionId) {
        const collection = this.collectionManager.getCollection(collectionId);
        if (!collection) return;

        const articleCount = collection.articleIds.length;
        const message = articleCount > 0
            ? `Delete "${collection.name}"? This collection contains ${articleCount} article${articleCount !== 1 ? 's' : ''}. Articles will not be deleted, only removed from this collection.`
            : `Delete "${collection.name}"?`;

        if (confirm(message)) {
            this.collectionManager.deleteCollection(collectionId);
            this.showNotification('Collection deleted');
            this.renderCollectionsList();
            this.updateCollectionsCount();

            // Remove collection references from saved articles
            this.savedArticles = this.savedArticles.map(article => ({
                ...article,
                collections: (article.collections || []).filter(id => id !== collectionId)
            }));
            localStorage.setItem('savedArticles', JSON.stringify(this.savedArticles));
        }
    }

    viewCollection(collectionId) {
        const collection = this.collectionManager.getCollection(collectionId);
        if (!collection) return;

        this.currentViewingCollection = collectionId;

        // Update header
        document.getElementById('collectionViewName').textContent = collection.name;
        document.getElementById('collectionViewDescription').textContent = collection.description || 'No description';
        document.getElementById('collectionViewIcon').className = `fas ${collection.icon}`;
        document.getElementById('collectionViewIcon').style.color = collection.color;

        // Get articles in this collection
        const articles = this.savedArticles.filter(a =>
            collection.articleIds.includes(a.id)
        );

        // Update article count
        document.getElementById('collectionArticleCount').textContent =
            `${articles.length} article${articles.length !== 1 ? 's' : ''}`;

        // Render articles
        const container = document.getElementById('collectionArticles');
        if (articles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No articles in this collection</p>
                    <p class="empty-state-hint">Save articles and add them to this collection</p>
                </div>
            `;
        } else {
            container.innerHTML = articles.map(article => `
                <div class="collection-article-item">
                    <div class="collection-article-info">
                        <h4>${this.escapeHtml(article.title)}</h4>
                        <p>${this.escapeHtml(this.truncateText(article.summary || '', 100))}</p>
                        <div class="collection-article-meta">
                            <span><i class="fas fa-newspaper"></i> ${this.escapeHtml(article.source)}</span>
                            <span><i class="fas fa-calendar"></i> ${new Date(article.savedAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="collection-article-actions">
                        <button class="icon-btn" onclick="window.open('${article.url || article.link}', '_blank')" title="Open article">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="icon-btn" onclick="newsAggregator.removeFromCollection('${collectionId}', '${article.id}')" title="Remove from collection">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Show modal
        this.closeCollectionsManager();
        document.getElementById('collectionViewModal').style.display = 'flex';
    }

    closeCollectionView() {
        document.getElementById('collectionViewModal').style.display = 'none';
        document.getElementById('exportOptions').style.display = 'none';
        this.currentViewingCollection = null;
    }

    removeFromCollection(collectionId, articleId) {
        this.collectionManager.removeArticleFromCollection(collectionId, articleId);

        // Update saved article's collection list
        const article = this.savedArticles.find(a => a.id === articleId);
        if (article) {
            article.collections = (article.collections || []).filter(id => id !== collectionId);
            localStorage.setItem('savedArticles', JSON.stringify(this.savedArticles));
        }

        this.showNotification('Removed from collection');
        this.viewCollection(collectionId); // Refresh view
    }

    toggleExportOptions() {
        const exportOptions = document.getElementById('exportOptions');
        exportOptions.style.display = exportOptions.style.display === 'none' ? 'flex' : 'none';
    }

    exportCollection(format) {
        if (!this.currentViewingCollection) return;

        const collectionId = this.currentViewingCollection;
        const collection = this.collectionManager.getCollection(collectionId);
        if (!collection) return;

        let content, filename, mimeType;

        switch (format) {
            case 'json':
                content = JSON.stringify(
                    this.collectionManager.exportToJSON(collectionId, this.savedArticles),
                    null,
                    2
                );
                filename = `${collection.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                mimeType = 'application/json';
                break;

            case 'markdown':
                content = this.collectionManager.exportToMarkdown(collectionId, this.savedArticles);
                filename = `${collection.name.replace(/[^a-z0-9]/gi, '_')}.md`;
                mimeType = 'text/markdown';
                break;

            case 'csv':
                content = this.collectionManager.exportToCSV(collectionId, this.savedArticles);
                filename = `${collection.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
                mimeType = 'text/csv';
                break;

            case 'html':
                content = this.collectionManager.exportToHTML(collectionId, this.savedArticles);
                filename = `${collection.name.replace(/[^a-z0-9]/gi, '_')}.html`;
                mimeType = 'text/html';
                break;

            default:
                this.showNotification('Unknown export format', 'error');
                return;
        }

        // Create download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification(`Exported as ${format.toUpperCase()}`);
        this.toggleExportOptions();
    }

    showCollectionSelectorForArticle(articleId) {
        const article = this.savedArticles.find(a => a.id === articleId);
        if (!article) return;

        const collections = this.collectionManager.getAllCollections();
        const articleCollections = this.collectionManager.getCollectionsForArticle(articleId);
        const articleCollectionIds = articleCollections.map(c => c.id);

        const selectorHTML = `
            <div class="collection-selector-overlay" onclick="this.remove()">
                <div class="collection-selector-modal" onclick="event.stopPropagation()">
                    <h4><i class="fas fa-folder-plus"></i> Add to Collections</h4>
                    <p class="selector-article-title">${this.escapeHtml(this.truncateText(article.title, 60))}</p>
                    <div class="collection-checkboxes">
                        ${collections.map(col => `
                            <label class="collection-checkbox-item">
                                <input type="checkbox"
                                       data-collection-id="${col.id}"
                                       ${articleCollectionIds.includes(col.id) ? 'checked' : ''}
                                       onchange="newsAggregator.toggleArticleCollection('${articleId}', '${col.id}', this.checked)">
                                <span class="checkbox-custom"></span>
                                <i class="fas ${col.icon}" style="color: ${col.color};"></i>
                                <span>${this.escapeHtml(col.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                    <button class="btn-primary" onclick="this.closest('.collection-selector-overlay').remove(); newsAggregator.showSavedArticles();">
                        Done
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', selectorHTML);
    }

    toggleArticleCollection(articleId, collectionId, isChecked) {
        if (isChecked) {
            this.collectionManager.addArticleToCollection(collectionId, articleId);
            this.showNotification('Added to collection');
        } else {
            this.collectionManager.removeArticleFromCollection(collectionId, articleId);
            this.showNotification('Removed from collection');
        }
    }

    renderPagination() {
        const paginationContainer = document.getElementById('paginationControls');
        if (!paginationContainer) return;

        const totalPages = Math.ceil(this.filteredArticles.length / this.articlesPerPage);

        if (totalPages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';

        // Generate page buttons
        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}"
                    onclick="newsAggregator.changePage(${this.currentPage - 1})"
                    ${this.currentPage === 1 ? 'disabled' : ''}
                    aria-label="Previous page">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // First page
        if (this.currentPage > 3) {
            paginationHTML += `
                <button class="pagination-btn" onclick="newsAggregator.changePage(1)">1</button>
            `;
            if (this.currentPage > 4) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        // Page numbers around current page
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}"
                        onclick="newsAggregator.changePage(${i})"
                        aria-label="Page ${i}"
                        ${i === this.currentPage ? 'aria-current="page"' : ''}>
                    ${i}
                </button>
            `;
        }

        // Last page
        if (this.currentPage < totalPages - 2) {
            if (this.currentPage < totalPages - 3) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
            paginationHTML += `
                <button class="pagination-btn" onclick="newsAggregator.changePage(${totalPages})">${totalPages}</button>
            `;
        }

        // Next button
        paginationHTML += `
            <button class="pagination-btn ${this.currentPage === totalPages ? 'disabled' : ''}"
                    onclick="newsAggregator.changePage(${this.currentPage + 1})"
                    ${this.currentPage === totalPages ? 'disabled' : ''}
                    aria-label="Next page">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        // Page info
        const startItem = (this.currentPage - 1) * this.articlesPerPage + 1;
        const endItem = Math.min(this.currentPage * this.articlesPerPage, this.filteredArticles.length);
        paginationHTML += `
            <span class="pagination-info">
                ${startItem}-${endItem} of ${this.filteredArticles.length}
            </span>
        `;

        paginationContainer.innerHTML = paginationHTML;
    }

    changePage(page) {
        const totalPages = Math.ceil(this.filteredArticles.length / this.articlesPerPage);

        if (page < 1 || page > totalPages) return;

        this.currentPage = page;
        this.renderNews();

        // Announce page change to screen readers
        this.announceToScreenReader(`Now on page ${page} of ${totalPages}`);
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
    }
`;
document.head.appendChild(style);

window.refreshNews = function() {
    window.newsAggregator.refreshNews();
};

window.closeSavedModal = function() {
    window.newsAggregator.closeSavedModal();
};

window.closeAboutModal = function() {
    window.newsAggregator.closeAboutModal();
};

document.addEventListener('DOMContentLoaded', () => {
    window.newsAggregator = new NewsAggregator();
});