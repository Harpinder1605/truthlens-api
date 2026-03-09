// --- CONFIGURATION ---
// your Render URL (or localhost if testing locally)
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
            alert("The AI Server could not process this page.");
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const aiResult = await response.json();
  
        // 4. Update the Extension UI with the new metrics
        document.getElementById('simScore').innerText = aiResult.similarity_score;
        
        // Probability Score & Read Time
        document.getElementById('riskScore').innerText = aiResult.risk_percentage + "%";
        document.getElementById('readTime').innerText = aiResult.read_time + " min (" + aiResult.word_count + " words)";
        
        // Trigger Words Tags
        const triggerContainer = document.getElementById('triggerContainer');
        const triggerWordsBox = document.getElementById('triggerWords');
        
        if (aiResult.trigger_words && aiResult.trigger_words.length > 0) {
            triggerWordsBox.innerHTML = ''; // Clear old words
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
        
        resultBox.className = aiResult.final_warning ? 'danger-border' : 'safe-border';
        verdictEl.className = 'verdict ' + (aiResult.final_warning ? 'danger-bg' : 'safe-bg');
        
        // If probability is extremely high, turn the percentage text red
        document.getElementById('riskScore').style.color = aiResult.risk_percentage > 60 ? 'var(--danger-dark)' : 'var(--text-main)';
  
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
    
    return { headline: headline.trim(), body: paragraphs };
  }