const request = require('supertest');
const express = require('express');
const path = require('path');
const app = require('../../server.js');

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn(),
      evaluate: jest.fn().mockResolvedValue({
        frameworks: ['React'],
        isDynamic: true
      }),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

// Use a different port for testing
let server;

describe('Server', () => {
  beforeAll(async () => {
    server = app.listen(3002);
    await new Promise((resolve) => server.once('listening', resolve));
    console.log('Test server running on port 3002');
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  describe('GET /', () => {
    test('should serve index.html', async () => {
      const response = await request(`http://localhost:3002`).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    });
  });

  describe('POST /api/crawl', () => {
    test('should handle valid crawl requests', async () => {
      const crawlData = {
        url: 'https://example.com',
        depth: 2,
        useHeadless: false
      };

      const response = await request(`http://localhost:3002`)
        .post('/api/crawl')
        .send(crawlData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urls');
    });

    test('should handle invalid URLs', async () => {
      const crawlData = {
        url: 'invalid-url',
        depth: 2,
        useHeadless: false
      };

      const response = await request(`http://localhost:3002`)
        .post('/api/crawl')
        .send(crawlData);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/check-robots', () => {
    test('should check robots.txt permissions', async () => {
      const response = await request(`http://localhost:3002`)
        .get('/api/check-robots')
        .query({ url: 'https://example.com/page' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('allowed');
    });
  });

  describe('POST /api/detect-framework', () => {
    test('should detect website framework', async () => {
      const response = await request(`http://localhost:3002`)
        .post('/api/detect-framework')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.frameworks)).toBe(true);
    });

    test('should handle invalid URLs', async () => {
      const response = await request(`http://localhost:3002`)
        .post('/api/detect-framework')
        .send({ url: 'invalid-url' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /fetch', () => {
    test('should fetch page content', async () => {
      const response = await request(app)
        .post('/fetch')
        .send({
          url: 'https://example.com',
          respectRobots: false,
          usePuppeteer: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('html');
      expect(typeof response.body.html).toBe('string');
    });

    test('should handle invalid URLs', async () => {
      const response = await request(app)
        .post('/fetch')
        .send({
          url: 'invalid-url',
          respectRobots: false,
          usePuppeteer: false
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
