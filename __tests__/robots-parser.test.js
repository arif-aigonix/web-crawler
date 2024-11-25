const RobotsParser = require('../robots-parser');

describe('RobotsParser', () => {
  let parser;

  beforeEach(() => {
    parser = new RobotsParser();
  });

  describe('parse', () => {
    test('should parse allow rules correctly', () => {
      const robotsTxt = `
        User-agent: *
        Allow: /allowed-path
        Disallow: /disallowed-path
      `;
      const domain = 'https://example.com';
      
      parser.parse(robotsTxt, domain);
      
      expect(parser.isAllowed('https://example.com/allowed-path')).toBe(true);
      expect(parser.isAllowed('https://example.com/disallowed-path')).toBe(false);
    });

    test('should handle multiple user agents', () => {
      const robotsTxt = `
        User-agent: bot1
        Allow: /path1
        
        User-agent: bot2
        Disallow: /path1
      `;
      const domain = 'https://example.com';
      
      parser.parse(robotsTxt, domain);
      
      expect(parser.isAllowed('https://example.com/path1')).toBe(true);
    });

    test('should handle empty robots.txt', () => {
      parser.parse('', 'https://example.com');
      expect(parser.isAllowed('https://example.com/any-path')).toBe(true);
    });
  });
});
