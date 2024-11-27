const HeadlessCrawler = require('../../headless-crawler.js');

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockImplementation(() => Promise.resolve({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn(),
      evaluate: jest.fn().mockImplementation(() => ({
        links: ['https://example.com/page1', 'https://example.com/page2'],
        frameworks: ['React'],
        reactElements: true,
        vueElements: false,
        angularElements: false,
        jqueryElements: false
      })),
      close: jest.fn()
    }),
    close: jest.fn()
  }))
}));

describe('HeadlessCrawler', () => {
  let crawler;

  beforeEach(() => {
    crawler = new HeadlessCrawler();
  });

  describe('detectFramework', () => {
    test('should detect frameworks correctly', async () => {
      const url = 'https://example.com';
      const result = await crawler.detectFramework(url);
      
      expect(result).toBeDefined();
      expect(result.frameworks).toBeDefined();
      expect(Array.isArray(result.frameworks)).toBe(true);
      expect(result.frameworks).toContain('React');
    });

    test('should handle invalid URLs', async () => {
      const url = 'not-a-url';
      const result = await crawler.detectFramework(url);
      expect(result.error).toBe('Invalid URL format');
      expect(result.frameworks).toEqual([]);
    });
  });

  describe('crawl', () => {
    test('should crawl pages and extract links', async () => {
      const url = 'https://example.com';
      const maxDepth = 2;

      const result = await crawler.crawl(url, maxDepth);
      
      expect(result).toBeDefined();
      expect(result.urls).toBeInstanceOf(Array);
      expect(result.urls[0]).toHaveProperty('url', url);
      expect(result.stats).toBeDefined();
    });

    test('should respect max depth', async () => {
      const url = 'https://example.com';
      const maxDepth = 1;

      const result = await crawler.crawl(url, maxDepth);
      
      expect(result.byDepth).toBeDefined();
      expect(Object.keys(result.byDepth).length).toBeLessThanOrEqual(2);
    });

    test('should handle invalid URLs', async () => {
      const url = 'not-a-url';
      const maxDepth = 1;

      const result = await crawler.crawl(url, maxDepth);
      expect(result.stats.error).toBe(1);
    });

    test('should handle browser launch errors', async () => {
      // Mock fetch to simulate a server error
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Failed to fetch'));

      const url = 'https://example.com';
      const maxDepth = 1;

      const result = await crawler.crawl(url, maxDepth);
      expect(result.stats.error).toBe(1);
      expect(result.urls[0].status).toBe('error');
    });
  });
});
