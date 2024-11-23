class URLCrawler {
    constructor() {
        this.urlMap = new Map(); // URL -> {sourceUrl, depth}
        this.queue = [];
        this.processing = false;
        this.startTime = null;
        this.maxDepth = 1;
        this.exclusionRules = [];
        this.baseUrl = '';
        this.baseDomain = '';
        
        // Statistics
        this.processedCount = 0;
        this.acceptedCount = 0;
        this.totalFound = 0;
        this.depthStats = new Map();

        // Stream management
        this.streamContainer = document.getElementById('urlStream');
        this.maxStreamItems = 1000;
        this.streamBuffer = [];
        this.updateInterval = null;
        this.lastUpdateTime = 0;
        this.minUpdateInterval = 500;
        this.currentDepthFilter = null;

        // Bind methods
        this.processQueue = this.processQueue.bind(this);
        this.updateUI = this.updateUI.bind(this);
        this.addUrlToStream = this.addUrlToStream.bind(this);
        this.filterStreamByDepth = this.filterStreamByDepth.bind(this);
        this.resetDepthFilter = this.resetDepthFilter.bind(this);
        this.usePuppeteer = false;
    }

    initializeStream() {
        this.streamContainer = document.getElementById('urlStream');
        if (this.streamContainer) {
            this.streamContainer.innerHTML = '';
            this.streamBuffer = [];
            
            // Set up periodic UI updates
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }
            this.updateInterval = setInterval(() => {
                this.flushStreamBuffer();
            }, this.minUpdateInterval);
        } else {
            console.error('Stream container not found!');
        }
    }

    addUrlToStream(url, sourceUrl, depth, status = 'accepted', reason = '') {
        console.log('Adding to stream:', { url, sourceUrl, depth, status, reason });
        const streamItem = {
            url,
            sourceUrl,
            depth,
            status,
            reason,
            timestamp: new Date().toISOString()
        };

        // Add to buffer instead of immediate DOM update
        this.streamBuffer.push(streamItem);
        console.log('Stream buffer size:', this.streamBuffer.length);

        // Store in localStorage if needed
        this.storeUrlData(streamItem);

        // Force an immediate UI update if needed
        if (status === 'error' || status === 'excluded') {
            this.flushStreamBuffer();
        }
    }

    storeUrlData(streamItem) {
        // Only store accepted URLs for export
        if (streamItem.status !== 'accepted') return;

        try {
            // Get existing export data
            let urlData = localStorage.getItem('crawlerData');
            let data = urlData ? JSON.parse(urlData) : [];
            
            // Add new item with only required fields
            data.push({
                url: streamItem.url,
                sourceUrl: streamItem.sourceUrl,
                depth: streamItem.depth,
                timestamp: streamItem.timestamp
            });
            
            // Keep only last 10000 items to prevent localStorage from getting too full
            if (data.length > 10000) {
                data = data.slice(-10000);
            }
            
            // Store back to crawlerData (for export)
            localStorage.setItem('crawlerData', JSON.stringify(data));

            // Separately store stream display data
            let streamData = localStorage.getItem('streamData');
            let streamItems = streamData ? JSON.parse(streamData) : [];
            streamItems.push(streamItem);
            
            // Keep only recent items for stream display
            if (streamItems.length > this.maxStreamItems) {
                streamItems = streamItems.slice(-this.maxStreamItems);
            }
            
            localStorage.setItem('streamData', JSON.stringify(streamItems));
        } catch (e) {
            console.warn('Failed to store URL data:', e);
            // If localStorage is full, clear stream data but preserve crawler data
            if (e.name === 'QuotaExceededError') {
                try {
                    localStorage.removeItem('streamData');
                    this.storeUrlData(streamItem); // Try again with just crawler data
                } catch (e2) {
                    console.error('Failed to recover from storage error:', e2);
                }
            }
        }
    }

    flushStreamBuffer() {
        if (this.streamBuffer.length === 0) return;
        console.log('Flushing buffer with', this.streamBuffer.length, 'items');

        const fragment = document.createDocumentFragment();
        
        this.streamBuffer.forEach(item => {
            const div = document.createElement('div');
            div.className = `stream-item ${item.status}`;
            div.setAttribute('data-depth', item.depth);
            const shouldShow = this.currentDepthFilter === null || this.currentDepthFilter === item.depth;
            div.style.display = shouldShow ? '' : 'none';
            
            div.innerHTML = `
                <div class="stream-item-header">
                    <span class="depth">Depth: ${item.depth}</span>
                    <span class="timestamp">${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="url">
                    <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="${item.url}">${this.truncateUrl(item.url, 100)}</a>
                </div>
                ${item.sourceUrl ? `<div class="source">From: <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer" title="${item.sourceUrl}">${this.truncateUrl(item.sourceUrl, 100)}</a></div>` : ''}
                ${item.reason ? `<div class="reason">${item.reason}</div>` : ''}
            `;
            
            fragment.appendChild(div);
        });

        // If we have a depth filter active, only count visible items towards the limit
        if (this.currentDepthFilter !== null) {
            const visibleItems = Array.from(this.streamContainer.children).filter(
                item => parseInt(item.getAttribute('data-depth')) === this.currentDepthFilter
            );
            console.log('Current visible items:', visibleItems.length);
            
            // Remove oldest items of the current depth if we're over the limit
            while (visibleItems.length + this.streamBuffer.length > this.maxStreamItems) {
                const oldestItem = visibleItems.shift();
                if (oldestItem && oldestItem.parentNode) {
                    oldestItem.parentNode.removeChild(oldestItem);
                    console.log('Removed old item to stay under limit');
                }
            }
        } else {
            // No filter active, remove oldest items regardless of depth
            while (this.streamContainer.children.length + this.streamBuffer.length > this.maxStreamItems) {
                this.streamContainer.removeChild(this.streamContainer.firstChild);
                console.log('Removed old item (no filter)');
            }
        }

        this.streamContainer.appendChild(fragment);
        this.streamBuffer = [];
        console.log('Buffer flushed, stream now has', this.streamContainer.children.length, 'items');

        // Auto-scroll if enabled
        if (document.getElementById('autoScroll').checked) {
            this.streamContainer.scrollTop = this.streamContainer.scrollHeight;
        }
    }

    truncateUrl(url, maxLength) {
        if (url.length <= maxLength) return url;
        const half = Math.floor(maxLength / 2);
        return url.substr(0, half) + '...' + url.substr(-half);
    }

    clearStream() {
        console.log('Clearing stream...');
        
        // Clear visual elements
        if (this.streamContainer) {
            this.streamContainer.innerHTML = '';
        }
        
        // Clear stream buffer
        this.streamBuffer = [];
        
        // Clear depth stats UI
        const depthStatsContainer = document.getElementById('depthStats');
        if (depthStatsContainer) {
            depthStatsContainer.innerHTML = '';
        }
        
        // Hide depth stats section
        const depthStatsSection = document.querySelector('.depth-stats-section');
        if (depthStatsSection) {
            depthStatsSection.style.display = 'none';
        }
        
        // Reset depth filter
        this.currentDepthFilter = null;
        document.getElementById('resetDepthFilter').disabled = true;
        
        // Clear depth statistics if not processing
        if (!this.processing) {
            this.depthStats.clear();
        }
        
        // Clear stream-specific localStorage items
        try {
            localStorage.removeItem('streamData');
        } catch (e) {
            console.error('Error clearing stream data from localStorage:', e);
        }

        console.log('Stream cleared');
    }

    exportData() {
        try {
            const urlData = localStorage.getItem('crawlerData');
            if (!urlData) {
                console.log('No data to export');
                return;
            }

            const data = JSON.parse(urlData);
            
            // Create and trigger download
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `crawler-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to export data:', e);
        }
    }

    stop() {
        this.processing = false;
        if (this.queue.length === 0) { 
            document.getElementById('startButton').textContent = 'Start Crawling';
            document.getElementById('startButton').disabled = false;
            document.getElementById('exportButton').disabled = false;
            document.getElementById('status').textContent = 'Crawling stopped';
            
            // Re-enable checkboxes
            document.getElementById('respectRobotsTxt').disabled = false;
            document.getElementById('useDynamicCrawling').disabled = false;
        }
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async start() {
        // Clear everything before starting
        this.clearStream();
        this.urlMap.clear();
        this.queue = [];
        this.processedCount = 0;
        this.acceptedCount = 0;
        this.totalFound = 0;
        this.depthStats.clear();
        
        // Reset UI elements
        document.getElementById('totalFound').textContent = '0';
        document.getElementById('processedCount').textContent = '0';
        document.getElementById('acceptedCount').textContent = '0';
        document.getElementById('status').textContent = 'Starting...';
        document.getElementById('elapsedTime').textContent = '00:00:00';
        
        // Clear depth stats
        const depthStatsContainer = document.getElementById('depthStats');
        if (depthStatsContainer) {
            depthStatsContainer.innerHTML = '';
        }
        
        // Hide depth stats section
        const depthStatsSection = document.querySelector('.depth-stats-section');
        if (depthStatsSection) {
            depthStatsSection.style.display = 'none';
        }
        
        // Clear localStorage
        try {
            localStorage.removeItem('streamData');
            localStorage.removeItem('crawlerData');
        } catch (e) {
            console.error('Error clearing localStorage:', e);
        }

        const url = document.getElementById('startUrl').value.trim();
        
        if (!this.validateUrl(url)) {
            alert('Please enter a valid URL');
            return;
        }

        try {
            // Check if dynamic crawling is enabled
            this.usePuppeteer = document.getElementById('useDynamicCrawling').checked;

            // Start crawling
            const urlObj = new URL(url);
            this.baseUrl = urlObj.origin;
            this.baseDomain = urlObj.hostname;
            
            // Initialize stream
            this.initializeStream();
            
            // Reset state
            this.urlMap.clear();
            this.queue = [];
            this.processedCount = 0;
            this.acceptedCount = 0;
            this.totalFound = 0;
            this.depthStats.clear();
            this.clearStream();
            
            // Get max depth
            const maxDepthInput = document.getElementById('maxDepth');
            this.maxDepth = maxDepthInput.value ? parseInt(maxDepthInput.value) : Infinity;
            
            // Get exclusion rules
            const rulesInput = document.getElementById('exclusionRules');
            this.exclusionRules = rulesInput.value
                .split('\n')
                .map(rule => rule.trim())
                .filter(rule => rule.length > 0);
            
            console.log('Loaded exclusion rules:', this.exclusionRules);
            
            // Start processing
            this.processing = true;
            this.startTime = Date.now();
            this.queue.push({ url, sourceUrl: null, depth: 0 });
            
            // Update button state
            const startButton = document.getElementById('startButton');
            startButton.textContent = 'Stop Crawling';
            document.getElementById('exportButton').disabled = true;
            
            // Disable checkboxes during crawling
            document.getElementById('respectRobotsTxt').disabled = true;
            document.getElementById('useDynamicCrawling').disabled = true;
            
            this.processQueue();
            
            // Start UI updates
            this.updateInterval = setInterval(this.updateUI, 1000);
            
        } catch (error) {
            console.error('Error starting crawler:', error);
            alert('Error starting crawler: ' + error.message);
        }
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => {
            if (!this.processing) {
                this.start();
            } else {
                this.stopCrawling();
            }
        });

        document.getElementById('exportButton').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('resetDepthFilter').addEventListener('click', () => {
            this.resetDepthFilter();
        });

        document.getElementById('clearStream').addEventListener('click', () => {
            if (this.processing) {
                if (confirm('Crawler is still running. Clearing the stream will only hide existing results but new URLs will continue to appear. Do you want to proceed?')) {
                    this.clearStream();
                }
            } else {
                this.clearStream();
            }
        });
    }

    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            
            // Remove tracking parameters
            const searchParams = new URLSearchParams(urlObj.search);
            const trackingParams = [
                // UTM parameters
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
                // Social media
                'fbclid', 'igshid', 'twclid',
                // Google Analytics and Ads
                '_ga', 'gclid', 'gclsrc', '_gl',
                // Microsoft/Bing
                'msclkid',
                // Mailchimp
                'mc_eid', 'mc_cid',
                // General tracking
                'ref', 'source', 'campaign', 'medium', 'term', 'content',
                // Others
                '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
                'mkt_tok', 'trk', 'linkId', 'oeid', 'sid', 'cid', 'eid', '_ke',
                // Additional tracking IDs
                'tracking_id', 'track', 'tracking', 'click_id', 'click', 'affiliate_id', 'aff_id'
            ];
            
            trackingParams.forEach(param => {
                // Remove exact parameter matches
                searchParams.delete(param);
                
                // Remove parameters that start with these prefixes
                Array.from(searchParams.keys()).forEach(key => {
                    if (key.startsWith('utm_') || 
                        key.startsWith('hsa_') || 
                        key.startsWith('_') ||
                        key.includes('tracking') ||
                        key.includes('click') ||
                        key.includes('affiliate')) {
                        searchParams.delete(key);
                    }
                });
            });
            
            // Remove fragments
            urlObj.hash = '';
            
            // Update search params
            urlObj.search = searchParams.toString();
            
            // Remove trailing slash
            let normalized = urlObj.toString().replace(/\/$/, '');
            
            // Remove default ports
            normalized = normalized.replace(':80/', '/').replace(':443/', '/');
            
            // Force HTTPS if available
            if (normalized.startsWith('http://')) {
                try {
                    const httpsUrl = normalized.replace('http://', 'https://');
                    return httpsUrl;
                } catch {
                    return normalized;
                }
            }
            
            return normalized;
        } catch {
            return url;
        }
    }

    isInternalUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === this.baseDomain;
        } catch {
            return false;
        }
    }

    shouldExcludeUrl(url) {
        const urlLower = url.toLowerCase();

        // Skip common non-HTML file extensions
        const skipExtensions = [
            '.css', '.js', '.json', '.xml', '.png', '.jpg', '.jpeg', 
            '.gif', '.pdf', '.doc', '.docx', '.zip', '.rar', '.mp4', 
            '.mp3', '.avi', '.mov', '.svg', '.woff', '.woff2', '.ttf',
            '.eot', '.ico', '.map'
        ];
        
        if (skipExtensions.some(ext => urlLower.endsWith(ext))) {
            console.log('Skipping file with excluded extension:', url);
            return true;
        }

        // Skip URLs with query parameters that typically indicate non-HTML content
        const skipParams = ['download=', '.download', 'attachment=', 'format='];
        if (skipParams.some(param => urlLower.includes(param))) {
            console.log('Skipping URL with excluded parameter:', url);
            return true;
        }

        // Check against user-defined exclusion rules
        if (this.exclusionRules && this.exclusionRules.length > 0) {
            for (const rule of this.exclusionRules) {
                try {
                    const ruleLower = rule.trim().toLowerCase();
                    
                    // Skip empty rules
                    if (!ruleLower) continue;
                    
                    // Handle regular expressions (if rule starts and ends with /)
                    if (ruleLower.startsWith('/') && ruleLower.length > 2 && /\/[a-z]*$/.test(ruleLower)) {
                        const lastSlashIndex = ruleLower.lastIndexOf('/');
                        if (lastSlashIndex > 0) {
                            const pattern = ruleLower.substring(1, lastSlashIndex);
                            const flags = ruleLower.substring(lastSlashIndex + 1);
                            const regex = new RegExp(pattern, flags);
                            if (regex.test(urlLower)) {
                                console.log('URL matches regexp rule:', url, 'Rule:', rule);
                                return true;
                            }
                        }
                    } 
                    // Handle path-based rules
                    else {
                        try {
                            const urlObj = new URL(url);
                            let pathLower = urlObj.pathname.toLowerCase();
                            
                            // Normalize path by removing trailing slash if present
                            pathLower = pathLower.replace(/\/$/, '');
                            
                            // Remove leading and trailing slashes from rule
                            const ruleClean = ruleLower.replace(/^\/+|\/+$/g, '');
                            
                            // Check if path matches the rule:
                            // 1. Exact match: /search matches /search
                            // 2. Subfolder match: /search matches /search/anything
                            const pathPattern = new RegExp(`^/${ruleClean}(?:/.*)?$`);
                            
                            if (pathPattern.test(pathLower)) {
                                console.log('URL matches path rule:', url, 'Rule:', rule);
                                return true;
                            }
                        } catch (e) {
                            console.error('Error checking path match:', e);
                            // If URL parsing fails, fall back to simple string matching
                            const rulePattern = new RegExp(`/${ruleLower.replace(/^\/+|\/+$/g, '')}(?:/|$)`);
                            if (rulePattern.test(urlLower)) {
                                console.log('URL matches string rule:', url, 'Rule:', rule);
                                return true;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error processing exclusion rule:', rule, e);
                }
            }
        }

        return false;
    }

    async fetchPage(url) {
        try {
            console.log('Fetching URL:', url);
            const response = await fetch('http://localhost:3000/fetch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: url,
                    respectRobots: document.getElementById('respectRobotsTxt').checked,
                    usePuppeteer: this.usePuppeteer
                })
            });

            const data = await response.json();
            console.log('Server response:', data);

            if (data.status === 'error' || data.status === 'excluded') {
                console.error(' Error fetching page:', data.error || data.reason);
                return {
                    success: false,
                    error: data.error || data.reason
                };
            }

            return {
                success: true,
                html: data.html,
                finalUrl: data.finalUrl
            };
        } catch (error) {
            console.error('Network error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async extractUrls(html, sourceUrl) {
        if (!html) {
            console.log('No HTML content to parse');
            return [];
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            console.log(`Parsing HTML from ${sourceUrl}, length: ${html.length}`);
            
            const links = new Set();
            const addUrl = (url) => {
                try {
                    if (!url) return;
                    // Clean the URL
                    url = url.trim();
                    // Skip empty, javascript:, data:, mailto:, tel:, etc.
                    if (!url || url.startsWith('#') || /^(javascript|data|mailto|tel|ftp|file):/.test(url)) return;

                    // Skip common non-HTML file extensions
                    const urlLower = url.toLowerCase();
                    const skipExtensions = [
                        '.css', '.js', '.json', '.xml', '.png', '.jpg', '.jpeg', 
                        '.gif', '.pdf', '.doc', '.docx', '.zip', '.rar', '.mp4', 
                        '.mp3', '.avi', '.mov', '.svg', '.woff', '.woff2', '.ttf',
                        '.eot', '.ico', '.map'
                    ];
                    
                    if (skipExtensions.some(ext => urlLower.endsWith(ext))) {
                        console.log('Skipping non-HTML file:', url);
                        return;
                    }

                    // Skip URLs with query parameters that typically indicate non-HTML content
                    const skipParams = ['download=', '.download', 'attachment=', 'format='];
                    if (skipParams.some(param => urlLower.includes(param))) {
                        console.log('Skipping download/attachment URL:', url);
                        return;
                    }

                    // Handle relative URLs
                    const absoluteUrl = new URL(url, sourceUrl).toString();
                    // Remove hash and query parameters for better deduplication
                    const cleanUrl = absoluteUrl.split('#')[0].split('?')[0];
                    links.add(cleanUrl);
                    console.log('Found link:', cleanUrl);
                } catch (e) {
                    console.error('Error processing URL:', url, e);
                }
            };
            
            // Get all links from the page
            const elements = doc.querySelectorAll('a[href], link[href][rel="alternate"], [onclick], [data-href]');
            elements.forEach(element => {
                // Check href attribute
                const href = element.getAttribute('href');
                if (href) addUrl(href);

                // Check data-href attribute
                const dataHref = element.getAttribute('data-href');
                if (dataHref) addUrl(dataHref);

                // Check onclick attribute
                const onclick = element.getAttribute('onclick');
                if (onclick) {
                    // Match various onclick patterns
                    const patterns = [
                        /window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/,
                        /location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/,
                        /navigate\(['"]([^'"]+)['"]\)/,
                        /href\s*=\s*['"]([^'"]+)['"]/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = onclick.match(pattern);
                        if (match && match[1]) {
                            addUrl(match[1]);
                        }
                    }
                }
            });

            // Convert Set to Array and return
            const urlArray = Array.from(links);
            console.log(`Found ${urlArray.length} unique URLs on page ${sourceUrl}`);
            return urlArray;
        } catch (error) {
            console.error('Error extracting URLs:', error);
            return [];
        }
    }

    async processQueue() {
        if (!this.processing) {
            console.log('Crawling stopped');
            this.stop(); 
            return;
        }

        while (this.processing && this.queue.length > 0) {
            try {
                const { url, sourceUrl, depth } = this.queue.shift();
                await this.processUrl(url, sourceUrl, depth);
                
                // Add a small delay between requests to be polite
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Error processing URL:', error);
                // Continue processing despite errors
            }
        }

        if (this.queue.length === 0) {
            console.log('Queue empty, crawling finished');
            this.stop();
        }
    }

    async processUrl(url, sourceUrl, depth) {
        const normalizedUrl = this.normalizeUrl(url);
        
        // Skip if already processed
        if (this.urlMap.has(normalizedUrl)) return;

        // Mark URL as processed
        this.urlMap.set(normalizedUrl, { sourceUrl, depth });
        this.processedCount++;
        
        console.log(`Processing URL: ${normalizedUrl} at depth: ${depth}`);

        // Check validity
        if (!this.isInternalUrl(normalizedUrl)) {
            this.addUrlToStream(normalizedUrl, sourceUrl, depth, 'external', 'External URL');
            return;
        }
        
        if (this.shouldExcludeUrl(normalizedUrl)) {
            this.addUrlToStream(normalizedUrl, sourceUrl, depth, 'excluded', 'Matched exclusion rule');
            return;
        }

        try {
            const result = await this.fetchPage(normalizedUrl);
            
            if (!result.success) {
                this.addUrlToStream(normalizedUrl, sourceUrl, depth, 'error', result.error);
                return;
            }

            // Add to stream with success status
            this.acceptedCount++;
            this.updateDepthStats(depth); // Only update depth stats for accepted URLs
            this.addUrlToStream(normalizedUrl, sourceUrl, depth, 'accepted');
            console.log('Successfully processed URL:', normalizedUrl);

            // Extract and process new URLs
            const newUrls = await this.extractUrls(result.html, result.finalUrl || normalizedUrl);
            console.log('Total URLs found:', newUrls.length);

            // Filter and add valid URLs to queue
            const validUrls = newUrls.filter(url => {
                try {
                    const normalized = this.normalizeUrl(url);
                    return !this.urlMap.has(normalized);
                } catch (e) {
                    return false;
                }
            });

            console.log('Valid URLs to process:', validUrls.length);
            this.totalFound += validUrls.length;

            // Only add to queue if we haven't exceeded max depth
            if (depth < this.maxDepth || this.maxDepth === Infinity) {
                validUrls.forEach(newUrl => {
                    this.queue.push({
                        url: newUrl,
                        sourceUrl: normalizedUrl,
                        depth: depth + 1
                    });
                });
            }

        } catch (error) {
            console.error('Error processing URL:', normalizedUrl, error);
            this.addUrlToStream(normalizedUrl, sourceUrl, depth, 'error', error.message);
        }

        // Update UI
        this.updateUI();
        
        // Continue processing queue if we have more URLs and still crawling
        if (this.queue.length > 0 && this.processing) {
            await this.processQueue();
        }
    }

    updateDepthStats(depth) {
        const count = (this.depthStats.get(depth) || 0) + 1;
        this.depthStats.set(depth, count);
        this.updateDepthStatsUI();
    }

    updateDepthStatsUI() {
        const depthStatsContainer = document.getElementById('depthStats');
        const depthStatsSection = document.querySelector('.depth-stats-section');
        if (!depthStatsContainer || !depthStatsSection) return;

        depthStatsContainer.innerHTML = '';
        
        // Sort depths numerically
        const sortedDepths = Array.from(this.depthStats.keys()).sort((a, b) => a - b);
        
        // Show/hide the section based on whether there are depths to display
        depthStatsSection.style.display = sortedDepths.length > 0 ? '' : 'none';
        
        sortedDepths.forEach(depth => {
            const count = this.depthStats.get(depth);
            const depthButton = document.createElement('button');
            depthButton.className = 'depth-stat-item' + (this.currentDepthFilter === depth ? ' active' : '');
            depthButton.innerHTML = `Depth ${depth}: <span>${count}</span>`;
            depthButton.onclick = () => this.filterStreamByDepth(depth);
            depthStatsContainer.appendChild(depthButton);
        });
    }

    filterStreamByDepth(depth) {
        console.log('Filtering by depth:', depth);
        this.currentDepthFilter = depth;
        this.updateDepthStatsUI(); // Update button styles
        
        // Enable reset filter button
        document.getElementById('resetDepthFilter').disabled = false;
        
        // Get all stream items
        const streamItems = this.streamContainer.getElementsByClassName('stream-item');
        console.log('Total stream items:', streamItems.length);
        
        // Count items of the selected depth
        let visibleCount = 0;
        Array.from(streamItems).forEach(item => {
            const itemDepth = parseInt(item.getAttribute('data-depth'));
            const shouldShow = itemDepth === depth;
            item.style.display = shouldShow ? '' : 'none';
            if (shouldShow) visibleCount++;
        });
        console.log('Visible items at depth', depth, ':', visibleCount);

        // If we have fewer visible items than stored in depthStats,
        // try to load more from localStorage
        const totalAtDepth = this.depthStats.get(depth) || 0;
        console.log('Total items at depth', depth, 'according to stats:', totalAtDepth);
        
        if (visibleCount < totalAtDepth) {
            console.log('Loading more items from localStorage...');
            try {
                const urlData = localStorage.getItem('crawlerData');
                if (urlData) {
                    const data = JSON.parse(urlData);
                    console.log('Total items in localStorage:', data.length);
                    
                    const depthItems = data.filter(item => item.depth === depth);
                    console.log('Items at depth', depth, 'in localStorage:', depthItems.length);
                    
                    // Clear current items of this depth
                    let removedCount = 0;
                    Array.from(streamItems).forEach(item => {
                        if (parseInt(item.getAttribute('data-depth')) === depth) {
                            item.remove();
                            removedCount++;
                        }
                    });
                    console.log('Removed', removedCount, 'existing items');

                    // Add items from storage
                    const itemsToAdd = depthItems.slice(-this.maxStreamItems);
                    console.log('Adding', itemsToAdd.length, 'items from storage');
                    
                    // Clear the stream buffer first
                    this.streamBuffer = [];
                    
                    // Add items to the buffer
                    itemsToAdd.forEach(item => {
                        this.addUrlToStream(item.url, item.sourceUrl, item.depth, 'accepted');
                    });
                    
                    // Force immediate flush of the buffer
                    this.flushStreamBuffer();
                }
            } catch (e) {
                console.error('Error loading items from storage:', e);
            }
        }
    }

    resetDepthFilter() {
        this.currentDepthFilter = null;
        this.updateDepthStatsUI(); // Update button styles
        
        // Show all stream items
        const streamItems = this.streamContainer.getElementsByClassName('stream-item');
        Array.from(streamItems).forEach(item => {
            item.style.display = '';
        });
        
        // Disable reset filter button
        document.getElementById('resetDepthFilter').disabled = true;
    }

    updateUI() {
        // Update statistics
        document.getElementById('totalFound').textContent = this.totalFound;
        document.getElementById('processedCount').textContent = this.processedCount;
        document.getElementById('acceptedCount').textContent = this.acceptedCount;
        document.getElementById('status').textContent = this.processing ? 'Crawling...' : 'Ready';
        
        // Update elapsed time
        if (this.startTime) {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('elapsedTime').textContent = 
                `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }

        this.updateDepthStatsUI();
    }

    stopCrawling() {
        this.processing = false;
        this.cleanup();
        console.log('Crawling stopped and memory cleaned up');
    }

    cleanup() {
        // Clear visual elements
        this.clearStream();
        
        // Clear all memory structures except accepted URLs
        const acceptedUrls = new Map();
        for (const [url, data] of this.urlMap.entries()) {
            if (!data.excluded && !data.error) {
                acceptedUrls.set(url, data);
            }
        }
        
        // Reset crawler state
        this.urlMap = acceptedUrls;
        this.queue = [];
        this.processing = false;
        this.streamBuffer = [];
        this.processedCount = acceptedUrls.size;
        this.depthStats.clear();
        
        // Clear intervals
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Clear localStorage
        localStorage.removeItem('crawlerData');
        
        console.log('Crawler memory cleaned up. Keeping', acceptedUrls.size, 'accepted URLs');
    }
}

// Initialize the crawler when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const crawler = new URLCrawler();
    crawler.setupEventListeners();
});
