// Pre-baked UMAP 2D coordinates for tutorial visualizations
// Subset of reference words (3-4 per category) for cleaner maps

const TUTORIAL_POINTS = [
    // animals (4)
    {word:"cat",category:"animals",x:1.61,y:-5.33},{word:"dog",category:"animals",x:1.522,y:-5.431},
    {word:"eagle",category:"animals",x:0.748,y:-5.433},{word:"whale",category:"animals",x:-0.076,y:-5.287},
    // colors (3)
    {word:"red",category:"colors",x:1.142,y:-0.536},{word:"blue",category:"colors",x:0.937,y:-0.546},
    {word:"green",category:"colors",x:0.796,y:-0.402},
    // emotions (4)
    {word:"happy",category:"emotions",x:3.167,y:-0.647},{word:"sad",category:"emotions",x:2.849,y:-0.336},
    {word:"love",category:"emotions",x:3.136,y:-0.79},{word:"fear",category:"emotions",x:2.212,y:-1.462},
    // food (3)
    {word:"bread",category:"food",x:0.621,y:-2.406},{word:"pizza",category:"food",x:0.525,y:-2.697},
    {word:"banana",category:"food",x:0.568,y:-1.717},
    // technology (3)
    {word:"computer",category:"technology",x:2.067,y:-3.89},{word:"algorithm",category:"technology",x:2.858,y:-4.035},
    {word:"internet",category:"technology",x:1.842,y:-3.608},
    // nature (3)
    {word:"ocean",category:"nature",x:-0.25,y:-4.385},{word:"mountain",category:"nature",x:0.136,y:-4.0},
    {word:"sun",category:"nature",x:0.005,y:-3.501},
    // actions (3)
    {word:"run",category:"actions",x:2.87,y:-2.153},{word:"think",category:"actions",x:2.373,y:-0.43},
    {word:"dance",category:"actions",x:2.201,y:-2.588},
    // people (3)
    {word:"king",category:"people",x:1.159,y:-4.397},{word:"doctor",category:"people",x:1.896,y:-4.565},
    {word:"artist",category:"people",x:2.248,y:-2.847},
];

const TUTORIAL_EXAMPLES = {
    cat: { x: 1.72, y: -5.713 },
    dog: { x: 1.477, y: -5.103 },
    algorithm: { x: 3.106, y: -3.919 },
};

const CATEGORY_COLORS_TUT = {
    animals: "#f0a05b",
    colors: "#c05bf0",
    emotions: "#f05b7a",
    food: "#5bf09b",
    technology: "#5ba0f0",
    nature: "#7af05b",
    actions: "#f0e05b",
    people: "#f0905b",
};

const TUTORIAL_MODES = [
    { name: "Furthest", color: "#f05b7a", rule: "Get as far as possible from the target word" },
    { name: "Closest", color: "#5bf09b", rule: "Get as close as possible (but not the same word)" },
    { name: "Midpoint", color: "#c05bf0", rule: "Land equally between two target words" },
    { name: "Bullseye", color: "#f0e05b", rule: "Hit an exact target distance" },
    { name: "Blind", color: "#f0a05b", rule: "The target word is hidden — you only see its category" },
    { name: "Double Down", color: "#5ba0f0", rule: "Get far from both target words at once" },
];

let tutorialStep = 0;
const TOTAL_STEPS = 6;

function openTutorial() {
    tutorialStep = 0;
    document.getElementById("tutorialOverlay").style.display = "flex";
    renderTutorialStep();
}

function closeTutorial() {
    document.getElementById("tutorialOverlay").style.display = "none";
    localStorage.setItem("tutorial_seen", "1");
    Plotly.purge("tutorialChart");
}

function tutorialNext() {
    if (tutorialStep >= TOTAL_STEPS - 1) {
        closeTutorial();
        return;
    }
    tutorialStep++;
    renderTutorialStep();
}

function tutorialPrev() {
    if (tutorialStep <= 0) return;
    tutorialStep--;
    renderTutorialStep();
}

function renderTutorialStep() {
    const dots = document.getElementById("tutorialDots");
    dots.innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) =>
        `<div class="tutorial-dot${i === tutorialStep ? " active" : ""}"></div>`
    ).join("");

    const prevBtn = document.getElementById("tutorialPrev");
    const nextBtn = document.getElementById("tutorialNext");
    prevBtn.style.visibility = tutorialStep === 0 ? "hidden" : "visible";
    nextBtn.textContent = tutorialStep === TOTAL_STEPS - 1 ? "Got it!" : "Next";

    const chart = document.getElementById("tutorialChart");
    const content = document.getElementById("tutorialContent");

    const steps = [
        renderStepEmbedding1,
        renderStepEmbedding2,
        renderStepClusters,
        renderStepDistance,
        renderStepModes,
        renderStepReady,
    ];
    steps[tutorialStep](chart, content);
}

// ── Reference traces helper ─────────────────────────────────────────────────

function buildRefTraces(opts = {}) {
    const { showText = true, opacity = 0.6, legendOn = true } = opts;
    const cats = {};
    for (const p of TUTORIAL_POINTS) {
        if (!cats[p.category]) cats[p.category] = [];
        cats[p.category].push(p);
    }
    const traces = [];
    for (const [cat, pts] of Object.entries(cats)) {
        traces.push({
            x: pts.map((p) => p.x),
            y: pts.map((p) => p.y),
            mode: showText ? "markers+text" : "markers",
            type: "scatter",
            name: cat,
            text: pts.map((p) => p.word),
            textposition: "top center",
            textfont: { size: 9, color: CATEGORY_COLORS_TUT[cat] + "aa" },
            marker: { size: 8, color: CATEGORY_COLORS_TUT[cat], opacity },
            hovertemplate: "<b>%{text}</b><extra>" + cat + "</extra>",
            showlegend: legendOn,
        });
    }
    return traces;
}

function tutorialLayout(opts = {}) {
    const { legend = true } = opts;
    return {
        paper_bgcolor: "#141419",
        plot_bgcolor: "#141419",
        font: { color: "#888", size: 10 },
        xaxis: { showgrid: false, zeroline: false, showticklabels: false },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false },
        showlegend: legend,
        legend: { bgcolor: "rgba(0,0,0,0)", font: { size: 10 }, orientation: "h", x: 0.5, xanchor: "center", y: -0.02 },
        margin: { l: 5, r: 5, t: 5, b: legend ? 40 : 5 },
        dragmode: false,
    };
}

function plotChart(traces, layout) {
    Plotly.newPlot("tutorialChart", traces, layout, {
        responsive: true, scrollZoom: false, displayModeBar: false, staticPlot: true,
    });
}

// ── Step renderers ──────────────────────────────────────────────────────────

function renderStepEmbedding1(chart, content) {
    chart.style.display = "none";
    content.innerHTML = `
        <h3>What Are Text Embeddings?</h3>
        <p>AI models read words by converting them into lists of numbers called <strong style="color:#5b5bf0">embeddings</strong>.</p>
        <p>Each word becomes a point in a high-dimensional space (384 dimensions in this game).</p>
        <div class="tutorial-embed-example">
            <div class="tutorial-embed-word">"cat"</div>
            <div class="tutorial-embed-arrow">→</div>
            <div class="tutorial-embed-vec">[0.23, -0.81, 0.44, 0.12, ...]</div>
        </div>
        <div class="tutorial-embed-example">
            <div class="tutorial-embed-word">"dog"</div>
            <div class="tutorial-embed-arrow">→</div>
            <div class="tutorial-embed-vec">[0.21, -0.79, 0.41, 0.15, ...]</div>
        </div>
        <p style="color:#666; font-size:12px; margin-top:8px;">Notice how similar words get similar numbers.</p>
    `;
}

function renderStepEmbedding2(chart, content) {
    chart.style.display = "none";
    content.innerHTML = `
        <h3>Why Does This Matter?</h3>
        <p>These numbers capture <strong style="color:#5b5bf0">meaning</strong>. Words that are used in similar contexts end up with similar embeddings.</p>
        <p>This means we can measure how "far apart" two concepts are — not by spelling, but by <strong style="color:#5b5bf0">meaning</strong>.</p>
        <div class="tutorial-pairs">
            <div class="tutorial-pair close">
                <span>"cat" ↔ "dog"</span>
                <span class="tutorial-pair-label">close — both pets</span>
            </div>
            <div class="tutorial-pair far">
                <span>"cat" ↔ "algorithm"</span>
                <span class="tutorial-pair-label">far — unrelated concepts</span>
            </div>
        </div>
    `;
}

function renderStepClusters(chart, content) {
    content.innerHTML = `
        <h3>Words Form Clusters</h3>
        <p>When we project the 384 dimensions down to 2D, you can see similar words cluster together.</p>
    `;
    chart.style.display = "block";
    plotChart(buildRefTraces(), tutorialLayout());
}

function renderStepDistance(chart, content) {
    content.innerHTML = `
        <h3>Distance = Meaning Difference</h3>
        <p>
            <strong style="color:#5bf09b">"cat" ↔ "dog" = 0.34</strong> — close in meaning<br>
            <strong style="color:#f05b7a">"cat" ↔ "algorithm" = 0.78</strong> — very different
        </p>
        <p style="color:#666; font-size:12px;">Distance ranges from 0 (identical) to ~1 (unrelated).</p>
    `;
    chart.style.display = "block";

    const traces = buildRefTraces({ showText: false, opacity: 0.15, legendOn: false });
    const ex = TUTORIAL_EXAMPLES;

    traces.push({
        x: [ex.cat.x, ex.dog.x, ex.algorithm.x],
        y: [ex.cat.y, ex.dog.y, ex.algorithm.y],
        mode: "markers+text",
        type: "scatter",
        text: ["cat", "dog", "algorithm"],
        textposition: ["bottom center", "top center", "top center"],
        textfont: { size: 13, color: "#fff" },
        marker: { size: 16, color: "#fff", symbol: "diamond", line: { width: 2, color: "#5b5bf0" } },
        hoverinfo: "skip",
        showlegend: false,
    });

    traces.push({
        x: [ex.cat.x, ex.dog.x], y: [ex.cat.y, ex.dog.y],
        mode: "lines", type: "scatter",
        line: { color: "#5bf09b", width: 2.5, dash: "dash" },
        showlegend: false, hoverinfo: "skip",
    });

    traces.push({
        x: [ex.cat.x, ex.algorithm.x], y: [ex.cat.y, ex.algorithm.y],
        mode: "lines", type: "scatter",
        line: { color: "#f05b7a", width: 2.5, dash: "dash" },
        showlegend: false, hoverinfo: "skip",
    });

    const layout = tutorialLayout({ legend: false });
    layout.annotations = [
        {
            x: (ex.cat.x + ex.dog.x) / 2, y: (ex.cat.y + ex.dog.y) / 2,
            text: "<b>0.34</b>", showarrow: false,
            font: { size: 14, color: "#5bf09b" }, bgcolor: "#141419ee", borderpad: 4,
        },
        {
            x: (ex.cat.x + ex.algorithm.x) / 2, y: (ex.cat.y + ex.algorithm.y) / 2,
            text: "<b>0.78</b>", showarrow: false,
            font: { size: 14, color: "#f05b7a" }, bgcolor: "#141419ee", borderpad: 4,
        },
    ];

    plotChart(traces, layout);
}

function renderStepModes(chart, content) {
    chart.style.display = "none";
    content.innerHTML = `
        <h3>Game Modes</h3>
        <div class="tutorial-modes">
            ${TUTORIAL_MODES.map((m) => `
                <div class="tutorial-mode-row">
                    <div class="tutorial-mode-dot" style="background:${m.color}"></div>
                    <div>
                        <div class="tutorial-mode-name">${m.name}</div>
                        <div class="tutorial-mode-rule">${m.rule}</div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderStepReady(chart, content) {
    chart.style.display = "none";
    content.innerHTML = `
        <h3>Ready to Play!</h3>
        <p>Create or join a room, type your word before time runs out, and see where it lands on the map.</p>
        <p style="color:#555; font-size:13px; margin-top:8px;">After each round you'll see a visualization of everyone's answers plotted in embedding space.</p>
    `;
}

// Auto-show on first visit
if (!localStorage.getItem("tutorial_seen")) {
    document.addEventListener("DOMContentLoaded", () => openTutorial());
}
