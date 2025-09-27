// 1. Log the current page URL to the console
console.log("Current page URL:", window.location.href);

// 2. Create the fixed icon element
function createIcon() {
    const container = document.createElement('div');
    container.id = 'eco-extension-icon';
    
    // Load the SVG from web_accessible_resources
    // chrome.runtime.getURL converts a path relative to the extension's root to a full URL
    const svgURL = chrome.runtime.getURL("images/leafIcon.svg");
    
    // Create an image or object element for the SVG content
    const img = document.createElement('img');
    img.src = svgURL;
    img.alt = 'Leaf Icon';
    img.style.filter = 'brightness(0) invert(1)'; // To make the SVG content white

    container.appendChild(img);
    
    // Set up the click handler to 'change to another variant' (for now, just a log)
    container.addEventListener('click', () => {
        console.log("Icon clicked! Logic to change variant goes here.");
        // Example of changing a style/class on click:
        container.classList.toggle('variant-active');
    });

    document.body.appendChild(container);
}

// Ensure we only create the icon once
if (!document.getElementById('eco-extension-icon')) {
    createIcon();
}