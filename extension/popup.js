// --- CONFIGURATION ---
const API_URL = 'https://truthlens-api-xnvw.onrender.com/api/analyze'; 

// --- PRIVACY SHIELD LOGIC ---
const shieldToggle = document.getElementById('shieldToggle');

if (shieldToggle) {
    // 1. Check current status
    chrome.declarativeNetRequest.getEnabledRulesets((rulesetIds) => {
        if (rulesetIds.includes("privacy_shield")) {
            shieldToggle.checked = true;
            fetchTrackerStats(); // Fetch stats if shield is ON
        }
    });

    // 2. Listen for switch flip
    shieldToggle.addEventListener('change', async (e) => {
        if (e.target.checked) {
            await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["privacy_shield"], disableRulesetIds: [] });
            fetchTrackerStats(); // Load stats immediately
        } else {
            await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [], disableRulesetIds: ["privacy_shield"] });
            document.getElementById('trackerStats').style.display = 'none'; // Hide stats
        }
    });
}

// 3. NEW: Ask background.js for the blocked numbers and names
async function fetchTrackerStats() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({ action: "getBlockedStats", tabId: tab.id }, (response) => {
        if (response && response.count > 0) {
            document.getElementById('trackerStats').style.display = 'block';
            document.getElementById('blockCount').innerText = response.count;
            document.getElementById('blockList').innerText = response.domains.join(', ');
        } else {
            document.getElementById('trackerStats').style.display = 'none';
        }
    });
}

// --- EXISTING ML ANALYSIS LOGIC ---
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const resultBox = document.getElementById('resultBox');
    
    btn.disabled = true;
    loading.style.display = 'block';
    resultBox.style.display = 'none';
  
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapePageData,
      }, async (injectionResults) => {
        
        if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
            alert("Could not read text from this page.");
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const pageData = injectionResults[0].result;
  
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pageData)
        });
  
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            alert(errData.error || "The AI Server could not process this page.");
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const aiResult = await response.json();
  
        // UI Updates matching the new HTML
        document.getElementById('simScore').innerText = aiResult.is_media ? "N/A" : aiResult.similarity_score;
        document.getElementById('riskScore').innerText = aiResult.is_media ? "N/A" : (aiResult.risk_percentage + "%");
        document.getElementById('readTime').innerText = aiResult.is_media ? "Video/Media" : (aiResult.read_time + " min (" + aiResult.word_count + " words)");
        
        // Trigger Words
        const triggerContainer = document.getElementById('triggerContainer');
        const triggerWordsBox = document.getElementById('triggerWords');
        
        if (!aiResult.is_media && aiResult.trigger_words && aiResult.trigger_words.length > 0) {
            triggerWordsBox.innerHTML = ''; 
            aiResult.trigger_words.forEach(word => {
                const span = document.createElement('span');
                span.className = 'trigger-tag';
                span.innerText = word;
                triggerWordsBox.appendChild(span);
            });
            triggerContainer.style.display = 'block';
        } else {
            triggerContainer.style.display = 'none';
        }

        // Final Verdict Styling
        const verdictEl = document.getElementById('verdictText');
        verdictEl.innerText = aiResult.message;
        
        // Handle the new Media (Neutral) state vs Clickbait (Danger) vs Safe
        if (aiResult.is_media) {
            resultBox.className = 'neutral-border';
            verdictEl.className = 'verdict neutral-bg';
            document.getElementById('riskScore').style.color = 'var(--text-main)';
        } else {
            resultBox.className = aiResult.final_warning ? 'danger-border' : 'safe-border';
            verdictEl.className = 'verdict ' + (aiResult.final_warning ? 'danger-bg' : 'safe-bg');
            document.getElementById('riskScore').style.color = aiResult.risk_percentage > 60 ? 'var(--danger-dark)' : 'var(--text-main)';
        }
  
        loading.style.display = 'none';
        resultBox.style.display = 'block';
        btn.disabled = false;
      });
  
    } catch (error) {
      console.error(error);
      alert("Error connecting to AI Server. Is it running locally on port 5000?");
      btn.disabled = false;
      loading.style.display = 'none';
    }
  });
  
  function scrapePageData() {
    let headline = '';
    const h1 = document.querySelector('h1');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    
    if (h1) headline = h1.innerText;
    else if (ogTitle) headline = ogTitle.content;
    else headline = document.title;

    const hasVideoElements = document.querySelectorAll('video, audio, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"], iframe[src*="twitch"], iframe[src*="rumble"], iframe[src*="tiktok"], smp-toucan-player, cnn-video, amp-video').length > 0;
    const hasVideoMeta = document.querySelectorAll('meta[property^="og:video"], meta[name^="twitter:player"]').length > 0;
    const hasVideoClass = document.querySelectorAll('.video-player, [data-video-player], .media-player, .vjs-tech, .bbc-video-player, [id^="toucan-"], .jwplayer, .bc-player, .vhs-video, .video-container, .wistia_embed, [data-testid="videoComponent"]').length > 0;
    
    const hasMedia = hasVideoElements || hasVideoMeta || hasVideoClass;
    
    let articleContainer = document.querySelector('article, main, [role="main"], .article-content, .post-content, .entry-content');
    let searchArea = articleContainer || document.body;
    let clone = searchArea.cloneNode(true);
    
    const noiseSelectors = ['nav', 'footer', 'aside', 'header', 'script', 'style', '.comments', '.sidebar', '.ad', '#cookie-banner'];
    noiseSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    let paragraphs = Array.from(clone.querySelectorAll('p, li, h2, h3, h4, .subbuzz-text'))
        .map(el => el.innerText.trim())
        .filter(text => text.length > 20)
        .join(' ');
        
    if (paragraphs.split(' ').length < 20) {
        const metaDesc = document.querySelector('meta[name="description"]');
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (metaDesc) paragraphs += " " + metaDesc.content;
        if (ogDesc) paragraphs += " " + ogDesc.content;
    }
    
    return { headline: headline.trim(), body: paragraphs.trim(), hasMedia: hasMedia };
  }