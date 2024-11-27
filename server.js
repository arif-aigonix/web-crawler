const express = require('express');
// We'll use dynamic import for fetch
let fetch;
(async () => {
  const { default: _fetch } = await import('node-fetch');
  fetch = _fetch;
})();
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');
const RobotsParser = require('./robots-parser');
const HeadlessCrawler = require('./headless-crawler');

const app = express();
const host = '0.0.0.0';
const port = 3000;

// Enable trust proxy for Replit
app.set('trust proxy', true);

// Store robots.txt data for different domains
const robotsCache = new Map();
const ROBOTS_CACHE_DURATION = 3600000; // 1 hour

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error'
    });
});

async function fetchRobotsTxt(domain) {
    try {
        const robotsUrl = `${domain}/robots.txt`;
        console.log('Fetching robots.txt from:', robotsUrl);
        
        const response = await fetch(robotsUrl);
        if (!response.ok) {
            console.log(`No robots.txt found at ${robotsUrl} (${response.status})`);
            return null;
        }

        const text = await response.text();
        const parser = new RobotsParser();
        parser.parse(text, domain);
        
        // Cache the parser
        robotsCache.set(domain, {
            parser,
            timestamp: Date.now()
        });
        
        return parser;
    } catch (error) {
        console.error('Error fetching robots.txt:', error);
        return null;
    }
}

async function getRobotsParser(url) {
    try {
        const domain = new URL(url).origin;
        const cached = robotsCache.get(domain);
        
        if (cached && (Date.now() - cached.timestamp) < ROBOTS_CACHE_DURATION) {
            return cached.parser;
        }
        
        return await fetchRobotsTxt(domain);
    } catch (error) {
        console.error('Error getting robots parser:', error);
        return null;
    }
}

function isAllowedByRobots(robotsTxt, url) {
    const parser = new RobotsParser();
    parser.parse(robotsTxt, new URL(url).origin);
    return parser.isAllowed(url);
}

const userAgent = 'Mozilla/5.0 (compatible; CascadeCrawler/1.0)';

async function detectFramework(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            }
        });
        const html = await response.text();
        
        const frameworks = {
            'React': [
                /<div[^>]*\sid="root"[^>]*>/i,
                /<div[^>]*\sid="app"[^>]*>/i,
                /react\.development\.js/i,
                /react\.production\.min\.js/i,
                /react-dom/i
            ],
            'Vue.js': [
                /<div[^>]*\sid="app"[^>]*>/i,
                /vue\.js/i,
                /vue\.min\.js/i,
                /vue-router/i,
                /"vue":/i
            ],
            'Angular': [
                /<[^>]+ng-[^>]+>/i,
                /angular\.js/i,
                /angular\.min\.js/i,
                /ng-app/i,
                /<app-root/i
            ],
            'Next.js': [
                /__NEXT_DATA__/i,
                /_next\/static/i,
                /next\/router/i
            ],
            'Gatsby': [
                /gatsby-/i,
                /__gatsby/i,
                /gatsby\.js/i
            ]
        };

        const detectedFrameworks = [];
        
        for (const [framework, patterns] of Object.entries(frameworks)) {
            if (patterns.some(pattern => pattern.test(html))) {
                detectedFrameworks.push(framework);
            }
        }

        // Check for client-side rendering by looking for empty content containers
        const hasEmptyContainers = /<div[^>]*>([\s\n]*|<!--[\s\S]*?-->)<\/div>/i.test(html) && 
                                 (/<div[^>]*\sid="root"[^>]*>[\s\n]*<\/div>/i.test(html) ||
                                  /<div[^>]*\sid="app"[^>]*>[\s\n]*<\/div>/i.test(html));

        return {
            frameworks: detectedFrameworks,
            isDynamic: detectedFrameworks.length > 0 || hasEmptyContainers,
            initialHtml: html
        };
    } catch (error) {
        console.error('Error detecting framework:', error);
        return {
            frameworks: [],
            isDynamic: false,
            error: error.message
        };
    }
}

// Browser instance that will be reused
let browser = null;

// Function to get or create a browser instance
async function getBrowser() {
    if (!browser) {
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
                ignoreDefaultArgs: ['--disable-extensions']
            });
        } catch (error) {
            console.error('Failed to launch browser:', error);
            throw error;
        }
    }
    return browser;
}

// Cleanup browser on process exit
process.on('exit', async () => {
    if (browser) {
        await browser.close();
    }
});

// API Routes
app.post('/api/crawl', async (req, res) => {
    try {
        const { url, depth, useHeadless } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        const crawler = new HeadlessCrawler();
        const results = await crawler.crawl(url, depth);
        
        res.json({
            status: 'success',
            urls: results.urls,
            stats: results.stats,
            byDepth: results.byDepth
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message || 'Crawl failed'
        });
    }
});

app.get('/api/check-robots', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            const urlObj = new URL(url);
            const robotsParser = await getRobotsParser(urlObj.origin);
            const allowed = robotsParser ? robotsParser.isAllowed(url) : true;

            res.json({ allowed });
        } catch (error) {
            res.status(400).json({ error: 'Invalid URL format' });
        }
    } catch (error) {
        res.status(500).json({
            error: error.message || 'Failed to check robots.txt'
        });
    }
});

app.post('/api/detect-framework', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        const crawler = new HeadlessCrawler();
        const result = await crawler.detectFramework(url);
        
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            frameworks: result.frameworks || [],
            isDynamic: result.isDynamic || false
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || 'Failed to detect framework'
        });
    }
});

// Add the /fetch endpoint
app.post('/fetch', async (req, res) => {
    try {
        const { url, respectRobots, usePuppeteer } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Check robots.txt if requested
        if (respectRobots) {
            try {
                const urlObj = new URL(url);
                const robotsParser = await getRobotsParser(urlObj.origin);
                if (robotsParser && !robotsParser.isAllowed(url)) {
                    return res.status(403).json({ 
                        error: 'Access denied by robots.txt',
                        html: null 
                    });
                }
            } catch (error) {
                console.error('Error checking robots.txt:', error);
            }
        }

        if (usePuppeteer) {
            const browser = await getBrowser();
            const page = await browser.newPage();
            try {
                // Set viewport and user agent
                await page.setViewport({ width: 1920, height: 1080 });
                await page.setUserAgent(userAgent);

                // Enable JavaScript and wait for network to be idle
                await page.setJavaScriptEnabled(true);
                await page.goto(url, { 
                    waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
                    timeout: 30000 
                });

                // Replace waitForTimeout with setTimeout wrapped in Promise
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Get the final URL after any redirects
                const finalUrl = page.url();

                // Get the rendered HTML
                const html = await page.content();

                res.json({ 
                    html,
                    finalUrl,
                    dynamicContent: true
                });
            } catch (error) {
                res.status(500).json({ 
                    error: `Failed to fetch page: ${error.message}`,
                    html: null 
                });
            } finally {
                await page.close();
            }
        } else {
            // Handle non-Puppeteer fetch here
            const response = await fetch(url, {
                headers: {
                    'User-Agent': userAgent
                }
            });
            const html = await response.text();
            res.json({ 
                html,
                finalUrl: response.url,
                dynamicContent: false
            });
        }
    } catch (error) {
        res.status(500).json({ 
            error: error.message || 'Failed to fetch page',
            html: null 
        });
    }
});

// Only start the server if not being required by another module (e.g. tests)
if (require.main === module) {
    const server = app.listen(port, host, () => {
        console.log(`Server running on port ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Trying port ${port + 1}`);
            server.close();
            app.listen(port + 1, host, () => {
                console.log(`Server running on port ${port + 1}`);
            });
        } else {
            console.error('Server error:', err);
        }
    });
}

module.exports = app;
