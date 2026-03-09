// filters.js
// Wires the Filter Data panel controls (bias, reliability, search dropdowns)
// to the main processData pipeline.
//
// Dependencies:
//   - main.js (must load first — provides processData, debounce)

(function () {
    "use strict";

    function initFilterListeners() {
        document.getElementById("bias-filter").addEventListener(
            "change", debounce(() => processData(), 300)
        );
        document.getElementById("reliability-filter").addEventListener(
            "change", debounce(() => processData(), 300)
        );
        document.getElementById("search").addEventListener(
            "input", debounce(() => processData(), 300)
        );

        // Clear buttons deselect all options and re-run filters
        const clearBias = document.getElementById("clear-bias-filter");
        if (clearBias) clearBias.addEventListener("click", () => {
            Array.from(document.getElementById("bias-filter").options)
                .forEach(o => o.selected = false);
            processData();
        });
        const clearRel = document.getElementById("clear-reliability-filter");
        if (clearRel) clearRel.addEventListener("click", () => {
            Array.from(document.getElementById("reliability-filter").options)
                .forEach(o => o.selected = false);
            processData();
        });
    }

    initFilterListeners();

})();
