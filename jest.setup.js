import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';

// Mock TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock DOM elements that crawler.js expects
document.body.innerHTML = `
    <div id="urlStream"></div>
    <div id="status">Ready</div>
    <input id="startUrl" value="" />
    <input id="useDynamicCrawling" type="checkbox" />
    <input id="maxDepth" value="2" />
    <textarea id="exclusionRules"></textarea>
    <div id="totalFound">0</div>
    <div id="processedCount">0</div>
    <div id="acceptedCount">0</div>
    <div id="elapsedTime">00:00:00</div>
    <div id="depthStats"></div>
    <div class="depth-stats-section" style="display: none;"></div>
    <button id="startButton">Start Crawling</button>
    <button id="exportButton" disabled>Export Data</button>
    <button id="resetDepthFilter" disabled>Reset Filter</button>
    <button id="clearStream">Clear Stream</button>
    <input id="autoScroll" type="checkbox" />
    <input id="respectRobotsTxt" type="checkbox" />
`;

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body><a href="https://example.com">Link</a></body></html>')
    })
);

// Mock console methods to prevent noise in test output
const originalConsoleError = console.error;
console.error = (...args) => {
    if (process.env.DEBUG) {
        originalConsoleError(...args);
    }
};

const originalConsoleLog = console.log;
console.log = (...args) => {
    if (process.env.DEBUG) {
        originalConsoleLog(...args);
    }
};
