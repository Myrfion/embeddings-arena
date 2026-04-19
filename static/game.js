const socket = io();

let roomCode = null;
let timerInterval = null;
let countdownInterval = null;

// Mode definitions
const MODES = [
    { id: "furthest", name: "Furthest", color: "#f05b7a", desc: "Get far" },
    { id: "closest", name: "Closest", color: "#5bf09b", desc: "Get close" },
    { id: "midpoint", name: "Midpoint", color: "#c05bf0", desc: "Between two" },
    { id: "bullseye", name: "Bullseye", color: "#f0e05b", desc: "Hit exact dist" },
    { id: "blind", name: "Blind", color: "#f0a05b", desc: "Category only" },
    { id: "double_down", name: "Double Down", color: "#5ba0f0", desc: "Far from both" },
];

const modeEnabled = {};
MODES.forEach((m) => (modeEnabled[m.id] = true));

let totalRounds = 7;
let roundTime = 20;

// ── View management ─────────────────────────────────────────────────────────

function showView(id) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

// ── Home ────────────────────────────────────────────────────────────────────

document.getElementById("createNameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createGame();
});

document.getElementById("joinCodeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinGame();
});

function createGame() {
    const name = document.getElementById("createNameInput").value.trim();
    if (!name) return;
    socket.emit("create_room", { name });
}

function joinGame() {
    const name = document.getElementById("joinNameInput").value.trim();
    const code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
    if (!name || !code) return;
    socket.emit("join_room_request", { name, code });
}

function copyCode() {
    if (roomCode) {
        navigator.clipboard.writeText(roomCode).catch(() => {});
    }
}

// ── Lobby / Config ──────────────────────────────────────────────────────────

function buildModeToggles() {
    const container = document.getElementById("modeToggles");
    container.innerHTML = MODES.map(
        (m) =>
            `<div class="mode-row">
                <div class="mode-info">
                    <div class="mode-dot" style="background:${m.color}"></div>
                    <span class="mode-name">${m.name}</span>
                    <span class="mode-desc">${m.desc}</span>
                </div>
                <div class="toggle on" id="toggle-${m.id}" onclick="toggleMode('${m.id}')"></div>
            </div>`
    ).join("");
}

function toggleMode(id) {
    modeEnabled[id] = !modeEnabled[id];
    const el = document.getElementById("toggle-" + id);
    el.classList.toggle("on", modeEnabled[id]);
}

function adjustRounds(delta) {
    totalRounds = Math.max(1, Math.min(30, totalRounds + delta));
    document.getElementById("totalRoundsVal").textContent = totalRounds;
}

function adjustTime(delta) {
    roundTime = Math.max(5, Math.min(60, roundTime + delta));
    document.getElementById("roundTimeVal").textContent = roundTime;
}

buildModeToggles();

function startGame() {
    const modes = MODES.filter((m) => modeEnabled[m.id]).map((m) => m.id);
    if (modes.length === 0) {
        alert("Enable at least 1 mode");
        return;
    }
    socket.emit("start_game", {
        modes,
        total_rounds: totalRounds,
        round_duration: roundTime,
    });
}

function playAgain() {
    showView("lobby");
}

function nextRound() {
    socket.emit("next_round");
}

// ── Playing ─────────────────────────────────────────────────────────────────

document.getElementById("answerInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAnswer();
});

function submitAnswer() {
    const word = document.getElementById("answerInput").value.trim();
    if (!word) return;
    socket.emit("submit_answer", { word });
}

function startTimer(duration) {
    clearInterval(timerInterval);
    let remaining = duration;
    const el = document.getElementById("timer");
    el.textContent = remaining;
    el.classList.remove("urgent");

    timerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            remaining = 0;
            clearInterval(timerInterval);
        }
        el.textContent = remaining;
        if (remaining <= 5) el.classList.add("urgent");
    }, 1000);
}

// ── Socket events ───────────────────────────────────────────────────────────

socket.on("room_created", (data) => {
    roomCode = data.code;
    document.getElementById("roomCode").textContent = roomCode;
    showView("lobby");
});

socket.on("room_joined", (data) => {
    roomCode = data.code;
    document.getElementById("roomCode").textContent = roomCode;
    showView("lobby");
});

socket.on("players_update", (players) => {
    const lobbyEl = document.getElementById("lobbyPlayers");
    if (players.length > 0) {
        lobbyEl.innerHTML =
            '<h3>Players</h3>' +
            players
                .map(
                    (p) =>
                        `<div class="player-item"><span class="player-name">${esc(p.name)}</span><span class="player-score">${p.score}</span></div>`
                )
                .join("");
    } else {
        lobbyEl.innerHTML = "";
    }

    const sb = document.getElementById("scoreboard");
    if (players.length > 0) {
        sb.innerHTML =
            '<h3>Scoreboard</h3>' +
            players
                .map(
                    (p) =>
                        `<div class="player-item"><span class="player-name">${esc(p.name)}</span><span class="player-score">${p.score} pts</span></div>`
                )
                .join("");
    }
});

const ROUND_CONFIG = {
    furthest: {
        label: "get far from",
        instruction: "Type a word as FAR as possible from the target",
        color: "#f05b7a",
    },
    closest: {
        label: "get close to",
        instruction: "Type a word as CLOSE as possible (not the same word!)",
        color: "#5bf09b",
    },
    midpoint: {
        label: "find the middle of",
        instruction: "Type a word equally distant from both words",
        color: "#c05bf0",
    },
    bullseye: {
        label: "hit the target distance from",
        instruction: "Type a word at EXACTLY the target distance",
        color: "#f0e05b",
    },
    blind: {
        label: "get far from the hidden word",
        instruction: "You only see the category \u2014 guess what's far!",
        color: "#f0a05b",
    },
    double_down: {
        label: "get far from both",
        instruction: "Maximize your minimum distance from either word",
        color: "#5ba0f0",
    },
};

socket.on("countdown_start", (data) => {
    showView("countdown");
    clearInterval(countdownInterval);

    document.getElementById("cdRoundNum").textContent = data.round_num;
    document.getElementById("cdRoundTotal").textContent = data.total_rounds || "?";
    const badge = document.getElementById("cdRoundType");
    badge.textContent = (data.round_type || "").toUpperCase().replace("_", " ");
    badge.className = "round-type-badge " + (data.round_type || "furthest");

    let remaining = data.duration;
    const el = document.getElementById("countdownNum");
    el.textContent = remaining;

    countdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            el.textContent = "GO!";
        } else {
            el.textContent = remaining;
        }
    }, 1000);
});

socket.on("round_start", (data) => {
    showView("playing");
    const rt = data.round_type || "furthest";
    const cfg = ROUND_CONFIG[rt];

    document.getElementById("roundNum").textContent = data.round_num;
    document.getElementById("roundTotal").textContent = data.total_rounds || "?";

    const badge = document.getElementById("roundType");
    badge.textContent = rt.toUpperCase().replace("_", " ");
    badge.className = "round-type-badge " + rt;

    document.getElementById("targetLabel").textContent = cfg.label;
    const tw = document.getElementById("targetWord");
    tw.style.color = cfg.color;
    tw.textContent = data.target_word;
    document.getElementById("instruction").textContent = cfg.instruction;

    // Second target word (midpoint, double_down)
    const amp = document.getElementById("targetAmp");
    const tw2 = document.getElementById("targetWord2");
    if ((rt === "midpoint" || rt === "double_down") && data.target_word2) {
        amp.style.display = "block";
        tw2.textContent = data.target_word2;
        tw2.style.display = "block";
    } else {
        amp.style.display = "none";
        tw2.style.display = "none";
    }

    // Blind: show category
    const bc = document.getElementById("blindCategory");
    if (rt === "blind" && data.target_category) {
        bc.textContent = `Category: ${data.target_category}`;
        bc.style.display = "block";
    } else {
        bc.style.display = "none";
    }

    // Bullseye: target distance
    const bInfo = document.getElementById("bullseyeInfo");
    if (rt === "bullseye" && data.bullseye_target != null) {
        document.getElementById("bullseyeTarget").textContent = data.bullseye_target.toFixed(2);
        bInfo.style.display = "block";
    } else {
        bInfo.style.display = "none";
    }

    document.getElementById("answerInput").value = "";
    document.getElementById("submittedWord").textContent = "";
    startTimer(data.duration);
    setTimeout(() => document.getElementById("answerInput").focus(), 100);
});

socket.on("answer_confirmed", (data) => {
    document.getElementById("submittedWord").textContent = `Submitted: ${data.word}`;
});

socket.on("round_end", (data) => {
    clearInterval(timerInterval);
    showView("results");

    const rt = data.round_type || "furthest";
    document.getElementById("resultRoundNum").textContent = data.round_num;
    document.getElementById("resultRoundTotal").textContent = data.total_rounds || "?";

    // Blind mode: reveal the word
    const reveal = document.getElementById("revealWord");
    if (rt === "blind" && data.target_word) {
        reveal.textContent = `The hidden word was: ${data.target_word}`;
        reveal.style.display = "block";
    } else {
        reveal.style.display = "none";
    }

    // Winner banner
    const banner = document.getElementById("winnerBanner");
    if (data.winners && data.winners.length > 0) {
        banner.textContent = data.winners.join(" & ") + " wins!";
    } else {
        banner.textContent = "No answers this round";
    }

    // Score display per type
    function scoreLabel(r) {
        if (!r.word) return "";
        if (r.score === 999) return "invalid";
        if (rt === "midpoint") return "\u0394 " + r.score.toFixed(4);
        if (rt === "bullseye") return "\u0394 " + r.score.toFixed(4);
        return r.distance.toFixed(4);
    }

    // Results table
    const table = document.getElementById("resultsTable");
    table.innerHTML = data.results
        .map(
            (r) =>
                `<div class="result-row${r.rank === 1 && r.word && r.score !== 999 ? " winner" : ""}">
                    <div class="result-rank">${r.rank}</div>
                    <div class="result-info">
                        <div class="result-name">${esc(r.name)}</div>
                        <div class="result-word">${r.word ? `"${esc(r.word)}"` : "<em>no answer</em>"}</div>
                    </div>
                    <div class="result-distance">${scoreLabel(r)}</div>
                </div>`
        )
        .join("");

    // Render visualization
    renderViz(data.viz_data, data.results);

    // Next round button text
    const nextBtn = document.getElementById("nextRoundBtn");
    if (data.is_last_round) {
        nextBtn.textContent = "See Final Results";
    } else {
        nextBtn.textContent = "Next Round";
    }
});

socket.on("game_over", (data) => {
    clearInterval(timerInterval);
    showView("gameOver");

    document.getElementById("gameOverWinner").textContent = `${data.winner} wins!`;

    const scores = document.getElementById("finalScores");
    scores.innerHTML = data.final_scores
        .map(
            (s) =>
                `<div class="final-score-row">
                    <span class="final-score-name">${esc(s.name)}</span>
                    <span class="final-score-pts">${s.score} pts</span>
                </div>`
        )
        .join("");
});

socket.on("game_error", (data) => {
    alert(data.msg);
});

// ── Visualization ───────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
    animals: "#f0a05b",
    colors: "#c05bf0",
    emotions: "#f05b7a",
    food: "#5bf09b",
    technology: "#5ba0f0",
    nature: "#7af05b",
    actions: "#f0e05b",
    people: "#f0905b",
    target: "#ff3355",
    answer: "#ffffff",
};

function renderViz(points, results) {
    if (!points || points.length === 0) return;

    const refPts = points.filter((p) => !["target", "answer"].includes(p.category));
    const targetPts = points.filter((p) => p.category === "target");
    const answerPts = points.filter((p) => p.category === "answer");

    // Compute zoom bounds from target + answer points
    const focusPts = [...targetPts, ...answerPts];
    let xRange = null;
    let yRange = null;
    if (focusPts.length > 0) {
        const xs = focusPts.map((p) => p.x);
        const ys = focusPts.map((p) => p.y);
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const xPad = Math.max((xMax - xMin) * 0.3, 1);
        const yPad = Math.max((yMax - yMin) * 0.3, 1);
        xRange = [xMin - xPad, xMax + xPad];
        yRange = [yMin - yPad, yMax + yPad];
    }

    const cats = {};
    for (const p of refPts) {
        if (!cats[p.category]) cats[p.category] = [];
        cats[p.category].push(p);
    }

    const traces = [];

    for (const [cat, pts] of Object.entries(cats)) {
        traces.push({
            x: pts.map((p) => p.x),
            y: pts.map((p) => p.y),
            mode: "markers",
            type: "scatter",
            name: cat,
            text: pts.map((p) => p.word),
            marker: { size: 5, color: CATEGORY_COLORS[cat], opacity: 0.2 },
            hovertemplate: "<b>%{text}</b><extra>" + cat + "</extra>",
            showlegend: false,
        });
    }

    // Target word(s)
    if (targetPts.length > 0) {
        traces.push({
            x: targetPts.map((p) => p.x),
            y: targetPts.map((p) => p.y),
            mode: "markers+text",
            type: "scatter",
            name: "target",
            text: targetPts.map((p) => p.word),
            textposition: "bottom center",
            textfont: { size: 13, color: "#ff3355" },
            marker: { size: 16, color: "#ff3355", symbol: "star" },
            hovertemplate: "<b>%{text}</b><br>(target)<extra></extra>",
        });
    }

    if (answerPts.length > 0) {
        const answerLabels = answerPts.map((p) => {
            const match = results.find((r) => r.word === p.word);
            return match ? `${match.name}: ${p.word}` : p.word;
        });

        traces.push({
            x: answerPts.map((p) => p.x),
            y: answerPts.map((p) => p.y),
            mode: "markers+text",
            type: "scatter",
            name: "answers",
            text: answerLabels,
            textposition: "top center",
            textfont: { size: 11, color: "#fff" },
            marker: {
                size: 12,
                color: "#fff",
                symbol: "diamond",
                line: { width: 2, color: "#5b5bf0" },
            },
            hovertemplate: "<b>%{text}</b><extra></extra>",
        });

        for (const tp of targetPts) {
            for (const ap of answerPts) {
                traces.push({
                    x: [tp.x, ap.x],
                    y: [tp.y, ap.y],
                    mode: "lines",
                    type: "scatter",
                    line: { color: "#5b5bf044", width: 1, dash: "dot" },
                    showlegend: false,
                    hoverinfo: "skip",
                });
            }
        }
    }

    const layout = {
        paper_bgcolor: "#0a0a0f",
        plot_bgcolor: "#0a0a0f",
        font: { color: "#888" },
        xaxis: { showgrid: false, zeroline: false, showticklabels: false },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false },
        showlegend: false,
        margin: { l: 10, r: 10, t: 10, b: 10 },
        dragmode: "pan",
    };

    // Zoom to focus area
    if (xRange) {
        layout.xaxis.range = xRange;
        layout.yaxis.range = yRange;
    }

    Plotly.newPlot("resultChart", traces, layout, {
        responsive: true,
        scrollZoom: true,
        displayModeBar: false,
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}
