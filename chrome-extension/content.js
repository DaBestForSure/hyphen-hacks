// 1. Log the current page URL to the console
console.log("Current page URL:", window.location.href);

// Define component URLs from web_accessible_resources
const textBoxHTMLUrl = chrome.runtime.getURL("resources/textBox.html");
const textBoxCSSUrl = chrome.runtime.getURL("resources/textBoxStyle.css");
const textBoxScriptUrl = chrome.runtime.getURL("resources/textBoxScript.js");

// Define icon URLs the component needs
const iconUrls = {
    attach: chrome.runtime.getURL("images/attach_money_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg"),
    borg: chrome.runtime.getURL("images/borg_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg"),
    globe: chrome.runtime.getURL("images/globe_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg")
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
    console.log("Icon clicked! Opening the textBox component.");
    isTextBoxOpen = true;

    try {
        // A. Fetch and Inject HTML (as before)
        const htmlResponse = await fetch(textBoxHTMLUrl);
        const html = await htmlResponse.text();
        
        const textBoxContainer = document.createElement('div');
        textBoxContainer.id = 'eco-textbox-wrapper'; 
        textBoxContainer.style.cssText = `
            position: fixed;
            bottom: 80px; 
            right: 20px;
            z-index: 9998;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        // Inject the HTML string, which contains the #custom-component
        textBoxContainer.innerHTML = html;
        document.body.appendChild(textBoxContainer);

        // B. Inject CSS (as before)
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = textBoxCSSUrl;
        styleLink.id = 'eco-textbox-style';
        document.head.appendChild(styleLink);
        
        // C. Inject JavaScript (The secure way - using src)
        const script = document.createElement('script');
        script.src = textBoxScriptUrl;
        script.id = 'eco-textbox-script';
        document.body.appendChild(script);

        // D. Pass data to the newly injected script using postMessage
        // CRITICAL CHANGE: Use a small delay (0ms) to ensure the script tag is processed 
        // and the HTML is fully parsed before sending the message.
        setTimeout(() => {
            window.postMessage({
                type: 'ECO_TEXTBOX_INIT',
                payload: iconUrls
            }, '*'); 

            // Make it visible after sending the message
            textBoxContainer.style.opacity = '1';
            textBoxContainer.style.transform = 'translateY(0)';
        }, 0); 

    } catch (error) {
        console.error("Error loading textBox component:", error);
        isTextBoxOpen = false;
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