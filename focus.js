// focus.js
// Module for the "Focus Sources" panel.
// Manages a list of highlighted source names and dispatches "focus:changed"
// whenever the list changes, so other modules (e.g. scatterplot.js) can
// re-render without this module needing to know they exist.
//
// Exposes window.focusedSources (read-only reference) so other modules can
// check membership without importing anything.
//
// Dependencies:
//   - main.js (provides mediaSourcesData, processData)
//
// Listens for:
//   - "search:refresh" — repopulates the datalist when data changes
//
// Dispatches:
//   - "focus:changed" on document, detail: { focusedSources }

(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let focusedSources = [];

    // Expose as read-only reference for other modules
    Object.defineProperty(window, "focusedSources", {
        get: () => focusedSources,
    });

    // -----------------------------------------------------------------------
    // Dispatch helper
    // -----------------------------------------------------------------------
    function notifyChanged() {
        document.dispatchEvent(
            new CustomEvent("focus:changed", { detail: { focusedSources } })
        );
    }

    // -----------------------------------------------------------------------
    // Management
    // -----------------------------------------------------------------------
    function addFocusedSource(sourceName) {
        if (!focusedSources.includes(sourceName)) {
            focusedSources.push(sourceName);
            updateDisplay();
            notifyChanged();
        }
    }

    function removeFocusedSource(sourceName) {
        const index = focusedSources.indexOf(sourceName);
        if (index > -1) {
            focusedSources.splice(index, 1);
            updateDisplay();
            notifyChanged();
        }
    }

    function clearAllFocusedSources() {
        focusedSources = [];
        updateDisplay();
        notifyChanged();
    }

    // Needed for the inline onclick in tags (no way around this without
    // switching to event delegation, which would require extra plumbing)
    window.removeFocusedSource = removeFocusedSource;

    // -----------------------------------------------------------------------
    // Display
    // -----------------------------------------------------------------------
    function updateDisplay() {
        const container = document.getElementById("focus-tags");
        if (!container) return;
        container.innerHTML = "";

        if (focusedSources.length === 0) {
            container.innerHTML =
                '<div style="color:#7f8c8d; font-style:italic;">No sources highlighted</div>';
            return;
        }

        focusedSources.forEach((name) => {
            const tag = document.createElement("div");
            tag.className = "focus-tag";
            tag.innerHTML = `
                <span>${name}</span>
                <button class="focus-tag-remove"
                        onclick="removeFocusedSource('${name.replace(/'/g, "\\'")}')">×</button>
            `;
            container.appendChild(tag);
        });
    }

    // -----------------------------------------------------------------------
    // Datalist population
    // -----------------------------------------------------------------------
    function populateSuggestions() {
        const datalist = document.getElementById("focus-suggestions");
        if (!datalist) return;
        datalist.innerHTML = "";
        [...new Set(mediaSourcesData.map((s) => s.moniker_name))]
            .sort()
            .forEach((name) => {
                const opt = document.createElement("option");
                opt.value = name;
                datalist.appendChild(opt);
            });
    }

    // -----------------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------------
    function initControls() {
        const addBtn      = document.getElementById("add-focus");
        const searchInput = document.getElementById("focus-search");
        const clearBtn    = document.getElementById("clear-focus");

        function tryAdd(value) {
            const name = value.trim();
            if (name && mediaSourcesData.some((s) => s.moniker_name === name)) {
                addFocusedSource(name);
                searchInput.value = "";
            }
        }

        if (addBtn)      addBtn.addEventListener("click", () => tryAdd(searchInput.value));
        if (searchInput) searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") tryAdd(e.target.value);
        });
        if (clearBtn)    clearBtn.addEventListener("click", clearAllFocusedSources);
    }

    // Re-populate datalist whenever mediaSourcesData changes
    document.addEventListener("search:refresh", () => populateSuggestions());

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    initControls();
    populateSuggestions();
    updateDisplay();

})();
