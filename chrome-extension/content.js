// Complete content.js with sentiment analysis, OpenAI, ProPublica nonprofit search, website finding,
// and impact-scored selection of top 3 organizations via ProPublica /organizations/:ein.json
// config.js is loaded first, so we can access the global 'config' variable

console.log("🌱 ECO EXTENSION: Starting with all features...");

/* ==============================
   1) Site detection
   ============================== */

const NEWS_SITES = ["nytimes.com", "economist.com", "wsj.com", "washingtonpost.com"];

function isOnNewsSite() {
  const currentDomain = window.location.hostname.replace("www.", "");
  return NEWS_SITES.some((site) => currentDomain.includes(site));
}

/* ======================================
   2) Article title / text extraction
   ====================================== */

function extractArticleTitle() {
  const selectors = [
    'h1[data-testid="headline"]', // NYTimes
    "h1.headline", // WSJ
    "h1.article__headline", // Common pattern
    'h1[class*="headline"]', // Any h1 with "headline" in class
    'h1[class*="title"]', // Any h1 with "title" in class
    "article h1", // H1 inside article tag
    ".article-title", // Generic
    "h1", // Fallback
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return document.title || "";
}

function extractArticleText() {
  const contentSelectors = [
    'section[name="articleBody"]', // NYTimes
    ".article-body",
    ".story-body",
    'div[data-testid="articleBody"]',
    "article .content",
    "article p",
    ".post-content",
    "main article",
    '[role="main"] p',
  ];
  let articleText = "";
  for (const selector of contentSelectors) {
    const el = document.querySelector(selector);
    if (!el) continue;

    if (selector.includes("p")) {
      const paragraphs = document.querySelectorAll(selector);
      articleText = Array.from(paragraphs)
        .slice(0, 10)
        .map((p) => p.textContent.trim())
        .filter((t) => t.length > 20)
        .join(" ");
    } else {
      const paragraphs = el.querySelectorAll("p");
      if (paragraphs.length > 0) {
        articleText = Array.from(paragraphs)
          .slice(0, 10)
          .map((p) => p.textContent.trim())
          .filter((t) => t.length > 20)
          .join(" ");
      } else {
        articleText = el.textContent.trim();
      }
    }

    if (articleText && articleText.length > 100) break;
  }
  if (articleText.length > 3000) articleText = articleText.substring(0, 3000) + "...";
  return articleText;
}

/* ==============================
   3) Sentiment analysis
   ============================== */

async function analyzeSentiment(text) {
  if (typeof config === "undefined" || !config.GOOGLE_API) {
    console.log("🌱 ECO EXTENSION: No Google API key, using keyword fallback");
    const negativeWords = [
      "crisis", "disaster", "death", "fire", "flood", "war",
      "attack", "tragedy", "terrible", "awful",
    ];
    const hasNegative = negativeWords.some((w) => text.toLowerCase().includes(w));
    return { score: hasNegative ? -0.3 : 0.1 };
  }

  try {
    const res = await fetch(
      `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${config.GOOGLE_API}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { type: "PLAIN_TEXT", content: text } }),
      }
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return data.documentSentiment;
  } catch (err) {
    console.error("🌱 ECO EXTENSION: Sentiment analysis error:", err);
    const negativeWords = [
      "crisis", "disaster", "death", "fire", "flood", "war",
      "attack", "tragedy", "terrible", "awful",
    ];
    const hasNegative = negativeWords.some((w) => text.toLowerCase().includes(w));
    return { score: hasNegative ? -0.3 : 0.1 };
  }
}

/* ===========================================
   4) OpenAI search-term generation
   =========================================== */

async function generateSearchQueries(articleTitle, articleText) {
  if (typeof config === "undefined" || !config.OPENAI_API_KEY) {
    console.log("🌱 ECO EXTENSION: No OpenAI API key, using fallback queries");
    return ["disaster relief", "community support", "emergency assistance", "local nonprofit", "charity organization"];
  }

  const fullArticle = `${articleTitle}\n\n${articleText}`;
  const prompt = `Based on this article, provide 5 search terms for finding relevant nonprofit organizations on ProPublica's API. Return ONLY the search terms separated by commas, no explanations, no URLs, no additional text. The terms should be:

1. Very specific to the main issue
2. Somewhat specific to the main issue
3. Related to the geographic region if applicable
4. Broader related topic
5. Very broad related topic (this should find at least 3 organizations)

For flood/disaster articles, use terms like: "flood relief", "disaster response", "emergency housing", "Florida nonprofits", "disaster recovery"

Article:
${fullArticle}

Search terms only:`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI API error! status: ${response.status}`);
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    const queries = text.split(",").map((q) => q.trim().replace(/"/g, "").replace(/^\d+\.\s*/, "")).filter((q) => q && !q.includes("http"));
    console.log("🌱 ECO EXTENSION: Generated search queries:", queries);
    return queries;
  } catch (error) {
    console.error("🌱 ECO EXTENSION: OpenAI error:", error);
    return ["disaster relief", "community support", "emergency assistance", "local nonprofit", "charity organization"];
  }
}

/* ==========================================
   5) ProPublica search (via background)
   ========================================== */

// Accept a limit so callers can request e.g. 20. Background should honor it.
async function searchProPublica(query, limit = 10) {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "SEARCH_PROPUBLICA", query, limit }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("🌱 ECO EXTENSION: Runtime error:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          const orgs = response.organizations || [];
          resolve(orgs.slice(0, limit));
        } else {
          console.error("🌱 ECO EXTENSION: ProPublica search failed:", response?.error);
          resolve([]);
        }
      });
    });
  } catch (error) {
    console.error(`🌱 ECO EXTENSION: Error searching ProPublica for "${query}":`, error);
    return [];
  }
}

/* ================================================
   6) Website finding (Google CSE + MapQuest fallback)
   ================================================ */

function isPdfUrl(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  // reject .pdf anywhere at end or before query/hash
  return /\.(pdf)(\?|#|$)/i.test(u);
}
function isCauseIQ(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase().replace(/^www\./, "");
    return host === "causeiq.com" || host.endsWith(".causeiq.com");
  } catch {
    // Fallback for malformed URLs
    return /(^|\/\/|\.)causeiq\.com/i.test(String(url));
  }
}

async function findOfficialWebsite(orgName, orgCity, orgState) {
  if (typeof config === "undefined" || !config.GOOGLE_API || !config.SEARCH_ENGINE_ID) {
    console.log("🌱 ECO EXTENSION: No Google Search API credentials");
    return null;
  }

  try {
    const addressInfo = orgCity && orgState ? `${orgCity} ${orgState}` : "";
    const query = `"${orgName}" ${addressInfo} official site donate volunteer`;
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${config.GOOGLE_API}&cx=${config.SEARCH_ENGINE_ID}&q=${encodeURIComponent(
        query
      )}&num=10`
    );
    if (!response.ok) throw new Error(`Search API error! status: ${response.status}`);

    const data = await response.json();
    const items = data.items || [];
    console.log(`🌱 ECO EXTENSION: Found ${items.length} search results for "${orgName}" ${addressInfo}`);

    // Prefer .org
    for (const item of items) {
      if (item.link.includes(".org") && !isPdfUrl(item.link) && !isCauseIQ(item.link) && isRelevantDomainRelaxed(item.link, orgName)) {
        console.log(`🌱 ECO EXTENSION: Found .org website: ${item.link}`);
        return item.link;
      }
    }
    // Then .com
    for (const item of items) {
      if (item.link.includes(".com") && !isPdfUrl(item.link) && isRelevantDomainRelaxed(item.link, orgName)) {
        console.log(`🌱 ECO EXTENSION: Found .com website: ${item.link}`);
        return item.link;
      }
    }

    // MapQuest fallback
    if (typeof config.MAPQUEST_API_KEY !== "undefined") {
      const mapquestQuery = `${orgName} ${orgCity || ""} ${orgState || ""}`.trim();
      const mapquestUrl = `https://www.mapquestapi.com/search/v2/search?key=${config.MAPQUEST_API_KEY}&q=${encodeURIComponent(
        mapquestQuery
      )}&pageSize=1`;

      try {
        const mqResponse = await fetch(mapquestUrl);
        if (mqResponse.ok) {
          const mqData = await mqResponse.json();
          if (mqData.results && mqData.results.length > 0) {
            const fields = mqData.results[0].fields || {};
            if (fields.website && !isPdfUrl(fields.website) && isLegitimateNonprofit(fields.website)) {
              console.log(`🌱 ECO EXTENSION: MapQuest fallback found URL: ${fields.website}`);
              return fields.website;
            }
          }
        }
      } catch (err) {
        console.error("🌱 ECO EXTENSION: MapQuest fallback error:", err);
      }
    }

    console.log("🌱 ECO EXTENSION: No suitable websites found in search results");
    return null;
  } catch (error) {
    console.error("🌱 ECO EXTENSION: Search API error:", error);
    return null;
  }
}

function isRelevantDomainRelaxed(url, orgName) {
  const domain = url.toLowerCase();
  const cleanOrgName = orgName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|incorporated|foundation|fund|international|america|usa|the|of)\b/g, "")
    .trim()
    .replace(/\s+/g, "");

  const orgWords = cleanOrgName.split(/\s+/).filter((w) => w.length > 2);
  const hasMatchingWords = orgWords.some((w) => domain.includes(w.substring(0, 4)));

  const domainParts = domain.split(".")[0].split(/[^a-z]/);
  const domainHasOrgWords = domainParts.some((part) => part.length > 3 && cleanOrgName.includes(part));

  return hasMatchingWords || domainHasOrgWords;
}

function isLegitimateNonprofit(url) {
  const domain = url.toLowerCase();
  const excluded = [
    "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
    "youtube.com", "tiktok.com", "amazon.com", "ebay.com",
    "wikipedia.org", "crunchbase.com", "bloomberg.com",
  ];
  if (excluded.some((e) => domain.includes(e))) return false;
  const good = [".org", "donate", "volunteer", "charity", "foundation", "nonprofit"];
  return good.some((g) => domain.includes(g));
}

async function getOrganizationWebsite(orgName, ein, orgCity, orgState) {
  console.log(`🌱 ECO EXTENSION: Finding website for: ${orgName} in ${orgCity}, ${orgState}`);
  const website = await findOfficialWebsite(orgName, orgCity, orgState);
  return { name: orgName, ein, website };
}

/* ==========================================================
   7) ProPublica org details (via background) + impact score
   ========================================================== */

async function getOrgDetailsByEIN(ein) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_ORG_DETAILS", ein: String(ein) }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("🌱 ECO EXTENSION: BG message error:", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      if (response && response.success && response.data) {
        resolve(response.data);
      } else {
        console.warn("🌱 ECO EXTENSION: BG fetch failed for EIN", ein, response?.error);
        resolve(null);
      }
    });
  });
}

function pickLatestFilingWithData(filingsWithData = []) {
  if (!Array.isArray(filingsWithData) || filingsWithData.length === 0) return null;
  const sorted = [...filingsWithData].sort((a, b) => {
    const ay = Number(a.tax_prd_yr || String(a.tax_prd || "").slice(0, 4) || 0);
    const by = Number(b.tax_prd_yr || String(b.tax_prd || "").slice(0, 4) || 0);
    if (by !== ay) return by - ay;
    return Number(b.tax_prd || 0) - Number(a.tax_prd || 0);
  });
  return sorted[0] || null;
}

function computeImpactScoreFromFiling(filing) {
  const rev = Math.max(0, Number(filing?.totrevenue || 0));
  const assets = Math.max(0, Number(filing?.totassetsend || 0));
  const contrib = Math.max(0, Number(filing?.totcntrbgfts || 0));
  // Weighted log scale
  return 1.2 * Math.log1p(rev) + 0.9 * Math.log1p(assets) + 0.8 * Math.log1p(contrib);
}

/* ==================================================================================
   8) Get top 3 orgs across multiple queries (lazy website lookups)
      - Gather up to 20 EINs across queries.
      - Compute impact scores (no website lookups yet).
      - Sort by impact (with slight early-query boost).
      - Walk the sorted list top-down:
          * Lookup websites until we’ve found 3 orgs with websites.
          * If we reach 3, STOP doing website lookups (per your request).
          * If fewer than 3 found, fill remaining slots with highest-impact orgs (website=null).
      - Reject any website that is a PDF.
   ================================================================================== */

async function getTopThreeOrganizations(searchQueries) {
  if (!Array.isArray(searchQueries) || searchQueries.length === 0) return [];

  const MAX_UNIQUE = 20;
  const seenEIN = new Set();
  const candidates = [];

  // 1) Collect up to 20 unique EINs across queries, preserving which query found them
  for (let qIndex = 0; qIndex < searchQueries.length; qIndex++) {
    const query = searchQueries[qIndex];
    console.log(`🌱 ECO EXTENSION: Searching ProPublica for: "${query}"`);

    const remaining = MAX_UNIQUE - candidates.length;
    if (remaining <= 0) break;

    const results = await searchProPublica(query, remaining);
    console.log(`🌱 ECO EXTENSION: Found ${results.length} orgs for "${query}"`);

    for (const org of results) {
      if (seenEIN.has(org.ein)) continue;
      seenEIN.add(org.ein);
      candidates.push({ ...org, _queryIndex: qIndex });
      if (candidates.length >= MAX_UNIQUE) break;
    }
    if (candidates.length >= MAX_UNIQUE) break;
  }

  if (candidates.length < 3) {
    console.log("🌱 ECO EXTENSION: Fewer than 3 candidates found; returning []");
    return [];
  }

  console.log(`🌱 ECO EXTENSION: Evaluating ${candidates.length} candidates (impact only)...`);

  // 2) For each candidate: get details + impact score (NO website lookups yet)
  const evaluated = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const details = await getOrgDetailsByEIN(c.ein);
    if (!details || !details.organization) continue;

    const filings = details.filings_with_data || [];
    const latest = pickLatestFilingWithData(filings);
    if (!latest) continue;

    const baseImpact = computeImpactScoreFromFiling(latest);
    const earlyBoost = 0.25 * Math.max(0, (searchQueries.length - 1 - c._queryIndex));

    evaluated.push({
      ein: c.ein,
      name: c.name || c.sub_name || "",
      city: c.city || "",
      state: c.state || "",
      ntee_code: c.ntee_code || c.raw_ntee_code || "",
      impactScore: baseImpact + earlyBoost,
      latestFiling: {
        tax_prd_yr: latest.tax_prd_yr || null,
        totrevenue: latest.totrevenue || 0,
        totassetsend: latest.totassetsend || 0,
        totcntrbgfts: latest.totcntrbgfts || 0,
      },
      website: null, // will fill lazily
    });
  }

  if (evaluated.length < 3) {
    console.log("🌱 ECO EXTENSION: Fewer than 3 evaluated orgs; returning []");
    return [];
  }

  // 3) Sort by impactScore desc
  evaluated.sort((a, b) => b.impactScore - a.impactScore);

  // 4) Walk sorted list; do website lookups UNTIL we have 3 with websites; then stop looking up
  const withSites = [];
  const noSiteYet = [];
  for (const org of evaluated) {
    if (withSites.length < 3) {
      const siteBundle = await getOrganizationWebsite(org.name, org.ein, org.city, org.state);
      const websiteUrl = siteBundle?.website || null;
      if (websiteUrl && !isPdfUrl(websiteUrl)) {
        org.website = websiteUrl;
        withSites.push(org);
      } else {
        org.website = null;
        noSiteYet.push(org);
      }
    } else {
      // Already have 3 with websites → no more lookups (per requirement)
      break;
    }
  }

  // If we already have 3 with websites, return them
  if (withSites.length === 3) return withSites;

  // Otherwise, fill remaining slots with highest-impact orgs without websites (no extra lookups)
  const need = 3 - withSites.length;
  const filler = noSiteYet.slice(0, need).map((o) => ({ ...o, website: null }));
  const topThree = [...withSites, ...filler].slice(0, 3);
  return topThree;
}

/* ======================================
   9) Sentiment gating
   ====================================== */

async function analyzeArticleSentiment(title, articleText) {
  console.log("🌱 ECO EXTENSION: Analyzing sentiment...");

  const titleSentiment = await analyzeSentiment(title);
  if (!titleSentiment) {
    return { shouldShow: false, titleScore: null, textScore: null, combinedScore: null };
    }
  console.log("🌱 ECO EXTENSION: Title sentiment score:", titleSentiment.score);

  let textSentiment = null;
  let combinedScore = titleSentiment.score;

  if (articleText && articleText.length > 50) {
    textSentiment = await analyzeSentiment(articleText);
    if (textSentiment) {
      console.log("🌱 ECO EXTENSION: Text sentiment score:", textSentiment.score);
      combinedScore = titleSentiment.score * 0.6 + textSentiment.score * 0.4;
      console.log("🌱 ECO EXTENSION: Combined sentiment score:", combinedScore);
    }
  }

  // Relaxed thresholds
  const titleIsNegative = titleSentiment.score < -0.1;
  const textIsNegative = textSentiment && textSentiment.score < -0.1;
  const combinedIsNegative = combinedScore < 0.1;
  const shouldShow = titleIsNegative || textIsNegative || combinedIsNegative;

  console.log("🌱 ECO EXTENSION: Should show extension:", shouldShow);

  return {
    shouldShow,
    titleScore: titleSentiment.score,
    textScore: textSentiment ? textSentiment.score : null,
    combinedScore,
  };
}

/* ============================================
   10) Initialize: tie everything together
   ============================================ */

async function initializeExtension() {
  console.log("🌱 ECO EXTENSION: Current page:", window.location.href);

  if (!isOnNewsSite()) {
    console.log("🌱 ECO EXTENSION: Not on news site, but continuing for testing...");
  }

  const articleTitle = extractArticleTitle();
  const articleText = extractArticleText();

  console.log("🌱 ECO EXTENSION: Article title:", (articleTitle || "").substring(0, 100));
  console.log("🌱 ECO EXTENSION: Article text length:", articleText.length);

  if (!articleTitle) {
    console.log("🌱 ECO EXTENSION: Could not extract article title");
    return;
  }

  const sentimentResult = await analyzeArticleSentiment(articleTitle, articleText);
  if (sentimentResult.titleScore === null) {
    console.log("🌱 ECO EXTENSION: Could not analyze sentiment");
    return;
  }

  if (sentimentResult.shouldShow) {
    console.log("🌱 ECO EXTENSION: Negative/neutral sentiment detected, showing extension");

    console.log("🌱 ECO EXTENSION: Generating search queries with OpenAI...");
    const searchQueries = await generateSearchQueries(articleTitle, articleText);

    let topOrganizations = [];
    if (searchQueries.length > 0) {
      console.log("🌱 ECO EXTENSION: Searching and ranking organizations by impact + websites...");
      topOrganizations = await getTopThreeOrganizations(searchQueries);
    }

    if (!topOrganizations || topOrganizations.length < 3) {
      console.log("🌱 ECO EXTENSION: Impact-scored selection returned <3 orgs; using empty list so UI falls back.");
      window.ecoExtensionOrganizations = [];
    } else {
      window.ecoExtensionOrganizations = topOrganizations.slice(0, 3);
    }

    createIcon();
  } else {
    console.log("🌱 ECO EXTENSION: Not showing icon - sentiment too positive");
  }
}

/* =================================
   11) UI (icon + panel)
   ================================= */

const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const styledIconCSSUrl = chrome.runtime.getURL("resources/styledIcon.css");
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

const iconUrls = {
  money: { url: chrome.runtime.getURL("images/money.svg"), description: "Financial Impact" },
  food: { url: chrome.runtime.getURL("images/food.svg"), description: "Food & Shelter" },
  globe: { url: chrome.runtime.getURL("images/globe.svg"), description: "Global Reach" },
};

let isTextBoxOpen = false;

function createIcon() {
  const container = document.createElement("div");
  container.id = "eco-extension-icon";
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    background-color: #4CAF50;
    border-radius: 50%;
    z-index: 10000;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    transition: transform 0.2s ease;
  `;

  container.addEventListener("mouseenter", () => { container.style.transform = "scale(1.1)"; });
  container.addEventListener("mouseleave", () => { container.style.transform = "scale(1)"; });

  try {
    const svgURL = chrome.runtime.getURL("images/leafIcon.svg");
    const img = document.createElement("img");
    img.src = svgURL;
    img.alt = "Leaf Icon";
    img.style.cssText = "width: 30px; height: 30px; filter: brightness(0) invert(1);";
    container.appendChild(img);
  } catch {
    container.textContent = "🌱";
    container.style.fontSize = "24px";
  }

  container.addEventListener("click", async () => {
    if (!isTextBoxOpen) {
      await openTextBox();
    } else {
      closeTextBox();
    }
  });

  document.body.appendChild(container);
  console.log("🌱 ECO EXTENSION: Icon created and added to page");
}

async function openTextBox() {
  console.log("🌱 ECO EXTENSION: Opening text box with organization data...");
  isTextBoxOpen = true;

  try {
    const htmlResponse = await fetch(textBoxHTMLUrl);
    const componentHTML = await htmlResponse.text();

    const mainWrapper = document.createElement("div");
    mainWrapper.id = "eco-main-wrapper";
    mainWrapper.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 9998;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const leafIconUrl = chrome.runtime.getURL("images/leafIcon.svg");
    const topBarHTML = `
      <div id="eco-top-bar">
        <img id="top-bar-icon" src="${leafIconUrl}" alt="Leaf Icon"/>
        <div id="top-bar-title">Local Impact</div>
        <div id="top-bar-close">×</div>
      </div>
    `;
    mainWrapper.innerHTML += topBarHTML;

    const organizations = window.ecoExtensionOrganizations || [];
    const componentsData =
      organizations.length > 0
        ? organizations.slice(0, 3).map((org, index) => ({
            componentId: `comp-${index + 1}`,
            title: org.name,
            subtext1: `${org.city}, ${org.state}`,
            subtext2: "Nonprofit",
            activeText: `Learn more about ${org.name} and how you can support their mission in your local community.`,
            supportURL: org.website || "#",
          }))
        : [
            { componentId: "comp-1", title: "Habitat for Humanity", subtext1: "10 miles", subtext2: "Mission", supportURL: "https://www.habitat.org" },
            { componentId: "comp-2", title: "Local Food Bank Drive", subtext1: "5 miles", subtext2: "Donation", supportURL: "https://www.feedingamerica.org" },
            { componentId: "comp-3", title: "Park Cleanup Event for Earth Day", subtext1: "15 miles", subtext2: "Event", supportURL: "https://www.earthday.org" },
          ];

    if (organizations.length > 0) {
      console.log("🌱 ECO EXTENSION: Using impact-scored organizations:");
      organizations.forEach((org, idx) => {
        console.log(`${idx + 1}. ${org.name} - ${org.city}, ${org.state} (EIN: ${org.ein})`);
        console.log(`   ImpactScore: ${org.impactScore?.toFixed ? org.impactScore.toFixed(2) : org.impactScore}`);
        console.log(`   Website: ${org.website}`);
      });
    } else {
      console.log("🌱 ECO EXTENSION: No organizations found, using fallback data");
    }

    // Mount 3 cards
    componentsData.forEach((data) => {
      const box = document.createElement("div");
      box.id = data.componentId;
      box.classList.add("eco-textbox-container");
      box.innerHTML = componentHTML;
      mainWrapper.appendChild(box);
    });

    document.body.appendChild(mainWrapper);

    const closeButton = document.getElementById("top-bar-close");
    if (closeButton) closeButton.addEventListener("click", closeTextBox);

    const styleLink1 = document.createElement("link");
    styleLink1.rel = "stylesheet";
    styleLink1.href = textBoxCSSUrl;
    styleLink1.id = "eco-textbox-style";
    document.head.appendChild(styleLink1);

    const styleLink2 = document.createElement("link");
    styleLink2.rel = "stylesheet";
    styleLink2.href = styledIconCSSUrl;
    styleLink2.id = "eco-styled-icon-style";
    document.head.appendChild(styleLink2);

    await new Promise((resolve) => (styleLink1.onload = resolve));
    await new Promise((resolve) => (styleLink2.onload = resolve));

    const script = document.createElement("script");
    script.src = textBoxScriptUrl;
    script.id = "eco-textbox-script";
    document.body.appendChild(script);

    setTimeout(() => {
      window.postMessage(
        { type: "ECO_TEXTBOX_INIT", payload: { iconUrls, componentsData } },
        "*"
      );
      mainWrapper.style.opacity = "1";
      mainWrapper.style.transform = "translateY(0)";
    }, 50);
  } catch (error) {
    console.error("🌱 ECO EXTENSION: Error loading components:", error);
    isTextBoxOpen = false;
  }
}

function closeTextBox() {
  console.log("🌱 ECO EXTENSION: Closing text box");
  isTextBoxOpen = false;

  const container = document.getElementById("eco-main-wrapper");
  if (container) container.remove();

  const style1 = document.getElementById("eco-textbox-style");
  if (style1) style1.remove();

  const style2 = document.getElementById("eco-styled-icon-style");
  if (style2) style2.remove();

  const script = document.getElementById("eco-textbox-script");
  if (script) script.remove();
}

/* ==========================
   12) Boot the whole thing
   ========================== */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}
