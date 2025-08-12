class NewsAggregator {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.currentFilter = 'all';
        this.savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
        this.readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        this.isDarkTheme = localStorage.getItem('darkTheme') === 'true';
        this.autoRefreshEnabled = localStorage.getItem('autoRefresh') === 'true';
        this.autoRefreshInterval = null;
        this.searchQuery = '';
        this.trendingTopics = [];
        this.init();
    }

    init() {
        this.bindEventListeners();
        this.applyTheme();
        this.updateSavedCount();
        this.setupAutoRefresh();
        this.updateSourcesCount();
        this.loadNews();
        this.loadDynamicSources();
    }

    bindEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshNews());
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterNews(e.target.dataset.filter));
        });
        
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('autoRefreshToggle').addEventListener('click', () => this.toggleAutoRefresh());
        document.getElementById('savedArticlesBtn').addEventListener('click', () => this.showSavedArticles());
        
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        clearSearch.addEventListener('click', () => this.clearSearch());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSavedModal();
            }
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
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
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
        const reliabilityScore = this.getReliabilityScore(article.source);
        const relatedArticles = this.getRelatedArticles(article);
        
        return `
            <div class="news-card ${isSaved ? 'saved' : ''} ${isRead ? 'read' : ''}" data-article-id="${article.id}">
                <div class="card-actions">
                    <button class="action-btn save-btn ${isSaved ? 'saved' : ''}" title="${isSaved ? 'Remove from saved' : 'Save article'}">
                        <i class="${isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'}"></i>
                    </button>
                    <button class="action-btn share-btn" title="Share article">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
                
                ${article.image ? `
                    <img src="${article.image}" alt="Article image" class="news-card-image" onerror="this.style.display='none'">
                ` : ''}
                
                <div class="card-header">
                    <div class="source-info">
                        <span class="source-badge">${article.source}</span>
                        <div class="reliability-score">
                            <span class="reliability-stars">${'★'.repeat(reliabilityScore)}${'☆'.repeat(5-reliabilityScore)}</span>
                        </div>
                    </div>
                    <span class="category-badge">
                        <i class="${categoryIcon}"></i>
                        ${article.category}
                    </span>
                </div>
                
                <div class="reading-time">
                    <i class="fas fa-clock"></i>
                    ~${readingTime} min read
                </div>
                
                <h3 class="news-title">
                    <a href="${article.link}" target="_blank" rel="noopener noreferrer" onclick="newsAggregator.markAsRead('${article.id}')">
                        ${this.escapeHtml(article.title)}
                    </a>
                </h3>
                
                ${article.aiSummary ? `
                    <div class="ai-summary">
                        ${this.escapeHtml(article.aiSummary)}
                    </div>
                ` : ''}
                
                <div class="news-summary">
                    ${this.escapeHtml(this.truncateText(article.summary, 150))}
                </div>
                
                ${relatedArticles.length > 0 ? `
                    <div class="related-articles">
                        <div class="related-title">Related Articles:</div>
                        ${relatedArticles.map(related => `
                            <div class="related-item" onclick="newsAggregator.scrollToArticle('${related.id}')">
                                ${this.truncateText(related.title, 60)}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="share-buttons">
                    <button class="share-btn" onclick="newsAggregator.shareArticle('${article.id}', 'twitter')">
                        <i class="fab fa-twitter"></i> Twitter
                    </button>
                    <button class="share-btn" onclick="newsAggregator.shareArticle('${article.id}', 'linkedin')">
                        <i class="fab fa-linkedin"></i> LinkedIn
                    </button>
                    <button class="share-btn" onclick="newsAggregator.shareArticle('${article.id}', 'email')">
                        <i class="fas fa-envelope"></i> Email
                    </button>
                </div>
                
                <div class="card-footer">
                    <span class="publish-date">
                        <i class="fas fa-clock"></i>
                        ${timeAgo}
                    </span>
                    <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="read-more" onclick="newsAggregator.markAsRead('${article.id}')">
                        Read More
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </div>
        `;
    }

    getCategoryIcon(category) {
        const icons = {
            'Cybersecurity': 'fas fa-shield-alt',
            'Technology': 'fas fa-microchip'
        };
        return icons[category] || 'fas fa-newspaper';
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
        document.getElementById('totalArticles').textContent = this.filteredArticles.length;
        
        const lastUpdate = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = lastUpdate;
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
                    'TechCrunch': 'fas fa-rocket'
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
            document.getElementById('totalSources').textContent = '5';
            document.getElementById('sourceIcons').innerHTML = '<i class="fas fa-bug" title="BleepingComputer"></i><i class="fas fa-shield-alt" title="Cybersecurity News"></i><i class="fas fa-window-maximize" title="Neowin"></i><i class="fas fa-question-circle" title="AskWoody"></i><i class="fas fa-rocket" title="TechCrunch"></i>';
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
        return btoa(encodeURIComponent(article.title + article.source + article.scraped)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
    
    applyCurrentFilters() {
        let filtered = [...this.articles];
        
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(article => article.category === this.currentFilter);
        }
        
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(article => 
                article.title.toLowerCase().includes(query) ||
                (article.summary && article.summary.toLowerCase().includes(query)) ||
                article.source.toLowerCase().includes(query)
            );
        }
        
        this.filteredArticles = filtered;
    }
    
    handleSearch(query) {
        this.searchQuery = query;
        const clearBtn = document.getElementById('clearSearch');
        clearBtn.style.display = query ? 'block' : 'none';
        
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
    }
    
    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearch').style.display = 'none';
        this.searchQuery = '';
        this.applyCurrentFilters();
        this.renderNews();
        this.updateStats();
    }
    
    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
        localStorage.setItem('darkTheme', this.isDarkTheme);
        this.applyTheme();
    }
    
    applyTheme() {
        const body = document.body;
        const themeBtn = document.getElementById('themeToggle');
        const themeIcon = themeBtn.querySelector('i');
        
        if (this.isDarkTheme) {
            body.classList.add('dark-theme');
            themeIcon.className = 'fas fa-sun';
            themeBtn.classList.add('active');
        } else {
            body.classList.remove('dark-theme');
            themeIcon.className = 'fas fa-moon';
            themeBtn.classList.remove('active');
        }
    }
    
    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        localStorage.setItem('autoRefresh', this.autoRefreshEnabled);
        this.setupAutoRefresh();
        
        const autoRefreshBtn = document.getElementById('autoRefreshToggle');
        autoRefreshBtn.classList.toggle('active', this.autoRefreshEnabled);
        
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
        autoRefreshBtn.classList.toggle('active', this.autoRefreshEnabled);
        
        if (this.autoRefreshEnabled) {
            this.autoRefreshInterval = setInterval(() => {
                this.refreshNews();
            }, 15 * 60 * 1000);
        }
    }
    
    saveArticle(articleId) {
        const article = this.articles.find(a => a.id === articleId);
        if (!article) return;
        
        const existingIndex = this.savedArticles.findIndex(saved => saved.id === articleId);
        if (existingIndex > -1) {
            this.savedArticles.splice(existingIndex, 1);
            this.showNotification('Article removed from saved', 'info');
        } else {
            this.savedArticles.push({
                ...article,
                savedAt: new Date().toISOString()
            });
            this.showNotification('Article saved successfully');
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
        const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'do', 'does', 'did', 'a', 'an', 'this', 'that', 'these', 'those'];
        
        this.articles.forEach(article => {
            const text = (article.title + ' ' + (article.summary || '')).toLowerCase();
            const words = text.match(/\b[a-z]{4,}\b/g) || [];
            
            words.forEach(word => {
                if (!commonWords.includes(word)) {
                    wordFreq[word] = (wordFreq[word] || 0) + 1;
                }
            });
        });
        
        this.trendingTopics = Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
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

document.addEventListener('DOMContentLoaded', () => {
    window.newsAggregator = new NewsAggregator();
});