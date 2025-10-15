/**
 * HTML Sanitization Utilities
 * Provides secure methods to sanitize HTML content and prevent XSS attacks
 */

/**
 * Escapes HTML characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Sanitizes HTML content by removing potentially dangerous elements and attributes
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML
 */
function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';
    
    // Simple sanitization for server-side - remove script tags and dangerous attributes
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '');
    
    // List of allowed tags
    const allowedTags = ['p', 'br', 'strong', 'em', 'b', 'i', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    
    // List of allowed attributes
    const allowedAttributes = ['class', 'id', 'title', 'aria-label', 'aria-labelledby', 'aria-describedby'];
    
    // Remove all script tags and their content
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove all style tags and their content
    const styles = temp.querySelectorAll('style');
    styles.forEach(style => style.remove());
    
    // Process all elements
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(element => {
        // Remove elements that aren't in the allowed list
        if (!allowedTags.includes(element.tagName.toLowerCase())) {
            element.remove();
            return;
        }
        
        // Remove dangerous attributes
        const attributes = [...element.attributes];
        attributes.forEach(attr => {
            if (!allowedAttributes.includes(attr.name.toLowerCase()) && 
                !attr.name.toLowerCase().startsWith('data-')) {
                element.removeAttribute(attr.name);
            }
            
            // Check for javascript: or data: URLs in attributes
            if (attr.value && (
                attr.value.toLowerCase().includes('javascript:') ||
                attr.value.toLowerCase().includes('data:') ||
                attr.value.toLowerCase().includes('vbscript:') ||
                attr.value.toLowerCase().includes('onload') ||
                attr.value.toLowerCase().includes('onerror')
            )) {
                element.removeAttribute(attr.name);
            }
        });
        
        // Remove on* event handlers
        const eventAttributes = ['onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'];
        eventAttributes.forEach(event => {
            if (element.hasAttribute(event)) {
                element.removeAttribute(event);
            }
        });
    });
    
    return temp.innerHTML;
}

/**
 * Validates and sanitizes URL to prevent malicious redirects
 * @param {string} url - URL to validate
 * @returns {string|null} - Sanitized URL or null if invalid
 */
function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    try {
        const urlObj = new URL(url);
        
        // Only allow HTTP and HTTPS protocols
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return null;
        }
        
        // Prevent malicious characters
        if (url.includes('<') || url.includes('>') || url.includes('"') || url.includes("'")) {
            return null;
        }
        
        return urlObj.href;
    } catch (error) {
        return null;
    }
}

/**
 * Sanitizes search input to prevent injection attacks
 * @param {string} input - Search input to sanitize
 * @returns {string} - Sanitized search input
 */
function sanitizeSearchInput(input) {
    if (!input || typeof input !== 'string') return '';
    
    // Remove potentially dangerous characters while preserving search operators
    return input
        .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
        .replace(/[<>]/g, '') // Remove HTML brackets
        .replace(/javascript:/gi, '') // Remove javascript protocol
        .replace(/data:/gi, '') // Remove data protocol
        .replace(/vbscript:/gi, '') // Remove vbscript protocol
        .trim()
        .substring(0, 200); // Limit length
}

/**
 * Validates article data to ensure it's safe
 * @param {object} article - Article object to validate
 * @returns {object} - Validated and sanitized article
 */
function validateArticle(article) {
    if (!article || typeof article !== 'object') return null;
    
    return {
        id: escapeHtml(article.id || ''),
        title: escapeHtml(article.title || ''),
        summary: sanitizeHtml(article.summary || ''),
        aiSummary: sanitizeHtml(article.aiSummary || ''),
        source: escapeHtml(article.source || ''),
        category: escapeHtml(article.category || ''),
        link: sanitizeUrl(article.link || ''),
        publishedAt: escapeHtml(article.publishedAt || ''),
        scraped: escapeHtml(article.scraped || ''),
        priority: escapeHtml(article.priority || ''),
        sentiment: escapeHtml(article.sentiment || ''),
        priorityScore: parseInt(article.priorityScore) || 0,
        readingTime: parseInt(article.readingTime) || 1,
        isBreaking: Boolean(article.isBreaking),
        keywords: Array.isArray(article.keywords) ? article.keywords.map(k => escapeHtml(k)) : []
    };
}

/**
 * Validates and sanitizes source update data to prevent prototype pollution
 * @param {object} updateData - Source update data from request body
 * @returns {object} - Validation result with sanitized data or error
 */
function validateSourceUpdate(updateData) {
    if (!updateData || typeof updateData !== 'object') {
        return { valid: false, error: 'Invalid update data' };
    }

    // Check for prototype pollution attempts
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    const allKeys = Object.keys(updateData).concat(Object.getOwnPropertyNames(updateData));
    
    for (const key of dangerousKeys) {
        if (allKeys.includes(key)) {
            return { valid: false, error: 'Invalid property name' };
        }
    }

    const validatedData = {};
    const allowedFields = ['name', 'url', 'category', 'status', 'selectors'];
    const validCategories = ['AI Industry', 'AI News', 'AI Research', 'Coding Tools'];

    // Validate each allowed field
    for (const field of allowedFields) {
        if (updateData.hasOwnProperty(field)) {
            switch (field) {
                case 'name':
                    if (typeof updateData.name !== 'string' || updateData.name.trim().length === 0) {
                        return { valid: false, error: 'Source name must be a non-empty string' };
                    }
                    validatedData.name = updateData.name.trim().substring(0, 100);
                    break;

                case 'url':
                    const sanitizedUrl = sanitizeUrl(updateData.url);
                    if (!sanitizedUrl) {
                        return { valid: false, error: 'Valid URL is required' };
                    }
                    validatedData.url = sanitizedUrl;
                    break;

                case 'category':
                    if (typeof updateData.category !== 'string' || !validCategories.includes(updateData.category)) {
                        return { valid: false, error: `Category must be one of: ${validCategories.join(', ')}` };
                    }
                    validatedData.category = updateData.category;
                    break;

                case 'status':
                    if (!['active', 'inactive'].includes(updateData.status)) {
                        return { valid: false, error: 'Status must be either "active" or "inactive"' };
                    }
                    validatedData.status = updateData.status;
                    break;

                case 'selectors':
                    if (updateData.selectors !== null && typeof updateData.selectors !== 'object') {
                        return { valid: false, error: 'Selectors must be an object or null' };
                    }
                    validatedData.selectors = updateData.selectors;
                    break;
            }
        }
    }

    return { valid: true, data: validatedData };
}

// Export functions for use in both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment - no need for JSDOM anymore
    module.exports = {
        escapeHtml,
        sanitizeHtml,
        sanitizeUrl,
        sanitizeSearchInput,
        validateArticle,
        validateSourceUpdate
    };
} else {
    // Browser environment
    window.Sanitizer = {
        escapeHtml,
        sanitizeHtml,
        sanitizeUrl,
        sanitizeSearchInput,
        validateArticle,
        validateSourceUpdate
    };
}