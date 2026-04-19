let currentData = null;
let currentView = "2d";

const CATEGORY_COLORS = {
    animals: "#f0a05b",
    colors: "#c05bf0",
    emotions: "#f05b7a",
    food: "#5bf09b",
    technology: "#5ba0f0",
    nature: "#7af05b",
    actions: "#f0e05b",
    people: "#f0905b",
    input: "#ffffff",
};

// Submit on Enter
document.getElementById("word1").addEventListener("keydown", (e) => {
    if (e.key === "Enter") compare();
});
document.getElementById("word2").addEventListener("keydown", (e) => {
    if (e.key === "Enter") compare();
});

async function compare() {
    const word1 = document.getElementById("word1").value.trim();
    const word2 = document.getElementById("word2").value.trim();
    if (!word1 || !word2) return;

    const btn = document.getElementById("compareBtn");
    const loading = document.getElementById("loading");
    btn.disabled = true;
    loading.classList.add("visible");

    try {
        const res = await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word1, word2 }),
        });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        currentData = data;
        document.getElementById("similarityVal").textContent = data.similarity.toFixed(4);
        document.getElementById("distanceVal").textContent = data.distance.toFixed(4);
        document.getElementById("stats").classList.add("visible");
        render();
    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        btn.disabled = false;
        loading.classList.remove("visible");
    }
}

function setView(view) {
    currentView = view;
    document.getElementById("btn2d").classList.toggle("active", view === "2d");
    document.getElementById("btn3d").classList.toggle("active", view === "3d");
    if (currentData) render();
}

function render() {
    if (!currentData) return;

    const { points, input_words } = currentData;

    // Separate reference and input points
    const refPoints = points.filter((p) => p.category !== "input");
    const inputPoints = points.filter((p) => p.category === "input");

    // Group reference points by category
    const categories = {};
    for (const p of refPoints) {
        if (!categories[p.category]) categories[p.category] = [];
        categories[p.category].push(p);
    }

    const traces = [];

    if (currentView === "2d") {
        // Reference word traces (one per category)
        for (const [cat, pts] of Object.entries(categories)) {
            traces.push({
                x: pts.map((p) => p.x2d),
                y: pts.map((p) => p.y2d),
                mode: "markers+text",
                type: "scatter",
                name: cat,
                text: pts.map((p) => p.word),
                textposition: "top center",
                textfont: { size: 10, color: CATEGORY_COLORS[cat] + "99" },
                marker: {
                    size: 7,
                    color: CATEGORY_COLORS[cat],
                    opacity: 0.4,
                },
                hovertemplate: "<b>%{text}</b><br>Category: " + cat + "<extra></extra>",
            });
        }

        // Input words — large highlighted markers
        traces.push({
            x: inputPoints.map((p) => p.x2d),
            y: inputPoints.map((p) => p.y2d),
            mode: "markers+text",
            type: "scatter",
            name: "input",
            text: inputPoints.map((p) => p.word),
            textposition: "top center",
            textfont: { size: 14, color: "#fff", family: "sans-serif" },
            marker: {
                size: 16,
                color: "#fff",
                symbol: "diamond",
                line: { width: 2, color: "#5b5bf0" },
            },
            hovertemplate: "<b>%{text}</b><br>(your input)<extra></extra>",
        });

        // Dashed line connecting input words
        traces.push({
            x: inputPoints.map((p) => p.x2d),
            y: inputPoints.map((p) => p.y2d),
            mode: "lines",
            type: "scatter",
            name: "connection",
            line: { color: "#5b5bf0", width: 1.5, dash: "dash" },
            showlegend: false,
            hoverinfo: "skip",
        });

        Plotly.newPlot("chart", traces, {
            paper_bgcolor: "#0a0a0f",
            plot_bgcolor: "#0a0a0f",
            font: { color: "#888" },
            xaxis: {
                showgrid: true,
                gridcolor: "#1a1a24",
                zeroline: false,
                showticklabels: false,
            },
            yaxis: {
                showgrid: true,
                gridcolor: "#1a1a24",
                zeroline: false,
                showticklabels: false,
            },
            showlegend: true,
            legend: {
                bgcolor: "rgba(0,0,0,0)",
                font: { size: 11 },
                x: 1,
                xanchor: "right",
            },
            margin: { l: 20, r: 20, t: 10, b: 20 },
            dragmode: "pan",
        }, {
            responsive: true,
            scrollZoom: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
            displaylogo: false,
        });
    } else {
        // 3D view
        for (const [cat, pts] of Object.entries(categories)) {
            traces.push({
                x: pts.map((p) => p.x3d),
                y: pts.map((p) => p.y3d),
                z: pts.map((p) => p.z3d),
                mode: "markers+text",
                type: "scatter3d",
                name: cat,
                text: pts.map((p) => p.word),
                textposition: "top center",
                textfont: { size: 9, color: CATEGORY_COLORS[cat] + "99" },
                marker: {
                    size: 4,
                    color: CATEGORY_COLORS[cat],
                    opacity: 0.5,
                },
                hovertemplate: "<b>%{text}</b><br>Category: " + cat + "<extra></extra>",
            });
        }

        traces.push({
            x: inputPoints.map((p) => p.x3d),
            y: inputPoints.map((p) => p.y3d),
            z: inputPoints.map((p) => p.z3d),
            mode: "markers+text",
            type: "scatter3d",
            name: "input",
            text: inputPoints.map((p) => p.word),
            textposition: "top center",
            textfont: { size: 13, color: "#fff" },
            marker: {
                size: 8,
                color: "#fff",
                symbol: "diamond",
                line: { width: 1, color: "#5b5bf0" },
            },
            hovertemplate: "<b>%{text}</b><br>(your input)<extra></extra>",
        });

        traces.push({
            x: inputPoints.map((p) => p.x3d),
            y: inputPoints.map((p) => p.y3d),
            z: inputPoints.map((p) => p.z3d),
            mode: "lines",
            type: "scatter3d",
            name: "connection",
            line: { color: "#5b5bf0", width: 4, dash: "dash" },
            showlegend: false,
            hoverinfo: "skip",
        });

        Plotly.newPlot("chart", traces, {
            paper_bgcolor: "#0a0a0f",
            font: { color: "#888" },
            scene: {
                bgcolor: "#0a0a0f",
                xaxis: { showgrid: true, gridcolor: "#1a1a24", zeroline: false, showticklabels: false, title: "" },
                yaxis: { showgrid: true, gridcolor: "#1a1a24", zeroline: false, showticklabels: false, title: "" },
                zaxis: { showgrid: true, gridcolor: "#1a1a24", zeroline: false, showticklabels: false, title: "" },
            },
            showlegend: true,
            legend: {
                bgcolor: "rgba(0,0,0,0)",
                font: { size: 11 },
                x: 1,
                xanchor: "right",
            },
            margin: { l: 0, r: 0, t: 0, b: 0 },
        }, {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
        });
    }
}
