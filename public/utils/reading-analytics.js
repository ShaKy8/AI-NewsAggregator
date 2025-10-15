/**
 * ReadingAnalytics - Comprehensive reading behavior tracking and analytics
 * Tracks user reading patterns, preferences, and provides insights
 */
class ReadingAnalytics {
    constructor() {
        this.storageKey = 'readingAnalytics';
        this.maxEvents = 1000; // Keep last 1000 events for performance
        this.data = this.loadData();
        this.ensureDataStructure();
    }

    /**
     * Load analytics data from localStorage
     */
    loadData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : this.getDefaultData();
        } catch (error) {
            console.error('Error loading analytics data:', error);
            return this.getDefaultData();
        }
    }

    /**
     * Get default analytics data structure
     */
    getDefaultData() {
        return {
            events: [],
            streaks: {
                current: 0,
                longest: 0,
                lastActive: null
            },
            goals: {
                dailyArticles: 5,
                weeklyArticles: 25
            },
            stats: {
                totalArticlesRead: 0,
                totalArticlesSaved: 0,
                totalSearches: 0,
                totalTimeSpent: 0, // in seconds
                accountCreated: new Date().toISOString()
            }
        };
    }

    /**
     * Ensure data structure has all required fields
     */
    ensureDataStructure() {
        const defaults = this.getDefaultData();

        // Merge with defaults to ensure all fields exist
        this.data = {
            ...defaults,
            ...this.data,
            streaks: { ...defaults.streaks, ...this.data.streaks },
            goals: { ...defaults.goals, ...this.data.goals },
            stats: { ...defaults.stats, ...this.data.stats }
        };

        if (!Array.isArray(this.data.events)) {
            this.data.events = [];
        }
    }

    /**
     * Save analytics data to localStorage
     */
    saveData() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            return true;
        } catch (error) {
            console.error('Error saving analytics data:', error);
            return false;
        }
    }

    /**
     * Track an event
     * @param {string} eventType - Type of event (article_read, article_saved, search, etc.)
     * @param {object} eventData - Event-specific data
     */
    trackEvent(eventType, eventData = {}) {
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...eventData
        };

        this.data.events.push(event);

        // Update statistics
        this.updateStats(eventType, eventData);

        // Maintain event limit
        if (this.data.events.length > this.maxEvents) {
            this.data.events = this.data.events.slice(-this.maxEvents);
        }

        this.saveData();
    }

    /**
     * Update statistics based on event type
     */
    updateStats(eventType, eventData) {
        const today = new Date().toISOString().split('T')[0];

        switch (eventType) {
            case 'article_read':
                this.data.stats.totalArticlesRead++;
                this.updateStreak(today);
                if (eventData.readingTime) {
                    this.data.stats.totalTimeSpent += eventData.readingTime;
                }
                break;

            case 'article_saved':
                this.data.stats.totalArticlesSaved++;
                break;

            case 'search':
                this.data.stats.totalSearches++;
                break;
        }
    }

    /**
     * Update reading streak
     */
    updateStreak(today) {
        const lastActive = this.data.streaks.lastActive;

        if (!lastActive) {
            // First day
            this.data.streaks.current = 1;
            this.data.streaks.longest = 1;
            this.data.streaks.lastActive = today;
            return;
        }

        const lastDate = new Date(lastActive);
        const currentDate = new Date(today);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Same day, no streak change
            return;
        } else if (diffDays === 1) {
            // Consecutive day, increment streak
            this.data.streaks.current++;
            if (this.data.streaks.current > this.data.streaks.longest) {
                this.data.streaks.longest = this.data.streaks.current;
            }
        } else {
            // Streak broken, restart
            this.data.streaks.current = 1;
        }

        this.data.streaks.lastActive = today;
    }

    /**
     * Get articles read today
     */
    getArticlesReadToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.data.events.filter(e =>
            e.type === 'article_read' && e.timestamp.startsWith(today)
        ).length;
    }

    /**
     * Get articles read this week
     */
    getArticlesReadThisWeek() {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        return this.data.events.filter(e =>
            e.type === 'article_read' && new Date(e.timestamp) >= weekAgo
        ).length;
    }

    /**
     * Get articles read in last N days
     */
    getArticlesReadInDays(days) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return this.data.events.filter(e =>
            e.type === 'article_read' && new Date(e.timestamp) >= startDate
        );
    }

    /**
     * Get reading activity by day (last 30 days)
     */
    getReadingActivityByDay(days = 30) {
        const activity = [];
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const count = this.data.events.filter(e =>
                e.type === 'article_read' && e.timestamp.startsWith(dateStr)
            ).length;

            activity.push({
                date: dateStr,
                count,
                label: this.formatDate(date)
            });
        }

        return activity;
    }

    /**
     * Get category distribution
     */
    getCategoryDistribution() {
        const categories = {};

        this.data.events
            .filter(e => e.type === 'article_read' && e.category)
            .forEach(e => {
                categories[e.category] = (categories[e.category] || 0) + 1;
            });

        return Object.entries(categories)
            .map(([name, count]) => ({
                name,
                count,
                percentage: 0 // Will be calculated later
            }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Get source distribution (top N sources)
     */
    getTopSources(limit = 10) {
        const sources = {};

        this.data.events
            .filter(e => e.type === 'article_read' && e.source)
            .forEach(e => {
                sources[e.source] = (sources[e.source] || 0) + 1;
            });

        return Object.entries(sources)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Get reading activity by hour of day
     */
    getActivityByHour() {
        const hours = Array(24).fill(0);

        this.data.events
            .filter(e => e.type === 'article_read')
            .forEach(e => {
                const hour = new Date(e.timestamp).getHours();
                hours[hour]++;
            });

        return hours.map((count, hour) => ({
            hour,
            count,
            label: this.formatHour(hour)
        }));
    }

    /**
     * Get reading activity by day of week
     */
    getActivityByDayOfWeek() {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const activity = Array(7).fill(0);

        this.data.events
            .filter(e => e.type === 'article_read')
            .forEach(e => {
                const day = new Date(e.timestamp).getDay();
                activity[day]++;
            });

        return activity.map((count, index) => ({
            day: days[index],
            count
        }));
    }

    /**
     * Get insights and recommendations
     */
    getInsights() {
        const insights = [];

        // Reading streak insight
        if (this.data.streaks.current >= 3) {
            insights.push({
                type: 'streak',
                icon: '🔥',
                title: `${this.data.streaks.current}-day reading streak!`,
                message: `You're on fire! Keep it up to beat your record of ${this.data.streaks.longest} days.`
            });
        }

        // Category preference insight
        const categories = this.getCategoryDistribution();
        if (categories.length > 0) {
            const topCategory = categories[0];
            insights.push({
                type: 'preference',
                icon: '📊',
                title: `${topCategory.name} enthusiast`,
                message: `You've read ${topCategory.count} ${topCategory.name} articles. That's your favorite category!`
            });
        }

        // Goal progress insight
        const todayCount = this.getArticlesReadToday();
        const dailyGoal = this.data.goals.dailyArticles;
        if (todayCount >= dailyGoal) {
            insights.push({
                type: 'goal',
                icon: '🎯',
                title: 'Daily goal achieved!',
                message: `You've read ${todayCount} articles today, meeting your goal of ${dailyGoal}.`
            });
        } else if (todayCount > 0) {
            insights.push({
                type: 'goal',
                icon: '📈',
                title: 'Progress toward daily goal',
                message: `You've read ${todayCount} of ${dailyGoal} articles today. ${dailyGoal - todayCount} more to go!`
            });
        }

        // Most active time
        const hourActivity = this.getActivityByHour();
        const peakHour = hourActivity.reduce((max, curr) => curr.count > max.count ? curr : max);
        if (peakHour.count > 5) {
            insights.push({
                type: 'pattern',
                icon: '⏰',
                title: 'Peak reading time',
                message: `You read most at ${peakHour.label}. Consider scheduling important reads for this time.`
            });
        }

        // Diversity recommendation
        if (categories.length > 0) {
            const totalReads = categories.reduce((sum, c) => sum + c.count, 0);
            const topCategoryPercentage = (categories[0].count / totalReads) * 100;

            if (topCategoryPercentage > 70 && categories.length > 1) {
                insights.push({
                    type: 'recommendation',
                    icon: '🌟',
                    title: 'Explore more categories',
                    message: `Try reading more ${categories[1].name} articles to diversify your knowledge.`
                });
            }
        }

        return insights;
    }

    /**
     * Set reading goals
     */
    setGoals(dailyArticles, weeklyArticles) {
        this.data.goals = {
            dailyArticles: parseInt(dailyArticles) || 5,
            weeklyArticles: parseInt(weeklyArticles) || 25
        };
        this.saveData();
    }

    /**
     * Get current goals
     */
    getGoals() {
        return this.data.goals;
    }

    /**
     * Get progress toward goals
     */
    getGoalProgress() {
        return {
            daily: {
                current: this.getArticlesReadToday(),
                goal: this.data.goals.dailyArticles,
                percentage: Math.min(100, (this.getArticlesReadToday() / this.data.goals.dailyArticles) * 100)
            },
            weekly: {
                current: this.getArticlesReadThisWeek(),
                goal: this.data.goals.weeklyArticles,
                percentage: Math.min(100, (this.getArticlesReadThisWeek() / this.data.goals.weeklyArticles) * 100)
            }
        };
    }

    /**
     * Export analytics data
     */
    exportData(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.data, null, 2);
        } else if (format === 'csv') {
            return this.exportToCSV();
        }
    }

    /**
     * Export to CSV format
     */
    exportToCSV() {
        const headers = ['Date', 'Type', 'Article ID', 'Category', 'Source', 'Reading Time'];
        const rows = this.data.events.map(e => [
            e.timestamp,
            e.type,
            e.articleId || '',
            e.category || '',
            e.source || '',
            e.readingTime || ''
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    /**
     * Clear all analytics data
     */
    clearData() {
        this.data = this.getDefaultData();
        this.saveData();
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Format hour for display
     */
    formatHour(hour) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour} ${period}`;
    }

    /**
     * Get summary statistics
     */
    getSummaryStats() {
        return {
            totalArticlesRead: this.data.stats.totalArticlesRead,
            totalArticlesSaved: this.data.stats.totalArticlesSaved,
            totalSearches: this.data.stats.totalSearches,
            totalTimeSpent: this.data.stats.totalTimeSpent,
            currentStreak: this.data.streaks.current,
            longestStreak: this.data.streaks.longest,
            articlesToday: this.getArticlesReadToday(),
            articlesThisWeek: this.getArticlesReadThisWeek(),
            daysActive: this.getDaysActive(),
            averagePerDay: this.getAverageArticlesPerDay()
        };
    }

    /**
     * Get number of active days
     */
    getDaysActive() {
        const uniqueDays = new Set(
            this.data.events
                .filter(e => e.type === 'article_read')
                .map(e => e.timestamp.split('T')[0])
        );
        return uniqueDays.size;
    }

    /**
     * Get average articles per day
     */
    getAverageArticlesPerDay() {
        const daysActive = this.getDaysActive();
        if (daysActive === 0) return 0;
        return (this.data.stats.totalArticlesRead / daysActive).toFixed(1);
    }

    /**
     * Alias for getReadingActivityByDay for compatibility
     */
    getActivityByDate(days = 30) {
        return this.getReadingActivityByDay(days);
    }

    /**
     * Alias for getTopSources for compatibility
     */
    getSourceDistribution() {
        return this.getTopSources(10);
    }

    /**
     * Get time-based reading patterns
     * Returns peak hour, most active day, and average reads per day
     */
    getTimePatterns() {
        // Get peak hour
        const hourlyActivity = this.getActivityByHour();
        let peakHour = '-';
        let maxHourReads = 0;

        hourlyActivity.forEach(item => {
            if (item.count > maxHourReads) {
                maxHourReads = item.count;
                const hour = parseInt(item.hour);
                const period = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
                peakHour = `${displayHour}:00 ${period}`;
            }
        });

        // Get most active day
        const dailyActivity = this.getActivityByDayOfWeek();
        let mostActiveDay = '-';
        let maxDayReads = 0;

        dailyActivity.forEach(item => {
            if (item.count > maxDayReads) {
                maxDayReads = item.count;
                mostActiveDay = item.day;
            }
        });

        // Get average per day
        const averagePerDay = parseFloat(this.getAverageArticlesPerDay());

        return {
            peakHour,
            mostActiveDay,
            averagePerDay
        };
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.ReadingAnalytics = ReadingAnalytics;
}
