const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');
const RobotsParser = require('./robots-parser');

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

const userAgent = 'Mozilla/5.0 (compatible; CascadeCrawler/1.0; +http://localhost:3000)';

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
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
            headless: 'new'
        });
    }
    return browser;
}

// Cleanup browser on process exit
process.on('exit', async () => {
    if (browser) {
        await browser.close();
    }
});

app.post('/detect-framework', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({
            status: 'error',
            error: 'URL is required'
        });
    }

    try {
        const result = await detectFramework(url);
        res.json({
            status: 'success',
            ...result
        });
    } catch (error) {
        res.json({
            status: 'error',
            error: error.message
        });
    }
});

app.post('/fetch', async (req, res) => {
    const { url, respectRobots, usePuppeteer } = req.body;
    console.log('Fetch request:', { url, respectRobots, usePuppeteer });

    let page = null;
    try {
        // Check robots.txt if enabled
        if (respectRobots) {
            const robotsUrl = new URL('/robots.txt', url).toString();
            console.log('Checking robots.txt:', robotsUrl);
            
            try {
                const robotsRes = await fetch(robotsUrl);
                if (robotsRes.ok) {
                    const robotsTxt = await robotsRes.text();
                    const parser = new RobotsParser();
                    parser.parse(robotsTxt, new URL(url).origin);
                    if (!parser.isAllowed(url, userAgent)) {
                        console.log('URL disallowed by robots.txt:', url);
                        return res.json({
                            status: 'excluded',
                            reason: 'Disallowed by robots.txt'
                        });
                    }
                }
            } catch (error) {
                console.log('Error fetching robots.txt:', error.message);
            }
        }

        if (usePuppeteer) {
            // Reuse browser instance
            browser = await getBrowser();

            // Create a new page
            page = await browser.newPage();
            
            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                // Only allow HTML and necessary scripts
                if (['document', 'script', 'xhr', 'fetch'].includes(resourceType)) {
                    request.continue();
                } else {
                    request.abort();
                }
            });

            // Configure page
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent(userAgent);
            
            // Set shorter timeouts
            page.setDefaultNavigationTimeout(15000);
            page.setDefaultTimeout(15000);

            // Navigate to URL with optimized settings
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 15000
            });

            // Get the rendered HTML
            const content = await page.content();
            const finalUrl = page.url();

            res.json({
                status: 'success',
                html: content,
                finalUrl: finalUrl
            });
        } else {
            // Regular fetch mode
            const response = await fetch(url, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });

            const content = await response.text();
            res.json({
                status: 'success',
                html: content,
                finalUrl: response.url
            });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.json({
            status: 'error',
            error: error.message || 'Failed to fetch URL'
        });
    } finally {
        if (page) {
            await page.close();
        }
    }
});

// API endpoint for headless crawling
app.post('/api/crawl', async (req, res) => {
    const { url, maxDepth, exclusionRules } = req.body;

    if (!url) {
        return res.status(400).json({
            status: 'error',
            error: 'URL is required'
        });
    }

    try {
        const HeadlessCrawler = require('./headless-crawler');
        const crawler = new HeadlessCrawler(maxDepth || Infinity, exclusionRules || []);
        const results = await crawler.crawl(url);
        res.json({
            status: 'success',
            results
        });
    } catch (error) {
        console.error('API crawl error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message || 'Crawl failed'
        });
    }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
