(function() {

    let receivedData = null; // Will hold { iconUrls, componentsData }

    // Listener to receive the full data object from content.js
    window.addEventListener('message', function(event) {
        if (event.data.type === 'ECO_TEXTBOX_INIT' && receivedData === null) {
            receivedData = event.data.payload;
            // Now that we have the data, try to initialize all components
            safeInitializeComponents(); // Plural
        }
    });
    

    // A robust function to check if the DOM is ready for the script
    function safeInitializeComponents() {
        if (!receivedData) {
            return; 
        }

        const componentDataList = receivedData.componentsData;
        let allFound = true;

        // Check for all three containers to be present
        componentDataList.forEach(data => {
            if (!document.getElementById(data.componentId)) {
                allFound = false;
            }
        });

        if (allFound) {
            // All container elements are found. Proceed with initialization for each.
            console.log("All component containers found! Initializing component logic.");
            componentDataList.forEach(data => {
                const containerEl = document.getElementById(data.componentId);
                // The component element is the one *inside* the container: #custom-component
                const component = containerEl.querySelector('#custom-component'); 
                
                if (component) {
                    initializeComponentLogic(component, data);
                } else {
                    console.error(`#custom-component not found inside ${data.componentId}`);
                }
            });
        } else {
            // Not all elements are available yet. Retry.
            console.warn("Not all component containers found yet, retrying...");
            setTimeout(safeInitializeComponents, 50); 
        }
    }

    // New signature: takes the component element and its specific data
    function initializeComponentLogic(component, componentData) {

        const receivedIconUrls = receivedData.iconUrls; // Access icon URLs from the global receivedData

        const MAX_TITLE_LENGTH = 35;

        function truncateTitle(text) {
            if (text.length > MAX_TITLE_LENGTH) {
                return text.substring(0, MAX_TITLE_LENGTH) + "...";
            }
            return text;
        }

        // --- Component Inputs (Merged with passed data) ---
        const initialInputs = {
            // Use the component-specific data passed in
            title: componentData.title,
            subtext1: componentData.subtext1 || "N/A", 
            subtext2: componentData.subtext2 || "N/A", 
            // Use static/default data for active state/icons for simplicity
            subtextActive: "seeking to put god's love into action, habitat for humanity brings people together to build homes, communities, and hope.", 
            iconList: [
            { id: 'money', src: receivedIconUrls.money.url, description: receivedIconUrls.money.description }, 
            { id: 'food', src: receivedIconUrls.food.url, description: receivedIconUrls.food.description },
            { id: 'globe', src: receivedIconUrls.globe.url, description: receivedIconUrls.globe.description }
        ],
        charityURL: "hhtps:"
        };

        // Truncate title if too long
        const displayTitle = truncateTitle(initialInputs.title);

        // --- DOM Elements and Content Injection ---
        
        // ... (The rest of the function remains largely the same, using 'component.querySelector' 
        // and 'initialInputs' to populate the elements as before) ...
        
        const titleEl = component.querySelector('#comp-title');
        const subtext1DefaultEl = component.querySelector('#comp-subtext-1-default');
        const subtext1HoverActiveEl = component.querySelector('#comp-subtext-1-hover-active');
        const subtext2El = component.querySelector('#comp-subtext-2');
        const largeSubtextEl = component.querySelector('#comp-large-subtext');
        const iconsEl = component.querySelector('#comp-icons');
        
        if (titleEl) titleEl.textContent = displayTitle; 
        if (subtext1DefaultEl) subtext1DefaultEl.textContent = initialInputs.subtext1;
        if (subtext1HoverActiveEl) subtext1HoverActiveEl.textContent = initialInputs.subtext1;
        if (subtext2El) subtext2El.textContent = initialInputs.subtext2;
        if (largeSubtextEl) largeSubtextEl.textContent = initialInputs.subtextActive;

        // Inject Icons
        if (iconsEl) {
            iconsEl.innerHTML = initialInputs.iconList.map(item => 
                `
                <div class="styled-icon-box" data-icon-id="${item.id}">
                    <div class="icon-content">
                        <img src="${item.src}" alt="${item.id}" />
                    </div>
                    <div class="icon-tooltip">${item.description}</div>
                </div>
                `
            ).join('');
        }

        // --- State Management (Hover/Click logic remains the same) ---
        let currentState = 'default'; 
    
        function updateVariant(variant) {
            component.className = '';
            component.classList.add(`variant-${variant}`);
            currentState = variant;
            // Optional: Check state changes, maybe include component ID for debugging
            console.log(`${componentData.componentId} state updated to: ${currentState}`); 
        }
        
        updateVariant('default'); 

        // 5. Hover and Click Logic
        // ... (Hover and Click logic remains the same) ...
        
        // Hover: Switch to hover variant, unless active
        component.addEventListener('mouseenter', () => {
            if (currentState === 'default') {
                updateVariant('hover');
            }
        });

        // Mouse Leave: Switch back to default, unless active
        component.addEventListener('mouseleave', () => {
            if (currentState === 'hover') {
                updateVariant('default');
            }
        });

        // Click: Toggle between active and default
        component.addEventListener('click', (event) => {
            if (event.target.id === 'comp-button') {
                return;
            }
            
            if (currentState === 'active') {
                updateVariant('default');
            } else {
                updateVariant('active');
            }
            event.stopPropagation(); 
        });
    }

})();