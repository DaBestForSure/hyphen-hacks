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
    'h1[data-testid="headline"]',
    "h1.headline",
    "h1.article__headline",
    'h1[class*="headline"]',
    'h1[class*="title"]',
    "article h1",
    ".article-title",
    "h1",
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return document.title || "";
}

function extractArticleText() {
  const contentSelectors = [
    'section[name="articleBody"]',
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
   3.5) Article-level sentiment wrapper
   =========================================== */

async function analyzeArticleSentiment(articleTitle, articleText) {
  try {
    const [titleRes, bodyRes] = await Promise.all([
      analyzeSentiment(articleTitle || ""),
      analyzeSentiment(articleText || "")
    ]);

    const titleScore = typeof titleRes?.score === "number" ? titleRes.score : null;
    const bodyScore  = typeof bodyRes?.score  === "number" ? bodyRes.score  : null;

    const scores = [titleScore, bodyScore].filter((n) => typeof n === "number");
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const shouldShow = avgScore !== null ? avgScore <= 0.2 : false;
    return { titleScore, bodyScore, avgScore, shouldShow };
  } catch (err) {
    console.error("🌱 ECO EXTENSION: analyzeArticleSentiment error:", err);
    return { titleScore: null, bodyScore: null, avgScore: null, shouldShow: false };
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

async function searchProPublica(query, limit = 30) {
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
  return /\.(pdf)(\?|#|$)/i.test(u);
}

function isCauseIQ(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase().replace(/^www\./, "");
    return host === "causeiq.com" || host.endsWith(".causeiq.com");
  } catch {
    return /(^|\/\/|\.)causeiq\.com/i.test(String(url));
  }
}

const BLOCKED_HOST_PATTERNS = [
  "nytimes.com","washingtonpost.com","wsj.com","theguardian.com","latimes.com","reuters.com",
  "apnews.com","bloomberg.com","forbes.com","ft.com","economist.com","cnn.com","bbc.co.uk","bbc.com",
  "npr.org","aljazeera.com","usatoday.com","foxnews.com","abcnews.go.com","cbsnews.com","nbcnews.com",
  "yahoo.com","news.yahoo.com","time.com","newsweek.com","politico.com","vox.com","theatlantic.com",
  "patch.com","triblive.com","chicagotribune.com","sfgate.com","sfchronicle.com","mercurynews.com","startribune.com",
  "mlive.com","cleveland.com","oregonlive.com","boston.com","bostonglobe.com","seattletimes.com","denverpost.com",
  "charitynavigator.org","guidestar.org","candid.org","greatnonprofits.org","glassdoor.com","indeed.com","ziprecruiter.com",
  "yelp.com","meetup.com","eventbrite.com","givengain.com","justgiving.com","donorbox.org",
  "crunchbase.com","bloomberg.com","pitchbook.com","rocketreach.co","zoominfo.com","owler.com",
  "facebook.com","twitter.com","x.com","instagram.com","linkedin.com","youtube.com","tiktok.com",
  "wikipedia.org","m.wikidata.org","wikimedia.org",
  "webcache.googleusercontent.com","translate.google.com"
];

const ARTICLEY_PATH_RE = /\/(news|article|articles|story|stories|press|media|opinions?|editorial|blog|politics|local|world|investigations?)\b/i;
const NEWSY_TEXT_HINTS = /\b(report|reports|investigation|investigates|obituary|breaking|editorial|opinion|says|sued|charged|arrested|kills?|dead|dies)\b/i;
const GOOD_TLDS_RE = /\.(org|ngo|ong|charity|foundation|edu|org\.[a-z]{2}|[a-z]{2}\.org)(\/|$)/i;

const DIRECTORY_HOST_PATTERNS = [
  "charitynavigator.org","guidestar.org","candid.org","greatnonprofits.org","charitywatch.org"
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isBlockedHost(url) {
  const host = hostnameOf(url);
  return BLOCKED_HOST_PATTERNS.some(b => host === b || host.endsWith(`.${b}`));
}

function isDirectoryHost(url) {
  const host = hostnameOf(url);
  return DIRECTORY_HOST_PATTERNS.some(b => host === b || host.endsWith(`.${b}`));
}

function looksLikeArticlePath(url) {
  try {
    const u = new URL(url);
    return ARTICLEY_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

function textLooksNewsy(str = "") {
  return NEWSY_TEXT_HINTS.test(String(str).toLowerCase());
}

function tokensFromName(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|inc|incorporated|foundation|fund|international|america|american|usa|of|for|and)\b/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

function hostnameMatchesOrg(host, orgNameTokens) {
  const labels = host.split(".")[0].split(/[^a-z0-9]/g).filter(Boolean);
  return orgNameTokens.some(tok => labels.some(lbl => lbl.includes(tok) || tok.includes(lbl)));
}

// Require the full org name (normalized) to be present in CSE title or URL
function hasFullOrgNameInTitleOrUrl(orgName, url, cseTitle = "") {
  if (!orgName || !url) return false;

  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const squish = (s) => norm(s).replace(/\s+/g, "");
  const orgFull = squish(orgName);

  const titleHas = squish(cseTitle).includes(orgFull);

  let urlHas = false;
  try {
    const u = new URL(url);
    const hostPath = `${u.hostname} ${u.pathname}`;
    urlHas = squish(hostPath).includes(orgFull);
  } catch {}

  return titleHas || urlHas;
}

function isLikelyOfficial(url, orgName, cseTitle = "", cseSnippet = "") {
  if (!url) return false;
  if (isPdfUrl(url)) return false;
  if (isCauseIQ(url)) return false;
  if (isBlockedHost(url)) return false;
  if (looksLikeArticlePath(url)) return false;
  if (textLooksNewsy(cseTitle) || textLooksNewsy(cseSnippet)) return false;

  // Strict: full org name must appear in title or URL
  if (!hasFullOrgNameInTitleOrUrl(orgName, url, cseTitle)) return false;

  const host = hostnameOf(url);
  const nameTokens = tokensFromName(orgName);

  const tldGood = GOOD_TLDS_RE.test(url);
  const hostMatches = hostnameMatchesOrg(host, nameTokens);

  let pathPenalty = 0;
  try {
    const u = new URL(url);
    if (u.pathname.split("/").filter(Boolean).length >= 3) pathPenalty += 1;
    if (/\b(donate|volunteer|about|our-work|programs|contact)\b/i.test(u.pathname)) pathPenalty -= 0.5;
  } catch {}

  return (hostMatches || tldGood) && pathPenalty <= 0;
}

function isLegitimateNonprofit(url) {
  if (!url) return false;
  if (isBlockedHost(url) || isDirectoryHost(url)) return false;
  return GOOD_TLDS_RE.test(url) || /\b(donate|volunteer|foundation|nonprofit|charity)\b/i.test(url) || /\/(donate|volunteer|about)\b/i.test(url);
}

async function findOfficialWebsite(orgName, orgCity, orgState) {
  if (typeof config === "undefined" || !config.GOOGLE_API || !config.SEARCH_ENGINE_ID) {
    console.log("🌱 ECO EXTENSION: No Google Search API credentials");
    return null;
  }

  try {
    const where = orgCity && orgState ? `${orgCity} ${orgState}` : "";
    const query = `"${orgName}" ${where} (official|home|homepage) (donate|volunteer|about) -site:facebook.com -site:linkedin.com -site:twitter.com -site:x.com -site:instagram.com -site:wikipedia.org`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${config.GOOGLE_API}&cx=${config.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Search API error! status: ${response.status}`);
    const data = await response.json();
    const items = data.items || [];
    console.log(`🌱 ECO EXTENSION: Found ${items.length} search results for "${orgName}" ${where}`);

    // Pass 1: strict official heuristic
    for (const item of items) {
      const { link, title = "", snippet = "" } = item;
      if (isLikelyOfficial(link, orgName, title, snippet)) {
        console.log(`🌱 ECO EXTENSION: Official-looking site: ${link}`);
        return link;
      }
    }

    // Pass 2: allow .com if hostname matches AND full name present
    for (const item of items) {
      const { link, title = "", snippet = "" } = item;
      if (!isBlockedHost(link) && !looksLikeArticlePath(link) && !textLooksNewsy(title) && !textLooksNewsy(snippet)) {
        const host = hostnameOf(link);
        if (hostnameMatchesOrg(host, tokensFromName(orgName)) && hasFullOrgNameInTitleOrUrl(orgName, link, title)) {
          console.log(`🌱 ECO EXTENSION: Accepting matched host (.com ok, full name present): ${link}`);
          if (!isPdfUrl(link) && !isCauseIQ(link)) return link;
        }
      }
    }

    // MapQuest fallback
    if (typeof config.MAPQUEST_API_KEY !== "undefined" && config.MAPQUEST_API_KEY) {
      const mapquestQuery = `${orgName} ${orgCity || ""} ${orgState || ""}`.trim();
      const mapquestUrl =
        `https://www.mapquestapi.com/search/v2/search?key=${config.MAPQUEST_API_KEY}&q=${encodeURIComponent(mapquestQuery)}&pageSize=1`;
      try {
        const mqResponse = await fetch(mapquestUrl);
        if (mqResponse.ok) {
          const mqData = await mqResponse.json();
          const fields = mqData?.results?.[0]?.fields || {};
          const site = fields.website;
          if (site && !isPdfUrl(site) && isLegitimateNonprofit(site) && hasFullOrgNameInTitleOrUrl(orgName, site)) {
            console.log(`🌱 ECO EXTENSION: MapQuest fallback found URL: ${site}`);
            return site;
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
  const rev     = Math.max(0, Number(filing?.totrevenue || 0));
  const assets  = Math.max(0, Number(filing?.totassetsend || 0));
  const contrib = Math.max(0, Number(filing?.totcntrbgfts || 0));
  return 1.2 * Math.log1p(rev) + 0.9 * Math.log1p(assets) + 0.8 * Math.log1p(contrib);
}

/* ==================================================================================
   8) Get top 3 orgs across multiple queries (lazy website lookups)
   ================================================================================== */

/* ==================================================================================
   8) Get top 3 orgs across multiple queries
      - Collect up to 60 unique EINs.
      - Compute impact scores (money + other factors).
      - Sort by impact (with slight early-query boost).
      - Run website lookups for the TOP 20 ONLY.
      - Prefer orgs with valid websites; fill remaining slots from impact list (no extra lookups).
   ================================================================================== */

async function getTopThreeOrganizations(searchQueries) {
  if (!Array.isArray(searchQueries) || searchQueries.length === 0) return [];

  const MAX_UNIQUE = 60;            // find up to 60
  const WEBSITE_LOOKUP_BUDGET = 20; // only do website lookups for top 20
  const seenEIN = new Set();
  const candidates = [];

  // 1) Collect up to 60 unique EINs across queries, preserving query index
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

    const latest = pickLatestFilingWithData(details.filings_with_data || []);
    if (!latest) continue;

    // "Importance" score: money (revenue/assets/contrib) + slight early-query boost
    const baseImpact = computeImpactScoreFromFiling(latest);
    const earlyBoost = 2 * Math.max(0, (searchQueries.length - 1 - c._queryIndex));

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
      website: null, // filled only for top 20
    });
  }

  if (evaluated.length < 3) {
    console.log("🌱 ECO EXTENSION: Fewer than 3 evaluated orgs; returning []");
    return [];
  }

  // 3) Sort by impactScore desc
  evaluated.sort((a, b) => b.impactScore - a.impactScore);

  // 4) Website lookups for TOP 20 ONLY
  const withSites = [];
  const noSiteYet = [];
  const lookupSlice = evaluated.slice(0, WEBSITE_LOOKUP_BUDGET);

  for (const org of lookupSlice) {
    if (withSites.length >= 3) break; // stop once we have 3 with sites

    const siteBundle = await getOrganizationWebsite(org.name, org.ein, org.city, org.state);
    const websiteUrl = siteBundle?.website || null;

    if (websiteUrl && !isPdfUrl(websiteUrl)) {
      org.website = websiteUrl; // passes strict checks inside findOfficialWebsite
      withSites.push(org);
    } else {
      org.website = null;
      noSiteYet.push(org);
    }
  }

  // 5) If we already have 3 with websites, return them (already top-20 by impact)
  if (withSites.length === 3) return withSites;

  // 6) Otherwise, fill remaining slots with highest-impact orgs (no extra lookups beyond top 20)
  // First try remaining from the top-20 pool (those without sites), then—if still short—allow from the rest of evaluated.
  const need = 3 - withSites.length;
  const fallbackPool = [
    ...noSiteYet,                 // top-20 that lacked sites
    ...evaluated.slice(WEBSITE_LOOKUP_BUDGET) // beyond top-20 (no lookups done)
  ];

  const filler = fallbackPool.slice(0, need).map(o => ({ ...o, website: null }));
  return [...withSites, ...filler].slice(0, 3);
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
        <div id="top-bar-title">uplift</div>
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

    // New map to translate the first letter of the NTEE code to the numeric category ID
    const nteeLetterToNumberMap = {
        'A': 1,
        'B': 2,
        'C': 3,
        'D': 3,
        'E': 4,
        'F': 4,
        'G': 4,
        'H': 4,
        'I': 5,
        'J': 5,
        'K': 5,
        'L': 5,
        'M': 5,
        'N': 5,
        'O': 5,
        'P': 5,
        'Q': 6,
        'R': 7,
        'S': 7,
        'T': 7,
        'U': 7,
        'V': 7,
        'W': 7,
        'X': 8,
        'Y': 9,
        'Z': 10
    };

    // Existing numeric category map (use NTEE's full name, e.g., 'Unknown/Unclassified')
    const nteeCategoryMap = {
        1: "Arts, Culture & Humanities",
        2: "Education",
        3: "Environment & Animals",
        4: "Health",
        5: "Human Services",
        6: "International, Foreign Affairs",
        7: "Public, Societal Benefit",
        8: "Religion Related",
        9: "Mutual/Membership Benefit",
        10: "Unknown/Unclassified"
    };

    const nteeImageNameMap = {
        1: "wall_art",
        2: "education",
        3: "forest",
        4: "health",
        5: "human",
        6: "globe",
        7: "building",
        8: "church",
        9: "handshake",
        10: "generic"
    };

    /**
     * Transforms an array of organization objects into an object map of icon URLs,
     * suitable for direct assignment to an icon URLs variable.
     * The keys of the returned object are unique identifiers for each organization.
     *
     * @param {Array<Object>} organizations The input array of organization objects.
     * @returns {Object} An object where keys are organization identifiers and values are icon objects.
     */
    function transformOrganizationsWithNTEE(organizations) {
        console.log("Organizations passed into NTEE fn.:", organizations);
        if (!Array.isArray(organizations)) {
            console.error("Invalid input data: expected an array of organizations.");
            return {};
        }

        console.log("Attempting to grab ntee codes");

        let componentCounter = 1;
        const iconUrls = {}; // Initialize the empty object

        organizations.map(org => {
            // 1. Extract the NTEE letter code (the first character)
            // Ensure org.ntree_code exists and is a string, default to 'Z' for unknown if not
            const fullNteeCode = org.ntee_code || 'Z'; 
            const nteeLetter = fullNteeCode.charAt(0).toUpperCase();

            // 2. Map the letter to the numeric category ID (e.g., 'A' -> 1)
            // Default to 10 (Unknown/Unclassified) if the letter isn't found
            const numericCode = nteeLetterToNumberMap[nteeLetter] || 10; 

            // 3. Use the numeric code to get the Category Name and Image Name
            const categoryName = nteeCategoryMap[numericCode];
            const imageName = nteeImageNameMap[numericCode];
            
            // Use a unique key for the returned object (e.g., comp-1, comp-2, etc.)
            const uniqueKey = `comp-${componentCounter++}`;
            
            const iconURL = chrome.runtime.getURL(`images/${imageName}.svg`);

            // 4. Determine icon URL and description based on category
            // Construct the dynamic icon object
            const iconData = {
                url: iconURL,
                // Example: "Education type of nonprofit"
                description: `${categoryName} type of nonprofit`
            };

            // 5. Assign the icon data to the unique key in the resulting object
            iconUrls[uniqueKey] = iconData;

            // Logging for verification
            console.log("Found NTEE code:", fullNteeCode, "-> Letter:", nteeLetter);
            console.log("Mapped to numeric code:", numericCode);
            console.log("Mapped to categoryName:", categoryName, "mapped to imageName:", imageName);
        });

        return iconUrls;
    }


    const iconUrls = transformOrganizationsWithNTEE(window.ecoExtensionOrganizations);

    console.log("iconUrls:", iconUrls)

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
