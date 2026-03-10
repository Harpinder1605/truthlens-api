// --- CONFIGURATION ---
const API_URL = 'https://truthlens-api-xnvw.onrender.com/api/analyze'; 

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
            const errData = await response.json();
            alert(errData.error || "The AI Server could not process this page.");
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const aiResult = await response.json();
  
        // UI Updates
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
        
        // Handle the new Media (Neutral) state
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
      alert("Error connecting to AI Server. Is it running?");
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

    // 1. Detect if the page is media-heavy (Videos, YouTube iframes)
    const hasMedia = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0;
    
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
        
    // 2. SEO FALLBACK: If there's barely any text, grab the hidden description tags!
    if (paragraphs.split(' ').length < 20) {
        const metaDesc = document.querySelector('meta[name="description"]');
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (metaDesc) paragraphs += " " + metaDesc.content;
        if (ogDesc) paragraphs += " " + ogDesc.content;
    }
    
    return { headline: headline.trim(), body: paragraphs.trim(), hasMedia: hasMedia };
  }