document.addEventListener('DOMContentLoaded', () => {
    const component = document.getElementById('custom-component');

    // --- Component Inputs ---
    const initialInputs = {
        title: "habitat for humanity",
        subtext1: "10 miles away", // Used in Variant 1 and as icon subtext in Variant 2
        subtext2: "mission", // Used in Variant 2 (title subtext)
        subtextActive: "mission: seeking to put god's love into action, habitat for humanity brings people together to build homes, communities, and hope.", // Used in Variant 3 (large subtext)
        iconList: [
            { id: 'icon1', color: 'red' },
            { id: 'icon2', color: 'yellow' },
            { id: 'icon3', color: 'green' }
        ]
    };

    // --- DOM Elements ---
    const titleEl = document.getElementById('comp-title');
    const subtext1DefaultEl = document.getElementById('comp-subtext-1-default');
    const subtext1HoverActiveEl = document.getElementById('comp-subtext-1-hover-active');
    const subtext2El = document.getElementById('comp-subtext-2');
    const largeSubtextEl = document.getElementById('comp-large-subtext');
    const iconsEl = document.getElementById('comp-icons');
    
    // 4. Initial Content Setup
    titleEl.textContent = initialInputs.title;
    subtext1DefaultEl.textContent = initialInputs.subtext1;
    subtext1HoverActiveEl.textContent = initialInputs.subtext1;
    subtext2El.textContent = initialInputs.subtext2;
    largeSubtextEl.textContent = initialInputs.subtextActive;

    // Inject Icons
    iconsEl.innerHTML = initialInputs.iconList.map(item => 
        `<div class="icon" style="background-color: ${item.color};" title="${item.id}"></div>`
    ).join('');


    // --- State Management ---
    let currentState = 'default'; // 'default', 'hover', 'active'
    
    // Function to update the component's class/variant
    function updateVariant(variant) {
        component.className = '';
        component.classList.add(`variant-${variant}`);
        currentState = variant;
    }

    // 5. Hover and Click Logic
    
    // Hover: Switch to hover variant, unless active
    component.addEventListener('mouseenter', () => {
        if (currentState !== 'active') {
            updateVariant('hover');
        }
    });

    // Mouse Leave: Switch back to default, unless active
    component.addEventListener('mouseleave', () => {
        if (currentState !== 'active') {
            updateVariant('default');
        }
    });

    // Click: Toggle between active and default
    component.addEventListener('click', () => {
        if (currentState === 'active') {
            // Click again to send it back to the original variant
            updateVariant('default');
        } else {
            // Click to become the active variant
            updateVariant('active');
        }
        // Prevent the mouseenter/mouseleave logic from immediately overriding the click state
        event.stopPropagation(); 
    });
});