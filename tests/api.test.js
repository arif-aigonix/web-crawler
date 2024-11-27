const request = require('supertest');
const app = require('../server.js');

// Mock puppeteer
jest.mock('puppeteer', () => {
  const mockPage = {
    goto: jest.fn(),
    content: jest.fn(),
    evaluate: jest.fn().mockResolvedValue({
      frameworks: ['React'],
      isDynamic: true
    }),
    close: jest.fn(),
    setViewport: jest.fn(),
    setJavaScriptEnabled: jest.fn(),
    setUserAgent: jest.fn()
  };

  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn()
  };

  return {
    launch: jest.fn().mockResolvedValue(mockBrowser)
  };
});

jest.setTimeout(60000); // Increase timeout to 60 seconds

describe('Framework Detection API', () => {
  let server;
  let baseUrl;
  let puppeteer;

  beforeAll(async () => {
    server = app.listen(0); // Use dynamic port
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    baseUrl = `http://localhost:${address.port}`;
    puppeteer = require('puppeteer');
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  afterEach(async () => {
    // Clean up after each test
    jest.clearAllMocks();
  });

  describe('POST /api/detect-framework', () => {
    it('should detect frameworks for valid URLs', async () => {
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
      expect(response.body.error).toBe('URL is required');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should handle browser launch failures', async () => {
      puppeteer.launch.mockRejectedValueOnce(new Error('Browser launch failed'));

      const response = await request(baseUrl)
        .post('/api/detect-framework')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Browser launch failed');
    }, 60000);

    it('should handle navigation failures', async () => {
      const mockPage = {
        goto: jest.fn().mockRejectedValueOnce(new Error('Navigation failed')),
        evaluate: jest.fn(),
        close: jest.fn()
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValueOnce(mockPage),
        close: jest.fn()
      };
      puppeteer.launch.mockResolvedValueOnce(mockBrowser);

      const response = await request(baseUrl)
        .post('/api/detect-framework')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Navigation failed');
    }, 60000);

    it('should handle evaluation failures', async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValueOnce(),
        evaluate: jest.fn().mockRejectedValueOnce(new Error('Evaluation failed')),
        close: jest.fn()
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValueOnce(mockPage),
        close: jest.fn()
      };
      puppeteer.launch.mockResolvedValueOnce(mockBrowser);

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
      const mockPage = {
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValueOnce({
          frameworks: ['React'],
          isDynamic: true
        }),
        close: jest.fn()
      };
      puppeteer.launch.mockResolvedValueOnce({
        newPage: jest.fn().mockResolvedValueOnce(mockPage),
        close: jest.fn()
      });

      const response = await request(baseUrl)
        .post('/api/detect-framework')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(200);
      expect(response.body.frameworks).toContain('React');
    }, 60000);

    it('should detect Vue.js', async () => {
      const mockPage = {
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValueOnce({
          frameworks: ['Vue.js'],
          isDynamic: true
        }),
        close: jest.fn()
      };
      puppeteer.launch.mockResolvedValueOnce({
        newPage: jest.fn().mockResolvedValueOnce(mockPage),
        close: jest.fn()
      });

      const response = await request(baseUrl)
        .post('/api/detect-framework')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(200);
      expect(response.body.frameworks).toContain('Vue.js');
    }, 60000);

    it('should detect multiple frameworks', async () => {
      const mockPage = {
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValueOnce({
          frameworks: ['React', 'Next.js'],
          isDynamic: true
        }),
        close: jest.fn()
      };
      puppeteer.launch.mockResolvedValueOnce({
        newPage: jest.fn().mockResolvedValueOnce(mockPage),
        close: jest.fn()
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
