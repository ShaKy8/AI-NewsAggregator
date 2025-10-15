/**
 * Tests for sanitizer utility
 * Basic test framework for security-critical functionality
 */

const { escapeHtml, sanitizeHtml, sanitizeUrl, sanitizeSearchInput, validateArticle } = require('../utils/sanitizer');

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }
    
    test(name, testFn) {
        this.tests.push({ name, testFn });
    }
    
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
        }
    }
    
    assertTrue(condition, message = '') {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}\nExpected: true\nActual: ${condition}`);
        }
    }
    
    assertFalse(condition, message = '') {
        if (condition) {
            throw new Error(`Assertion failed: ${message}\nExpected: false\nActual: ${condition}`);
        }
    }
    
    assertNull(value, message = '') {
        if (value !== null) {
            throw new Error(`Assertion failed: ${message}\nExpected: null\nActual: ${value}`);
        }
    }
    
    async run() {
        console.log(`Running ${this.tests.length} tests...\n`);
        
        for (const { name, testFn } of this.tests) {
            try {
                await testFn.call(this);
                console.log(`✅ ${name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${name}: ${error.message}`);
                this.failed++;
            }
        }
        
        console.log(`\nTest Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }
}

// Initialize test runner
const runner = new TestRunner();

// Test escapeHtml function
runner.test('escapeHtml - should escape HTML characters', function() {
    this.assertEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    this.assertEqual(escapeHtml('Hello "World"'), 'Hello &quot;World&quot;');
    this.assertEqual(escapeHtml("Hello 'World'"), "Hello &#x27;World&#x27;");
});

runner.test('escapeHtml - should handle empty and null input', function() {
    this.assertEqual(escapeHtml(''), '');
    this.assertEqual(escapeHtml(null), '');
    this.assertEqual(escapeHtml(undefined), '');
});

// Test sanitizeHtml function
runner.test('sanitizeHtml - should remove script tags', function() {
    const malicious = '<div>Hello</div><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtml(malicious);
    this.assertTrue(!result.includes('<script>'), 'Should remove script tags');
    this.assertTrue(result.includes('<div>Hello</div>'), 'Should preserve safe tags');
});

runner.test('sanitizeHtml - should remove dangerous attributes', function() {
    const malicious = '<div onclick="alert(\'xss\')" class="safe">Hello</div>';
    const result = sanitizeHtml(malicious);
    this.assertTrue(!result.includes('onclick'), 'Should remove onclick attributes');
    this.assertTrue(result.includes('class="safe"'), 'Should preserve safe attributes');
});

// Test sanitizeUrl function
runner.test('sanitizeUrl - should validate HTTP URLs', function() {
    this.assertEqual(sanitizeUrl('https://example.com'), 'https://example.com/');
    this.assertEqual(sanitizeUrl('http://example.com'), 'http://example.com/');
});

runner.test('sanitizeUrl - should reject malicious URLs', function() {
    this.assertNull(sanitizeUrl('javascript:alert("xss")'));
    this.assertNull(sanitizeUrl('data:text/html,<script>alert("xss")</script>'));
    this.assertNull(sanitizeUrl('ftp://example.com'));
});

runner.test('sanitizeUrl - should handle malformed URLs', function() {
    this.assertNull(sanitizeUrl('not-a-url'));
    this.assertNull(sanitizeUrl(''));
    this.assertNull(sanitizeUrl(null));
});

// Test sanitizeSearchInput function
runner.test('sanitizeSearchInput - should remove dangerous characters', function() {
    this.assertEqual(sanitizeSearchInput('search <script>alert("xss")</script>'), 'search');
    this.assertEqual(sanitizeSearchInput('search "term"'), 'search "term"');
    this.assertEqual(sanitizeSearchInput('+include -exclude'), '+include -exclude');
});

runner.test('sanitizeSearchInput - should limit length', function() {
    const longInput = 'a'.repeat(300);
    const result = sanitizeSearchInput(longInput);
    this.assertTrue(result.length <= 200, 'Should limit input length');
});

// Test validateArticle function
runner.test('validateArticle - should validate and sanitize article data', function() {
    const article = {
        id: 'test-1',
        title: 'Test <script>alert("xss")</script> Article',
        summary: '<p>Safe content</p><script>alert("xss")</script>',
        source: 'Test Source',
        category: 'Technology',
        link: 'https://example.com/article',
        priorityScore: '5',
        readingTime: '3',
        isBreaking: 'true'
    };
    
    const validated = validateArticle(article);
    
    this.assertTrue(!validated.title.includes('<script>'), 'Should sanitize title');
    this.assertTrue(!validated.summary.includes('<script>'), 'Should sanitize summary');
    this.assertEqual(validated.link, 'https://example.com/article');
    this.assertEqual(typeof validated.priorityScore, 'number');
    this.assertEqual(typeof validated.isBreaking, 'boolean');
});

runner.test('validateArticle - should handle null input', function() {
    this.assertNull(validateArticle(null));
    this.assertNull(validateArticle(undefined));
    this.assertNull(validateArticle('not an object'));
});

// Run tests if this file is executed directly
if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { TestRunner, runner };