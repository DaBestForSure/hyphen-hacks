(function () {
    let receivedData = null;

    // Listen for the initial payload from content.js
    window.addEventListener("message", (event) => {
        if (event.data.type === "ECO_TEXTBOX_INIT" && !receivedData) {
            receivedData = event.data.payload;
            initWhenReady();
        }
    });

    // Keep retrying until all containers exist in the DOM
    function initWhenReady() {
        if (!receivedData) return;

        const { componentsData } = receivedData;
        const allReady = componentsData.every((d) =>
            document.getElementById(d.componentId)
        );

        if (!allReady) {
            setTimeout(initWhenReady, 50);
            return;
        }

        console.log("All components found, initializing.");
        componentsData.forEach((data) => {
            const container = document.getElementById(data.componentId);
            const comp = container?.querySelector("#custom-component");
            if (comp) {
                setupComponent(comp, data);
            }
        });
    }

    function setupComponent(root, data) {
        // ✅ CHANGE 1: Convert the iconUrls object into an array of its values
        const { iconUrls } = receivedData;
        const iconDataArray = Object.values(iconUrls); 

        const MAX_TITLE = 28;

        const specificIconData = iconUrls[data.componentId] || iconDataArray[0]; // Fallback to first

        const inputs = {
            title: data.title,
            sub1: data.subtext1 || "N/A",
            sub2: data.subtext2 || "N/A",
            activeText:
                "seeking to put god's love into action, habitat for humanity brings people together to build homes, communities, and hope.",
            // ✅ CHANGE 2: Build the icons array using the dynamically generated icon data
            // We use the specific icon and wrap it in an array for the single icon display.
            icons: specificIconData ? [
                { 
                    id: data.componentId, 
                    url: specificIconData.url, 
                    description: specificIconData.description 
                }
            ] : [], // Use an empty array if no data is found
            
            supportURL: data.supportURL || "https://example.com/support",
        };

        const shortTitle =
            inputs.title.length > MAX_TITLE
                ? inputs.title.slice(0, MAX_TITLE) + "..."
                : inputs.title;

        // Populate DOM
        root.querySelector("#comp-title").textContent = shortTitle;
        root.querySelector("#comp-subtext-1-default").textContent = inputs.sub1;
        root.querySelector("#comp-subtext-1-hover-active").textContent = inputs.sub1;
        root.querySelector("#comp-subtext-2").textContent = inputs.sub2;
        root.querySelector("#comp-large-subtext").textContent = inputs.activeText;

        // NEW: Set the support button URL
        const supportButton = root.querySelector("#comp-button");
        if (supportButton) {
            supportButton.href = inputs.supportURL;
        }

        const iconsEl = root.querySelector("#comp-icons");
        if (iconsEl) {
            iconsEl.innerHTML = inputs.icons
                .map(
                    (item) => `
                <div class="styled-icon-box" data-icon-id="${item.id}">
                    <div class="icon-content">
                        <img src="${item.url}" alt="${item.id}" />
                    </div>
                    <div class="icon-tooltip">${item.description}</div>
                </div>`
                )
                .join("");
        }

        // State & interactivity
        let state = "default";
        const setState = (s) => {
            root.className = `variant-${s}`;
            state = s;
        };
        setState("default");

        root.addEventListener("mouseenter", () => {
            if (state === "default") setState("hover");
        });

        root.addEventListener("mouseleave", () => {
            if (state === "hover") setState("default");
        });

        root.addEventListener("click", (e) => {
            // NEW: Don't prevent default for the support button link
            if (e.target.id === "comp-button") {
                // Let the link work normally
                return;
            }
            setState(state === "active" ? "default" : "active");
            e.stopPropagation();
        });
    }
})();