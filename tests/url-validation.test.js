import { jest } from '@jest/globals';
import { URLCrawler } from '../crawler.js';

// Mock global alert
global.alert = jest.fn();

// Mock DOM elements and functions
beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock DOM elements
    document.body.innerHTML = `
        <input id="urlInput" type="text">
        <button id="startButton">Start</button>
        <button id="stopButton">Stop</button>
        <div id="status"></div>
        <div id="results"></div>
        <div id="error"></div>
    `;

    // Mock localStorage
    const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        clear: jest.fn()
    };
    global.localStorage = localStorageMock;

    // Mock fetch
    global.fetch = jest.fn(() =>
        Promise.resolve({
            ok: true,
            text: () => Promise.resolve('<html><body><a href="https://example.com">Link</a></body></html>')
        })
    );
});

describe('URL Validation Tests', () => {
    let crawler;

    beforeEach(() => {
        crawler = new URLCrawler();
        crawler.setupEventListeners();
    });

    test('should validate correct HTTP URL', () => {
        expect(crawler.validateUrl('http://example.com')).toBe(true);
    });

    test('should validate correct HTTPS URL', () => {
        expect(crawler.validateUrl('https://example.com')).toBe(true);
    });

    test('should reject URL with invalid protocol (htttps)', () => {
        expect(crawler.validateUrl('htttps://example.com')).toBe(false);
    });

    test('should reject URL with FTP protocol', () => {
        expect(crawler.validateUrl('ftp://example.com')).toBe(false);
    });

    test('should reject malformed URLs', () => {
        expect(crawler.validateUrl('not-a-url')).toBe(false);
    });

    test('should reject empty URLs', () => {
        expect(crawler.validateUrl('')).toBe(false);
    });

    test('should reject URLs with missing protocol', () => {
        expect(crawler.validateUrl('example.com')).toBe(false);
    });
});

describe('Crawler Core Functionality', () => {
    let crawler;

    beforeEach(() => {
        crawler = new URLCrawler();
        crawler.setupEventListeners();
    });

    test('should initialize with empty queue and visited set', () => {
        expect(crawler.queue).toEqual([]);
        expect(crawler.visited.size).toBe(0);
        expect(crawler.isCrawling).toBe(false);
    });

    test('should update UI elements correctly', () => {
        const message = 'Test message';
        crawler.updateUI('status', message);
        expect(document.getElementById('status').textContent).toBe(message);
    });

    test('should handle error messages correctly', () => {
        const errorMessage = 'Test error';
        crawler.handleError(errorMessage);
        expect(document.getElementById('error').textContent).toBe(errorMessage);
    });

    test('should process queue and update visited links', async () => {
        crawler.queue = ['https://example.com'];
        await crawler.processQueue();
        expect(crawler.visited.has('https://example.com')).toBe(true);
    });

    test('should extract links from HTML content', () => {
        const html = '<a href="https://test1.com">Link1</a><a href="https://test2.com">Link2</a>';
        const links = crawler.extractLinks(html, 'https://example.com');
        expect(links).toContain('https://test1.com');
        expect(links).toContain('https://test2.com');
    });

    test('should handle relative URLs correctly', () => {
        const html = '<a href="/page1">Page1</a><a href="../page2">Page2</a>';
        const links = crawler.extractLinks(html, 'https://example.com');
        expect(links).toContain('https://example.com/page1');
    });
});

describe('start() method URL validation', () => {
    let crawler;

    beforeEach(() => {
        crawler = new URLCrawler();
        crawler.setupEventListeners();
    });

    test('should not start crawling with invalid URL', async () => {
        const urlInput = document.getElementById('urlInput');
        urlInput.value = 'invalid-url';
        await crawler.start();
        expect(crawler.isCrawling).toBe(false);
        expect(document.getElementById('error').textContent).toBeTruthy();
    });

    test('should proceed with valid URL', async () => {
        const urlInput = document.getElementById('urlInput');
        urlInput.value = 'https://example.com';
        await crawler.start();
        expect(crawler.isCrawling).toBe(true);
        expect(crawler.queue.length).toBeGreaterThan(0);
    });

    test('should handle stop correctly', () => {
        crawler.isCrawling = true;
        crawler.stop();
        expect(crawler.isCrawling).toBe(false);
        expect(crawler.queue).toEqual([]);
    });
});

describe('Error Handling', () => {
    let crawler;

    beforeEach(() => {
        crawler = new URLCrawler();
        crawler.setupEventListeners();
    });

    test('should handle network errors gracefully', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
        crawler.queue = ['https://example.com'];
        await crawler.processQueue();
        expect(document.getElementById('error').textContent).toContain('Network error');
    });

    test('should handle malformed HTML gracefully', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('malformed html<<<')
            })
        );
        crawler.queue = ['https://example.com'];
        await crawler.processQueue();
        expect(crawler.visited.has('https://example.com')).toBe(true);
    });
});
