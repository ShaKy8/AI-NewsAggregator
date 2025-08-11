# 🛡️ CyberTech News Aggregator

A modern, feature-rich news aggregator focused on cybersecurity and technology news. Built with Node.js and vanilla JavaScript, this application provides a clean, professional interface for staying updated with the latest security threats and tech developments.

![News Aggregator Screenshot](screenshot.png)

## 🚀 Features

### Core Functionality
- **Multi-Source Aggregation**: Fetches news from BleepingComputer, Cybersecurity News, Neowin, and AskWoody
- **Real-time Updates**: Manual refresh and auto-refresh capabilities
- **Smart Filtering**: Category-based filtering (All, Security, Technology)
- **Advanced Search**: Search across article titles, summaries, and sources

### User Experience
- **🌙 Dark/Light Theme**: Toggle between themes with persistent preferences
- **🔖 Save Articles**: Bookmark articles for later reading with local storage
- **⏰ Auto-refresh**: Optional 15-minute automatic news updates
- **📱 Responsive Design**: Optimized for desktop, tablet, and mobile devices

### Visual Enhancements
- **📊 Statistics Dashboard**: Live article counts and update times
- **🔥 Trending Topics**: Dynamic keyword analysis with hot topic highlighting
- **⭐ Source Reliability**: Trust scores for each news source
- **📖 Reading Time**: Estimated reading time for each article
- **🎨 Smooth Animations**: Modern UI with skeleton loading and transitions

### Content Features
- **🤖 AI Summaries**: Generated summaries for quick understanding
- **🔗 Related Articles**: Discover similar content
- **📤 Social Sharing**: Share to Twitter, LinkedIn, or Email
- **📚 Article History**: Track read articles with visual indicators
- **⚡ Progress Indicators**: Visual feedback during operations

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Scraping**: Axios, Cheerio
- **Scheduling**: Node-cron
- **Icons**: Font Awesome
- **Fonts**: Google Fonts (Inter)

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/NewsAggregator.git
   cd NewsAggregator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Access the application**:
   - Local: `http://localhost:3000`
   - Network: `http://your-ip:3000`

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=production
```

### Customizing News Sources
Edit `services/newsService.js` to modify or add news sources:
```javascript
const newsSources = [
  {
    name: 'YourSource',
    url: 'https://example.com',
    scraper: yourScraperFunction,
    category: 'Technology'
  }
];
```

## 🔧 Usage

### Basic Operations
- **Refresh News**: Click the refresh button or wait for auto-refresh
- **Search Articles**: Use the search bar to find specific content
- **Filter Content**: Use category buttons to filter by topic
- **Save Articles**: Click the bookmark icon on any article

### Advanced Features
- **Theme Toggle**: Click the moon/sun icon to switch themes
- **Auto-refresh**: Click the clock icon to enable/disable automatic updates
- **Trending Topics**: Click on trending keywords to search
- **Article Sharing**: Use share buttons on articles for social media

## 📊 API Endpoints

- `GET /api/news` - Fetch cached news articles
- `GET /api/refresh` - Force refresh all news sources
- `GET /` - Serve the main application

## 🔒 Security Features

- **Input Sanitization**: All user inputs are properly escaped
- **CORS Protection**: Cross-origin requests are properly managed
- **Content Security**: XSS protection through proper HTML escaping
- **Safe External Links**: All external links open in new tabs with security attributes

## 📱 Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- News sources: BleepingComputer, Cybersecurity News, Neowin, AskWoody
- Icons: Font Awesome
- Fonts: Google Fonts
- Framework inspiration: Modern web development practices

## 🐛 Known Issues

- Some news sources may occasionally be unavailable due to rate limiting
- Article images depend on source website availability

## 🔮 Future Enhancements

- [ ] RSS feed integration
- [ ] Push notifications for breaking news
- [ ] Machine learning for better article recommendations
- [ ] Multiple language support
- [ ] Custom news source additions
- [ ] Export to PDF/email functionality

---

**Built with ❤️ for cybersecurity professionals and tech enthusiasts**