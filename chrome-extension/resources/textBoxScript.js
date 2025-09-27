// resources/textBoxScript.js - FINAL (DOM Search Adjustment)

(function() {

    let receivedIconUrls = null;

    // Listener to receive the iconUrls data from content.js
    window.addEventListener('message', function(event) {
        // Stop listening after the first message is processed
        if (event.data.type === 'ECO_TEXTBOX_INIT' && receivedIconUrls === null) {
            receivedIconUrls = event.data.payload;
            // Now that we have the data, try to initialize the component
            safeInitializeComponent();
        }
    });
    

    // A robust function to check if the DOM is ready for the script
    function safeInitializeComponent() {
        if (!receivedIconUrls) {
            return; 
        }

        // We check if the #custom-component is present in the DOM.
        // Since we are searching inside the content script's context, 
        // getElementById is the fastest and safest method.
        const component = document.getElementById('custom-component');

        if (component) {
            // The element is found. Proceed with initialization.
            console.log("#custom-component found! Initializing component logic.");
            initializeComponentLogic(component);
        } else {
            // The HTML element is not yet available. Retry.
            console.warn("#custom-component not found yet, retrying...");
            setTimeout(safeInitializeComponent, 50); 
        }
    }

    // ... (The initializeComponentLogic function remains the same as the previous response) ...
    // Note: It's important that your logic uses the 'component' variable passed to it 
    // for all subsequent searches (e.g., component.querySelector('#comp-title')).

    function initializeComponentLogic(component) {

        const MAX_TITLE_LENGTH = 35;

        function truncateTitle(text) {
            if (text.length > MAX_TITLE_LENGTH) {
                // Cut the text to 35 characters and add ellipsis "..."
                return text.substring(0, MAX_TITLE_LENGTH) + "...";
            }
            return text;
        }

        // --- Component Inputs ---
        const initialInputs = {
            title: "habitat for humanity",
            subtext1: "10 miles", 
            subtext2: "Mission", 
            subtextActive: "seeking to put god's love into action, habitat for humanity brings people together to build homes, communities, and hope.", 
            iconList: [
                { id: 'money', src: receivedIconUrls.money, color: 'white' }, 
                { id: 'food', src: receivedIconUrls.food, color: 'white' },
                { id: 'globe', src: receivedIconUrls.globe, color: 'white' }
            ],
            charityURL: "hhtps:"
        };

        // Truncate title if too long
        const displayTitle = truncateTitle(initialInputs.title);

        // --- DOM Elements ---
        // Ensure you use .querySelector on the component passed in, not the document.
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
                // Use the structure of the new styled component:
                `
                <div class="styled-icon-box" title="${item.id}">
                    <div class="icon-content">
                        <img src="${item.src}" alt="${item.id}" />
                    </div>
                </div>
                `
            ).join('');
        }

        // --- State Management (rest of your logic remains the same) ---
        let currentState = 'default'; 
    
        function updateVariant(variant) {
            component.className = '';
            component.classList.add(`variant-${variant}`);
            currentState = variant;
            console.log(`Component state updated to: ${currentState}`); // Optional: Check state changes
        }
        
        // Set initial state class on the component
        updateVariant('default'); 

        // 5. Hover and Click Logic
        
        // Hover: Switch to hover variant, unless active
        component.addEventListener('mouseenter', () => {
            // Only change to hover if the component is currently in the 'default' state.
            if (currentState === 'default') {
                updateVariant('hover');
            }
            // If it's 'active', leave it 'active'.
        });

        // Mouse Leave: Switch back to default, unless active
        component.addEventListener('mouseleave', () => {
            // Only switch back to default if the component is currently in the 'hover' state.
            if (currentState === 'hover') {
                updateVariant('default');
            }
            // If it's 'active', leave it 'active'.
        });

        // Click: Toggle between active and default
        component.addEventListener('click', (event) => {
            if (event.target.id === 'comp-button') {
                return;
            }
            
            if (currentState === 'active') {
                updateVariant('default');
            } else {
                // When clicking to activate, the state will be 'default' or 'hover'.
                updateVariant('active');
            }
            event.stopPropagation(); 
        });
    }

})();