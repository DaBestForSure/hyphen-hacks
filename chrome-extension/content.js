// Enhanced content.js with sentiment analysis, OpenAI, and ProPublica nonprofit search
// config.js is loaded first, so we can access the global 'config' variable

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
    // Try multiple selectors that news sites commonly use
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
    
    // Ultimate fallback to page title
    return document.title;
}

// 4. Extract article text/content from the page
function extractArticleText() {
    // Try multiple selectors for article content
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
    
    // Try each selector to find article content
    for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            // If it's a container, get all paragraph text
            if (selector.includes('p')) {
                const paragraphs = document.querySelectorAll(selector);
                articleText = Array.from(paragraphs)
                    .slice(0, 10) // Limit to first 10 paragraphs for API efficiency
                    .map(p => p.textContent.trim())
                    .filter(text => text.length > 20) // Filter out short/empty paragraphs
                    .join(' ');
            } else {
                // Get all text from the container
                const paragraphs = element.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    articleText = Array.from(paragraphs)
                        .slice(0, 10) // Limit to first 10 paragraphs
                        .map(p => p.textContent.trim())
                        .filter(text => text.length > 20)
                        .join(' ');
                } else {
                    articleText = element.textContent.trim();
                }
            }
            
            if (articleText && articleText.length > 100) {
                break; // Found good content, stop looking
            }
        }
    }
    
    // Limit text length for API efficiency (Google Cloud has limits)
    if (articleText.length > 3000) {
        articleText = articleText.substring(0, 3000) + '...';
    }
    
    return articleText;
}

// 5. Sentiment analysis function
async function analyzeSentiment(text) {
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
        console.error("Error analyzing sentiment:", error);
        return null;
    }
}

// 6. NEW: Generate search queries using OpenAI GPT-4o-mini
async function generateSearchQueries(articleTitle, articleText) {
    const fullArticle = `${articleTitle}\n\n${articleText}`;
    
    const prompt = `Based on this article, provide 5 search terms for finding relevant nonprofit organizations on ProPublica's API. Return ONLY the search terms separated by commas, no explanations, no URLs, no additional text. The terms should be:

1. Very specific to the main issue
2. Somewhat specific to the main issue  
3. Related to the geographic region/state if applicable
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
                'Authorization': `Bearer ${config.OPENAI_API}`
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
        
        // Extract the comma-separated queries and clean them
        const queries = searchQueriesText
            .split(',')
            .map(q => q.trim().replace(/"/g, '').replace(/^\d+\.\s*/, '')) // Remove quotes and numbering
            .filter(q => q.length > 0 && !q.includes('http')); // Filter out URLs and empty strings
        
        console.log("Generated search queries:", queries);
        return queries;
        
    } catch (error) {
        console.error("Error generating search queries with OpenAI:", error);
        // Fallback queries for flood/disaster articles
        return [
            "flood resilience",
            "disaster recovery", 
            "Florida housing",
            "emergency relief",
            "community development"
        ];
    }
}

// 7. NEW: Search ProPublica API for organizations using background script
async function searchProPublica(query) {
    try {
        // Use Chrome extension messaging to make the API call from background script
        // This avoids CORS issues
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'SEARCH_PROPUBLICA',
                query: query
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response && response.success) {
                    resolve(response.organizations || []);
                } else {
                    console.error('ProPublica search failed:', response?.error);
                    resolve([]);
                }
            });
        });
        
    } catch (error) {
        console.error(`Error searching ProPublica for "${query}":`, error);
        return [];
    }
}

// 8. NEW: Get top 3 organizations using the progressive search strategy
async function getTopThreeOrganizations(searchQueries) {
    let allOrganizations = [];
    
    for (const query of searchQueries) {
        console.log(`Searching ProPublica for: "${query}"`);
        
        const organizations = await searchProPublica(query);
        console.log(`Found ${organizations.length} organizations for "${query}"`);
        
        if (organizations.length > 0) {
            // Add organizations that we don't already have (avoid duplicates by EIN)
            const existingEINs = new Set(allOrganizations.map(org => org.ein));
            const newOrganizations = organizations.filter(org => !existingEINs.has(org.ein));
            
            allOrganizations = allOrganizations.concat(newOrganizations);
            
            console.log(`Total unique organizations found so far: ${allOrganizations.length}`);
            
            // If we have 3 or more, we can stop
            if (allOrganizations.length >= 3) {
                console.log("Found 3+ organizations, stopping search");
                break;
            }
        }
    }
    
    // Return top 3 organizations
    const topThree = allOrganizations.slice(0, 3);
    
    console.log("=== TOP 3 ORGANIZATIONS ===");
    topThree.forEach((org, index) => {
        console.log(`${index + 1}. ${org.name}`);
        console.log(`   EIN: ${org.ein}`);
        console.log(`   Location: ${org.city}, ${org.state}`);
        console.log(`   NTEE Code: ${org.ntee_code}`);
        console.log(`   Score: ${org.score}`);
        console.log("   ---");
    });
    
    return topThree;
}

// 9. Analyze both title and content, check multiple conditions
async function analyzeArticleSentiment(title, articleText) {
    console.log("Analyzing title:", title.substring(0, 100) + "...");
    console.log("Analyzing article text:", articleText.substring(0, 100) + "...");
    
    // Analyze title sentiment
    const titleSentiment = await analyzeSentiment(title);
    
    if (!titleSentiment) {
        console.log("Could not analyze title sentiment");
        return { shouldShow: false, titleScore: null, textScore: null, combinedScore: null };
    }
    
    console.log("Title sentiment score:", titleSentiment.score);
    
    let textSentiment = null;
    let combinedScore = titleSentiment.score; // Default to title score
    
    // If we have article text, analyze it too
    if (articleText && articleText.length > 50) {
        textSentiment = await analyzeSentiment(articleText);
        
        if (textSentiment) {
            console.log("Article text sentiment score:", textSentiment.score);
            
            // Calculate combined score with 60/40 weighting (title/text)
            combinedScore = (titleSentiment.score * 0.6) + (textSentiment.score * 0.4);
            console.log("Combined weighted sentiment score:", combinedScore);
        } else {
            console.log("Could not analyze article text");
        }
    } else {
        console.log("No article text found");
    }
    
    // Check all three conditions:
    // 1. Title is negative enough (< -0.2)
    // 2. Text is negative enough (< -0.2) 
    // 3. Combined score is negative (< 0)
    const titleIsNegative = titleSentiment.score < -0.2;
    const textIsNegative = textSentiment && textSentiment.score < -0.2;
    const combinedIsNegative = combinedScore < 0;
    
    const shouldShow = titleIsNegative || textIsNegative || combinedIsNegative;
    
    console.log(`Title negative (< -0.2): ${titleIsNegative}`);
    console.log(`Text negative (< -0.2): ${textIsNegative}`);
    console.log(`Combined negative (< 0): ${combinedIsNegative}`);
    console.log(`Should show extension: ${shouldShow}`);
    
    return {
        shouldShow: shouldShow,
        titleScore: titleSentiment.score,
        textScore: textSentiment ? textSentiment.score : null,
        combinedScore: combinedScore
    };
}

// 10. Main initialization function
async function initializeExtension() {
    console.log("Current page URL:", window.location.href);
    
    // Only proceed if we're on a news site
    if (!isOnNewsSite()) {
        console.log("Not on a news site, extension will not activate");
        return;
    }
    
    console.log("On news site, checking article sentiment...");
    
    // Extract article title and text
    const articleTitle = extractArticleTitle();
    const articleText = extractArticleText();
    
    console.log("Article title:", articleTitle);
    console.log("Article text length:", articleText.length, "characters");
    
    if (!articleTitle) {
        console.log("Could not extract article title");
        return;
    }
    
    // Analyze sentiment and check if we should show extension
    const sentimentResult = await analyzeArticleSentiment(articleTitle, articleText);
    
    if (sentimentResult.titleScore === null) {
        console.log("Could not analyze sentiment");
        return;
    }
    
    console.log("Title sentiment score:", sentimentResult.titleScore);
    if (sentimentResult.textScore !== null) {
        console.log("Text sentiment score:", sentimentResult.textScore);
    }
    console.log("Combined sentiment score:", sentimentResult.combinedScore);
    
    // Show extension if any of the three conditions are met:
    // 1. Title < -0.2, OR 2. Text < -0.2, OR 3. Combined < 0
    if (sentimentResult.shouldShow) {
        console.log("Negative sentiment detected, showing extension icon");
        
        // NEW: Generate search queries and find organizations
        console.log("Generating search queries with OpenAI...");
        const searchQueries = await generateSearchQueries(articleTitle, articleText);
        
        if (searchQueries.length > 0) {
            console.log("Searching for relevant organizations...");
            const topOrganizations = await getTopThreeOrganizations(searchQueries);
            
            // Store organizations for later use in the extension
            window.ecoExtensionOrganizations = topOrganizations;
        } else {
            console.log("Could not generate search queries");
            window.ecoExtensionOrganizations = [];
        }
        
        createIcon();
    } else {
        console.log("No negative sentiment conditions met, extension will not show");
    }
}

// Define component URLs from web_accessible_resources
const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const styledIconCSSUrl = chrome.runtime.getURL("resources/styledIcon.css"); 
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

// Define icon URLs the component needs
const iconUrls = {
    money: { url: chrome.runtime.getURL("images/money.svg"), description: "Financial Impact" }, 
    food: { url: chrome.runtime.getURL("images/food.svg"), description: "Food & Shelter" },   
    globe: { url: chrome.runtime.getURL("images/globe.svg"), description: "Global Reach" }
};

// Flag to track the state of the component
let isTextBoxOpen = false;

// 11. Create the fixed icon element
function createIcon() {
    const container = document.createElement('div');
    container.id = 'eco-extension-icon';
    
    const svgURL = chrome.runtime.getURL("images/leafIcon.svg");
    
    const img = document.createElement('img');
    img.src = svgURL;
    img.alt = 'Leaf Icon';
    img.style.filter = 'brightness(0) invert(1)';

    container.appendChild(img);
    
    // Set up the click handler to toggle the textBox component
    container.addEventListener('click', async () => {
        if (!isTextBoxOpen) {
            await openTextBox();
        } else {
            closeTextBox();
        }
    });

    document.body.appendChild(container);
}

// Function to handle opening the component
async function openTextBox() {
    console.log("Icon clicked! Opening the stacked components.");
    isTextBoxOpen = true;

    try {
        // A. Fetch and Inject HTML 
        const htmlResponse = await fetch(textBoxHTMLUrl);
        const componentHTML = await htmlResponse.text(); // Renamed for clarity

        // --- 1. Create the main wrapper for all components and the top bar ---
        const mainWrapper = document.createElement('div');
        mainWrapper.id = 'eco-main-wrapper'; 
        mainWrapper.style.cssText = `
            position: fixed;
            bottom: 80px; 
            right: 20px;
            z-index: 9998;
            /* Add transition for a smooth reveal */
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            display: flex;
            flex-direction: column;
            gap: 4px; /* Space between components */
        `;

        // --- 2. Create and append the Top Bar HTML ---
        const leafIconUrl = chrome.runtime.getURL("images/leafIcon.svg");

        const topBarHTML = `
            <div id="eco-top-bar">
                <img id="top-bar-icon" src="${leafIconUrl}" alt="Leaf Icon"/>
                <div id="top-bar-title">Local Impact</div>
                <div id="top-bar-close">×</div>
            </div>
        `;
        mainWrapper.innerHTML += topBarHTML;

        // --- 3. Create and append the three component containers ---
        // Use the organizations found by ProPublica, or fallback data
        const organizations = window.ecoExtensionOrganizations || [];
        
        const componentsData = organizations.length >= 3 ? [
            { 
                id: 'comp-1', 
                title: organizations[0].name,
                subtext1: `${organizations[0].city}, ${organizations[0].state}`,
                subtext2: "Nonprofit"
            },
            { 
                id: 'comp-2', 
                title: organizations[1].name,
                subtext1: `${organizations[1].city}, ${organizations[1].state}`,
                subtext2: "Nonprofit"
            },
            { 
                id: 'comp-3', 
                title: organizations[2].name,
                subtext1: `${organizations[2].city}, ${organizations[2].state}`,
                subtext2: "Nonprofit"
            }
        ] : [
            // Fallback data if no organizations found
            { id: 'comp-1', title: "Habitat for Humanity", subtext1: "10 miles", subtext2: "Mission" },
            { id: 'comp-2', title: "Local Food Bank Drive", subtext1: "5 miles", subtext2: "Donation" },
            { id: 'comp-3', title: "Park Cleanup Event for Earth Day", subtext1: "15 miles", subtext2: "Event" }
        ];

        componentsData.forEach(data => {
            const textBoxContainer = document.createElement('div');
            // Give each one a unique ID and a common class for styling
            textBoxContainer.id = data.id; 
            textBoxContainer.classList.add('eco-textbox-container');

            // Inject the component HTML (from textBox.html)
            textBoxContainer.innerHTML = componentHTML;
            mainWrapper.appendChild(textBoxContainer);
        });

        // Append the whole structure to the body
        document.body.appendChild(mainWrapper);
        
        // Add listener to the close button
        const closeButton = document.getElementById('top-bar-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeTextBox);
        }
        
        // B. Inject CSS (as before)
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
        
        // Wait for CSS
        await new Promise(resolve => styleLink1.onload = resolve);
        await new Promise(resolve => styleLink2.onload = resolve);
        
        // C. Inject JavaScript (The secure way - using src)
        const script = document.createElement('script');
        script.src = textBoxScriptUrl;
        script.id = 'eco-textbox-script';
        document.body.appendChild(script);

        // D. Pass data to the newly injected script using postMessage
        setTimeout(() => {
            window.postMessage({
                type: 'ECO_TEXTBOX_INIT',
                payload: {
                    iconUrls: iconUrls,
                    componentsData: componentsData
                }
            }, '*'); 

            // Make it visible after sending the message
            mainWrapper.style.opacity = '1';
            mainWrapper.style.transform = 'translateY(0)';
        }, 50); 

    } catch (error) {
        console.error("Error loading components:", error);
        isTextBoxOpen = false;
    }
}

// Function to handle closing the component
function closeTextBox() {
    console.log("Closing the stacked components.");
    isTextBoxOpen = false;

    // Remove HTML (remove the main wrapper)
    const container = document.getElementById('eco-main-wrapper');
    if (container) container.remove();

    // Remove CSS and Script
    const style1 = document.getElementById('eco-textbox-style');
    if (style1) style1.remove();
    
    const style2 = document.getElementById('eco-styled-icon-style');
    if (style2) style2.remove();
    
    const script = document.getElementById('eco-textbox-script');
    if (script) script.remove();
}

// 12. Initialize everything when the page loads
// Wait for the page to be fully loaded before trying to extract title
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    // Page already loaded
    initializeExtension();
}