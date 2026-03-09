// data-table.js
// Module for the "Media Sources Table" panel, including sorting and pagination.
//
// Exposes a small public API on window.dataTable:
//   window.dataTable.update(filteredData)  — re-renders with new data
//   window.dataTable.resetSort()           — resets to default sort (used by CSV upload)
//
// Communication contract with the parent page:
//   - The parent dispatches a CustomEvent "data-table:update" on document
//     with event.detail.filteredData set to the current filtered source array.
//   - The parent may also call window.dataTable.resetSort() before dispatching
//     when a new CSV is loaded.

(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // Private state
    // -----------------------------------------------------------------------
    let currentData      = [];
    let currentPage      = 1;
    const rowsPerPage    = 100;
    let currentSortCol   = "id";
    let currentSortDir   = "asc";

    // -----------------------------------------------------------------------
    // Sorting
    // -----------------------------------------------------------------------
    function sortData(column) {
        if (column === currentSortCol) {
            currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
        } else {
            currentSortCol = column;
            currentSortDir = "asc";
        }
        updateSortIndicators();
        currentData.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];
            if (typeof valA === "string" && typeof valB === "string") {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            if (column === "reliability_mean" || column === "bias_mean" || column === "id") {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }
            if (currentSortDir === "asc") {
                return valA < valB ? -1 : valA > valB ? 1 : 0;
            } else {
                return valA > valB ? -1 : valA < valB ? 1 : 0;
            }
        });
        currentPage = 1;
        renderTable();
        renderPagination();
    }

    function updateSortIndicators() {
        document.querySelectorAll(".data-table th").forEach((header) => {
            header.classList.remove("sort-asc", "sort-desc");
            if (header.getAttribute("data-sort") === currentSortCol) {
                header.classList.add(currentSortDir === "asc" ? "sort-asc" : "sort-desc");
            }
        });
    }

    // -----------------------------------------------------------------------
    // Color helpers (mirror logic from other modules; CSS vars are source of truth)
    // -----------------------------------------------------------------------
    const ROOT_STYLE = getComputedStyle(document.documentElement);
    function getCSSVar(n) { return ROOT_STYLE.getPropertyValue(n).trim(); }

    function getContrastColor(bg) {
        let r, g, b;
        const hex = bg.match(/^#([0-9a-f]{3,6})$/i);
        if (hex) {
            const v = hex[1].length===3 ? hex[1].split("").map(c=>c+c).join("") : hex[1];
            r=parseInt(v.slice(0,2),16); g=parseInt(v.slice(2,4),16); b=parseInt(v.slice(4,6),16);
        } else {
            const m = bg.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
            if (!m) return "#000";
            r=parseFloat(m[1]); g=parseFloat(m[2]); b=parseFloat(m[3]);
        }
        const lin = c => { const s=c/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4); };
        return (0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)) < 0.35 ? "#fff" : "#000";
    }

    // Map reliability score → CSS var index (1-based, matching RELIABILITY_CATEGORIES order:
    // index 1 = most reliable = scores ≥48, index 7 = least reliable = scores <8)
    function getReliabilityCellStyle(score) {
        let idx;
        if      (score >= 48) idx = 1;
        else if (score >= 40) idx = 2;
        else if (score >= 32) idx = 3;
        else if (score >= 24) idx = 4;
        else if (score >= 16) idx = 5;
        else if (score >= 8)  idx = 6;
        else                  idx = 7;
        const bg = getCSSVar(`--reliability-${idx}-of-7`) || "#cccccc";
        const fg = getContrastColor(bg);
        return `background:${bg};color:${fg};`;
    }

    // Map bias score → CSS var index (1-based, left→right, matching BIAS_CATEGORIES)
    function getBiasCellStyle(score) {
        let idx;
        if      (score <  -30) idx = 1;
        else if (score <  -18) idx = 2;
        else if (score <  -12) idx = 3;
        else if (score <   -6) idx = 4;
        else if (score <=   6) idx = 5;
        else if (score <=  12) idx = 6;
        else if (score <=  18) idx = 7;
        else if (score <=  30) idx = 8;
        else                   idx = 9;
        const bg = getCSSVar(`--bias-${idx}-of-9`) || "rgba(180,180,180,0.8)";
        const fg = getContrastColor(bg);
        return `background:${bg};color:${fg};`;
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------
    function renderTable() {
        const tableBody = document.getElementById("data-table-body");
        if (!tableBody) return;
        tableBody.innerHTML = "";
        const pageData = currentData.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        );
        const pageOffset = (currentPage - 1) * rowsPerPage;
        pageData.forEach((source, idx) => {
            const row = document.createElement("tr");
            const relStyle  = getReliabilityCellStyle(source.reliability_mean);
            const biasStyle = getBiasCellStyle(source.bias_mean);
            row.innerHTML = `
<td style="color:#888;font-size:0.85em;text-align:right;padding-right:6px;">${pageOffset + idx + 1}</td>
<td>${source.id}</td>
<td>${source.moniker_name}</td>
<td>${source.domain}</td>
<td style="${relStyle}">${source.reliability_mean.toFixed(2)}</td>
<td>${source.reliability_label}</td>
<td style="${biasStyle}">${source.bias_mean.toFixed(2)}</td>
<td>${source.bias_label}</td>`;
            tableBody.appendChild(row);
        });
    }

    function renderPagination() {
        const paginationEl = document.getElementById("pagination");
        if (!paginationEl) return;
        paginationEl.innerHTML = "";
        const totalPages = Math.ceil(currentData.length / rowsPerPage);

        const prevBtn = document.createElement("button");
        prevBtn.textContent = "← Previous";
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener("click", () => {
            if (currentPage > 1) { currentPage--; renderTable(); renderPagination(); }
        });
        paginationEl.appendChild(prevBtn);

        const maxButtons = 5;
        const startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        const endPage   = Math.min(totalPages, startPage + maxButtons - 1);
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.textContent = i;
            pageBtn.classList.toggle("active", i === currentPage);
            pageBtn.addEventListener("click", () => {
                currentPage = i; renderTable(); renderPagination();
            });
            paginationEl.appendChild(pageBtn);
        }

        const nextBtn = document.createElement("button");
        nextBtn.textContent = "Next →";
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        nextBtn.addEventListener("click", () => {
            if (currentPage < totalPages) { currentPage++; renderTable(); renderPagination(); }
        });
        paginationEl.appendChild(nextBtn);
    }

    // -----------------------------------------------------------------------
    // Public update — accepts fresh filteredData, re-sorts and re-renders
    // -----------------------------------------------------------------------
    function update(filteredData) {
        currentData = filteredData.slice(); // copy so we can sort in place
        currentPage = 1;
        sortData(currentSortCol);           // applies sort + renders table + pagination
    }

    // -----------------------------------------------------------------------
    // Wire up column header click listeners
    // -----------------------------------------------------------------------
    function initHeaderListeners() {
        document.querySelectorAll(".data-table th[data-sort]").forEach((header) => {
            header.addEventListener("click", () => {
                sortData(header.getAttribute("data-sort"));
            });
        });
    }

    // -----------------------------------------------------------------------
    // Listen for data updates from the main script
    // -----------------------------------------------------------------------
    document.addEventListener("data-table:update", (e) => {
        update((e.detail && e.detail.filteredData) || []);
    });

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    window.dataTable = {
        // Called by processData in index.html via the CustomEvent — no direct call needed.
        // resetSort is called by the CSV upload handler before dispatching data-table:update.
        resetSort: function () {
            currentSortCol = "id";
            currentSortDir = "asc";
        },
    };

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    initHeaderListeners();

})();
