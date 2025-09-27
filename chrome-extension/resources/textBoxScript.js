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
            // SUCCESS! The element is found. Proceed with initialization.
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
        // --- Component Inputs ---
        const initialInputs = {
            title: "Project Alpha Launch",
            subtext1: "Due on October 25th", 
            subtext2: "Marketing Strategy - Q4", 
            subtextActive: "Phase I analysis complete. Awaiting final feedback from stakeholders. Next steps involve API integration.", 
            iconList: [
                { id: 'money', src: receivedIconUrls.attach, color: 'white' }, 
                { id: 'borg', src: receivedIconUrls.borg, color: 'white' },
                { id: 'globe', src: receivedIconUrls.globe, color: 'white' }
            ]
        };

        // --- DOM Elements ---
        // Ensure you use .querySelector on the component passed in, not the document.
        const titleEl = component.querySelector('#comp-title');
        const subtext1DefaultEl = component.querySelector('#comp-subtext-1-default');
        const subtext1HoverActiveEl = component.querySelector('#comp-subtext-1-hover-active');
        const subtext2El = component.querySelector('#comp-subtext-2');
        const largeSubtextEl = component.querySelector('#comp-large-subtext');
        const iconsEl = component.querySelector('#comp-icons');
        
        // 4. Initial Content Setup
        if (titleEl) titleEl.textContent = initialInputs.title;
        if (subtext1DefaultEl) subtext1DefaultEl.textContent = initialInputs.subtext1;
        if (subtext1HoverActiveEl) subtext1HoverActiveL.textContent = initialInputs.subtext1;
        if (subtext2El) subtext2El.textContent = initialInputs.subtext2;
        if (largeSubtextEl) largeSubtextEl.textContent = initialInputs.subtextActive;

        // Inject Icons
        if (iconsEl) {
            iconsEl.innerHTML = initialInputs.iconList.map(item => 
                `<img src="${item.src}" class="icon" title="${item.id}" style="filter: brightness(0) invert(1);" />`
            ).join('');
        }

        // --- State Management (rest of your logic remains the same) ---
        let currentState = 'default'; 
        
        function updateVariant(variant) {
            component.className = '';
            component.classList.add(`variant-${variant}`);
            currentState = variant;
        }

        // 5. Hover and Click Logic
        
        component.addEventListener('mouseenter', () => {
            if (currentState !== 'active') {
                updateVariant('hover');
            }
        });

        component.addEventListener('mouseleave', () => {
            if (currentState !== 'active') {
                updateVariant('default');
            }
        });

        component.addEventListener('click', (event) => {
            if (event.target.id === 'comp-button') {
                console.log("Button in Active variant clicked!");
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