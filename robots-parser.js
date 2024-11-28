class RobotsParser {
    constructor() {
        this.rules = new Map(); // userAgent -> {allow: [], disallow: [], crawlDelay: null}
        this.sitemaps = [];
    }

    parse(robotsTxt, baseUrl) {
        if (!robotsTxt) return;

        let currentUserAgent = '*';
        const lines = robotsTxt.split('\n');

        for (let line of lines) {
            try {
                // Remove comments and trim whitespace
                line = line.split('#')[0].trim().toLowerCase();
                if (!line) continue;

                const [field, ...valueParts] = line.split(':');
                const value = valueParts.join(':').trim();

                if (!value) continue;

                switch (field.toLowerCase()) {
                    case 'user-agent':
                        currentUserAgent = value;
                        if (!this.rules.has(currentUserAgent)) {
                            this.rules.set(currentUserAgent, this.getDefaultRules());
                        }
                        break;

                    case 'allow':
                    case 'disallow':
                        if (!this.rules.has(currentUserAgent)) {
                            this.rules.set(currentUserAgent, this.getDefaultRules());
                        }
                        try {
                            const pattern = value.startsWith('/') ? value : '/' + value;
                            this.rules.get(currentUserAgent)[field].push(pattern);
                        } catch (error) {
                            console.warn(`Invalid ${field} pattern in robots.txt:`, value);
                        }
                        break;

                    case 'crawl-delay':
                        const delay = parseFloat(value);
                        if (!isNaN(delay) && delay >= 0) {
                            this.rules.get(currentUserAgent).crawlDelay = delay;
                        }
                        break;

                    case 'sitemap':
                        if (value.startsWith('http')) {
                            this.sitemaps.push(value);
                        } else if (baseUrl) {
                            this.sitemaps.push(new URL(value, baseUrl).href);
                        }
                        break;
                }
            } catch (error) {
                console.warn('Error parsing robots.txt line:', line, error);
                continue;
            }
        }
    }

    getDefaultRules() {
        return {
            allow: [],
            disallow: [],
            crawlDelay: null
        };
    }

    normalizePattern(pattern) {
        try {
            // Escape special regex characters first
            const escaped = pattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
                .replace(/\\\*/g, '.*')                  // Convert * back to .*
                .replace(/\\\$/g, '$');                  // Convert $ back to end anchor

            return new RegExp('^' + escaped);
        } catch (error) {
            console.warn('Invalid pattern in robots.txt:', pattern);
            return new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Fallback to exact match
        }
    }

    isAllowed(url, userAgent = '*') {
        try {
            const parsedUrl = new URL(url);
            const path = parsedUrl.pathname + parsedUrl.search;
            
            // Get rules for user agent, fallback to * if not found
            const rules = this.rules.get(userAgent) || this.rules.get('*') || this.getDefaultRules();
            
            // If no rules, allow by default
            if (!rules.allow.length && !rules.disallow.length) {
                return true;
            }

            // Check allow rules first (they take precedence)
            for (const pattern of rules.allow) {
                try {
                    const regex = this.normalizePattern(pattern);
                    if (regex.test(path)) {
                        return true;
                    }
                } catch (error) {
                    console.warn('Invalid allow pattern:', pattern);
                }
            }

            // Then check disallow rules
            for (const pattern of rules.disallow) {
                try {
                    const regex = this.normalizePattern(pattern);
                    if (regex.test(path)) {
                        return false;
                    }
                } catch (error) {
                    console.warn('Invalid disallow pattern:', pattern);
                }
            }

            // If no patterns match, allow by default
            return true;
        } catch (error) {
            console.warn('Error checking robots.txt permissions:', error);
            return true; // Allow by default in case of errors
        }
    }

    getCrawlDelay(userAgent = '*') {
        const rules = this.rules.get(userAgent.toLowerCase()) || 
                     this.rules.get('*') || 
                     this.getDefaultRules();
        return rules.crawlDelay || 0;
    }
}

export { RobotsParser };
