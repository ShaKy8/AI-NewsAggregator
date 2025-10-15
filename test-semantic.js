/**
 * Quick test for Semantic Search functionality
 */

// Load the semantic search module
const fs = require('fs');
const path = require('path');

// Read and evaluate the semantic-search.js file in a simulated browser environment
const semanticSearchCode = fs.readFileSync(
    path.join(__dirname, 'public/utils/semantic-search.js'),
    'utf-8'
);

// Create a minimal window/localStorage mock
global.window = {
    SemanticSearchEngine: null
};
global.localStorage = {
    data: {},
    getItem(key) {
        return this.data[key] || null;
    },
    setItem(key, value) {
        this.data[key] = value;
    }
};

// Execute the code
eval(semanticSearchCode);
const SemanticSearchEngine = global.window.SemanticSearchEngine;

console.log('🧪 Testing Semantic Search Engine\n');

// Test 1: Initialization
console.log('✓ Test 1: Initialization');
const engine = new SemanticSearchEngine();
console.log(`  - Engine created: ${engine ? 'PASS' : 'FAIL'}`);
console.log(`  - Initial state: ${engine.isEnabled() ? 'enabled' : 'disabled'}`);

// Test 2: Synonym Expansion
console.log('\n✓ Test 2: Synonym Expansion');
const synonyms = engine.getSimpleSynonyms('security breach');
console.log(`  - Query: "security breach"`);
console.log(`  - Synonyms found: ${synonyms.length}`);
console.log(`  - Sample synonyms: ${synonyms.slice(0, 5).join(', ')}`);

// Test 3: Query Expansion
console.log('\n✓ Test 3: Query Expansion');
engine.expandQuery('AI vulnerability').then(result => {
    console.log(`  - Original query: "${result.original}"`);
    console.log(`  - Expanded terms: ${result.expanded.length}`);
    console.log(`  - Concepts extracted: ${result.concepts.join(', ')}`);

    // Test 4: Similarity Calculation
    console.log('\n✓ Test 4: Similarity Calculation');
    const testArticle = {
        id: '1',
        title: 'New Security Vulnerability Discovered in AI Systems',
        summary: 'Researchers found a critical security flaw affecting artificial intelligence platforms'
    };

    const similarity = engine.calculateSimilarity('AI security', testArticle);
    console.log(`  - Query: "AI security"`);
    console.log(`  - Article: "${testArticle.title}"`);
    console.log(`  - Similarity score: ${similarity.score}/100`);
    console.log(`  - Relevance: ${similarity.relevance}`);
    console.log(`  - Matches found: ${similarity.matches.length}`);

    if (similarity.matches.length > 0) {
        console.log(`  - Top match: ${similarity.matches[0].term} (${similarity.matches[0].type}, weight: ${similarity.matches[0].weight})`);
    }

    // Test 5: Search Articles
    console.log('\n✓ Test 5: Search Articles');
    const testArticles = [
        {
            id: '1',
            title: 'Machine Learning Security Breakthrough',
            summary: 'New AI security measures prevent data breaches'
        },
        {
            id: '2',
            title: 'Cloud Computing Updates',
            summary: 'Latest AWS features for developers'
        },
        {
            id: '3',
            title: 'Cybersecurity Threat Alert',
            summary: 'New malware targets enterprise systems'
        }
    ];

    engine.setEnabled(true);
    engine.searchArticles('security breach', testArticles).then(results => {
        console.log(`  - Query: "security breach"`);
        console.log(`  - Total articles: ${testArticles.length}`);
        console.log(`  - Results with scores:`);
        results.forEach(r => {
            if (r.score >= 20) {
                console.log(`    • ${r.article.title.substring(0, 40)}... (score: ${r.score}, ${r.relevance})`);
            }
        });

        // Test 6: Cache Statistics
        console.log('\n✓ Test 6: Cache Management');
        const stats = engine.getCacheStats();
        console.log(`  - Query cache size: ${stats.queryCache}`);
        console.log(`  - Similarity cache size: ${stats.similarityCache}`);
        console.log(`  - Enabled: ${stats.enabled}`);

        console.log('\n✅ All tests completed!\n');
    });
});
