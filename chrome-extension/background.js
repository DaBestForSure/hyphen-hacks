// background.js - Service worker for handling API calls

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SEARCH_PROPUBLICA') {
        // Handle ProPublica API search
        searchProPublicaAPI(request.query)
            .then(organizations => {
                sendResponse({
                    success: true,
                    organizations: organizations
                });
            })
            .catch(error => {
                console.error('Background script error:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        
        // Return true to indicate we'll send a response asynchronously
        return true;
    }
});

// Function to search ProPublica API
async function searchProPublicaAPI(query) {
    try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodedQuery}`;
        
        console.log(`Searching ProPublica API: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`ProPublica API error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.organizations?.length || 0} organizations for "${query}"`);
        
        return data.organizations || [];
        
    } catch (error) {
        console.error(`Error searching ProPublica for "${query}":`, error);
        throw error;
    }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'GET_ORG_DETAILS') {
        const ein = String(msg.ein || '').replace(/\D/g, '');
        if (!ein) throw new Error('Missing EIN');

        const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
        const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${text?.slice(0,200)}`);
        }

        const data = await res.json();
        sendResponse({ success: true, data });
        return;
      }

      // existing handler you already have:
      // if (msg.type === 'SEARCH_PROPUBLICA') { ... }

    } catch (err) {
      console.error('🌱 ECO EXTENSION BG:', err);
      sendResponse({ success: false, error: String(err?.message || err) });
    }
  })();

  // IMPORTANT: keep the message channel open for async sendResponse
  return true;
});