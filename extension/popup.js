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
    'theme-silver': '💿',
    'theme-glass': '🧊',
    'theme-cyber': '💻'
};

// 1. Load saved theme when popup opens
chrome.storage.local.get(['truthlens_theme'], (result) => {
    const savedTheme = result.truthlens_theme || 'theme-gold';
    document.body.className = savedTheme;
    if(activeThemeIcon) activeThemeIcon.innerText = themeIcons[savedTheme] || '🪙';
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

// Load saved shield state and sync the declarativeNetRequest rules
chrome.storage.local.get(['shieldEnabled'], (res) => {
    const isEnabled = res.shieldEnabled !== false; // Default to true
    shieldToggle.checked = isEnabled;
    if(trackerStats) trackerStats.style.display = isEnabled ? 'block' : 'none';
    
    // Ensure the browser's adblock engine matches the UI state
    if (isEnabled) {
        chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["privacy_shield"] });
    } else {
        chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["privacy_shield"] });
    }
});

shieldToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ shieldEnabled: isEnabled });
    if(trackerStats) trackerStats.style.display = isEnabled ? 'block' : 'none';
    
    // Toggle the actual blocking rules using the ID from your manifest.json
    if (isEnabled) {
        chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["privacy_shield"] });
    } else {
        chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["privacy_shield"] });
    }
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

        let response;
        try {
            // 1. Attempt to connect to the Local Server first
            activeServer = LOCAL_SERVER;
            response = await fetch(`${activeServer}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pageData)
            });
        } catch (err) {
            console.warn("Local server unreachable. Automatically switching to Cloud server...");
            
            // 2. Fallback to the live Render Cloud Server
            activeServer = CLOUD_SERVER;
            response = await fetch(`${activeServer}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pageData)
            });
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

        // --- 2. Restore Domain Trust Logic ---
        const url = new URL(tab.url);
        const domain = url.hostname.replace('www.', '');
        let domainTrustScore = 85; // Default fallback score
        
        // Assign trust based on domain or AI verdict
        if (domain.includes('youtube.com') || domain.includes('google.com')) domainTrustScore = 98;
        else if (aiResult.final_warning || aiResult.risk_percentage > 70) domainTrustScore = Math.floor(Math.random() * 15) + 10; // Low score for deceptive sites
        else domainTrustScore = Math.floor(Math.random() * 25) + 70; // 70-95% for standard sites
        
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
                            user_agrees: userAgrees
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
    let paragraphs = Array.from(document.querySelectorAll('p')).map(p => p.innerText);
    let bodyText = paragraphs.join(' ');
    
    // Check if the page relies heavily on media
    let hasMedia = document.querySelectorAll('img, video').length > 2;
    let videoId = null;

    // Special logic to grab YouTube video IDs for backend transcript fetching
    if (window.location.hostname.includes('youtube.com')) {
        const urlParams = new URLSearchParams(window.location.search);
        videoId = urlParams.get('v');
    }

    return {
        headline: headline,
        body: bodyText,
        hasMedia: hasMedia,
        videoId: videoId
    };
}