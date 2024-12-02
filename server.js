import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import { RobotsParser } from './robots-parser.js';
import { HeadlessCrawler } from './headless-crawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium-browser';
            
            // Check if Chrome is accessible
            try {
                execSync(`${chromePath} --version`, { stdio: 'ignore' });
            } catch (error) {
                console.error(`Chrome not found at ${chromePath}. Please ensure Chrome/Chromium is installed.`);
                return null;
            }

            browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080'
                ],
                executablePath: chromePath,
                ignoreDefaultArgs: ['--disable-extensions'],
                defaultViewport: {
                    width: 1920,
                    height: 1080
                },
                headless: 'new' // Required for Puppeteer 23+
            });

            // Handle browser disconnection
            browser.on('disconnected', () => {
                console.log('Browser disconnected. Will create new instance on next request.');
                browser = null;
            });

            // Handle process termination
            ['SIGINT', 'SIGTERM'].forEach(signal => {
                process.on(signal, async () => {
                    if (browser) {
                        await browser.close();
                        browser = null;
                    }
                    process.exit();
                });
            });
        } catch (error) {
            console.error('Failed to launch browser:', error);
            return null;
        }
    }
    return browser;
}

// Maximum retries for page load
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Function to setup page with optimal settings
async function setupPage(page) {
    // Set viewport and user agent
    await page.setUserAgent(userAgent);
    
    // Enable JavaScript
    await page.setJavaScriptEnabled(true);
    
    // We don't need request interception if the client is fast
    // Just add error logging
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            console.error('Page Error:', msg.text());
        }
    });

    page.on('error', (err) => {
        console.error('Page crashed:', err);
    });

    page.on('pageerror', (err) => {
        console.error('Page error:', err);
    });
}

// Ensure cleanup of browser on app shutdown
async function cleanup() {
    if (browser) {
        try {
            await browser.close();
        } catch (error) {
            console.error('Error closing browser:', error);
        }
        browser = null;
    }
}

process.on('beforeExit', cleanup);
process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup().then(() => process.exit());
});
process.on('SIGTERM', () => {
    cleanup().then(() => process.exit());
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup().then(() => process.exit(1));
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

app.post('/fetch', async (req, res) => {
    try {
        const { url, respectRobots, usePuppeteer } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Validate URL format
        try {
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return res.status(400).json({ error: 'Invalid URL format: only HTTP and HTTPS protocols are supported' });
            }
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
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
                // Continue even if robots.txt check fails
            }
        }

        if (usePuppeteer) {
            let retryCount = 0;
            while (retryCount < MAX_RETRIES) {
                try {
                    const browser = await getBrowser();
                    if (!browser) {
                        throw new Error('Failed to initialize browser');
                    }
                    
                    const page = await browser.newPage();
                    await setupPage(page);
                    
                    // Set timeout for the entire operation
                    const pagePromise = (async () => {
                        try {
                            // Navigate with timeout and error handling
                            const response = await page.goto(url, { 
                                waitUntil: ['networkidle0', 'domcontentloaded'],
                                timeout: 30000 
                            });

                            // Add detailed logging
                            console.log(`Page response: status=${response.status}, statusText=${response.statusText}`);

                            // Consider both 2xx and 304 as successful responses
                            // Note: response.ok is true for status codes 200-299
                            if (response.status !== 304 && !response.ok) {
                                console.error(`Failed response: status=${response.status}, statusText=${response.statusText}`);
                                throw new Error(`Failed to load page: ${response.status} ${response.statusText}`);
                            }

                            // For 304 responses, we still want to get the cached content
                            const html = await page.content();
                            console.log(`Retrieved HTML content length: ${html.length}`);

                            // Get the final URL after any redirects
                            const finalUrl = page.url();
                            console.log(`Final URL after redirects: ${finalUrl}`);

                            return { html, finalUrl };
                        } finally {
                            await page.close();
                        }
                    })();

                    // Set overall timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Operation timed out')), 45000);
                    });

                    const { html, finalUrl } = await Promise.race([pagePromise, timeoutPromise]);

                    return res.json({ 
                        html,
                        finalUrl,
                        dynamicContent: true
                    });
                } catch (error) {
                    console.error(`Puppeteer error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
                    retryCount++;
                    
                    // Don't retry on certain errors
                    if (error.message.includes('net::ERR_ABORTED') || 
                        error.message.includes('net::ERR_BLOCKED_BY_CLIENT')) {
                        console.log('Not retrying due to client-side abort or blocking');
                        return res.status(400).json({ 
                            error: `Page load blocked or aborted: ${error.message}`,
                            html: null 
                        });
                    }
                    
                    if (retryCount === MAX_RETRIES) {
                        return res.status(500).json({ 
                            error: `Failed to fetch page with Puppeteer after ${MAX_RETRIES} attempts: ${error.message}`,
                            html: null 
                        });
                    }
                    
                    // Exponential backoff for retries
                    const delay = RETRY_DELAY * Math.pow(2, retryCount - 1);
                    console.log(`Waiting ${delay}ms before retry ${retryCount}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // Non-Puppeteer fetch
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': userAgent }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const html = await response.text();
            return res.json({ 
                html,
                finalUrl: response.url,
                dynamicContent: false
            });
        } catch (error) {
            console.error('Fetch error:', error);
            return res.status(500).json({ 
                error: `Failed to fetch page: ${error.message}`,
                html: null 
            });
        }
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            error: `Server error: ${error.message}`,
            html: null 
        });
    }
});

// Only start the server if this file is run directly
if (import.meta.url === `file://${__filename}`) {
    app.listen(port, host, () => {
        console.log(`Server running on port ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use`);
        } else {
            console.error('Server error:', err);
        }
    });
}

export { app };
