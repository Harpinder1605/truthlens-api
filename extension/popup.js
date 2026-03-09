// --- CONFIGURATION ---
// Cloud URL 
const API_URL = 'https://truthlens-api-xnvw.onrender.com/api/analyze'; 

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const resultBox = document.getElementById('resultBox');
    
    // Show loading state
    btn.disabled = true;
    loading.style.display = 'block';
    resultBox.style.display = 'none';
  
    try {
      // 1. Get the current active tab
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
      // 2. Inject a script into the page to scrape the Headline and Body Text
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapePageData,
      }, async (injectionResults) => {
        
        // Check if we got data back from the page
        if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
            alert("Could not read text from this page.");
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const pageData = injectionResults[0].result;
  
        // 3. Send the scraped text to your Python Flask Server
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pageData)
        });
  
        // Check if the server returned an error (like 400 Bad Request)
        if (!response.ok) {
            if (response.status === 400) {
                alert("Could not find enough readable text. (This might be a highly visual Buzzfeed listicle or a video page).");
            } else {
                console.error("Server Error:", await response.text());
                alert("The AI Server crashed! Please check your Python terminal for the exact error.");
            }
            btn.disabled = false; loading.style.display = 'none'; return;
        }

        const aiResult = await response.json();
  
        // 4. Update the Extension UI with the results
        document.getElementById('simScore').innerText = aiResult.similarity_score;
        document.getElementById('svmFlag').innerText = aiResult.svm_flag ? "Detected" : "Clear";
        
        const verdictEl = document.getElementById('verdictText');
        verdictEl.innerText = aiResult.message;
        
        // Color coding based on AI verdict
        resultBox.className = aiResult.final_warning ? 'danger-border' : 'safe-border';
        verdictEl.className = 'verdict ' + (aiResult.final_warning ? 'danger-bg' : 'safe-bg');
  
        loading.style.display = 'none';
        resultBox.style.display = 'block';
        btn.disabled = false;
      });
  
    } catch (error) {
      console.error(error);
      alert("Error connecting to AI Server. Is the Python server running?");
      btn.disabled = false;
      loading.style.display = 'none';
    }
  });
  
  // This function runs INSIDE the actual web page, not the popup
  function scrapePageData() {
    // 1. Smarter Headline Extraction
    let headline = '';
    const h1 = document.querySelector('h1');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    
    // Prioritize H1, fallback to OpenGraph Title (used for social media), then Document Title
    if (h1) headline = h1.innerText;
    else if (ogTitle) headline = ogTitle.content;
    else headline = document.title;
    
    // 2. Locate the main article container (Targeting common web standards)
    let articleContainer = document.querySelector('article, main, [role="main"], .article-content, .post-content, .entry-content');
    
    // Fallback to the whole body if semantic tags aren't found
    let searchArea = articleContainer || document.body;
    
    // Clone the area so we don't accidentally delete actual page elements on the live site
    let clone = searchArea.cloneNode(true);
    
    // 3. Remove "Noise" (Ads, sidebars, headers, footers)
    const noiseSelectors = ['nav', 'footer', 'aside', 'header', 'script', 'style', '.comments', '.sidebar', '.ad', '#cookie-banner'];
    noiseSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // 4. Extract clean paragraph text (including list items and subheadings, which often contain key information in Buzzfeed articles)
    let paragraphs = Array.from(clone.querySelectorAll('p, li, h2, h3, h4, .subbuzz-text'))
        .map(el => el.innerText.trim())
        .filter(text => text.length > 20) // Lowered filter to catch list items
        .join(' ');
    
    return { headline: headline.trim(), body: paragraphs };
  }