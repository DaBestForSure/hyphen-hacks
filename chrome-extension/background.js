// background.js - Service worker for handling API calls

// ---- ProPublica: search ----
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'SEARCH_PROPUBLICA') {
    searchProPublicaAPI(request.query)
      .then((organizations) => sendResponse({ success: true, organizations }))
      .catch((error) => {
        console.error('Background script error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // async
  }
});

// ---- ProPublica: org details & Google Places proxy ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

      if (msg.type === 'PLACES_TEXT_SEARCH') {
        const {
          apiKey,
          textQuery,
          center,
          radius = 10000,
          maxResultCount = 10,
          fieldMask = "places.displayName,places.location"
        } = msg;

        if (!apiKey) throw new Error('Missing Google Places API key');

        const payload = { textQuery, maxResultCount };
        if (center) payload.locationBias = { circle: { center, radius } };

        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          sendResponse({ success: false, status: res.status, body: t });
          return;
        }

        const data = await res.json();
        sendResponse({ success: true, data });
        return;
      }

    } catch (err) {
      console.error('🌱 ECO EXTENSION BG:', err);
      sendResponse({ success: false, error: String(err?.message || err) });
    }
  })();

  return true; // keep channel open for async sendResponse
});

// ---- ProPublica search helper ----
async function searchProPublicaAPI(query) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodedQuery}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ProPublica API error! status: ${response.status}`);
  const data = await response.json();
  return data.organizations || [];
}
