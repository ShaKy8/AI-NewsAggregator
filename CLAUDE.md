# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern AI-focused news aggregator that has evolved from cybersecurity/technology to focus on AI industry news, AI tools, research, and coding platforms. Built with Node.js/Express backend and vanilla JavaScript frontend (~1600 lines), featuring advanced filtering, content management, and dynamic source administration.

## Commands

### Development
- `npm start` - Start production server (default port 3000)
- `npm run dev` - Start development server with nodemon auto-restart
- `npm run build` - Frontend build process (currently just echoes completion)
- `node server.js` - Direct server startup

### Testing
- `npm test` - Run all tests (unit and API tests)
- `npm run test:unit` - Run unit tests only (sanitizer tests)
- `npm run test:api` - Run API integration tests (requires server running)
- `npm run test:security` - Run security-specific tests

### Code Quality
- `npm run lint` - Run linter (currently placeholder, no linter configured)
- `npm run typecheck` - Run type checking (currently placeholder, no TypeScript)

### Process Management
- Application supports PM2 for production deployment
- Uses dotenv for environment configuration (.env file)

## Architecture

### Backend Structure
- `server.js` - Main Express server with API routes and cron scheduling
- `services/newsService.js` - Core news scraping engine with source-specific scrapers
- `sources.json` - Dynamic news source configuration with status tracking

### Frontend Structure
- `public/index.html` - Main application interface with Material Design-inspired UI
- `public/app.js` - Core frontend application logic (1583 lines, class-based architecture)
- `public/styles.css` - Complete responsive stylesheet with dark/light themes
- `public/admin.html` + `public/admin.js` - Dynamic news source management interface
- `public/architecture.html` - System architecture documentation
- `public/favicon.svg` - Application favicon

### Key Features Architecture
- **Dynamic Source Management**: Sources configured in `sources.json` with real-time status tracking
- **Adaptive Scraping Engine**: Source-specific scrapers with fallback to generic scraper for new sources
- **In-Memory Caching**: Article caching with manual/auto refresh and persistence tracking
- **Scheduled Updates**: Node-cron for automatic refresh cycles with error handling
- **Advanced Filtering**: Include/exclude keywords, age filtering, content categorization
- **User Experience**: Dark/light themes, saved articles, read tracking, trending topics
- **Admin Interface**: Real-time source management with add/edit/delete capabilities

## Data Flow

1. **Source Loading**: `newsService.js` loads active sources from `sources.json` dynamically
2. **Scraping Process**: Applies source-specific scrapers (e.g., TechCrunch, GitHub Blog) or generic scraper
3. **Caching Layer**: Articles cached in `server.js` memory with lazy loading on first request
4. **API Endpoints**: Frontend fetches via `/api/news` (cached) and `/api/refresh` (live update)
5. **Source Management**: Admin interface manages sources via REST endpoints with real-time updates
6. **Status Tracking**: Each source tracks `articleCount`, `lastSuccess`, `lastError`, `lastAttempt`

## Source Management

### Source Configuration
Sources in `sources.json` include:
- **Core Fields**: `id`, `name`, `url`, `category` (AI Industry, AI News, AI Research, Coding Tools)
- **Status Control**: `status` (active/inactive) - only active sources are scraped
- **Tracking Fields**: `articleCount`, `lastSuccess`, `lastError`, `lastAttempt`, `created`
- **Custom Selectors**: Optional `selectors` field for generic scraper configuration

### Current Source Categories
- **AI Industry**: OpenAI Blog, Google AI Blog, Anthropic Blog
- **AI News**: MarkTechPost, AI News, VentureBeat AI, TechCrunch AI, The Verge AI
- **AI Research**: Towards Data Science, KDnuggets, Hugging Face Blog
- **Coding Tools**: GitHub Blog, Stack Overflow Blog, Hacker News, ClaudeCode Blog

### Adding New Sources
1. Add to `sources.json` with unique ID and appropriate category
2. If standard scraping fails, implement custom scraper in `newsService.js`
3. Sources automatically use generic scraper unless mapped to specific scraper

## Key Dependencies

### Production Dependencies
- **express**: Web server and API framework
- **axios**: HTTP client for web scraping with proper user-agent headers
- **cheerio**: Server-side HTML parsing and manipulation
- **node-cron**: Job scheduling for automatic news refresh
- **cors**: Cross-origin resource sharing middleware
- **dotenv**: Environment variable management
- **pm2**: Production process management

### Development Dependencies
- **nodemon**: Development server auto-restart on file changes

## API Endpoints

### Core API
- `GET /api/news` - Retrieve cached articles (lazy loads if cache empty)
- `GET /api/refresh` - Force refresh all active sources, return updated cache
- `GET /api/sources` - List all news sources with status
- `POST /api/sources` - Add new news source
- `PUT /api/sources/:id` - Update existing source
- `DELETE /api/sources/:id` - Delete source

### Static Serving
- `GET /` - Main application (index.html)
- `GET /admin` - Admin interface (admin.html)
- Static files served from `public/` directory

## Frontend Architecture Details

### Class-Based Structure
- **NewsAggregator Class**: Main application controller (app.js:1-21)
- **State Management**: Local storage for user preferences, saved articles, read tracking
- **Theme System**: Dynamic dark/light theme switching with persistence
- **Auto-refresh**: Configurable automatic news updates with user control

### Key Features
- **Advanced Filtering**: Category filters, keyword inclusion/exclusion, age-based filtering
- **Content Management**: Save articles, mark as read, trending topics analysis
- **Search Functionality**: Real-time search across article titles and content
- **Responsive Design**: Mobile-optimized interface with sticky headers
- **User Experience**: Loading states, error handling, smooth animations

## Testing Architecture

### Test Framework
- **Custom Test Runner**: Lightweight testing framework in `tests/sanitizer.test.js`
- **API Testing**: Integration tests using axios client in `tests/api.test.js`
- Tests run directly with Node.js, no external test framework dependencies

### Test Coverage
- **Security Tests**: HTML sanitization, XSS prevention, prototype pollution protection
- **API Tests**: Health checks, metrics, CRUD operations on sources
- **Validation Tests**: Input validation, URL sanitization, malicious input handling

### Running Tests
- Server must be running on `http://localhost:3000` for API tests
- Tests include automatic server health check with retry logic
- Exit codes: 0 for success, 1 for failure

## Security Architecture

### Input Sanitization
- **HTML Escaping**: `escapeHtml()` for preventing XSS in text content
- **HTML Sanitization**: `sanitizeHtml()` removes dangerous elements and attributes
- **URL Validation**: `sanitizeUrl()` ensures only HTTP/HTTPS protocols
- **Search Input**: `sanitizeSearchInput()` limits length and removes dangerous patterns

### API Security
- **Prototype Pollution Protection**: `validateSourceUpdate()` checks for dangerous keys
- **Input Validation**: All API endpoints validate and sanitize inputs
- **CORS Configuration**: Cross-origin requests properly managed
- **Content Security**: XSS protection through proper HTML escaping

## Specialized Agents

This repository has a custom **news-ux-optimizer** agent specifically designed for:
- News consumption pattern optimization
- Content discovery feature improvements  
- Information architecture enhancements
- Mobile news reading experience optimization