import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../server.js';

// Mock puppeteer
const mockPage = {
    goto: jest.fn(),
    content: jest.fn(),
    evaluate: jest.fn(),
    close: jest.fn(),
    setViewport: jest.fn(),
    setJavaScriptEnabled: jest.fn(),
    setUserAgent: jest.fn()
};

const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn()
};

const puppeteerMock = {
    launch: jest.fn().mockResolvedValue(mockBrowser)
};

jest.mock('puppeteer', () => ({
    __esModule: true,
    default: puppeteerMock
}));

jest.setTimeout(60000); // Increase timeout to 60 seconds

describe('Framework Detection API', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        server = app.listen(0); // Use dynamic port
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;

        // Set up default mock implementations
        mockPage.goto.mockResolvedValue({ ok: () => true });
        mockPage.evaluate.mockResolvedValue({
            frameworks: ['React'],
            isDynamic: true
        });
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        if (mockBrowser.close) {
            await mockBrowser.close();
        }
        // Reset all mocks
        jest.resetAllMocks();
    });
    afterEach(async () => {
        // Clean up after each test
        if (mockPage.close) {
            await mockPage.close();
        }
        jest.clearAllMocks();
    });

    beforeEach(() => {
        
        jest.clearAllMocks();
        
        // Reset default mock implementations
        mockPage.goto.mockResolvedValue({ ok: () => true });
        mockPage.evaluate.mockResolvedValue({
            frameworks: ['React'],
            isDynamic: true
        });
        mockPage.setViewport.mockResolvedValue();
        mockPage.setJavaScriptEnabled.mockResolvedValue();
        mockPage.setUserAgent.mockResolvedValue();
    });

    describe('POST /api/detect-framework', () => {
        it('should detect frameworks for valid URLs', async () => {
            mockPage.evaluate.mockResolvedValueOnce({
                frameworks: ['React'],
                isDynamic: true
            });

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('frameworks');
            expect(response.body).toHaveProperty('isDynamic');
            expect(Array.isArray(response.body.frameworks)).toBe(true);
            expect(response.body.frameworks).toContain('React');
        }, 60000);

        it('should handle invalid URLs', async () => {
            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'invalid-url' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toBe('Invalid URL format');
        });

        it('should handle missing URL parameter', async () => {
            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toBe('URL parameter is required');
        });
    });

    describe('Error Handling', () => {
        it('should handle browser launch failures', async () => {
            puppeteerMock.launch.mockRejectedValueOnce(new Error('Browser launch failed'));

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Browser launch failed');
        }, 60000);

        it('should handle navigation failures', async () => {
            mockPage.goto.mockRejectedValueOnce(new Error('Navigation failed'));

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Navigation failed');
        }, 60000);

        it('should handle evaluation failures', async () => {
            mockPage.evaluate.mockRejectedValueOnce(new Error('Evaluation failed'));

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Evaluation failed');
        }, 60000);
    });

    describe('Framework Detection', () => {
        it('should detect React', async () => {
            mockPage.evaluate.mockResolvedValueOnce({
                frameworks: ['React'],
                isDynamic: true
            });

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(200);
            expect(response.body.frameworks).toContain('React');
        }, 60000);

        it('should detect Vue.js', async () => {
            mockPage.evaluate.mockResolvedValueOnce({
                frameworks: ['Vue.js'],
                isDynamic: true
            });

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(200);
            expect(response.body.frameworks).toContain('Vue.js');
        }, 60000);

        it('should detect multiple frameworks', async () => {
            mockPage.evaluate.mockResolvedValueOnce({
                frameworks: ['React', 'Next.js'],
                isDynamic: true
            });

            const response = await request(baseUrl)
                .post('/api/detect-framework')
                .send({ url: 'https://example.com' });

            expect(response.status).toBe(200);
            expect(response.body.frameworks).toContain('React');
            expect(response.body.frameworks).toContain('Next.js');
        }, 60000);
    });
});
