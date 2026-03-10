// heatmap.js
// Module for the "Bias vs. Reliability Heatmap" dashboard panel.
//
// Dependencies:
//   - constants.js (must be loaded first — provides BIAS_CATEGORIES, RELIABILITY_CATEGORIES)
//
// Communication contract with the parent page:
//   - The parent dispatches a CustomEvent named "heatmap:update" on `document`
//     with `event.detail.filteredData` set to the current filtered source array.
//   - This module listens for that event and re-renders the heatmap automatically.
//
// Example (from main script, inside processData or after applyFilters):
//   document.dispatchEvent(new CustomEvent("heatmap:update", {
//       detail: { filteredData }
//   }));

(function () {
    "use strict";

    // ---------------------------------------------------------------------------
    // Color helpers
    // Note: BIAS_CATEGORIES and RELIABILITY_CATEGORIES come from constants.js.
    // ---------------------------------------------------------------------------

    // Cell background: green → red based on reliability row, opacity based on count
    function getHeatmapColor(relIdx, maxRelIdx, count, maxCount) {
        const relFrac = relIdx / maxRelIdx;
        const r = Math.round(100 + 155 * relFrac);
        const g = Math.round(220 - 140 * relFrac);
        const b = Math.round(100 * (1 - relFrac));
        const alpha =
            count === 0 ? 0.08 : 0.25 + 0.75 * (count / Math.max(1, maxCount));
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // styles.css is the single source of truth for label colors.
    // Row labels read --reliability-N-of-7; column labels read --bias-N-of-9.
    const ROOT_STYLE = getComputedStyle(document.documentElement);

    function getCSSVar(name) {
        return ROOT_STYLE.getPropertyValue(name).trim();
    }

    // Row label background (vertical axis = RELIABILITY_CATEGORIES):
    // reads --reliability-1-of-7 … --reliability-7-of-7 from :root
    function getReliabilityLabelColor(index) {
        return getCSSVar(`--reliability-${index + 1}-of-7`) || "#cccccc";
    }

    // Column header background (horizontal axis = BIAS_CATEGORIES):
    // reads --bias-1-of-9 … --bias-9-of-9 from :root
    function getBiasLabelColor(index) {
        return getCSSVar(`--bias-${index + 1}-of-9`) || "rgba(180,180,180,0.8)";
    }

    // Returns "#000" or "#fff" for legible text on a given background color.
    // Accepts hex (#rrggbb / #rgb) or rgba(...) strings.
    // Uses the WCAG relative luminance formula.
    function getContrastColor(bgColor) {
        let r, g, b;
        const hex = bgColor.match(/^#([0-9a-f]{3,6})$/i);
        if (hex) {
            const v = hex[1];
            if (v.length === 3) {
                r = parseInt(v[0] + v[0], 16);
                g = parseInt(v[1] + v[1], 16);
                b = parseInt(v[2] + v[2], 16);
            } else {
                r = parseInt(v.slice(0, 2), 16);
                g = parseInt(v.slice(2, 4), 16);
                b = parseInt(v.slice(4, 6), 16);
            }
        } else {
            const rgba = bgColor.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
            if (!rgba) return "#000";
            r = parseFloat(rgba[1]);
            g = parseFloat(rgba[2]);
            b = parseFloat(rgba[3]);
        }
        const toLinear = (c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
        return L < 0.35 ? "#fff" : "#000";
    }

    // ---------------------------------------------------------------------------
    // Core render function
    // ---------------------------------------------------------------------------
    function renderHeatmap(filteredData) {
        const table = document.getElementById("heatmap-table");
        if (!table) return;

        // Build matrix of source arrays
        const matrix = RELIABILITY_CATEGORIES.map(() =>
            BIAS_CATEGORIES.map(() => []),
        );

        filteredData.forEach((source) => {
            const biasIdx = BIAS_CATEGORIES.findIndex(
                (cat) =>
                    (source.bias_label || "").trim().toLowerCase() ===
                    cat.toLowerCase(),
            );
            const relIdx = RELIABILITY_CATEGORIES.findIndex(
                (cat) =>
                    (source.reliability_label || "").trim().toLowerCase() ===
                    cat.toLowerCase(),
            );
            if (biasIdx !== -1 && relIdx !== -1) {
                matrix[relIdx][biasIdx].push(source);
            }
        });

        // Find max count for opacity scaling
        let maxCount = 0;
        matrix.forEach((row) =>
            row.forEach((cell) => {
                if (cell.length > maxCount) maxCount = cell.length;
            }),
        );

        // Pre-compute row totals and column totals
        const rowTotals  = matrix.map(row => row.reduce((s, cell) => s + cell.length, 0));
        const colTotals  = BIAS_CATEGORIES.map((_, bi) =>
            matrix.reduce((s, row) => s + row[bi].length, 0));
        const grandTotal = rowTotals.reduce((s, n) => s + n, 0);

        // Header row — bias column labels + "Total" header
        let html = '<tr><th class="heatmap-label"></th>';
        BIAS_CATEGORIES.forEach((bias, biasIdx) => {
            const bg = getBiasLabelColor(biasIdx);
            const fg = getContrastColor(bg);
            html += `<th class="heatmap-label" style="background:${bg}; color:${fg}">${bias}</th>`;
        });
        html += `<th class="heatmap-label" style="background:#444;color:#fff;">Total</th></tr>`;

        // Data rows — reliability row labels + row total on right
        RELIABILITY_CATEGORIES.forEach((rel, relIdx) => {
            const bg = getReliabilityLabelColor(relIdx);
            const fg = getContrastColor(bg);
            html += `<tr><th class="heatmap-label" style="background:${bg}; color:${fg}">${rel}</th>`;
            BIAS_CATEGORIES.forEach((_bias, biasIdx) => {
                const sources = matrix[relIdx][biasIdx];
                const cellBg = getHeatmapColor(
                    relIdx,
                    RELIABILITY_CATEGORIES.length - 1,
                    sources.length,
                    maxCount,
                );
                const tooltip = sources.length
                    ? `${sources.length} source(s):\n${sources.map((s) => s.moniker_name).join("\n")}`
                    : "0 sources";
                html += `<td class="heatmap-cell" style="background:${cellBg}" title="${tooltip}">${sources.length}</td>`;
            });
            html += `<td class="heatmap-cell" style="background:${bg};color:${fg};font-weight:bold;">${rowTotals[relIdx]}</td></tr>`;
        });

        // Totals row — column sums + grand total
        html += `<tr><th class="heatmap-label" style="background:#444;color:#fff;">Total</th>`;
        BIAS_CATEGORIES.forEach((_, biasIdx) => {
            const bg = getBiasLabelColor(biasIdx);
            const fg = getContrastColor(bg);
            html += `<td class="heatmap-cell" style="background:${bg};color:${fg};font-weight:bold;">${colTotals[biasIdx]}</td>`;
        });
        html += `<td class="heatmap-cell" style="background:#222;color:#fff;font-weight:bold;">${grandTotal}</td></tr>`;

        table.innerHTML = html;

        // -------------------------------------------------------------------
        // Summary table — Left / Middle / Right totals per reliability row
        // -------------------------------------------------------------------
        renderSummary(matrix);
    }

    // Which BIAS_CATEGORIES indices fall into Left / Right
    const LEFT_INDICES  = BIAS_CATEGORIES.reduce((acc, cat, i) => { if (cat.includes("Left"))  acc.push(i); return acc; }, []);
    const RIGHT_INDICES = BIAS_CATEGORIES.reduce((acc, cat, i) => { if (cat.includes("Right")) acc.push(i); return acc; }, []);

    // Upper 3 reliability rows = indices 0,1,2 (most reliable first)
    // Lower 4 reliability rows = indices 3,4,5,6
    const UPPER_REL = [0, 1, 2];
    const LOWER_REL = [3, 4, 5, 6];

    function renderSidePanel(containerId, indices, matrix, headerBg, headerFg, headerLabel) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const pct = (n, t) => t === 0 ? "—" : `${Math.round(n / t * 100)}%`;

        // Total sources in this group across all reliability rows
        const totalAll = matrix.reduce((sum, row) =>
            sum + indices.reduce((s, bi) => s + row[bi].length, 0), 0);

        // Upper 3 rows
        const upperCount = UPPER_REL.reduce((sum, ri) =>
            sum + indices.reduce((s, bi) => s + matrix[ri][bi].length, 0), 0);

        // Lower 4 rows
        const lowerCount = LOWER_REL.reduce((sum, ri) =>
            sum + indices.reduce((s, bi) => s + matrix[ri][bi].length, 0), 0);

        const cs = "padding:5px 10px; border:1px solid #ccc; text-align:center; font-size:0.85em; white-space:nowrap;";
        const hdrStyle = `background:${headerBg}; color:${headerFg}; ${cs} font-weight:bold;`;

        // Colors for upper (reliable) and lower (unreliable) rows
        const upperBg = getReliabilityLabelColor(0); // most reliable color
        const upperFg = getContrastColor(upperBg);
        const lowerBg = getReliabilityLabelColor(6); // least reliable color
        const lowerFg = getContrastColor(lowerBg);

        el.innerHTML = `
            <table style="border-collapse:collapse; font-size:0.85em;">
                <tr><th colspan="2" style="${hdrStyle}">${headerLabel}</th></tr>
                <tr><th colspan="2" style="${hdrStyle} font-size:0.8em;">Total: ${totalAll}</th></tr>
                <tr>
                    <td style="background:${upperBg};color:${upperFg};${cs} font-weight:bold;">Upper 3<br/><span style="font-size:0.85em;opacity:0.8;">Reliable</span></td>
                    <td style="background:${upperBg};color:${upperFg};${cs}">${upperCount}<br/>${pct(upperCount, totalAll)}</td>
                </tr>
                <tr>
                    <td style="background:${lowerBg};color:${lowerFg};${cs} font-weight:bold;">Lower 4<br/><span style="font-size:0.85em;opacity:0.8;">Less Reliable</span></td>
                    <td style="background:${lowerBg};color:${lowerFg};${cs}">${lowerCount}<br/>${pct(lowerCount, totalAll)}</td>
                </tr>
            </table>`;
    }

    function renderSummary(matrix) {
        renderSidePanel(
            "heatmap-left-panel", LEFT_INDICES, matrix,
            "rgba(65,105,225,0.85)", "#fff", "Left"
        );
        renderSidePanel(
            "heatmap-right-panel", RIGHT_INDICES, matrix,
            "rgba(200,0,0,0.85)", "#fff", "Right"
        );
    }

    // ---------------------------------------------------------------------------
    // Toggle visibility
    // ---------------------------------------------------------------------------
    function initToggle() {
        const toggle = document.getElementById("toggle-heatmap");
        const container = document.getElementById("heatmap-container");
        if (toggle && container) {
            toggle.addEventListener("change", (e) => {
                container.style.display = e.target.checked ? "block" : "none";
            });
        }
    }

    // ---------------------------------------------------------------------------
    // Listen for data updates from the main script
    // ---------------------------------------------------------------------------
    document.addEventListener("heatmap:update", (e) => {
        const filteredData = (e.detail && e.detail.filteredData) || [];
        renderHeatmap(filteredData);
    });

    // ---------------------------------------------------------------------------
    // Init on DOM ready
    // ---------------------------------------------------------------------------
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initToggle);
    } else {
        initToggle();
    }
})();
