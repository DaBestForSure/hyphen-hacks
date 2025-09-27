// 1. Log the current page URL to the console
console.log("Current page URL:", window.location.href);

// Define component URLs from web_accessible_resources
const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

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
    console.log("Icon clicked! Opening the textBox component.");
    isTextBoxOpen = true;

    // A. Fetch and Inject HTML
    try {
        const response = await fetch(textBoxHTMLUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        
        const textBoxContainer = document.createElement('div');
        textBoxContainer.id = 'eco-textbox-wrapper'; // Unique ID for wrapper
        textBoxContainer.style.cssText = `
            position: fixed;
            bottom: 80px; /* Position it above the icon */
            right: 20px;
            z-index: 9998; /* Below the icon, but above page content */
        `;
        textBoxContainer.innerHTML = html;
        document.body.appendChild(textBoxContainer);

        // B. Inject CSS
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = textBoxCSSUrl;
        styleLink.id = 'eco-textbox-style';
        document.head.appendChild(styleLink);

        // C. Inject and Run JavaScript
        const script = document.createElement('script');
        script.src = textBoxScriptUrl;
        script.id = 'eco-textbox-script';
        
        script.onload = () => {
            // Make the container visible after everything is loaded
            textBoxContainer.style.visibility = 'visible';
        };
        
        document.body.appendChild(script);

    } catch (error) {
        console.error("Error loading textBox component:", error);
        isTextBoxOpen = false; // Reset flag on failure
    }
}

// Function to handle closing the component
function closeTextBox() {
    console.log("Closing the textBox component.");
    isTextBoxOpen = false;

    // Remove HTML
    const container = document.getElementById('eco-textbox-wrapper');
    if (container) container.remove();

    // Remove CSS
    const style = document.getElementById('eco-textbox-style');
    if (style) style.remove();
    
    // Remove Script (This is often tricky. Reloading the page is the cleanest way, 
    // but for now, we just remove the element. The global variables will persist 
    // but the visible component is gone.)
    const script = document.getElementById('eco-textbox-script');
    if (script) script.remove();
}

// Ensure we only create the icon once
if (!document.getElementById('eco-extension-icon')) {
    createIcon();
}