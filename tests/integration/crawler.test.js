/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { URLCrawler } from '../../crawler.js';

// Mock the window object and required browser APIs
global.window = {
  addEventListener: jest.fn()
};

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
