// Complete content.js with sentiment analysis, OpenAI, and ProPublica nonprofit search
// config.js is loaded first, so we can access the global 'config' variable

console.log("🌱 ECO EXTENSION: Starting with all features...");

// 1. Define news sites we care about
const NEWS_SITES = [
    'nytimes.com',
    'economist.com', 
    'wsj.com',
    'washingtonpost.com'
];

// 2. Check if we're on a news site
function isOnNewsSite() {
    const currentDomain = window.location.hostname.replace('www.', '');
    return NEWS_SITES.some(site => currentDomain.includes(site));
}

// 3. Extract article title from the page
function extractArticleTitle() {
    const selectors = [
        'h1[data-testid="headline"]', // NYTimes
        'h1.headline', // WSJ
        'h1.article__headline', // Common pattern
        'h1[class*="headline"]', // Any h1 with "headline" in class
        'h1[class*="title"]', // Any h1 with "title" in class
        'article h1', // H1 inside article tag
        '.article-title', // Generic article title class
        'h1' // Fallback to any h1
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            return element.textContent.trim();
        }
    }
    
    return document.title;
}

// 4. Extract article text/content from the page
function extractArticleText() {
    const contentSelectors = [
        'section[name="articleBody"]', // NYTimes
        '.article-body', // Common pattern
        '.story-body', // Common pattern
        'div[data-testid="articleBody"]', // Some sites
        'article .content', // Generic
        'article p', // Paragraphs in article
        '.post-content', // Blog posts
        'main article', // Main article content
        '[role="main"] p' // Accessible main content
    ];
    
    let articleText = '';
    
    for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            if (selector.includes('p')) {
                const paragraphs = document.querySelectorAll(selector);
                articleText = Array.from(paragraphs)
                    .slice(0, 10)
                    .map(p => p.textContent.trim())
                    .filter(text => text.length > 20)
                    .join(' ');
            } else {
                const paragraphs = element.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    articleText = Array.from(paragraphs)
                        .slice(0, 10)
                        .map(p => p.textContent.trim())
                        .filter(text => text.length > 20)
                        .join(' ');
                } else {
                    articleText = element.textContent.trim();
                }
            }
            
            if (articleText && articleText.length > 100) {
                break;
            }
        }
    }
    
    if (articleText.length > 3000) {
        articleText = articleText.substring(0, 3000) + '...';
    }
    
    return articleText;
}

// 5. Sentiment analysis function with fallback
async function analyzeSentiment(text) {
    if (typeof config === 'undefined' || !config.GOOGLE_API) {
        console.log("🌱 ECO EXTENSION: No Google API key, using keyword fallback");
        const negativeWords = ['crisis', 'disaster', 'death', 'fire', 'flood', 'war', 'attack', 'tragedy', 'terrible', 'awful'];
        const hasNegative = negativeWords.some(word => text.toLowerCase().includes(word));
        return { score: hasNegative ? -0.3 : 0.1 };
    }

    try {
        const response = await fetch(`https://language.googleapis.com/v1/documents:analyzeSentiment?key=${config.GOOGLE_API}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                document: { type: 'PLAIN_TEXT', content: text }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.documentSentiment;
    } catch (error) {
        console.error("🌱 ECO EXTENSION: Sentiment analysis error:", error);
        const negativeWords = ['crisis', 'disaster', 'death', 'fire', 'flood', 'war', 'attack', 'tragedy', 'terrible', 'awful'];
        const hasNegative = negativeWords.some(word => text.toLowerCase().includes(word));
        return { score: hasNegative ? -0.3 : 0.1 };
    }
}

// 6. Generate search queries using OpenAI GPT-4o-mini
async function generateSearchQueries(articleTitle, articleText) {
    if (typeof config === 'undefined' || !config.OPENAI_API_KEY) {
        console.log("🌱 ECO EXTENSION: No OpenAI API key, using fallback queries");
        return [
            "disaster relief",
            "community support", 
            "emergency assistance",
            "local nonprofit",
            "charity organization"
        ];
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
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 100,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error! status: ${response.status}`);
        }

        const data = await response.json();
        const searchQueriesText = data.choices[0].message.content.trim();
        
        const queries = searchQueriesText
            .split(',')
            .map(q => q.trim().replace(/"/g, '').replace(/^\d+\.\s*/, ''))
            .filter(q => q.length > 0 && !q.includes('http'));
        
        console.log("🌱 ECO EXTENSION: Generated search queries:", queries);
        return queries;
        
    } catch (error) {
        console.error("🌱 ECO EXTENSION: OpenAI error:", error);
        return [
            "disaster relief",
            "community support", 
            "emergency assistance",
            "local nonprofit",
            "charity organization"
        ];
    }
}

// 7. Search ProPublica API for organizations
async function searchProPublica(query) {
    try {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'SEARCH_PROPUBLICA',
                query: query
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('🌱 ECO EXTENSION: Runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response && response.success) {
                    resolve(response.organizations || []);
                } else {
                    console.error('🌱 ECO EXTENSION: ProPublica search failed:', response?.error);
                    resolve([]);
                }
            });
        });
        
    } catch (error) {
        console.error(`🌱 ECO EXTENSION: Error searching ProPublica for "${query}":`, error);
        return [];
    }
}

// 8. Get top 3 organizations using progressive search
async function getTopThreeOrganizations(searchQueries) {
    let allOrganizations = [];
    
    for (const query of searchQueries) {
        console.log(`🌱 ECO EXTENSION: Searching ProPublica for: "${query}"`);
        
        const organizations = await searchProPublica(query);
        console.log(`🌱 ECO EXTENSION: Found ${organizations.length} organizations for "${query}"`);
        
        if (organizations.length > 0) {
            const existingEINs = new Set(allOrganizations.map(org => org.ein));
            const newOrganizations = organizations.filter(org => !existingEINs.has(org.ein));
            
            allOrganizations = allOrganizations.concat(newOrganizations);
            
            console.log(`🌱 ECO EXTENSION: Total unique organizations: ${allOrganizations.length}`);
            
            if (allOrganizations.length >= 3) {
                console.log("🌱 ECO EXTENSION: Found 3+ organizations, stopping search");
                break;
            }
        }
    }
    
    const topThree = allOrganizations.slice(0, 3);
    
    console.log("🌱 ECO EXTENSION: Top 3 organizations:");
    topThree.forEach((org, index) => {
        console.log(`${index + 1}. ${org.name} (${org.city}, ${org.state})`);
    });
    
    return topThree;
}

// 9. Analyze sentiment with relaxed thresholds
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
            combinedScore = (titleSentiment.score * 0.6) + (textSentiment.score * 0.4);
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
        shouldShow: shouldShow,
        titleScore: titleSentiment.score,
        textScore: textSentiment ? textSentiment.score : null,
        combinedScore: combinedScore
    };
}

// 10. Main initialization function
async function initializeExtension() {
    console.log("🌱 ECO EXTENSION: Current page:", window.location.href);
    
    if (!isOnNewsSite()) {
        console.log("🌱 ECO EXTENSION: Not on news site, but continuing for testing...");
    }
    
    const articleTitle = extractArticleTitle();
    const articleText = extractArticleText();
    
    console.log("🌱 ECO EXTENSION: Article title:", articleTitle.substring(0, 100));
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
        console.log("🌱 ECO EXTENSION: Negative sentiment detected, showing extension");
        
        // Generate search queries and find organizations
        console.log("🌱 ECO EXTENSION: Generating search queries with OpenAI...");
        const searchQueries = await generateSearchQueries(articleTitle, articleText);
        
        if (searchQueries.length > 0) {
            console.log("🌱 ECO EXTENSION: Searching for relevant organizations...");
            const topOrganizations = await getTopThreeOrganizations(searchQueries);
            
            // Store organizations for later use
            window.ecoExtensionOrganizations = topOrganizations;
        } else {
            console.log("🌱 ECO EXTENSION: Could not generate search queries");
            window.ecoExtensionOrganizations = [];
        }
        
        createIcon();
    } else {
        console.log("🌱 ECO EXTENSION: Not showing icon - sentiment too positive");
    }
}

// Define URLs and resources
const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const styledIconCSSUrl = chrome.runtime.getURL("resources/styledIcon.css"); 
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

const iconUrls = {
    money: { url: chrome.runtime.getURL("images/money.svg"), description: "Financial Impact" }, 
    food: { url: chrome.runtime.getURL("images/food.svg"), description: "Food & Shelter" },   
    globe: { url: chrome.runtime.getURL("images/globe.svg"), description: "Global Reach" }
};

let isTextBoxOpen = false;

// 11. Create the fixed icon element
function createIcon() {
    const container = document.createElement('div');
    container.id = 'eco-extension-icon';
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
    
    container.addEventListener('mouseenter', () => {
        container.style.transform = 'scale(1.1)';
    });
    
    container.addEventListener('mouseleave', () => {
        container.style.transform = 'scale(1)';
    });
    
    try {
        const svgURL = chrome.runtime.getURL("images/leafIcon.svg");
        const img = document.createElement('img');
        img.src = svgURL;
        img.alt = 'Leaf Icon';
        img.style.cssText = 'width: 30px; height: 30px; filter: brightness(0) invert(1);';
        container.appendChild(img);
    } catch (error) {
        container.textContent = "🌱";
        container.style.fontSize = "24px";
    }
    
    container.addEventListener('click', async () => {
        if (!isTextBoxOpen) {
            await openTextBox();
        } else {
            closeTextBox();
        }
    });

    document.body.appendChild(container);
    console.log("🌱 ECO EXTENSION: Icon created and added to page");
}

// 12. Handle opening the component with real organization data
async function openTextBox() {
    console.log("🌱 ECO EXTENSION: Opening text box with organization data...");
    isTextBoxOpen = true;

    try {
        const htmlResponse = await fetch(textBoxHTMLUrl);
        const componentHTML = await htmlResponse.text();

        const mainWrapper = document.createElement('div');
        mainWrapper.id = 'eco-main-wrapper'; 
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

        // Always use default data for display - use componentId to match textBoxScript.js
        const componentsData = [
            { componentId: 'comp-1', title: "Habitat for Humanity", subtext1: "10 miles", subtext2: "Mission" },
            { componentId: 'comp-2', title: "Local Food Bank Drive", subtext1: "5 miles", subtext2: "Donation" },
            { componentId: 'comp-3', title: "Park Cleanup Event for Earth Day", subtext1: "15 miles", subtext2: "Event" }
        ];
        
        // Print organization data to console for debugging
        const organizations = window.ecoExtensionOrganizations || [];
        if (organizations.length > 0) {
            console.log("🌱 ECO EXTENSION: Found organizations (for debugging):");
            organizations.forEach((org, index) => {
                console.log(`${index + 1}. ${org.name} - ${org.city}, ${org.state} (EIN: ${org.ein})`);
            });
        } else {
            console.log("🌱 ECO EXTENSION: No organizations found or using fallback data");
        }

        componentsData.forEach(data => {
            const textBoxContainer = document.createElement('div');
            textBoxContainer.id = data.componentId; // Use componentId instead of id
            textBoxContainer.classList.add('eco-textbox-container');
            textBoxContainer.innerHTML = componentHTML;
            mainWrapper.appendChild(textBoxContainer);
        });

        document.body.appendChild(mainWrapper);
        
        const closeButton = document.getElementById('top-bar-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeTextBox);
        }
        
        const styleLink1 = document.createElement('link');
        styleLink1.rel = 'stylesheet';
        styleLink1.href = textBoxCSSUrl;
        styleLink1.id = 'eco-textbox-style';
        document.head.appendChild(styleLink1);

        const styleLink2 = document.createElement('link');
        styleLink2.rel = 'stylesheet';
        styleLink2.href = styledIconCSSUrl; 
        styleLink2.id = 'eco-styled-icon-style';
        document.head.appendChild(styleLink2);
        
        await new Promise(resolve => styleLink1.onload = resolve);
        await new Promise(resolve => styleLink2.onload = resolve);
        
        const script = document.createElement('script');
        script.src = textBoxScriptUrl;
        script.id = 'eco-textbox-script';
        document.body.appendChild(script);

        setTimeout(() => {
            window.postMessage({
                type: 'ECO_TEXTBOX_INIT',
                payload: {
                    iconUrls: iconUrls,
                    componentsData: componentsData
                }
            }, '*'); 

            mainWrapper.style.opacity = '1';
            mainWrapper.style.transform = 'translateY(0)';
        }, 50); 

    } catch (error) {
        console.error("🌱 ECO EXTENSION: Error loading components:", error);
        isTextBoxOpen = false;
    }
}

// 13. Close text box function
function closeTextBox() {
    console.log("🌱 ECO EXTENSION: Closing text box");
    isTextBoxOpen = false;

    const container = document.getElementById('eco-main-wrapper');
    if (container) container.remove();

    const style1 = document.getElementById('eco-textbox-style');
    if (style1) style1.remove();
    
    const style2 = document.getElementById('eco-styled-icon-style');
    if (style2) style2.remove();
    
    const script = document.getElementById('eco-textbox-script');
    if (script) script.remove();
}

// 14. Initialize everything when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}