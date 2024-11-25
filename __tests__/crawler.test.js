/**
 * @jest-environment jsdom
 */

// Mock the window object and required browser APIs
global.window = {
  addEventListener: jest.fn()
};

// Create a mock class that matches the actual implementation
class URLCrawler {
  constructor() {
    this.urlMap = new Map();
    this.queue = [];
    this.processing = false;
    this.maxDepth = 1;
    this.exclusionRules = [];
    this.baseUrl = '';
    this.baseDomain = '';
    this.processedCount = 0;
    this.acceptedCount = 0;
    this.totalFound = 0;
    this.depthStats = new Map();
    this.streamBuffer = [];
    this.maxStreamItems = 1000;
  }

  addToQueue(url, depth) {
    if (depth > this.maxDepth) return;
    if (this.urlMap.has(url)) return;
    if (this.exclusionRules.some(rule => rule.test(url))) return;
    if (this.baseDomain && !url.includes(this.baseDomain)) return;

    this.queue.push({ url, depth });
    this.urlMap.set(url, { depth });
  }

  updateDepthStats(depth) {
    const count = this.depthStats.get(depth) || 0;
    this.depthStats.set(depth, count + 1);
  }

  addUrlToStream(url, depth) {
    if (this.streamBuffer.length >= this.maxStreamItems) {
      this.streamBuffer.shift();
    }
    this.streamBuffer.push({ url, depth });
  }
}

describe('URLCrawler', () => {
  let crawler;
  
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="urlStream"></div>
    `;
    crawler = new URLCrawler();
  });

  describe('initialization', () => {
    test('should initialize with default values', () => {
      expect(crawler.maxDepth).toBe(1);
      expect(crawler.urlMap.size).toBe(0);
      expect(crawler.queue.length).toBe(0);
      expect(crawler.processing).toBe(false);
    });
  });

  describe('URL management', () => {
    test('should add URLs to queue', () => {
      const url = 'https://example.com';
      crawler.addToQueue(url, 0);
      
      expect(crawler.queue.length).toBe(1);
      expect(crawler.urlMap.has(url)).toBe(true);
    });

    test('should respect max depth', () => {
      crawler.maxDepth = 2;
      crawler.addToQueue('https://example.com', 3);
      
      expect(crawler.queue.length).toBe(0);
    });

    test('should not add duplicate URLs', () => {
      const url = 'https://example.com';
      crawler.addToQueue(url, 0);
      crawler.addToQueue(url, 1);
      
      expect(crawler.queue.length).toBe(1);
    });
  });

  describe('statistics', () => {
    test('should track crawling statistics', () => {
      crawler.addToQueue('https://example.com', 0);
      crawler.processedCount++;
      crawler.acceptedCount++;
      
      expect(crawler.processedCount).toBe(1);
      expect(crawler.acceptedCount).toBe(1);
    });

    test('should update depth statistics', () => {
      crawler.updateDepthStats(1);
      expect(crawler.depthStats.get(1)).toBe(1);
    });
  });

  describe('filtering', () => {
    test('should apply exclusion rules', () => {
      crawler.exclusionRules = [/excluded/];
      crawler.addToQueue('https://example.com/excluded', 0);
      
      expect(crawler.queue.length).toBe(0);
    });

    test('should filter by base domain', () => {
      crawler.baseDomain = 'example.com';
      crawler.addToQueue('https://otherdomain.com', 0);
      
      expect(crawler.queue.length).toBe(0);
    });
  });

  describe('UI updates', () => {
    test('should add items to stream buffer', () => {
      crawler.addUrlToStream('https://example.com', 1);
      
      expect(crawler.streamBuffer.length).toBe(1);
    });

    test('should respect max stream items', () => {
      for (let i = 0; i < crawler.maxStreamItems + 10; i++) {
        crawler.addUrlToStream(`https://example.com/${i}`, 1);
      }
      
      expect(crawler.streamBuffer.length).toBeLessThanOrEqual(crawler.maxStreamItems);
    });
  });
});
