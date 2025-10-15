/**
 * API Tests
 * Basic integration tests for API endpoints
 */

const axios = require('axios');
const { TestRunner } = require('./sanitizer.test');

class ApiTester extends TestRunner {
    constructor(baseUrl = 'http://localhost:3000') {
        super();
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 10000,
            validateStatus: () => true // Don't throw on non-2xx status codes
        });
    }
    
    async assertStatus(response, expectedStatus, message = '') {
        if (response.status !== expectedStatus) {
            throw new Error(`Status assertion failed: ${message}\nExpected: ${expectedStatus}\nActual: ${response.status}`);
        }
    }
    
    async assertResponseProperty(response, property, expectedValue, message = '') {
        if (response.data[property] !== expectedValue) {
            throw new Error(`Property assertion failed: ${message}\nExpected ${property}: ${expectedValue}\nActual: ${response.data[property]}`);
        }
    }
    
    async waitForServer(maxAttempts = 30, delay = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await this.client.get('/api/health');
                if (response.status === 200) {
                    return true;
                }
            } catch (error) {
                // Server not ready, wait and retry
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error('Server did not start within expected time');
    }
}

// Initialize API tester
const apiTester = new ApiTester();

// Health check tests
apiTester.test('GET /api/health - should return healthy status', async function() {
    const response = await this.client.get('/api/health');
    await this.assertStatus(response, 200);
    await this.assertResponseProperty(response, 'status', 'healthy');
    this.assertTrue(typeof response.data.uptime === 'number', 'Should include uptime');
});

// Metrics tests
apiTester.test('GET /api/metrics - should return application metrics', async function() {
    const response = await this.client.get('/api/metrics');
    await this.assertStatus(response, 200);
    this.assertTrue(typeof response.data.requests === 'number', 'Should include request count');
    this.assertTrue(typeof response.data.errors === 'number', 'Should include error count');
    this.assertTrue(typeof response.data.cacheSize === 'number', 'Should include cache size');
});

// News API tests
apiTester.test('GET /api/news - should return news articles', async function() {
    const response = await this.client.get('/api/news');
    await this.assertStatus(response, 200);
    this.assertTrue(Array.isArray(response.data), 'Should return an array');
    
    if (response.data.length > 0) {
        const article = response.data[0];
        this.assertTrue(typeof article.title === 'string', 'Articles should have title');
        this.assertTrue(typeof article.source === 'string', 'Articles should have source');
        this.assertTrue(typeof article.category === 'string', 'Articles should have category');
    }
});

// Sources API tests
apiTester.test('GET /api/sources - should return news sources', async function() {
    const response = await this.client.get('/api/sources');
    await this.assertStatus(response, 200);
    this.assertTrue(Array.isArray(response.data), 'Should return an array');
    
    if (response.data.length > 0) {
        const source = response.data[0];
        this.assertTrue(typeof source.name === 'string', 'Sources should have name');
        this.assertTrue(typeof source.url === 'string', 'Sources should have URL');
        this.assertTrue(typeof source.category === 'string', 'Sources should have category');
    }
});

// Source creation test
apiTester.test('POST /api/sources - should create new source with validation', async function() {
    const newSource = {
        name: 'Test Source',
        url: 'https://example.com',
        category: 'Test Category',
        status: 'active'
    };
    
    const response = await this.client.post('/api/sources', newSource);
    await this.assertStatus(response, 201);
    this.assertTrue(typeof response.data.id === 'string', 'Should return created source with ID');
    await this.assertResponseProperty(response, 'name', 'Test Source');
    
    // Clean up - delete the test source
    if (response.data.id) {
        await this.client.delete(`/api/sources/${response.data.id}`);
    }
});

// Source creation validation test
apiTester.test('POST /api/sources - should reject invalid source data', async function() {
    const invalidSource = {
        name: '',
        url: 'not-a-valid-url',
        category: 'Test'
    };
    
    const response = await this.client.post('/api/sources', invalidSource);
    await this.assertStatus(response, 400);
});

// Security test - XSS prevention
apiTester.test('POST /api/sources - should sanitize malicious input', async function() {
    const maliciousSource = {
        name: 'Test <script>alert("xss")</script>',
        url: 'https://example.com',
        category: 'Test Category',
        status: 'active'
    };
    
    const response = await this.client.post('/api/sources', maliciousSource);
    if (response.status === 201) {
        this.assertTrue(!response.data.name.includes('<script>'), 'Should sanitize malicious scripts');
        // Clean up
        if (response.data.id) {
            await this.client.delete(`/api/sources/${response.data.id}`);
        }
    }
});

// Security tests for PUT endpoint
apiTester.test('PUT /api/sources/:id - should prevent prototype pollution attacks', async function() {
    // First create a test source
    const testSource = {
        name: 'Security Test Source',
        url: 'https://example.com/test',
        category: 'AI News',
        status: 'active'
    };
    
    const createResponse = await this.client.post('/api/sources', testSource);
    await this.assertStatus(createResponse, 201);
    const sourceId = createResponse.data.id;
    
    try {
        // Test prototype pollution attempt
        const maliciousUpdate = {
            "__proto__": {
                "isAdmin": true,
                "polluted": "value"
            },
            "constructor": {
                "prototype": {
                    "hacked": true
                }
            },
            "prototype": {
                "malicious": "payload"
            },
            "name": "Updated Name"
        };
        
        const response = await this.client.put(`/api/sources/${sourceId}`, maliciousUpdate);
        await this.assertStatus(response, 400, 'Should reject prototype pollution attempt');
        this.assertTrue(response.data.error.includes('Invalid property name'), 'Should return appropriate error message');
        
        // Verify prototype was not polluted
        const testObj = {};
        this.assertFalse('isAdmin' in testObj, 'Prototype should not be polluted with isAdmin');
        this.assertFalse('polluted' in testObj, 'Prototype should not be polluted with polluted');
        this.assertFalse('hacked' in testObj, 'Prototype should not be polluted with hacked');
        
    } finally {
        // Clean up - delete the test source
        await this.client.delete(`/api/sources/${sourceId}`);
    }
});

apiTester.test('PUT /api/sources/:id - should validate input fields properly', async function() {
    // First create a test source
    const testSource = {
        name: 'Validation Test Source',
        url: 'https://example.com/validation',
        category: 'AI Industry',
        status: 'active'
    };
    
    const createResponse = await this.client.post('/api/sources', testSource);
    await this.assertStatus(createResponse, 201);
    const sourceId = createResponse.data.id;
    
    try {
        // Test invalid name
        const invalidNameUpdate = {
            name: '', // Empty name should be rejected
        };
        
        let response = await this.client.put(`/api/sources/${sourceId}`, invalidNameUpdate);
        await this.assertStatus(response, 400, 'Should reject empty name');
        
        // Test invalid URL
        const invalidUrlUpdate = {
            url: 'not-a-valid-url'
        };
        
        response = await this.client.put(`/api/sources/${sourceId}`, invalidUrlUpdate);
        await this.assertStatus(response, 400, 'Should reject invalid URL');
        
        // Test invalid category
        const invalidCategoryUpdate = {
            category: 'Invalid Category'
        };
        
        response = await this.client.put(`/api/sources/${sourceId}`, invalidCategoryUpdate);
        await this.assertStatus(response, 400, 'Should reject invalid category');
        
        // Test invalid status
        const invalidStatusUpdate = {
            status: 'invalid-status'
        };
        
        response = await this.client.put(`/api/sources/${sourceId}`, invalidStatusUpdate);
        await this.assertStatus(response, 400, 'Should reject invalid status');
        
    } finally {
        // Clean up - delete the test source
        await this.client.delete(`/api/sources/${sourceId}`);
    }
});

apiTester.test('PUT /api/sources/:id - should accept valid updates', async function() {
    // First create a test source
    const testSource = {
        name: 'Valid Update Test Source',
        url: 'https://example.com/valid',
        category: 'AI Research',
        status: 'active'
    };
    
    const createResponse = await this.client.post('/api/sources', testSource);
    await this.assertStatus(createResponse, 201);
    const sourceId = createResponse.data.id;
    
    try {
        // Test valid update
        const validUpdate = {
            name: 'Updated Valid Source',
            url: 'https://example.com/updated',
            category: 'Coding Tools',
            status: 'inactive',
            selectors: {
                container: '.articles',
                title: '.title'
            }
        };
        
        const response = await this.client.put(`/api/sources/${sourceId}`, validUpdate);
        await this.assertStatus(response, 200, 'Should accept valid update');
        
        await this.assertResponseProperty(response, 'name', 'Updated Valid Source');
        await this.assertResponseProperty(response, 'category', 'Coding Tools');
        await this.assertResponseProperty(response, 'status', 'inactive');
        this.assertTrue(response.data.selectors && response.data.selectors.container === '.articles', 'Should update selectors');
        
    } finally {
        // Clean up - delete the test source
        await this.client.delete(`/api/sources/${sourceId}`);
    }
});

// Error handling test
apiTester.test('GET /api/nonexistent - should return 404', async function() {
    const response = await this.client.get('/api/nonexistent');
    await this.assertStatus(response, 404);
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('Starting API tests...');
    console.log('Make sure the server is running on http://localhost:3000\n');
    
    apiTester.waitForServer()
        .then(() => {
            console.log('Server is ready, running tests...\n');
            return apiTester.run();
        })
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Failed to connect to server:', error.message);
            process.exit(1);
        });
}

module.exports = { ApiTester };