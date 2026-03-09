// scatterplot.js
(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // Private state
    // -----------------------------------------------------------------------
    let scatterChart             = null;
    let currentData              = [];
    let thresholdPercentile      = 20;
    let backgroundShadingEnabled = false;   // unchecked on load
    let thresholdLineColor       = "#000000";
    let categoryOverlayEnabled   = true;
    let biasStripsEnabled        = false;
    let reliabilityStripsEnabled = false;
    let cgEnabled                = true;    // on by default
    let cgOverallLineEnabled     = false;   // overall CG horizontal line

    // -----------------------------------------------------------------------
    // Category boundaries
    // -----------------------------------------------------------------------
    const BIAS_BOUNDARIES        = [-40, -30, -18, -12, -6, 6, 12, 18, 30, 40];
    const RELIABILITY_BOUNDARIES = [0, 8, 16, 24, 32, 40, 48, 60];
    const BIAS_INNER             = BIAS_BOUNDARIES.slice(1, -1);
    const RELIABILITY_INNER      = RELIABILITY_BOUNDARIES.slice(1, -1);
    const N_REL                  = RELIABILITY_CATEGORIES.length; // 7

    // Always-reserved padding keeps chart plot area stable on toggle
    const REL_LABEL_WIDTH = 200;
    const BOTTOM_PAD      = 60;

    // -----------------------------------------------------------------------
    // Color helpers
    // -----------------------------------------------------------------------
    const ROOT_STYLE = getComputedStyle(document.documentElement);
    function getCSSVar(n)               { return ROOT_STYLE.getPropertyValue(n).trim(); }
    function getBiasBandColor(i)        { return getCSSVar(`--bias-${i+1}-of-9`)        || "rgba(180,180,180,0.8)"; }
    function getReliabilityBandColor(i) { return getCSSVar(`--reliability-${i+1}-of-7`) || "#cccccc"; }

    function parseColor(c) {
        const hex = c.match(/^#([0-9a-f]{3,6})$/i);
        if (hex) {
            const v = hex[1].length===3 ? hex[1].split("").map(x=>x+x).join("") : hex[1];
            return { r:parseInt(v.slice(0,2),16), g:parseInt(v.slice(2,4),16), b:parseInt(v.slice(4,6),16) };
        }
        const m = c.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
        return m ? { r:parseFloat(m[1]), g:parseFloat(m[2]), b:parseFloat(m[3]) } : {r:180,g:180,b:180};
    }

    function getContrastColor(bg) {
        const {r,g,b} = parseColor(bg);
        const lin = c => { const s=c/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4); };
        return (0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)) < 0.35 ? "#fff" : "#000";
    }

    // -----------------------------------------------------------------------
    // Text wrap helper
    // -----------------------------------------------------------------------
    function wrapText(ctx, text, maxW) {
        const words = text.split(" "); const lines = []; let line = "";
        for (const w of words) {
            const test = line ? line+" "+w : w;
            if (ctx.measureText(test).width <= maxW) line = test;
            else { if (line) lines.push(line); line = w; }
        }
        if (line) lines.push(line);
        return lines;
    }

    // -----------------------------------------------------------------------
    // Scatter point color
    // -----------------------------------------------------------------------
    function getPointColors(data) {
        return data.map((p) => {
            const nb=Math.max(-1,Math.min(1,p.x/40)), nr=Math.max(0,Math.min(1,p.y/50));
            let r,g,b;
            if (nb<0){const t=-nb;r=Math.round(255*(1-t));g=Math.round(255*(1-t));b=255;}
            else     {const t= nb;r=255;g=Math.round(255*(1-t));b=Math.round(255*(1-t));}
            const op=0.3+nr*0.6, rf=0.4+nr*0.6;
            return `rgba(${Math.round(r*rf)},${Math.round(g*rf)},${Math.round(b*rf)},${op})`;
        });
    }

    // -----------------------------------------------------------------------
    // Bias strips plugin
    // -----------------------------------------------------------------------
    const biasStripsPlugin = {
        id: "biasStrips",
        beforeDatasetsDraw(chart) {
            if (!biasStripsEnabled) return;
            const { ctx, chartArea, scales } = chart;
            ctx.save();
            BIAS_CATEGORIES.forEach((_,i) => {
                const lx=scales.x.getPixelForValue(BIAS_BOUNDARIES[i]);
                const rx=scales.x.getPixelForValue(BIAS_BOUNDARIES[i+1]);
                const {r,g,b}=parseColor(getBiasBandColor(i));
                ctx.fillStyle=`rgba(${r},${g},${b},0.12)`;
                ctx.fillRect(lx,chartArea.top,rx-lx,chartArea.bottom-chartArea.top);
            });
            ctx.restore();
        },
    };

    // -----------------------------------------------------------------------
    // Reliability strips plugin
    // -----------------------------------------------------------------------
    const reliabilityStripsPlugin = {
        id: "reliabilityStrips",
        beforeDatasetsDraw(chart) {
            if (!reliabilityStripsEnabled) return;
            const { ctx, chartArea, scales } = chart;
            ctx.save();
            RELIABILITY_CATEGORIES.forEach((_,i) => {
                const scoreLow =RELIABILITY_BOUNDARIES[N_REL-1-i];
                const scoreHigh=RELIABILITY_BOUNDARIES[N_REL-i];
                const pyTop   =scales.y.getPixelForValue(scoreHigh);
                const pyBottom=scales.y.getPixelForValue(scoreLow);
                const {r,g,b}=parseColor(getReliabilityBandColor(i));
                ctx.fillStyle=`rgba(${r},${g},${b},0.12)`;
                ctx.fillRect(chartArea.left,pyTop,chartArea.right-chartArea.left,pyBottom-pyTop);
            });
            ctx.restore();
        },
    };

    // -----------------------------------------------------------------------
    // Grid lines plugin — ALWAYS draws boundary lines regardless of label toggle
    // -----------------------------------------------------------------------
    const gridLinesPlugin = {
        id: "gridLines",
        afterDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            ctx.save();
            ctx.strokeStyle="rgba(0,0,0,0.20)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
            BIAS_INNER.forEach(v => {
                const px=scales.x.getPixelForValue(v);
                ctx.beginPath(); ctx.moveTo(px,chartArea.top); ctx.lineTo(px,chartArea.bottom); ctx.stroke();
            });
            RELIABILITY_INNER.forEach(v => {
                const py=scales.y.getPixelForValue(v);
                ctx.beginPath(); ctx.moveTo(chartArea.left,py); ctx.lineTo(chartArea.right,py); ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.restore();
        },
    };

    // -----------------------------------------------------------------------
    // Category overlay plugin — ONLY draws label pills (no gridlines)
    // -----------------------------------------------------------------------
    const categoryOverlayPlugin = {
        id: "categoryOverlay",
        afterDraw(chart) {
            if (!categoryOverlayEnabled) return;
            const { ctx, chartArea, scales } = chart;
            const xScale=scales.x, yScale=scales.y;
            const FONT_SIZE=10, FONT=`bold ${FONT_SIZE}px Segoe UI, sans-serif`;
            const LINE_H=FONT_SIZE+3, PAD=5, PILL_R=4;

            ctx.save();
            ctx.font=FONT; ctx.textBaseline="middle"; ctx.textAlign="center";

            // Bias labels below x-axis
            const biasMidY=chartArea.bottom+(chart.height-chartArea.bottom)/2;
            BIAS_CATEGORIES.forEach((label,i) => {
                const lx=xScale.getPixelForValue(BIAS_BOUNDARIES[i]);
                const rx=xScale.getPixelForValue(BIAS_BOUNDARIES[i+1]);
                const midX=(lx+rx)/2, bandW=rx-lx, innerW=bandW-PAD*2;
                if (innerW<10) return;
                const lines=wrapText(ctx,label,innerW);
                const pillH=lines.length*LINE_H+PAD*2;
                const pillW=Math.min(bandW-2,lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0)+PAD*2);
                const pillX=midX-pillW/2, pillY=biasMidY-pillH/2;
                const bg=getBiasBandColor(i), fg=getContrastColor(bg);
                ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(pillX,pillY,pillW,pillH,PILL_R); ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.rect(pillX,pillY,pillW,pillH); ctx.clip();
                ctx.fillStyle=fg;
                lines.forEach((ln,li)=>ctx.fillText(ln,midX,pillY+PAD+LINE_H*li+LINE_H/2));
                ctx.restore();
            });

            // Reliability labels left of y-axis
            const availW=chartArea.left-4, pillMaxW=availW-4;
            RELIABILITY_CATEGORIES.forEach((label,i) => {
                const scoreLow =RELIABILITY_BOUNDARIES[N_REL-1-i];
                const scoreHigh=RELIABILITY_BOUNDARIES[N_REL-i];
                const pyTop=yScale.getPixelForValue(scoreHigh);
                const pyBottom=yScale.getPixelForValue(scoreLow);
                const midY=(pyTop+pyBottom)/2, bandH=pyBottom-pyTop;
                const innerW=pillMaxW-PAD*2;
                if (innerW<10||bandH<LINE_H+2) return;
                const lines=wrapText(ctx,label,innerW);
                const pillH=Math.min(lines.length*LINE_H+PAD*2,bandH-4);
                const pillW=Math.min(lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0)+PAD*2,pillMaxW);
                const pillX=chartArea.left-pillW-2, pillY=midY-pillH/2;
                const bg=getReliabilityBandColor(i), fg=getContrastColor(bg);
                ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(pillX,pillY,pillW,pillH,PILL_R); ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.rect(pillX,pillY,pillW,pillH); ctx.clip();
                ctx.fillStyle=fg;
                const totalH=lines.length*LINE_H, startY=midY-totalH/2+LINE_H/2;
                lines.forEach((ln,li)=>ctx.fillText(ln,pillX+pillW/2,startY+LINE_H*li));
                ctx.restore();
            });

            ctx.restore();
        },
    };

    // -----------------------------------------------------------------------
    // CG plugin
    // Groups: Left (#00FFFF), Middle (gray), Right (#FF0000), Overall (#000000)
    // Optional: overall-CG horizontal line with per-bias-column above/below counts
    // -----------------------------------------------------------------------
    const cgPlugin = {
        id: "cg",
        afterDraw(chart) {
            if (!cgEnabled || currentData.length === 0) return;
            const { ctx, chartArea, scales } = chart;

            const groups = [
                { key:"Left",    color:"#00FFFF",             label:"Left CG"    },
                { key:"Middle",  color:"rgba(120,120,120,1)", label:"Middle CG"  },
                { key:"Overall", color:"#000000",             label:"Overall CG" },
                { key:"Right",   color:"#FF0000",             label:"Right CG"   },
            ];

            // Populate sources — Overall gets all; others by bias_label
            groups.forEach(g => g.sources = []);
            currentData.forEach(s => {
                const bl=(s.bias_label||"").toLowerCase();
                if      (bl.includes("left"))  groups[0].sources.push(s);
                else if (bl.includes("right")) groups[3].sources.push(s);
                else                           groups[1].sources.push(s);
                groups[2].sources.push(s); // Overall = all sources
            });

            const mean=(arr,key)=>arr.length ? arr.reduce((s,x)=>s+x[key],0)/arr.length : null;

            ctx.save();
            ctx.font="bold 10px Segoe UI, sans-serif";
            ctx.textBaseline="middle";

            // Pill x-centers spread evenly across chart width
            const pillCenters = [0.10,0.35,0.60,0.85].map(
                f => chartArea.left + (chartArea.right-chartArea.left)*f
            );

            const PAD=5, PILL_R=4, LINE_H=13;

            groups.forEach((grp, gi) => {
                const n=grp.sources.length;
                const avgB=mean(grp.sources,"bias_mean");
                const avgR=mean(grp.sources,"reliability_mean");
                if (avgB===null||avgR===null) return;

                const px=scales.x.getPixelForValue(avgB);
                const py=scales.y.getPixelForValue(avgR);
                const R=10;

                // Crosshair
                ctx.strokeStyle=grp.color; ctx.lineWidth=2;
                ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px-R*1.6,py); ctx.lineTo(px+R*1.6,py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px,py-R*1.6); ctx.lineTo(px,py+R*1.6); ctx.stroke();
                ctx.fillStyle=grp.color;
                ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill();

                // Summary pill
                const lines=[grp.label,`n=${n}`,`Bias: ${avgB.toFixed(2)}`,`Rel: ${avgR.toFixed(2)}`];
                const maxTW=lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0);
                const pillW=maxTW+PAD*2, pillH=lines.length*LINE_H+PAD*2;
                const pillX=pillCenters[gi]-pillW/2;
                const pillY=chartArea.bottom+(chart.height-chartArea.bottom)/2-pillH/2;

                // Pill background — use a darker stroke outline for the cyan/white pills
                ctx.fillStyle=grp.color;
                ctx.beginPath(); ctx.roundRect(pillX,pillY,pillW,pillH,PILL_R); ctx.fill();
                if (grp.color==="#00FFFF") {
                    ctx.strokeStyle="#009999"; ctx.lineWidth=1.5;
                    ctx.beginPath(); ctx.roundRect(pillX,pillY,pillW,pillH,PILL_R); ctx.stroke();
                }

                ctx.save(); ctx.beginPath(); ctx.rect(pillX,pillY,pillW,pillH); ctx.clip();
                ctx.fillStyle=getContrastColor(grp.color); ctx.textAlign="center";
                lines.forEach((ln,li)=>ctx.fillText(ln,pillX+pillW/2,pillY+PAD+LINE_H*li+LINE_H/2));
                ctx.restore();

                // Connector
                ctx.strokeStyle=grp.color; ctx.lineWidth=1; ctx.setLineDash([3,3]);
                ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(pillX+pillW/2,pillY); ctx.stroke();
                ctx.setLineDash([]);

                // ---- Overall CG horizontal line + above/below breakdown ----
                if (grp.key==="Overall" && cgOverallLineEnabled) {
                    const lineY=scales.y.getPixelForValue(avgR);

                    // Draw the horizontal line
                    ctx.strokeStyle="#000000"; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
                    ctx.beginPath(); ctx.moveTo(chartArea.left,lineY); ctx.lineTo(chartArea.right,lineY); ctx.stroke();
                    ctx.setLineDash([]);

                    // Label on left
                    ctx.fillStyle="#000"; ctx.textAlign="left"; ctx.textBaseline="bottom";
                    ctx.font="bold 9px Segoe UI, sans-serif";
                    ctx.fillText(`Overall CG Rel: ${avgR.toFixed(2)}`, chartArea.left+2, lineY-2);

                    // Per-bias-column: count sources above & below the line
                    ctx.font="bold 9px Segoe UI, sans-serif";
                    ctx.textBaseline="middle";

                    BIAS_CATEGORIES.forEach((_, bi) => {
                        const colSources = currentData.filter(s => {
                            const bl=(s.bias_label||"").trim().toLowerCase();
                            return bl===BIAS_CATEGORIES[bi].toLowerCase();
                        });
                        if (colSources.length===0) return;

                        const above=colSources.filter(s=>s.reliability_mean > avgR).length;
                        const below=colSources.length-above;
                        const total=colSources.length;
                        const abovePct=Math.round(above/total*100);
                        const belowPct=100-abovePct;

                        const lx=scales.x.getPixelForValue(BIAS_BOUNDARIES[bi]);
                        const rx=scales.x.getPixelForValue(BIAS_BOUNDARIES[bi+1]);
                        const midX=(lx+rx)/2;
                        const bandW=rx-lx;

                        // Above line label
                        const aboveText=`${above} (${abovePct}%)`;
                        const belowText=`${below} (${belowPct}%)`;
                        const maxTW2=Math.max(ctx.measureText(aboveText).width, ctx.measureText(belowText).width);
                        if (maxTW2 > bandW-4) return; // skip if too cramped

                        ctx.fillStyle="rgba(0,100,0,0.85)";
                        ctx.textAlign="center";
                        ctx.fillText(aboveText, midX, lineY-10);

                        ctx.fillStyle="rgba(150,0,0,0.85)";
                        ctx.fillText(belowText, midX, lineY+10);
                    });
                }
            });

            ctx.restore();
        },
    };

    // -----------------------------------------------------------------------
    // Background shading + threshold line plugin
    // -----------------------------------------------------------------------
    const backgroundShadingPlugin = {
        id: "backgroundShading",
        afterDraw(chart) {
            if (!backgroundShadingEnabled) return;
            const { ctx, chartArea, scales, options } = chart;
            const opts=options.plugins.backgroundShading;
            const threshold=scales.y.getPixelForValue(opts.thresholdY);
            ctx.fillStyle=opts.aboveColor;
            ctx.fillRect(chartArea.left,chartArea.top,chartArea.width,threshold-chartArea.top);
            ctx.fillStyle=opts.belowColor;
            ctx.fillRect(chartArea.left,threshold,chartArea.width,chartArea.bottom-threshold);
            ctx.beginPath(); ctx.setLineDash([5,5]);
            ctx.moveTo(chartArea.left,threshold); ctx.lineTo(chartArea.right,threshold);
            ctx.lineWidth=1; ctx.strokeStyle=thresholdLineColor||"rgba(0,0,0,0.5)";
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle="rgba(0,0,0,0.8)"; ctx.font="bold 11px Segoe UI";
            ctx.textAlign="center"; ctx.textBaseline="alphabetic";
            const midX=chartArea.left+chartArea.width/2;
            ctx.fillText(`Top ${thresholdPercentile}% Threshold: ${opts.thresholdY.toFixed(2)}`,midX,threshold-20);
            ctx.fillText("More Reliable Sources",midX,threshold-6);
            ctx.fillText("Less Reliable Sources",midX,threshold+16);
        },
    };

    // -----------------------------------------------------------------------
    // Scale config — always stable (category boundary ticks)
    // -----------------------------------------------------------------------
    function buildScales() {
        return {
            x: {
                title: { display:true, text:"Bias Score (Negative = Left, Positive = Right)" },
                min:-40, max:40,
                ticks: { font:{size:9}, maxRotation:45, autoSkip:false },
                grid:  { color:()=>"rgba(0,0,0,0)" },
                afterBuildTicks(axis) { axis.ticks=BIAS_INNER.map(v=>({value:v})); },
            },
            y: {
                title: { display:true, text:"Reliability Score (Higher = More Reliable)" },
                min:0, max:60,
                ticks: { font:{size:9}, autoSkip:false },
                grid:  { color:()=>"rgba(0,0,0,0)" },
                afterBuildTicks(axis) { axis.ticks=RELIABILITY_INNER.map(v=>({value:v})); },
            },
        };
    }

    // -----------------------------------------------------------------------
    // Core render
    // -----------------------------------------------------------------------
    function render(filteredData) {
        const canvas=document.getElementById("scatter-chart");
        if (!canvas) return;

        const maxPoints=4000;
        let dataForScatter=filteredData;
        if (filteredData.length>maxPoints) {
            const rate=Math.floor(filteredData.length/maxPoints);
            dataForScatter=filteredData.filter((_,i)=>i%rate===0);
        }

        const scatterData=dataForScatter.map(s=>({x:s.bias_mean,y:s.reliability_mean,label:s.moniker_name}));
        const focused    =window.focusedSources||[];
        const regularData=scatterData.filter(p=>!focused.includes(p.label));
        const focusedData=scatterData.filter(p=> focused.includes(p.label));

        const relVals  =filteredData.map(s=>s.reliability_mean).sort((a,b)=>a-b);
        const tIdx     =Math.floor(relVals.length*((100-thresholdPercentile)/100));
        const relThresh=relVals[tIdx]||40;

        if (scatterChart) scatterChart.destroy();

        const datasets=[];
        if (regularData.length>0) datasets.push({
            label:"Media Sources",data:regularData,
            backgroundColor:getPointColors(regularData),
            pointRadius:4,pointHoverRadius:8,order:2,
        });
        if (focusedData.length>0) datasets.push({
            label:"Highlighted Sources",data:focusedData,
            backgroundColor:"rgba(255,215,0,0.9)",borderColor:"rgba(255,140,0,1)",
            borderWidth:2,pointRadius:8,pointHoverRadius:12,order:1,
        });

        scatterChart=new Chart(canvas.getContext("2d"),{
            type:"scatter",data:{datasets},
            options:{
                animation:filteredData.length<500,
                maintainAspectRatio:false,
                layout:{ padding:{ left:REL_LABEL_WIDTH, bottom:BOTTOM_PAD } },
                scales:buildScales(),
                plugins:{
                    tooltip:{
                        callbacks:{
                            label:ctx=>{
                                const p=ctx.raw,tag=focused.includes(p.label)?" (HIGHLIGHTED)":"";
                                return `${p.label}${tag}: Reliability: ${p.y.toFixed(2)}, Bias: ${p.x.toFixed(2)}`;
                            },
                        },
                    },
                    legend:{ display:focusedData.length>0 },
                    backgroundShading:{
                        thresholdY:relThresh,
                        aboveColor:"rgba(144,238,144,0.2)",
                        belowColor:"rgba(255,182,193,0.2)",
                    },
                },
            },
            plugins:[biasStripsPlugin,reliabilityStripsPlugin,backgroundShadingPlugin,gridLinesPlugin,categoryOverlayPlugin,cgPlugin],
        });

        renderThresholdBreakdown(filteredData, relThresh);
    }

    // -----------------------------------------------------------------------
    // Threshold bias breakdown
    // Renders a small table into #threshold-bias-breakdown showing, for each
    // BIAS_CATEGORY, how many sources are above vs. below the current threshold.
    // Always updated on every render regardless of shading toggle state.
    // -----------------------------------------------------------------------
    function renderThresholdBreakdown(filteredData, threshold) {
        const el = document.getElementById("threshold-bias-breakdown");
        if (!el) return;
        if (filteredData.length === 0) { el.innerHTML = ""; return; }

        // Count above/below per bias category
        const counts = BIAS_CATEGORIES.map(cat => {
            const inCat = filteredData.filter(s =>
                (s.bias_label || "").trim().toLowerCase() === cat.toLowerCase());
            const above = inCat.filter(s => s.reliability_mean > threshold).length;
            return { cat, total: inCat.length, above, below: inCat.length - above };
        });

        const pct = (n, t) => t === 0 ? "—" : `${Math.round(n / t * 100)}%`;

        // Build a compact 3-row table: header | above | below
        let html = `<table style="border-collapse:collapse; font-size:0.9em; width:100%;">`;

        // Header: bias category names with their band color
        html += `<tr><td style="padding:2px 4px; font-weight:bold; white-space:nowrap;">Threshold: ${threshold.toFixed(2)}</td>`;
        counts.forEach(({cat}, i) => {
            const bg = getCSSVar(`--bias-${i+1}-of-9`) || "rgba(180,180,180,0.8)";
            const fg = getContrastColor(bg);
            html += `<th style="background:${bg};color:${fg};padding:2px 5px;border:1px solid #ccc;font-size:0.85em;text-align:center;white-space:nowrap;">${cat}</th>`;
        });
        html += `</tr>`;

        // Above row (green tint header)
        html += `<tr><td style="padding:2px 4px;font-weight:bold;color:darkgreen;white-space:nowrap;">▲ Above</td>`;
        counts.forEach(({above, total}, i) => {
            const bg = getCSSVar(`--bias-${i+1}-of-9`) || "rgba(180,180,180,0.8)";
            const {r,g,b} = parseColor(bg);
            html += `<td style="background:rgba(${r},${g},${b},0.12);padding:2px 5px;border:1px solid #ccc;text-align:center;white-space:nowrap;">${above} (${pct(above,total)})</td>`;
        });
        html += `</tr>`;

        // Below row (red tint header)
        html += `<tr><td style="padding:2px 4px;font-weight:bold;color:darkred;white-space:nowrap;">▼ Below</td>`;
        counts.forEach(({below, total}, i) => {
            const bg = getCSSVar(`--bias-${i+1}-of-9`) || "rgba(180,180,180,0.8)";
            const {r,g,b} = parseColor(bg);
            html += `<td style="background:rgba(${r},${g},${b},0.12);padding:2px 5px;border:1px solid #ccc;text-align:center;white-space:nowrap;">${below} (${pct(below,total)})</td>`;
        });
        html += `</tr></table>`;

        el.innerHTML = html;
    }

    // -----------------------------------------------------------------------
    // Toggle helper
    // -----------------------------------------------------------------------
    function makeToggle(btnId,getState,setState,onLabel,offLabel,onColor) {
        const btn=document.getElementById(btnId);
        if (!btn) return;
        btn.textContent          =getState()?onLabel:offLabel;
        btn.style.backgroundColor=getState()?onColor:"";
        btn.addEventListener("click",()=>{
            setState(!getState());
            btn.textContent          =getState()?onLabel:offLabel;
            btn.style.backgroundColor=getState()?onColor:"";
            render(currentData);
        });
    }

    // -----------------------------------------------------------------------
    // Controls
    // -----------------------------------------------------------------------
    function initControls() {
        const sliderEl =document.getElementById("reliability-percentile");
        const numberEl =document.getElementById("reliability-percentile-value");
        const shadingEl=document.getElementById("toggle-background-shading");
        const colorEl  =document.getElementById("threshold-line-color");

        if (sliderEl)  sliderEl.addEventListener("input", e=>{thresholdPercentile=parseInt(e.target.value);if(numberEl)numberEl.value=thresholdPercentile;render(currentData);});
        if (numberEl)  numberEl.addEventListener("input", e=>{thresholdPercentile=Math.min(100,Math.max(1,parseInt(e.target.value)||20));if(sliderEl)sliderEl.value=thresholdPercentile;render(currentData);});
        if (shadingEl) shadingEl.addEventListener("change",e=>{backgroundShadingEnabled=e.target.checked;render(currentData);});
        if (colorEl)   colorEl.addEventListener("input",  e=>{thresholdLineColor=e.target.value;render(currentData);});

        // Threshold panel toggle
        const threshBtn  =document.getElementById("toggle-threshold-panel");
        const threshPanel=document.getElementById("threshold-panel");
        if (threshBtn&&threshPanel) {
            // Panel starts hidden
            threshPanel.style.display="none";
            threshBtn.textContent="Show Threshold Settings";
            threshBtn.style.backgroundColor="";
            threshBtn.addEventListener("click",()=>{
                const hidden=threshPanel.style.display==="none";
                threshPanel.style.display=hidden?"":"none";
                threshBtn.textContent          =hidden?"Hide Threshold Settings":"Show Threshold Settings";
                threshBtn.style.backgroundColor=hidden?"#27ae60":"";
            });
        }

        makeToggle("toggle-categories",
            ()=>categoryOverlayEnabled,v=>{categoryOverlayEnabled=v;},
            "Hide Category Labels","Show Category Labels","#27ae60");

        makeToggle("toggle-bias-strips",
            ()=>biasStripsEnabled,v=>{biasStripsEnabled=v;},
            "Hide Bias Strips","Show Bias Strips","#2980b9");

        makeToggle("toggle-reliability-strips",
            ()=>reliabilityStripsEnabled,v=>{reliabilityStripsEnabled=v;},
            "Hide Reliability Strips","Show Reliability Strips","#8e44ad");

        // toggle-cg also enables/disables the CG line button
        (function() {
            const cgBtn     = document.getElementById("toggle-cg");
            const lineBtn   = document.getElementById("toggle-cg-line");
            function syncLineBtn() {
                if (!lineBtn) return;
                lineBtn.disabled = !cgEnabled;
                lineBtn.style.opacity = cgEnabled ? "1" : "0.4";
                lineBtn.style.cursor  = cgEnabled ? "" : "not-allowed";
            }
            if (cgBtn) {
                cgBtn.textContent           = cgEnabled ? "Hide Centers of Gravity" : "Show Centers of Gravity";
                cgBtn.style.backgroundColor = cgEnabled ? "#e67e22" : "";
                cgBtn.addEventListener("click", () => {
                    cgEnabled = !cgEnabled;
                    if (!cgEnabled) cgOverallLineEnabled = false; // also turn off line
                    cgBtn.textContent           = cgEnabled ? "Hide Centers of Gravity" : "Show Centers of Gravity";
                    cgBtn.style.backgroundColor = cgEnabled ? "#e67e22" : "";
                    // sync line button appearance
                    if (lineBtn) {
                        lineBtn.textContent           = cgOverallLineEnabled ? "Hide Overall CG Line" : "Show Overall CG Line";
                        lineBtn.style.backgroundColor = cgOverallLineEnabled ? "#555555" : "";
                    }
                    syncLineBtn();
                    render(currentData);
                });
            }
            syncLineBtn(); // set initial state
        })();

        makeToggle("toggle-cg-line",
            ()=>cgOverallLineEnabled,v=>{cgOverallLineEnabled=v;},
            "Hide Overall CG Line","Show Overall CG Line","#555555");

        makeToggle("toggle-threshold-panel-btn",  // alias — same as threshBtn above but wired via makeToggle pattern if needed
            ()=>false,v=>{},"","",""); // no-op placeholder; real wiring above
    }

    // -----------------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------------
    document.addEventListener("scatterplot:update",e=>{
        currentData=(e.detail&&e.detail.filteredData)||[];
        render(currentData);
    });
    document.addEventListener("focus:changed",()=>render(currentData));

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    initControls();

})();
