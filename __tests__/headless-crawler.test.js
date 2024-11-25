const HeadlessCrawler = require('../headless-crawler');

jest.mock('puppeteer', () => ({
  launch: jest.fn()
    .mockImplementationOnce(() => Promise.resolve({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({
          links: ['https://example.com/page1', 'https://example.com/page2'],
          framework: 'test-framework'
        }),
        close: jest.fn()
      }),
      close: jest.fn()
    }))
    .mockImplementationOnce(() => Promise.resolve({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({
          links: ['https://example.com/page1'],
          framework: 'test-framework'
        }),
        close: jest.fn()
      }),
      close: jest.fn()
    }))
    .mockImplementationOnce(() => Promise.reject(new Error('Browser launch failed')))
}));

describe('HeadlessCrawler', () => {
  let crawler;

  beforeEach(() => {
    crawler = new HeadlessCrawler();
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
      expect(Object.keys(result.byDepth).length).toBeLessThanOrEqual(2); // depth 0 and 1
    });

    test('should handle browser launch errors', async () => {
      const url = 'https://example.com';
      const maxDepth = 1;

      const result = await crawler.crawl(url, maxDepth);
      expect(result.stats.error).toBe(1);
    });

    test('should handle invalid URLs', async () => {
      const url = 'not-a-url';
      const maxDepth = 1;

      const result = await crawler.crawl(url, maxDepth);
      expect(result.stats.error).toBe(1);
    });
  });
});
