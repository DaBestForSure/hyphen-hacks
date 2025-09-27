// Enhanced content.js with sentiment analysis and news site detection
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

// 6. Analyze both title and content, check multiple conditions
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

// 7. Main initialization function
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
        console.log("Negative sentiment detected (title < -0.2 OR text < -0.2 OR combined < 0), showing extension icon");
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

// 8. Create the fixed icon element
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
        const componentsData = [
            { id: 'comp-1', title: 'Component 1 Data' },
            { id: 'comp-2', title: 'Component 2 Data' },
            { id: 'comp-3', title: 'Component 3 Data' }
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
        // ... (Styles injection remains the same, but you might need to update IDs/variables if you're using the old ones) ...
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
        // We now pass the iconUrls AND the data for each of the three components
        const componentInitialData = [
            // Dummy data for the three components
            { componentId: 'comp-1', title: "Habitat for Humanity", subtext1: "10 miles", subtext2: "Mission" },
            { componentId: 'comp-2', title: "Local Food Bank Drive", subtext1: "5 miles", subtext2: "Donation" },
            { componentId: 'comp-3', title: "Park Cleanup Event for Earth Day", subtext1: "15 miles", subtext2: "Event" }
        ];
        
        setTimeout(() => {
            window.postMessage({
                type: 'ECO_TEXTBOX_INIT',
                payload: {
                    iconUrls: iconUrls,
                    componentsData: componentInitialData
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

    // ... (Remove CSS and Script as before) ...
    const style1 = document.getElementById('eco-textbox-style');
    if (style1) style1.remove();
    
    const style2 = document.getElementById('eco-styled-icon-style');
    if (style2) style2.remove();
    
    const script = document.getElementById('eco-textbox-script');
    if (script) script.remove();
}

// 9. Initialize everything when the page loads
// Wait for the page to be fully loaded before trying to extract title
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    // Page already loaded
    initializeExtension();
}