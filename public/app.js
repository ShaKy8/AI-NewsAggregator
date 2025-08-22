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
        this.excludedKeywords = JSON.parse(localStorage.getItem('excludedKeywords') || '[]');
        this.includedKeywords = JSON.parse(localStorage.getItem('includedKeywords') || '[]');
        this.showHiddenArticles = false;
        this.showOnlyIncluded = false;
        this.hiddenArticlesCount = 0;
        this.includedArticlesCount = 0;
        this.init();
    }

    init() {
        this.bindEventListeners();
        this.applyTheme();
        this.updateSavedCount();
        this.setupAutoRefresh();
        this.updateSourcesCount();
        this.startRealTimeClock();
        this.setupStickyHeader();
        this.renderExclusionTags();
        this.renderIncludeTags();
        this.loadNews();
        this.loadDynamicSources();
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
        
        document.getElementById('savedArticlesBtn').addEventListener('click', () => this.showSavedArticles());
        
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
        clearSearch.addEventListener('click', () => this.clearSearch());
        
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
        
        // Exclusion filter event listeners
        document.getElementById('exclusionInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addExclusionKeyword();
            }
        });
        
        document.getElementById('addExclusionBtn').addEventListener('click', () => {
            this.addExclusionKeyword();
        });
        
        document.getElementById('showHiddenBtn').addEventListener('click', () => {
            this.toggleHiddenArticles();
        });
        
        document.getElementById('clearExclusionsBtn').addEventListener('click', () => {
            this.clearAllExclusions();
        });
        
        // Exclusion preset button event listeners
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.addExclusionKeyword(e.target.dataset.keyword);
            });
        });
        
        // Include filter event listeners
        document.getElementById('includeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addIncludeKeyword();
            }
        });
        
        document.getElementById('addIncludeBtn').addEventListener('click', () => {
            this.addIncludeKeyword();
        });
        
        document.getElementById('showOnlyIncludedBtn').addEventListener('click', () => {
            this.toggleOnlyIncluded();
        });
        
        document.getElementById('clearIncludesBtn').addEventListener('click', () => {
            this.clearAllIncludes();
        });
        
        // Include preset button event listeners
        document.querySelectorAll('.include-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.addIncludeKeyword(e.target.dataset.keyword);
            });
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
                const errorData = await response.json();
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
            const errorMessage = error.message.includes('network') || error.message.includes('source') 
                ? 'Network or source error. Some news sources may be temporarily unavailable.'
                : 'Failed to refresh news. Please try again.';
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
            return;
        }
        
        newsGrid.style.display = 'grid';
        noArticles.style.display = 'none';
        
        newsGrid.innerHTML = this.filteredArticles.map(article => this.createArticleCard(article)).join('');
        
        newsGrid.querySelectorAll('.news-card').forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            card.classList.add('fade-in');
        });
        
        this.bindCardEventListeners();
    }

    createArticleCard(article) {
        const categoryIcon = this.getCategoryIcon(article.category);
        const timeAgo = this.getTimeAgo(article.scraped);
        const isSaved = this.savedArticles.some(saved => saved.id === article.id);
        const isRead = this.readArticles.includes(article.id);
        const readingTime = this.calculateReadingTime(article.summary || '');
        
        // Combine AI summary with regular summary for simplified display
        const combinedSummary = article.aiSummary || article.summary || '';
        
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
                </div>
                
                <!-- 2. Article Title (Primary CTA) -->
                <h3 class="news-title" id="title-${article.id}">
                    <a href="javascript:void(0)" 
                       onclick="newsAggregator.showArticlePreview('${article.id}')"
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
                </div>
            </article>
        `;
    }

    getCategoryIcon(category) {
        const icons = {
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
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStats() {
        const total = this.filteredArticles.length;
        let totalText = total.toString();
        
        // Enhanced stats display for filter interactions
        if (this.includedKeywords.length > 0 || this.excludedKeywords.length > 0) {
            const baseTotal = this.articles.length;
            const filterInfo = [];
            
            if (this.includedKeywords.length > 0) {
                filterInfo.push(`${this.includedArticlesCount} included`);
            }
            
            if (this.excludedKeywords.length > 0 && this.hiddenArticlesCount > 0) {
                filterInfo.push(`${this.hiddenArticlesCount} hidden`);
            }
            
            if (filterInfo.length > 0) {
                totalText = `${total} of ${baseTotal} (${filterInfo.join(', ')})`;
            } else {
                totalText = `${total} of ${baseTotal}`;
            }
        } else if (total !== this.articles.length) {
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
        const techCount = this.articles.filter(article => article.category === 'Technology').length;
        const securityCount = this.articles.filter(article => article.category === 'Cybersecurity').length;
        const aiCount = this.articles.filter(article => this.isAIRelated(article)).length;

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
                case 'Technology':
                    count = techCount;
                    label = 'Tech';
                    break;
                case 'Cybersecurity':
                    count = securityCount;
                    label = 'Security';
                    break;
                case 'AI':
                    count = aiCount;
                    label = 'AI';
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
        this.articles = this.articles.map(article => ({
            ...article,
            id: article.id || this.generateId(article)
        }));
    }
    
    generateId(article) {
        // Use title + source + link for stable IDs that don't change on refresh
        const uniqueString = article.title + article.source + (article.link || '');
        return btoa(encodeURIComponent(uniqueString)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
    
    applyCurrentFilters() {
        let filtered = [...this.articles];
        let excluded = [];
        
        if (this.currentFilter !== 'all') {
            if (this.currentFilter === 'AI') {
                filtered = filtered.filter(article => this.isAIRelated(article));
            } else {
                filtered = filtered.filter(article => article.category === this.currentFilter);
            }
        }
        
        if (this.currentAgeFilter !== 'all') {
            filtered = filtered.filter(article => this.isArticleInAgeRange(article, this.currentAgeFilter));
        }
        
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(article => 
                article.title.toLowerCase().includes(query) ||
                (article.summary && article.summary.toLowerCase().includes(query)) ||
                article.source.toLowerCase().includes(query)
            );
        }
        
        // Apply inclusion filters first (unless showing only included articles)
        if (this.includedKeywords.length > 0) {
            const beforeInclusionCount = filtered.length;
            const included = filtered.filter(article => this.isArticleIncluded(article));
            const notIncluded = filtered.filter(article => !this.isArticleIncluded(article));
            
            if (this.showOnlyIncluded) {
                this.filteredArticles = included;
                this.includedArticlesCount = included.length;
                this.hiddenArticlesCount = notIncluded.length;
                this.updateHiddenControls();
                this.updateIncludeControls();
                return;
            } else {
                filtered = included;
                this.includedArticlesCount = included.length;
            }
        } else {
            this.includedArticlesCount = 0;
        }
        
        // Apply exclusion filters (unless showing hidden articles)
        if (this.excludedKeywords.length > 0 && !this.showHiddenArticles) {
            const beforeExclusionCount = filtered.length;
            filtered = filtered.filter(article => !this.isArticleExcluded(article));
            excluded = this.articles.filter(article => this.isArticleExcluded(article));
            this.hiddenArticlesCount = beforeExclusionCount - filtered.length;
        } else if (this.includedKeywords.length === 0) {
            this.hiddenArticlesCount = 0;
        }
        
        this.filteredArticles = this.showHiddenArticles ? [...filtered, ...excluded] : filtered;
        this.updateHiddenControls();
        this.updateIncludeControls();
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
    
    handleSearch(query) {
        this.searchQuery = query;
        const clearBtn = document.getElementById('clearSearch');
        clearBtn.style.display = query ? 'block' : 'none';
        
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
        this.updateFilterCounts();
        
        // Announce search results to screen readers
        if (query) {
            setTimeout(() => {
                this.announceToScreenReader(`Search for "${query}" found ${this.filteredArticles.length} articles`);
            }, 500);
        }
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
            articlesList.innerHTML = this.savedArticles.map(article => `
                <div class="saved-article-item" onclick="window.open('${article.link}', '_blank')">
                    <div class="saved-article-info">
                        <h4>${this.escapeHtml(article.title)}</h4>
                        <p>${this.escapeHtml(this.truncateText(article.summary || '', 100))}</p>
                        <div class="saved-article-meta">
                            <span><i class="fas fa-tag"></i> ${article.category}</span>
                            <span><i class="fas fa-globe"></i> ${article.source}</span>
                            <span><i class="fas fa-bookmark"></i> ${this.getTimeAgo(article.savedAt)}</span>
                        </div>
                    </div>
                    <button class="remove-saved" onclick="event.stopPropagation(); newsAggregator.removeSavedArticle('${article.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
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
            window.open(article.link, '_blank', 'noopener,noreferrer');
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