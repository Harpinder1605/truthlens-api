let blockedData = {};

// 1. Listen for whenever a rule from our rules.json blocks something
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const tabId = info.request.tabId;
    if (tabId === -1) return; // Ignore background requests

    if (!blockedData[tabId]) {
        blockedData[tabId] = { count: 0, domains: new Set() };
    }

    // Increment the block counter
    blockedData[tabId].count++;
    
    // Extract the name of the tracker (e.g., google-analytics.com)
    try {
        const url = new URL(info.request.url);
        // Clean up the hostname (remove 'www.')
        const hostname = url.hostname.replace('www.', '');
        blockedData[tabId].domains.add(hostname);
    } catch (e) {
        console.error("Could not parse blocked URL", e);
    }
});

// 2. Clear the counter when the user refreshes or navigates to a new page
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) { // If it's the main page loading
        blockedData[details.tabId] = { count: 0, domains: new Set() };
    }
});

// 3. Send the stats to the popup UI when requested
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getBlockedStats") {
        const tabId = request.tabId;
        const data = blockedData[tabId] || { count: 0, domains: new Set() };
        
        sendResponse({ 
            count: data.count, 
            domains: Array.from(data.domains) // Convert Set to Array for JSON
        });
    }
    return true; // Keep message channel open
});