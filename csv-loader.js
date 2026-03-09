// csv-loader.js
// Handles CSV file upload, parsing, and normalization.
// Writes parsed data into the shared mediaSourcesData global, then
// calls processData() to push the new data through the pipeline.
//
// Dependencies:
//   - main.js  (provides mediaSourcesData, processData, showError)
//   - data-table.js (provides window.dataTable.resetSort)
//   - PapaParse (must be available globally)
//
// The upload UI is currently commented out in index.html but this module
// guards against a missing button, so it is safe to load regardless.

(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // Normalize a raw PapaParse row into a consistent source object
    // -----------------------------------------------------------------------
    function normalizeRow(row, index) {
        if (!row) {
            console.warn(`csv-loader: skipping invalid row at index ${index}`);
            return null;
        }
        // Trim all column-name whitespace
        const r = {};
        Object.keys(row).forEach((key) => { if (key) r[key.trim()] = row[key]; });

        return {
            id: r.id || r["#"] || r["ID"] || index + 1,
            moniker_name:
                r.moniker_name || r["Moniker Name"] || r["name"] || r["Name"] || "Unknown",
            domain:
                r.domain || r["Domain"] || r["website"] || r["Website"] || r["url"] || r["URL"] || "Unknown",
            reliability_mean:
                parseFloat(r.reliability_mean || r["Reliability Mean"] || r["reliability"] || r["Reliability"] || "0") || 0,
            reliability_label:
                r.reliability_label || r["Reliability Label"] || r["reliability type"] || r["Reliability Type"] || "Unknown",
            bias_mean:
                parseFloat(r.bias_mean || r["Bias Mean"] || r["bias"] || r["Bias"] || "0") || 0,
            bias_label:
                r.bias_label || r["Bias Label"] || r["bias type"] || r["Bias Type"] || "Unknown",
        };
    }

    // -----------------------------------------------------------------------
    // Show / hide loading overlay
    // -----------------------------------------------------------------------
    function showLoading() {
        const el = document.createElement("div");
        el.id = "loading-indicator";
        Object.assign(el.style, {
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255,255,255,0.9)", padding: "20px",
            borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            zIndex: "1000",
        });
        el.innerHTML = '<p style="margin:0;font-weight:bold;">Loading data, please wait...</p>';
        document.body.appendChild(el);
    }

    function hideLoading() {
        const el = document.getElementById("loading-indicator");
        if (el) document.body.removeChild(el);
    }

    // -----------------------------------------------------------------------
    // Parse and load the selected file
    // -----------------------------------------------------------------------
    function loadFile(file) {
        showLoading();
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            delimitersToGuess: [",", "\t", "|", ";"],
            error: function (error) {
                hideLoading();
                console.error("csv-loader: parse error:", error);
                showError("Error parsing the CSV file: " + error.message);
            },
            complete: function (results) {
                hideLoading();
                try {
                    console.log("csv-loader: parse results:", results);
                    if (!results.data || !Array.isArray(results.data)) {
                        showError("The CSV data structure is invalid. Check console for details.");
                        return;
                    }
                    if (results.meta && results.meta.fields) {
                        console.log("csv-loader: headers:", results.meta.fields);
                    }
                    mediaSourcesData = results.data
                        .map(normalizeRow)
                        .filter((item) => item !== null);
                    console.log(`csv-loader: loaded ${mediaSourcesData.length} records`);
                    window.dataTable.resetSort();
                    processData();
                } catch (err) {
                    console.error("csv-loader: processing error:", err);
                    showError("Error processing the data: " + err.message);
                }
            },
        });
    }

    // -----------------------------------------------------------------------
    // Wire up the upload button (guarded — UI may be commented out in HTML)
    // -----------------------------------------------------------------------
    const uploadBtn = document.getElementById("upload-btn");
    if (uploadBtn) {
        uploadBtn.addEventListener("click", () => {
            const fileInput = document.getElementById("csv-file");
            const file = fileInput && fileInput.files[0];
            if (file) {
                loadFile(file);
            } else {
                showError("Please select a file first");
            }
        });
    }

})();
