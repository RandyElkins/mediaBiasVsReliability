// search.js
// Module for the enhanced search dropdown in the Filter Data panel.
//
// Dependencies:
//   - main.js (must load first — provides processData, mediaSourcesData)
//
// Listens for "search:refresh" dispatched by processData to repopulate
// the dropdown whenever the underlying data changes.

(function () {
    "use strict";

    const searchInput     = document.getElementById("search");
    const dropdownToggle  = document.getElementById("show-all-sources");
    const sourcesDropdown = document.getElementById("sources-dropdown");
    const dropdownFilter  = document.getElementById("dropdown-filter");
    const dropdownContent = document.querySelector(".dropdown-content");
    const sourcesList     = document.getElementById("source-suggestions");

    // -----------------------------------------------------------------------
    // Populate dropdown and datalist from current mediaSourcesData
    // -----------------------------------------------------------------------
    function populate() {
        dropdownContent.innerHTML = "";
        sourcesList.innerHTML     = "";

        const uniqueSources = [
            ...new Set(mediaSourcesData.map((s) => s.moniker_name)),
        ].sort();

        uniqueSources.forEach((name) => {
            const item = document.createElement("div");
            item.className   = "dropdown-item";
            item.textContent = name;
            item.addEventListener("click", () => {
                searchInput.value = name;
                sourcesDropdown.classList.remove("show");
                processData();
            });
            dropdownContent.appendChild(item);

            const option = document.createElement("option");
            option.value = name;
            sourcesList.appendChild(option);
        });
    }

    // -----------------------------------------------------------------------
    // Toggle dropdown open/close
    // -----------------------------------------------------------------------
    dropdownToggle.addEventListener("click", (e) => {
        e.preventDefault();
        sourcesDropdown.classList.toggle("show");
    });

    // -----------------------------------------------------------------------
    // Filter visible items when typing inside the dropdown
    // -----------------------------------------------------------------------
    dropdownFilter.addEventListener("input", () => {
        const filterValue = dropdownFilter.value.toLowerCase();
        dropdownContent.querySelectorAll(".dropdown-item").forEach((item) => {
            item.style.display = item.textContent.toLowerCase().includes(filterValue)
                ? "block"
                : "none";
        });
    });

    // -----------------------------------------------------------------------
    // Close dropdown when clicking outside the search container
    // -----------------------------------------------------------------------
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-container")) {
            sourcesDropdown.classList.remove("show");
        }
    });

    // -----------------------------------------------------------------------
    // Re-populate when processData runs (mediaSourcesData may have changed)
    // -----------------------------------------------------------------------
    document.addEventListener("search:refresh", () => populate());

    // -----------------------------------------------------------------------
    // Initial population
    // -----------------------------------------------------------------------
    populate();

})();
