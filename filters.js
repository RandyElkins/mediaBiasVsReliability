// filters.js
// Builds checkbox filter lists from constants and wires them to processData.

(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // Build a checkbox list inside a container div.
    // Each item gets a colored swatch from CSS vars, a checkbox, and a label.
    // -----------------------------------------------------------------------
    // Parse any CSS color string to {r,g,b}
    function parseRGB(c) {
        const hex = c.match(/^#([0-9a-f]{3,6})$/i);
        if (hex) {
            const v = hex[1].length === 3 ? hex[1].split("").map(x => x+x).join("") : hex[1];
            return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
        }
        const m = c.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
        return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : [180,180,180];
    }
    function contrastFor(c) {
        const [r,g,b] = parseRGB(c);
        const L = c => { const s=c/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4); };
        return (0.2126*L(r)+0.7152*L(g)+0.0722*L(b)) < 0.35 ? "#fff" : "#000";
    }

    function buildCheckboxList(containerId, items, cssVarPrefix, totalItems, onChange) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        items.forEach((label, i) => {
            const bg = getComputedStyle(document.documentElement)
                .getPropertyValue(`${cssVarPrefix}${i + 1}-of-${totalItems}`).trim()
                || "#cccccc";
            const fgActive = contrastFor(bg);
            const [r,g,b]  = parseRGB(bg);
            const bgFaint  = `rgba(${r},${g},${b},0.18)`;
            let selected   = false;

            const pill = document.createElement("div");
            pill.title = label;
            pill.style.cssText = [
                "display:flex", "align-items:center", "justify-content:center",
                "cursor:pointer", "padding:4px 6px", "border-radius:4px",
                `background:${bgFaint}`,
                "user-select:none", "transition:background 0.12s, color 0.12s",
                "width:100%", "box-sizing:border-box",
                "text-align:center", "line-height:1.25",
                "font-size:0.78em",
            ].join(";");
            pill.textContent = label;
            pill.dataset.value    = label;
            pill.dataset.faint    = bgFaint;
            pill.dataset.selected = "false";

            function applyState() {
                if (selected) {
                    pill.style.background      = bg;
                    pill.style.color           = fgActive;
                    pill.style.fontWeight      = "600";
                    pill.dataset.selected      = "true";
                } else {
                    pill.style.background      = bgFaint;
                    pill.style.color           = "";
                    pill.style.fontWeight      = "";
                    pill.dataset.selected      = "false";
                }
            }

            pill.addEventListener("click", () => {
                selected = !selected;
                applyState();
                onChange();
            });

            container.appendChild(pill);
        });
    }

    // -----------------------------------------------------------------------
    // Read checked values from a checkbox list container.
    // Returns [] (show all) if nothing is checked.
    // -----------------------------------------------------------------------
    function getCheckedValues(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        // Pills store selection as font-weight:600 — read via dataset.value on active pills.
        // We track selection via a JS closure (selected flag), so expose via data-selected attr.
        return Array.from(container.querySelectorAll("div[data-selected='true']"))
            .map(pill => pill.dataset.value);
    }

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    function initFilterListeners() {
        const onChange = debounce(() => processData(), 150);

        // Build bias checkbox list from BIAS_CATEGORIES constant
        buildCheckboxList(
            "bias-checkbox-list",
            BIAS_CATEGORIES,
            "--bias-",
            BIAS_CATEGORIES.length,
            onChange
        );

        // Build reliability checkbox list from RELIABILITY_CATEGORIES constant
        buildCheckboxList(
            "reliability-checkbox-list",
            RELIABILITY_CATEGORIES,
            "--reliability-",
            RELIABILITY_CATEGORIES.length,
            onChange
        );

        // Clear buttons
        function clearPills(listId) {
            document.querySelectorAll(`#${listId} div[data-value]`).forEach(pill => {
                pill.dataset.selected = "false";
                pill.style.fontWeight = "";
                pill.style.color      = "";
                // Restore faint background from the pill's current active bg via opacity trick
                // We stored bgFaint in the closure so just re-apply via a click-reset pattern:
                // Dispatch a synthetic reset by reading the faint color from data attribute
                const faint = pill.dataset.faint;
                if (faint) pill.style.background = faint;
            });
        }

        const clearBias = document.getElementById("clear-bias-filter");
        if (clearBias) clearBias.addEventListener("click", () => {
            clearPills("bias-checkbox-list");
            processData();
        });

        const clearRel = document.getElementById("clear-reliability-filter");
        if (clearRel) clearRel.addEventListener("click", () => {
            clearPills("reliability-checkbox-list");
            processData();
        });

        // Search
        document.getElementById("search").addEventListener(
            "input", debounce(() => processData(), 300)
        );
    }

    // Expose getCheckedValues so main.js can read the selections
    window.getFilterSelections = function() {
        return {
            bias:        getCheckedValues("bias-checkbox-list"),
            reliability: getCheckedValues("reliability-checkbox-list"),
        };
    };

    initFilterListeners();

})();
