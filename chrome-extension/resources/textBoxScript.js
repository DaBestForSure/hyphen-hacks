(function () {
  let receivedData = null;

  // Listen for the initial payload from content.js
  window.addEventListener("message", (event) => {
    if (event.data?.type === "ECO_TEXTBOX_INIT" && !receivedData) {
      receivedData = event.data.payload;
      initWhenReady();
    }
  });

  // Inject minimal styles for the assets pill (scoped enough to avoid conflicts)
  function injectStatStylesOnce() {
    if (document.getElementById("eco-stats-style")) return;
    const s = document.createElement("style");
    s.id = "eco-stats-style";
    s.textContent = `
      .stats-row { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
      .stats-row .pill { font-size:12px; line-height:1; padding:6px 8px; border:1px solid rgba(0,0,0,.08);
                         border-radius:999px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.06); }
      .stats-row .pill b { font-weight:700; margin-right:4px; }
      .stats-row .pill i { font-style:normal; color:#666; }
    `;
    document.head.appendChild(s);
  }

  // Keep retrying until all containers exist in the DOM
  function initWhenReady() {
    if (!receivedData) return;

    const { componentsData } = receivedData;
    const allReady = componentsData.every((d) => document.getElementById(d.componentId));

    if (!allReady) {
      setTimeout(initWhenReady, 50);
      return;
    }

    injectStatStylesOnce();

    console.log("All components found, initializing.");
    componentsData.forEach((data) => {
      const container = document.getElementById(data.componentId);
      const comp = container?.querySelector("#custom-component");
      if (comp) {
        setupComponent(comp, data, container);
      }
    });
  }

  function setupComponent(root, data, containerEl) {
    const { iconUrls } = receivedData;
    const MAX_TITLE = 35;

    // choose per-card icon (mapped by componentId); fallback to a simple default
    const iconData = iconUrls?.[data.componentId] || {
      url: "",
      description: "Nonprofit"
    };

    const inputs = {
      title: data.title,
      sub1: data.subtext1 || "N/A",
      sub2: data.subtext2 || "N/A",
      activeText: data.activeText || data.activetext || "Learn more and get involved locally.",
      icons: [iconData],
      supportURL: data.supportURL || "https://example.com/support",
      assetsDisplay: data.assetsDisplay || containerEl?.dataset?.assetsDisplay || "" // <- from payload or data-attr
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

    // Assets pill
    const statsEl = root.querySelector("#comp-stats");
    if (statsEl) {
      if (inputs.assetsDisplay) {
        statsEl.innerHTML = `<span class="pill"><b>${inputs.assetsDisplay}</b> <i>assets</i></span>`;
      } else {
        statsEl.innerHTML = "";
      }
    }

    // Support link
    const supportButton = root.querySelector("#comp-button");
    if (supportButton) supportButton.href = inputs.supportURL;

    // Icon
    const iconsEl = root.querySelector("#comp-icons");
    if (iconsEl) {
      iconsEl.innerHTML = inputs.icons
        .map(
          (item) => `
          <div class="styled-icon-box" data-icon-id="org-icon">
            <div class="icon-content">
              ${item.url ? `<img src="${item.url}" alt="icon" />` : ""}
            </div>
            <div class="icon-tooltip">${item.description || ""}</div>
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
      if (e.target.id === "comp-button" || (e.target.closest && e.target.closest("#comp-button"))) {
        return; // allow link
      }
      setState(state === "active" ? "default" : "active");
      e.stopPropagation();
    });
  }
})();
