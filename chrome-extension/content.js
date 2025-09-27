// 1. Log the current page URL to the console
console.log("Current page URL:", window.location.href);

// Define component URLs from web_accessible_resources
const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const styledIconCSSUrl = chrome.runtime.getURL("resources/styledIcon.css"); 
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

// Define icon URLs the component needs
const iconUrls = {
    money: chrome.runtime.getURL("images/money.svg"), 
    food: chrome.runtime.getURL("images/food.svg"),   
    globe: chrome.runtime.getURL("images/globe.svg")
};

// Flag to track the state of the component
let isTextBoxOpen = false;

// 2. Create the fixed icon element
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

// Ensure we only create the icon once
if (!document.getElementById('eco-extension-icon')) {
    createIcon();
}