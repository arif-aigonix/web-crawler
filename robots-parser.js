class RobotsParser {
    constructor() {
        this.rules = new Map(); // userAgent -> {allow: [], disallow: [], crawlDelay: null}
        this.sitemaps = [];
    }

    parse(robotsTxt, baseUrl) {
        let currentUserAgent = '*';
        let currentRules = this.getDefaultRules();

        const lines = robotsTxt.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const [field, ...values] = line.split(':').map(s => s.trim());
            const value = values.join(':').trim();

            switch (field.toLowerCase()) {
                case 'user-agent':
                    if (currentRules.allow.length > 0 || currentRules.disallow.length > 0) {
                        this.rules.set(currentUserAgent, currentRules);
                        currentRules = this.getDefaultRules();
                    }
                    currentUserAgent = value.toLowerCase();
                    break;
                case 'allow':
                    if (value) currentRules.allow.push(this.normalizePattern(value));
                    break;
                case 'disallow':
                    if (value) currentRules.disallow.push(this.normalizePattern(value));
                    break;
                case 'crawl-delay':
                    currentRules.crawlDelay = parseInt(value) || null;
                    break;
                case 'sitemap':
                    if (value) {
                        try {
                            const sitemapUrl = new URL(value, baseUrl).toString();
                            this.sitemaps.push(sitemapUrl);
                        } catch (e) {
                            console.error('Invalid sitemap URL:', value);
                        }
                    }
                    break;
            }
        }

        // Save the last user-agent rules
        this.rules.set(currentUserAgent, currentRules);
    }

    getDefaultRules() {
        return {
            allow: [],
            disallow: [],
            crawlDelay: null
        };
    }

    normalizePattern(pattern) {
        // Convert robots.txt pattern to regex
        return new RegExp('^' + pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '\\?')
            .replace(/\./g, '\\.')
            .replace(/\//g, '\\/'));
    }

    isAllowed(url, userAgent = '*') {
        try {
            const parsedUrl = new URL(url);
            const path = parsedUrl.pathname + parsedUrl.search;

            // Get rules for specific user agent or default to '*'
            const rules = this.rules.get(userAgent.toLowerCase()) || 
                         this.rules.get('*') || 
                         this.getDefaultRules();

            // Check if URL matches any allow pattern
            const allowMatch = rules.allow.some(pattern => pattern.test(path));
            if (allowMatch) return true;

            // Check if URL matches any disallow pattern
            const disallowMatch = rules.disallow.some(pattern => pattern.test(path));
            if (disallowMatch) return false;

            // If no patterns match, it's allowed
            return true;
        } catch (e) {
            console.error('Error checking robots.txt rules:', e);
            return false; // When in doubt, don't crawl
        }
    }

    getCrawlDelay(userAgent = '*') {
        const rules = this.rules.get(userAgent.toLowerCase()) || 
                     this.rules.get('*') || 
                     this.getDefaultRules();
        return rules.crawlDelay || 0;
    }
}

module.exports = RobotsParser;
