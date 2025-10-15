/**
 * Enhanced logging and monitoring utility
 * Provides structured logging, error tracking, and basic analytics
 */

const fs = require('fs').promises;
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        // Create logs dir synchronously
        try {
            require('fs').mkdirSync(this.logDir, { recursive: true });
        } catch (error) {
            // Directory likely already exists
        }
        
        // In-memory metrics for basic analytics
        this.metrics = {
            requests: 0,
            errors: 0,
            sources: {},
            performance: [],
            lastReset: new Date()
        };
        
        // Reset metrics daily
        this.scheduleMetricsReset();
    }
    
    async ensureLogDir() {
        try {
            await fs.access(this.logDir);
        } catch (error) {
            await fs.mkdir(this.logDir, { recursive: true });
        }
    }
    
    scheduleMetricsReset() {
        // Reset metrics every 24 hours
        setInterval(() => {
            this.metrics = {
                requests: 0,
                errors: 0,
                sources: {},
                performance: [],
                lastReset: new Date()
            };
        }, 24 * 60 * 60 * 1000);
    }
    
    formatTimestamp() {
        return new Date().toISOString();
    }
    
    createLogEntry(level, message, data = {}) {
        return {
            timestamp: this.formatTimestamp(),
            level,
            message,
            data,
            pid: process.pid
        };
    }
    
    async writeToFile(filename, entry) {
        try {
            const logFile = path.join(this.logDir, filename);
            const logLine = JSON.stringify(entry) + '\n';
            await fs.appendFile(logFile, logLine);
        } catch (error) {
            // Fallback to console if file writing fails
            console.error('Failed to write to log file:', error);
            console.log('LOG:', entry);
        }
    }
    
    async info(message, data = {}) {
        const entry = this.createLogEntry('INFO', message, data);
        console.log(`[INFO] ${message}`, data);
        await this.writeToFile('app.log', entry);
        this.metrics.requests++;
    }
    
    async warn(message, data = {}) {
        const entry = this.createLogEntry('WARN', message, data);
        console.warn(`[WARN] ${message}`, data);
        await this.writeToFile('app.log', entry);
    }
    
    async error(message, error = null, data = {}) {
        const errorData = {
            ...data,
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : null
        };
        
        const entry = this.createLogEntry('ERROR', message, errorData);
        console.error(`[ERROR] ${message}`, errorData);
        await this.writeToFile('errors.log', entry);
        this.metrics.errors++;
    }
    
    async security(message, data = {}) {
        const entry = this.createLogEntry('SECURITY', message, data);
        console.warn(`[SECURITY] ${message}`, data);
        await this.writeToFile('security.log', entry);
    }
    
    async performance(operation, duration, data = {}) {
        const perfData = {
            ...data,
            operation,
            duration,
            timestamp: this.formatTimestamp()
        };
        
        const entry = this.createLogEntry('PERFORMANCE', `${operation} completed in ${duration}ms`, perfData);
        await this.writeToFile('performance.log', entry);
        
        // Keep last 100 performance entries in memory
        this.metrics.performance.push(perfData);
        if (this.metrics.performance.length > 100) {
            this.metrics.performance.shift();
        }
    }
    
    async sourceActivity(sourceName, action, data = {}) {
        const sourceData = {
            source: sourceName,
            action,
            ...data
        };
        
        const entry = this.createLogEntry('SOURCE', `${sourceName}: ${action}`, sourceData);
        await this.writeToFile('sources.log', entry);
        
        // Update source metrics
        if (!this.metrics.sources[sourceName]) {
            this.metrics.sources[sourceName] = {
                requests: 0,
                successes: 0,
                errors: 0,
                lastActivity: null
            };
        }
        
        this.metrics.sources[sourceName].requests++;
        this.metrics.sources[sourceName].lastActivity = new Date();
        
        if (action === 'success') {
            this.metrics.sources[sourceName].successes++;
        } else if (action === 'error') {
            this.metrics.sources[sourceName].errors++;
        }
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.lastReset.getTime(),
            averagePerformance: this.metrics.performance.length > 0 
                ? this.metrics.performance.reduce((sum, p) => sum + p.duration, 0) / this.metrics.performance.length
                : 0
        };
    }
    
    async getRecentLogs(type = 'app', limit = 100) {
        try {
            const logFile = path.join(this.logDir, `${type}.log`);
            const content = await fs.readFile(logFile, 'utf8');
            const lines = content.trim().split('\n');
            
            return lines
                .slice(-limit)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (error) {
                        return { message: line, timestamp: new Date().toISOString() };
                    }
                })
                .reverse();
        } catch (error) {
            return [];
        }
    }
    
    // Middleware for Express to log requests
    middleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Log request
            this.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                referer: req.get('Referer')
            });
            
            // Log response
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? 'warn' : 'info';
                
                this[level](`${req.method} ${req.path} - ${res.statusCode}`, {
                    statusCode: res.statusCode,
                    duration,
                    ip: req.ip
                });
                
                this.performance(`${req.method} ${req.path}`, duration, {
                    statusCode: res.statusCode
                });
            });
            
            next();
        };
    }
}

// Singleton instance
const logger = new Logger();

module.exports = logger;