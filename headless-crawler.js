import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';

class HeadlessCrawler {
    constructor(maxDepth = Infinity, exclusionRules = []) {
        this.urlMap = new Map();
        this.queue = [];
        this.maxDepth = maxDepth;
        this.exclusionRules = exclusionRules;
        this.baseUrl = "";
        this.baseDomain = "";
        this.results = {
            urls: [],
            stats: {
                total: 0,
                accepted: 0,
                excluded: 0,
                external: 0,
                error: 0,
            },
            byDepth: new Map(),
        };
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            // Remove trailing slash
            return urlObj.toString().replace(/\/$/, "");
        } catch (error) {
            console.error("Invalid URL:", url);
            throw error;
        }
    }

    isInternalUrl(url) {
        try {
            return new URL(url).hostname === this.baseDomain;
        } catch {
            return false;
        }
    }

    shouldExcludeUrl(url) {
        const urlLower = url.toLowerCase();

        // Skip common non-HTML extensions
        const skipExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".pdf",
            ".doc",
            ".docx",
            ".xls",
            ".xlsx",
            ".zip",
            ".tar",
            ".gz",
            ".exe",
            ".mp3",
            ".mp4",
            ".avi",
            ".css",
            ".js",
            ".ico",
            ".svg",
        ];

        if (skipExtensions.some((ext) => urlLower.endsWith(ext))) {
            return true;
        }

        // Skip URLs with query parameters that typically indicate non-HTML content
        const skipParams = ["download=", ".download", "attachment=", "format="];
        if (skipParams.some((param) => urlLower.includes(param))) {
            return true;
        }

        // Check against user-defined exclusion rules
        if (this.exclusionRules && this.exclusionRules.length > 0) {
            for (const rule of this.exclusionRules) {
                try {
                    const ruleLower = rule.trim().toLowerCase();
                    if (!ruleLower) continue;

                    if (
                        ruleLower.startsWith("/") &&
                        ruleLower.length > 2 &&
                        /\/[a-z]*$/.test(ruleLower)
                    ) {
                        const lastSlashIndex = ruleLower.lastIndexOf("/");
                        if (lastSlashIndex > 0) {
                            const pattern = ruleLower.substring(
                                1,
                                lastSlashIndex,
                            );
                            const flags = ruleLower.substring(
                                lastSlashIndex + 1,
                            );
                            const regex = new RegExp(pattern, flags);
                            if (regex.test(urlLower)) return true;
                        }
                    } else {
                        try {
                            const urlObj = new URL(url);
                            let pathLower = urlObj.pathname.toLowerCase();
                            pathLower = pathLower.replace(/\/$/, "");
                            const ruleClean = ruleLower.replace(
                                /^\/+|\/+$/g,
                                "",
                            );
                            const pathPattern = new RegExp(
                                `^/${ruleClean}(?:/.*)?$`,
                            );
                            if (pathPattern.test(pathLower)) return true;
                        } catch (e) {
                            const rulePattern = new RegExp(
                                `/${ruleLower.replace(/^\/+|\/+$/g, "")}(?:/|$)`,
                            );
                            if (rulePattern.test(urlLower)) return true;
                        }
                    }
                } catch (e) {
                    console.error("Error processing exclusion rule:", rule, e);
                }
            }
        }

        return false;
    }

    async extractUrls(html, sourceUrl) {
        if (!html) return [];

        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;

            const links = new Set();
            const addUrl = (url) => {
                try {
                    if (!url) return;
                    url = url.trim();
                    if (
                        !url ||
                        url.startsWith("#") ||
                        /^(javascript|data|mailto|tel|ftp|file):/.test(url)
                    )
                        return;
                    const absoluteUrl = new URL(url, sourceUrl).toString();
                    links.add(absoluteUrl);
                } catch (e) {
                    console.error("Error processing URL:", url, e);
                }
            };

            // Get URLs from various sources
            doc.querySelectorAll(
                'a[href], link[href][rel="alternate"]',
            ).forEach((link) => {
                addUrl(link.getAttribute("href"));
            });

            return Array.from(links);
        } catch (error) {
            console.error("Error extracting URLs:", error);
            return [];
        }
    }

    async processUrl(url, sourceUrl, depth) {
        const normalizedUrl = this.normalizeUrl(url);

        // Skip if already processed
        if (this.urlMap.has(normalizedUrl)) return;

        // Mark URL as processed
        this.urlMap.set(normalizedUrl, { sourceUrl, depth });
        this.results.stats.total++;

        // Update depth stats
        const depthCount = this.results.byDepth.get(depth) || 0;
        this.results.byDepth.set(depth, depthCount + 1);

        // Check validity
        if (!this.isInternalUrl(normalizedUrl)) {
            this.results.stats.external++;
            this.results.urls.push({
                url: normalizedUrl,
                sourceUrl,
                depth,
                status: "external",
            });
            return;
        }

        if (this.shouldExcludeUrl(normalizedUrl)) {
            this.results.stats.excluded++;
            this.results.urls.push({
                url: normalizedUrl,
                sourceUrl,
                depth,
                status: "excluded",
            });
            return;
        }

        try {
            // Fetch the page
            const response = await fetch(
                "https://e15f155f-c77a-4443-963a-5f5225dc327c-00-gmrpj3dapkv4.picard.replit.dev/fetch",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        url: normalizedUrl,
                        respectRobots: true,
                    }),
                },
            );

            let data;
            try {
                data = await response.json();
            } catch (error) {
                // Handle HTML or non-JSON responses
                this.results.stats.error++;
                this.results.urls.push({
                    url: normalizedUrl,
                    sourceUrl,
                    depth,
                    status: "error",
                    error: "Invalid response format",
                });
                return;
            }

            if (data.status === "error" || data.status === "excluded") {
                this.results.stats.error++;
                this.results.urls.push({
                    url: normalizedUrl,
                    sourceUrl,
                    depth,
                    status: "error",
                    error: data.error || data.reason,
                });
                return;
            }

            if (data.html) {
                this.results.stats.accepted++;
                this.results.urls.push({
                    url: normalizedUrl,
                    sourceUrl,
                    depth,
                    status: "accepted",
                });

                // Only extract new URLs if we haven't exceeded max depth
                if (depth < this.maxDepth || this.maxDepth === Infinity) {
                    const newUrls = await this.extractUrls(
                        data.html,
                        normalizedUrl,
                    );

                    // Add valid URLs to queue
                    for (const newUrl of newUrls) {
                        if (!this.urlMap.has(this.normalizeUrl(newUrl))) {
                            this.queue.push({
                                url: newUrl,
                                sourceUrl: normalizedUrl,
                                depth: depth + 1,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error processing URL:", error);
            this.results.stats.error++;
            this.results.urls.push({
                url: normalizedUrl,
                sourceUrl,
                depth,
                status: "error",
                error: error.message,
            });
        }
    }

    async crawl(startUrl) {
        try {
            // Validate URL format
            try {
                const urlObj = new URL(startUrl);
                this.baseUrl = urlObj.origin;
                this.baseDomain = urlObj.hostname;
            } catch (error) {
                return {
                    urls: [
                        {
                            url: startUrl,
                            depth: 0,
                            sourceUrl: null,
                            status: "error",
                            error: "Invalid URL format",
                        },
                    ],
                    stats: {
                        total: 1,
                        accepted: 0,
                        excluded: 0,
                        external: 0,
                        error: 1,
                    },
                    byDepth: { 0: 0 },
                };
            }

            // Reset state
            this.urlMap.clear();
            this.queue = [];
            this.results = {
                urls: [],
                stats: {
                    total: 0,
                    accepted: 0,
                    excluded: 0,
                    external: 0,
                    error: 0,
                },
                byDepth: new Map(),
            };

            // Start with the initial URL
            this.queue.push({ url: startUrl, sourceUrl: null, depth: 0 });

            // Process queue
            while (this.queue.length > 0) {
                const { url, sourceUrl, depth } = this.queue.shift();
                await this.processUrl(url, sourceUrl, depth);
            }

            // Convert byDepth Map to Object for JSON
            const byDepthObj = {};
            for (const [depth, count] of this.results.byDepth) {
                byDepthObj[depth] = count;
            }
            this.results.byDepth = byDepthObj;

            return this.results;
        } catch (error) {
            console.error("Crawl error:", error);
            return {
                urls: [],
                stats: {
                    total: 1,
                    accepted: 0,
                    excluded: 0,
                    external: 0,
                    error: 1,
                },
                byDepth: { 0: 0 },
            };
        }
    }

    async detectFramework(url) {
        try {
            // Validate URL format
            try {
                new URL(url);
            } catch (error) {
                return {
                    frameworks: [],
                    isDynamic: false,
                    error: "Invalid URL format",
                };
            }

            const browser = await puppeteer.launch({
                // Modern headless is now default
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                ],
                executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH,
                ignoreDefaultArgs: ["--disable-extensions"],
            });

            const page = await browser.newPage();
            await page.goto(url, { waitUntil: "networkidle0" });

            const result = await page.evaluate(() => {
                const frameworks = [];
                const isDynamic = !!window.history.pushState;

                // Check for common frameworks
                if (window.angular || document.querySelector("[ng-app]"))
                    frameworks.push("Angular");
                if (window.React || document.querySelector("[data-reactroot]"))
                    frameworks.push("React");
                if (window.Vue) frameworks.push("Vue.js");
                if (window.jQuery) frameworks.push("jQuery");

                return { frameworks, isDynamic };
            });

            await browser.close();
            return result;
        } catch (error) {
            return {
                frameworks: [],
                isDynamic: false,
                error: error.message,
            };
        }
    }
}

export { HeadlessCrawler };
