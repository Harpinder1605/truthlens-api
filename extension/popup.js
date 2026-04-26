// --- CONFIGURATION ---
const LOCAL_SERVER = 'http://127.0.0.1:5000';
const CLOUD_SERVER = 'https://truthlens-api-str5.onrender.com';
let activeServer = LOCAL_SERVER; // Will dynamically switch based on availability

// --- CUSTOM THEME SWITCHER LOGIC ---
const themeBtn = document.getElementById('themeMenuBtn');
const themeMenu = document.getElementById('themeMenu');
const activeThemeIcon = document.getElementById('activeThemeIcon');
const themeOptions = document.querySelectorAll('.theme-option');

const themeIcons = {
    'theme-gold': '🪙',
    'theme-glass': '🧊',
    'theme-cyber': '💻',
    'theme-jelly': '🫧'
};

// 1. Load saved theme when popup opens
chrome.storage.local.get(['truthlens_theme'], (result) => {
    const savedTheme = result.truthlens_theme || 'theme-gold';
    document.body.className = savedTheme;
    if (activeThemeIcon) activeThemeIcon.innerText = themeIcons[savedTheme] || '🪙';
});

// 2. Toggle custom dropdown
if (themeBtn) {
    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        themeMenu.classList.toggle('show');
    });
}

// 3. Handle theme selection clicks
themeOptions.forEach(option => {
    option.addEventListener('click', (e) => {
        const newTheme = e.currentTarget.getAttribute('data-theme');
        document.body.className = newTheme;
        activeThemeIcon.innerText = themeIcons[newTheme];
        chrome.storage.local.set({ truthlens_theme: newTheme });
        themeMenu.classList.remove('show');
    });
});

// 4. Close menu when clicking anywhere else
document.addEventListener('click', () => {
    if(themeMenu && themeMenu.classList.contains('show')) {
        themeMenu.classList.remove('show');
    }
});

// --- PRIVACY SHIELD LOGIC ---
const shieldToggle = document.getElementById('shieldToggle');
const trackerStats = document.getElementById('trackerStats');
const blockCount = document.getElementById('blockCount');
const blockList = document.getElementById('blockList');

function applyShieldState(isEnabled) {
    if(trackerStats) trackerStats.style.display = isEnabled ? 'block' : 'none';
    if (isEnabled) {
        chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["privacy_shield"] });
    } else {
        chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["privacy_shield"] });
    }
}

// Load saved shield state and sync the declarativeNetRequest rules
chrome.storage.local.get(['shieldEnabled'], (res) => {
    const isEnabled = res.shieldEnabled !== false; // Default to true
    shieldToggle.checked = isEnabled;
    applyShieldState(isEnabled);
});

shieldToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ shieldEnabled: isEnabled });
    applyShieldState(isEnabled);
});

// --- NEW: Fetch Real-Time Stats from your background.js ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
        const currentTabId = tabs[0].id;
        
        const updateStats = () => {
            // Ask your background.js for the stats of THIS specific tab
            chrome.runtime.sendMessage({ action: "getBlockedStats", tabId: currentTabId }, (response) => {
                if (response && blockCount) {
                    blockCount.innerText = response.count;
                    
                    // --- RESTORED: Update the list of blocked domain names ---
                    if (blockList) {
                        if (response.domains && response.domains.length > 0) {
                            blockList.innerText = response.domains.join(', ');
                        } else {
                            blockList.innerText = ''; // Clear if no domains
                        }
                    }
                }
            });
        };

        // Fetch immediately when popup opens
        updateStats();
        
        // Poll every 1 second to show real-time counter going up
        setInterval(updateStats, 1000);
    }
});

// --- MAIN AI ANALYSIS LOGIC ---
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const resultBox = document.getElementById('resultBox');

analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    loading.style.display = 'block';
    resultBox.style.display = 'none';

    try {
        // Query the active browser tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Inject the scraping function into the page
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapePageData
        });

        const pageData = injectionResults[0].result;

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pageData)
        };

        let response;
        try {
            // 1. Attempt to connect to the Local Server first
            activeServer = LOCAL_SERVER;
            response = await fetch(`${activeServer}/api/analyze`, fetchOptions);
        } catch (err) {
            console.warn("Local server unreachable. Automatically switching to Cloud server...");
            
            // 2. Fallback to the live Render Cloud Server
            activeServer = CLOUD_SERVER;
            response = await fetch(`${activeServer}/api/analyze`, fetchOptions);
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            alert(errData.error || "The AI Server could not process this page.");
            analyzeBtn.disabled = false; loading.style.display = 'none'; return;
        }

        const aiResult = await response.json();

        // --- 1. Basic Metric Updates ---
        document.getElementById('riskScore').innerText = aiResult.risk_percentage + "%";
        document.getElementById('simScore').innerText = aiResult.similarity_score;
        document.getElementById('readTime').innerText = aiResult.read_time + " MIN (" + aiResult.word_count + " WORDS)";

        const emotionEl = document.getElementById('emotionScore');
        if (emotionEl) emotionEl.innerText = (aiResult.emotion_score || 0) + "%";

        const emotionAlert = document.getElementById('emotionAlert');
        if (emotionAlert) {
            if (aiResult.emotion_score > 70) {
                emotionAlert.style.display = 'block';
            } else {
                emotionAlert.style.display = 'none';
            }
        }

        // --- 2. Global Domain Trust Logic ---
        let domainTrustScore = aiResult.domain_trust ?? 85;
        
        // Ensure standard platforms remain highly trusted
        if (pageData.domain.includes('youtube.com') || pageData.domain.includes('google.com')) {
            domainTrustScore = 98;
        }
        
        const domainTrustRow = document.getElementById('domainTrustRow');
        const domainTrustEl = document.getElementById('domainTrustScore');
        domainTrustRow.style.display = 'flex';
        domainTrustEl.innerText = domainTrustScore + "% SAFE";
        domainTrustEl.style.color = domainTrustScore > 60 ? 'var(--safe-dark)' : 'var(--danger-dark)';
        
        // --- 3. Google Fact Check UI Toggle ---
        const factCheckAlert = document.getElementById('factCheckAlert');
        if (aiResult.debunked_link) {
            factCheckAlert.style.display = 'block';
            document.getElementById('factCheckText').innerText = aiResult.fact_check_title || "Debunked Claim";
            document.getElementById('factCheckLink').href = aiResult.debunked_link;
        } else {
            factCheckAlert.style.display = 'none';
        }

        // --- 5.5 AI Explanation (XAI) ---
        const aiExplanationContainer = document.getElementById('aiExplanationContainer');
        const aiExplanationText = document.getElementById('aiExplanationText');
        if (aiResult.ai_explanation) {
            aiExplanationContainer.style.display = 'block';
            aiExplanationText.innerText = aiResult.ai_explanation;
        } else if (aiExplanationContainer) {
            aiExplanationContainer.style.display = 'none';
        }

        // --- 4. Trigger Words Extraction ---
        const triggerContainer = document.getElementById('triggerContainer');
        const triggerWordsDiv = document.getElementById('triggerWords');
        triggerWordsDiv.innerHTML = ''; // clear previous words
        
        if (aiResult.trigger_words && aiResult.trigger_words.length > 0) {
            triggerContainer.style.display = 'block';
            aiResult.trigger_words.forEach(word => {
                const span = document.createElement('span');
                span.className = 'trigger-tag';
                span.innerText = word;
                triggerWordsDiv.appendChild(span);
            });
            
            // Inject highlighting script into the active tab
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: highlightTriggerWordsOnPage,
                args: [aiResult.trigger_words]
            });
        } else {
            triggerContainer.style.display = 'none';
        }

        // --- 5. Dynamic Verdict Styling ---
        const verdictText = document.getElementById('verdictText');
        verdictText.innerText = aiResult.message;
        verdictText.className = 'verdict'; // Reset classes
        
        if (aiResult.final_warning || aiResult.risk_percentage > 70) {
            verdictText.classList.add('danger-bg');
            resultBox.classList.remove('safe-border', 'neutral-border');
            resultBox.classList.add('danger-border');
        } else if (!aiResult.final_warning && !aiResult.is_media) {
            verdictText.classList.add('safe-bg');
            resultBox.classList.remove('danger-border', 'neutral-border');
            resultBox.classList.add('safe-border');
        } else {
            verdictText.classList.add('neutral-bg');
            resultBox.classList.remove('danger-border', 'safe-border');
            resultBox.classList.add('neutral-border');
        }

        // --- 6. Crowdsourced Feedback UI ---
        const feedbackContainer = document.getElementById('feedbackContainer');
        if (feedbackContainer) {
            feedbackContainer.style.display = 'block';
            document.getElementById('feedbackThanks').style.display = 'none';
            document.getElementById('feedbackYesBtn').disabled = false;
            document.getElementById('feedbackNoBtn').disabled = false;
            
            const handleFeedback = async (userAgrees) => {
                document.getElementById('feedbackYesBtn').disabled = true;
                document.getElementById('feedbackNoBtn').disabled = true;
                
                try {
                    // Send feedback to whichever server successfully processed the request
                    await fetch(`${activeServer}/api/feedback`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            headline: aiResult.headline,
                            is_clickbait: aiResult.svm_flag,
                            user_agrees: userAgrees,
                            domain: pageData.domain
                        })
                    });
                } catch(err) {
                    console.error("Feedback failed", err);
                }
                
                document.getElementById('feedbackThanks').style.display = 'block';
            };
            
            document.getElementById('feedbackYesBtn').onclick = () => handleFeedback(true);
            document.getElementById('feedbackNoBtn').onclick = () => handleFeedback(false);
        }

        // --- 7. Reveal Results ---
        loading.style.display = 'none';
        resultBox.style.display = 'block';
        analyzeBtn.disabled = false;

    } catch (error) {
        console.error(error);
        alert("Error: Both Local and Cloud AI servers are currently unreachable.");
        analyzeBtn.disabled = false;
        loading.style.display = 'none';
    }
});

// --- DOM SCRAPING FUNCTION (Executes inside the active tab) ---
function scrapePageData() {
    let headline = document.querySelector('h1') ? document.querySelector('h1').innerText : document.title;
    
    // Target the most likely article containers first to avoid headers/footers/sidebars
    let container = document.querySelector('article') || 
                    document.querySelector('main') || 
                    document.querySelector('.post-content, .article-content, .entry-content') ||
                    document.body;

    // Get paragraphs only from the main container and filter out short, non-content strings (like "Log In" or "Subscribe")
    let paragraphs = Array.from(container.querySelectorAll('p'))
        .map(p => p.innerText.trim())
        .filter(text => text.length > 50); // Real article paragraphs usually exceed 50 characters
        
    let bodyText = paragraphs.join(' ');
    
    // Check if the page relies heavily on media
    let hasMedia = document.querySelectorAll('img, video').length > 2;
    let videoId = null;
    let author = null;

    // Special logic to grab YouTube video IDs for backend transcript fetching
    if (window.location.hostname.includes('youtube.com')) {
        const urlParams = new URLSearchParams(window.location.search);
        videoId = urlParams.get('v');
        
        // Try to extract the YouTube channel name
        const channelEl = document.querySelector('.ytd-channel-name a, #upload-info a');
        if (channelEl) author = channelEl.innerText.trim();
    } else {
        // Try to extract article author from standard meta tags
        const authorMeta = document.querySelector('meta[name="author"], meta[property="article:author"]');
        if (authorMeta) author = authorMeta.content;
    }

    return {
        headline: headline,
        body: bodyText,
        hasMedia: hasMedia,
        videoId: videoId,
        author: author,
        domain: window.location.hostname.replace('www.', '')
    };
}

// --- DOM HIGHLIGHTING FUNCTION (Executes inside the active tab) ---
function highlightTriggerWordsOnPage(words) {
    if (!words || words.length === 0) return;
    
    // Remove existing highlights if any exist from previous scans
    document.querySelectorAll('mark.truthlens-highlight').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });

    // Escape words and create regex (case-insensitive, whole word boundaries)
    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];

    let node;
    while ((node = walker.nextNode())) {
        const parentName = node.parentNode.nodeName;
        // Skip script, style, and already highlighted tags
        if (parentName !== 'SCRIPT' && parentName !== 'STYLE' && parentName !== 'NOSCRIPT' && parentName !== 'MARK') {
            if (regex.test(node.nodeValue)) {
                nodesToReplace.push(node);
            }
        }
    }

    // Safely replace text nodes with <mark> wrappers to preserve HTML structure
    nodesToReplace.forEach(node => {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let text = node.nodeValue;
        regex.lastIndex = 0;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'truthlens-highlight';
            // Grammarly-style subtle highlight (Red underline with slight background)
            mark.style.cssText = 'background-color: rgba(255, 0, 85, 0.2); border-bottom: 2px solid #ff0055; color: inherit; font-weight: bold; position: relative;';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        node.parentNode.replaceChild(fragment, node);
    });
}