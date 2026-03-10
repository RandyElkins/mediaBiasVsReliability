// main.js
// Central coordinator for the Media Sources Analysis Dashboard.
//
// Owns the two shared data globals and the processData pipeline.
// All dashboard modules receive data via CustomEvents dispatched here.
//
// Load order: constants.js → data.js → main.js → all other modules

// ---------------------------------------------------------------------------
// Shared globals (read by filters.js, search.js, csv-loader.js)
// ---------------------------------------------------------------------------
let mediaSourcesData = [];
let filteredData     = [];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function debounce(func, wait) {
    let timeout;
    return function () {
        const context = this;
        const args    = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function showError(message) {
    const errorDiv = document.getElementById("error-messages");
    if (!errorDiv) return;
    errorDiv.textContent  = message;
    errorDiv.style.display = "block";
    setTimeout(() => { errorDiv.style.display = "none"; }, 5000);
}

function getSelectedValues(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return [];
    return Array.from(el.selectedOptions).map(o => o.value);
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------
function applyFilters() {
    const selections = (typeof window.getFilterSelections === "function")
        ? window.getFilterSelections()
        : { bias: [], reliability: [] };

    const biasSelected        = selections.bias;        // [] = show all
    const reliabilitySelected = selections.reliability; // [] = show all
    const searchTerm          = document.getElementById("search").value.toLowerCase();

    filteredData = mediaSourcesData.filter((source) => {
        const matchesBias =
            biasSelected.length === 0 ||
            biasSelected.some(v => source.bias_label && source.bias_label.includes(v));
        const matchesReliability =
            reliabilitySelected.length === 0 ||
            reliabilitySelected.some(v => source.reliability_label && source.reliability_label.includes(v));
        const matchesSearch =
            searchTerm === "" ||
            (typeof source.moniker_name === "string" && source.moniker_name.toLowerCase().includes(searchTerm)) ||
            (typeof source.domain       === "string" && source.domain.toLowerCase().includes(searchTerm));
        return matchesBias && matchesReliability && matchesSearch;
    });
}

function updateSummaryStats() {
    document.getElementById("total-sources").textContent = filteredData.length;
    if (filteredData.length > 0) {
        const avgReliability = filteredData.reduce((sum, s) => sum + s.reliability_mean, 0) / filteredData.length;
        const avgBias        = filteredData.reduce((sum, s) => sum + s.bias_mean,        0) / filteredData.length;
        document.getElementById("avg-reliability").textContent = avgReliability.toFixed(2);
        document.getElementById("avg-bias").textContent        = avgBias.toFixed(2);
    } else {
        document.getElementById("avg-reliability").textContent = "N/A";
        document.getElementById("avg-bias").textContent        = "N/A";
    }
}

function processData() {
    try {
        applyFilters();
        updateSummaryStats();
        document.dispatchEvent(new CustomEvent("heatmap:update",           { detail: { filteredData } }));
        document.dispatchEvent(new CustomEvent("bias-distribution:update", { detail: { filteredData } }));
        document.dispatchEvent(new CustomEvent("data-table:update",        { detail: { filteredData } }));
        document.dispatchEvent(new CustomEvent("scatterplot:update",       { detail: { filteredData } }));
        document.dispatchEvent(new CustomEvent("search:refresh",           { detail: { mediaSourcesData } }));
    } catch (error) {
        console.error("Error in processData:", error);
        showError("Error processing data: " + error.message);
    }
}

// ---------------------------------------------------------------------------
// Bootstrap — called by index.html after all modules have loaded
// ---------------------------------------------------------------------------
function init() {
    mediaSourcesData = sampleData;
    processData();
}
