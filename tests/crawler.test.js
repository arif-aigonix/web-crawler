import { jest } from '@jest/globals';
import fetch from 'node-fetch';
import app from '../server.js';

jest.setTimeout(30000); // 30 seconds

describe('Web Crawler API', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        server = app.listen();
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    test('should crawl a website with depth 1', async () => {
        const response = await fetch(`${baseUrl}/api/crawl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                url: 'https://example.com',
                maxDepth: 1,
                exclusionRules: []
            })
        });

        const result = await response.json();

        // Check structure of response
        expect(result).toHaveProperty('stats');
        expect(result).toHaveProperty('urls');
        expect(result.stats).toHaveProperty('total');
        expect(result.stats).toHaveProperty('accepted');
        expect(result.stats).toHaveProperty('external');
        expect(result.stats).toHaveProperty('excluded');
        expect(result.stats).toHaveProperty('error');
        expect(Array.isArray(result.urls)).toBe(true);

        // Each URL in the result should have required properties
        result.urls.forEach(url => {
            expect(url).toHaveProperty('url');
            expect(url).toHaveProperty('status');
            expect(typeof url.url).toBe('string');
            expect(['accepted', 'external', 'excluded', 'error']).toContain(url.status);
        });
    });

    test('should handle invalid URLs', async () => {
        const response = await fetch(`${baseUrl}/api/crawl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                url: 'invalid-url',
                maxDepth: 1,
                exclusionRules: []
            })
        });

        const result = await response.json();
        expect(result).toHaveProperty('error');
    });

    test('should respect exclusion rules', async () => {
        const response = await fetch(`${baseUrl}/api/crawl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                url: 'https://example.com',
                maxDepth: 1,
                exclusionRules: ['/blog', '/about']
            })
        });

        const result = await response.json();
        
        // Check that URLs matching exclusion rules are marked as excluded
        const excludedUrls = result.urls.filter(url => url.status === 'excluded');
        excludedUrls.forEach(url => {
            expect(url.url).toMatch(/\/(blog|about)/);
        });
    });
});
