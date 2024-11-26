# Web Crawler

A web crawler with dynamic content support, capable of crawling JavaScript-rendered pages.

## Features

- Regular and dynamic content crawling
- Respects robots.txt
- Configurable depth and exclusion rules
- Real-time crawl statistics
- Export functionality

## Windsurf Quick Reference

### Common Commands
- Start server: `npm start`
- Run all tests: `npm test`
- Run specific test: `npm test -- path/to/test.js`

### Key Files
- `server.js`: Main server implementation
- `headless-crawler.js`: Core crawler functionality
- `__tests__/`: Test files

### Troubleshooting
- For ES module errors: Check `--experimental-vm-modules` flag in package.json
- For fetch issues: Verify node-fetch import syntax
- For test failures: Ensure all dependencies are installed

## Code Style Guidelines

- All code, comments, and documentation must be written in English
- This applies regardless of the communication language used in issues or discussions
- Variable names, function names, and comments should be clear and descriptive in English
