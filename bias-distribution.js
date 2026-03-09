// bias-distribution.js
// Module for the Bias Distribution bar chart dashboard panel.
//
// Dependencies:
//   - constants.js  (must be loaded first -- provides BIAS_CATEGORIES)
//   - Chart.js      (must be available globally)
//
// Communication contract with the parent page:
//   - The parent dispatches a CustomEvent "bias-distribution:update" on document
//     with event.detail.filteredData set to the current filtered source array.
//   - This module listens for that event and re-renders the chart automatically.
//
// Example (from main script, inside processData):
//   document.dispatchEvent(new CustomEvent("bias-distribution:update", {
//       detail: { filteredData }
//   }));

(function () {
    "use strict";

    // Chart.js instance -- kept private to this module
    let biasChart = null;

    // -----------------------------------------------------------------------
    // Color helper -- maps a bias label to its bar color
    // -----------------------------------------------------------------------
    function getBiasColor(label) {
        if (label.includes("Most Extreme Left"))    return "rgba(0, 0, 180, 0.8)";
        if (label.includes("Hyper-Partisan Left"))  return "rgba(30, 60, 220, 0.8)";
        if (label.includes("Strong Left"))          return "rgba(65, 105, 225, 0.8)";
        if (label.includes("Skews Left"))           return "rgba(100, 149, 237, 0.8)";
        if (label.includes("Middle"))               return "rgba(180, 180, 180, 0.8)";
        if (label.includes("Skews Right"))          return "rgba(255, 99, 71, 0.8)";
        if (label.includes("Strong Right"))         return "rgba(220, 50, 50, 0.8)";
        if (label.includes("Hyper-Partisan Right")) return "rgba(200, 0, 0, 0.8)";
        if (label.includes("Most Extreme Right"))   return "rgba(180, 0, 0, 0.8)";
        return "rgba(180, 180, 180, 0.8)";
    }

    // -----------------------------------------------------------------------
    // Core render function
    // -----------------------------------------------------------------------
    function renderBiasDistribution(filteredData) {
        const canvas = document.getElementById("bias-chart");
        if (!canvas) return;

        // Count sources per category, preserving canonical order from constants.js
        const counts = {};
        BIAS_CATEGORIES.forEach((cat) => { counts[cat] = 0; });
        filteredData.forEach((source) => {
            if (Object.prototype.hasOwnProperty.call(counts, source.bias_label)) {
                counts[source.bias_label]++;
            } else {
                console.warn("bias-distribution: unexpected bias label: " + source.bias_label);
            }
        });

        const labels = BIAS_CATEGORIES;
        const data   = labels.map((label) => counts[label] || 0);
        const colors = labels.map(getBiasColor);
        const useAnimation = filteredData.length < 500;

        if (biasChart) {
            biasChart.destroy();
        }

        biasChart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Number of Sources",
                        data: data,
                        backgroundColor: colors,
                    },
                ],
            },
            options: {
                animation: useAnimation,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: "Number of Sources" },
                    },
                    x: {
                        title: { display: true, text: "Bias Category" },
                    },
                },
            },
        });
    }

    // -----------------------------------------------------------------------
    // Listen for data updates from the main script
    // -----------------------------------------------------------------------
    document.addEventListener("bias-distribution:update", (e) => {
        const filteredData = (e.detail && e.detail.filteredData) || [];
        renderBiasDistribution(filteredData);
    });

})();
