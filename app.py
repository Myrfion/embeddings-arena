import random
import socket
import string
import threading
import time

import numpy as np
import umap
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
app.config["SECRET_KEY"] = "worddistance"
socketio = SocketIO(app, cors_allowed_origins="*")

# ── Embedding model ──────────────────────────────────────────────────────────

print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")
print("Model loaded.")

REFERENCE_WORDS = {
    "animals": [
        "cat", "dog", "bird", "fish", "lion", "eagle", "whale", "snake",
        "horse", "rabbit", "elephant", "shark", "wolf", "bear", "deer",
    ],
    "colors": [
        "red", "blue", "green", "yellow", "purple", "orange", "black", "white",
    ],
    "emotions": [
        "happy", "sad", "angry", "fear", "love", "hate", "joy", "anxiety",
        "calm", "excited",
    ],
    "food": [
        "apple", "bread", "rice", "meat", "cheese", "banana", "pizza", "soup",
        "cake", "milk",
    ],
    "technology": [
        "computer", "software", "internet", "robot", "phone", "code",
        "algorithm", "database",
    ],
    "nature": [
        "tree", "river", "mountain", "ocean", "forest", "desert", "rain",
        "snow", "sun", "moon",
    ],
    "actions": [
        "run", "think", "write", "speak", "build", "destroy", "create",
        "dance", "sing", "sleep",
    ],
    "people": [
        "king", "queen", "doctor", "teacher", "child", "soldier", "artist",
        "scientist",
    ],
}

ref_words = []
ref_categories = []
ref_word_to_cat = {}
for category, words in REFERENCE_WORDS.items():
    for word in words:
        ref_words.append(word)
        ref_categories.append(category)
        ref_word_to_cat[word] = category

print("Computing reference embeddings...")
ref_embeddings = model.encode(ref_words)
print(f"Computed embeddings for {len(ref_words)} reference words.")

print("Warming up UMAP (JIT compilation)...")
import umap
_warmup_reducer = umap.UMAP(n_components=2, n_neighbors=5, min_dist=0.1, random_state=42)
_warmup_reducer.fit_transform(ref_embeddings[:10])
print("UMAP ready.")

TARGET_POOL = list(ref_words)
ALL_MODES = ["furthest", "closest", "midpoint", "bullseye", "blind", "double_down"]

ROUND_DURATION = 20
COUNTDOWN_DURATION = 5


def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── Room state ───────────────────────────────────────────────────────────────

rooms = {}          # {code: {players, game}}
sid_to_room = {}    # {sid: code}


def generate_room_code():
    chars = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = "".join(random.choices(chars, k=5))
        if code not in rooms:
            return code
    return "".join(random.choices(chars, k=6))


def new_game_state():
    return {
        "state": "lobby",
        "round_num": 0,
        "total_rounds": 7,
        "round_type": "furthest",
        "round_queue": [],
        "target_word": None,
        "target_embedding": None,
        "target_word2": None,
        "target_embedding2": None,
        "target_category": None,
        "bullseye_target": None,
        "answers": {},
        "used_words": [],
        "config": {},
    }


def broadcast_players(code):
    room = rooms.get(code)
    if not room:
        return
    player_list = [
        {"name": p["name"], "score": p["score"]}
        for p in room["players"].values()
    ]
    player_list.sort(key=lambda x: -x["score"])
    socketio.emit("players_update", player_list, to=code)


def pick_target(code):
    game = rooms[code]["game"]
    available = [w for w in TARGET_POOL if w not in game["used_words"]]
    if not available:
        game["used_words"] = []
        available = TARGET_POOL
    target = random.choice(available)
    game["used_words"].append(target)
    return target


def start_countdown(code):
    room = rooms.get(code)
    if not room:
        return
    game = room["game"]

    if not game["round_queue"]:
        end_game(code)
        return

    game["state"] = "countdown"
    round_type = game["round_queue"][0]

    socketio.emit("countdown_start", {
        "duration": COUNTDOWN_DURATION,
        "round_num": game["round_num"] + 1,
        "total_rounds": game["total_rounds"],
        "round_type": round_type,
    }, to=code)

    timer = threading.Timer(COUNTDOWN_DURATION, start_round, args=[code])
    timer.daemon = True
    timer.start()


def start_round(code):
    room = rooms.get(code)
    if not room:
        return
    game = room["game"]

    if not game["round_queue"]:
        end_game(code)
        return

    game["state"] = "playing"
    game["round_num"] += 1
    game["answers"] = {}
    game["target_word2"] = None
    game["target_embedding2"] = None
    game["target_category"] = None
    game["bullseye_target"] = None

    round_type = game["round_queue"].pop(0)
    game["round_type"] = round_type

    target = pick_target(code)
    game["target_word"] = target
    game["target_embedding"] = model.encode([target])[0]

    round_duration = game["config"].get("round_duration", ROUND_DURATION)

    emit_data = {
        "round_num": game["round_num"],
        "total_rounds": game["total_rounds"],
        "round_type": round_type,
        "target_word": target,
        "duration": round_duration,
    }

    if round_type == "blind":
        game["target_category"] = ref_word_to_cat.get(target, "unknown")
        emit_data["target_word"] = "???"
        emit_data["target_category"] = game["target_category"]

    if round_type in ("midpoint", "double_down"):
        target2 = pick_target(code)
        game["target_word2"] = target2
        game["target_embedding2"] = model.encode([target2])[0]
        emit_data["target_word2"] = target2

    if round_type == "bullseye":
        bullseye = round(random.uniform(0.2, 0.6), 2)
        game["bullseye_target"] = bullseye
        emit_data["bullseye_target"] = bullseye

    socketio.emit("round_start", emit_data, to=code)

    timer = threading.Timer(round_duration, end_round, args=[code])
    timer.daemon = True
    timer.start()


def end_round(code):
    import time
    t_start = time.time()

    room = rooms.get(code)
    if not room:
        return
    game = room["game"]
    players = room["players"]

    game["state"] = "results"
    round_type = game["round_type"]
    higher_is_better = round_type in ("furthest", "blind", "double_down")

    socketio.emit("calculating", to=code)

    results = []
    answer_words = []
    answer_sids = []

    for sid, word in game["answers"].items():
        if sid in players:
            answer_words.append(word)
            answer_sids.append(sid)

    t_embed = time.time()
    if answer_words:
        answer_embeddings = model.encode(answer_words)
    else:
        answer_embeddings = []
    print(f"[Room {code}] Embedding {len(answer_words)} words: {time.time() - t_embed:.3f}s")

    for i, sid in enumerate(answer_sids):
        word = game["answers"][sid]
        emb = answer_embeddings[i]
        dist = 1.0 - cosine_similarity(game["target_embedding"], emb)

        if round_type == "closest":
            if word.lower() == game["target_word"].lower():
                score = 999.0
            else:
                score = dist

        elif round_type == "midpoint":
            dist2 = 1.0 - cosine_similarity(game["target_embedding2"], emb)
            score = round(abs(dist - dist2), 4)

        elif round_type == "bullseye":
            score = round(abs(dist - game["bullseye_target"]), 4)

        elif round_type == "double_down":
            dist2 = 1.0 - cosine_similarity(game["target_embedding2"], emb)
            score = min(dist, dist2)

        else:  # furthest, blind
            score = dist

        results.append({
            "sid": sid,
            "name": players[sid]["name"],
            "word": word,
            "distance": round(dist, 4),
            "score": round(score, 4),
        })

    for sid, p in players.items():
        if sid not in game["answers"]:
            worst = 0.0 if higher_is_better else 999.0
            results.append({
                "sid": sid,
                "name": p["name"],
                "word": None,
                "distance": 0.0,
                "score": worst,
            })

    if higher_is_better:
        results.sort(key=lambda x: -x["score"])
    else:
        results.sort(key=lambda x: x["score"])

    for i, r in enumerate(results):
        r["rank"] = i + 1

    if results and results[0]["word"] is not None and results[0]["score"] != 999.0:
        best = results[0]["score"]
        winners = [r for r in results if r["score"] == best and r["word"] is not None]
        for w in winners:
            players[w["sid"]]["score"] += 1
        winner_names = [w["name"] for w in winners]
    else:
        winner_names = []

    t_viz = time.time()
    viz_data = build_viz(code, answer_words, answer_embeddings if len(answer_words) > 0 else [])
    print(f"[Room {code}] UMAP visualization: {time.time() - t_viz:.3f}s")

    clean_results = [
        {"name": r["name"], "word": r["word"], "distance": r["distance"],
         "score": r["score"], "rank": r["rank"]}
        for r in results
    ]

    rounds_remaining = len(game["round_queue"])

    socketio.emit("round_end", {
        "results": clean_results,
        "winners": winner_names,
        "round_num": game["round_num"],
        "total_rounds": game["total_rounds"],
        "round_type": round_type,
        "target_word": game["target_word"],
        "target_word2": game.get("target_word2"),
        "bullseye_target": game.get("bullseye_target"),
        "target_category": game.get("target_category"),
        "viz_data": viz_data,
        "is_last_round": rounds_remaining == 0,
    }, to=code)
    print(f"[Room {code}] Round {game['round_num']} total: {time.time() - t_start:.3f}s")
    broadcast_players(code)


def end_game(code):
    room = rooms.get(code)
    if not room:
        return
    room["game"]["state"] = "game_over"
    final_scores = [
        {"name": p["name"], "score": p["score"]}
        for p in room["players"].values()
    ]
    final_scores.sort(key=lambda x: -x["score"])
    winner = final_scores[0]["name"] if final_scores else "Nobody"
    socketio.emit("game_over", {"final_scores": final_scores, "winner": winner}, to=code)


def build_viz(code, answer_words, answer_embeddings):
    game = rooms[code]["game"]
    target_emb = game["target_embedding"].reshape(1, -1)
    all_emb = [ref_embeddings, target_emb]
    all_words_list = list(ref_words) + [game["target_word"]]
    all_cats = list(ref_categories) + ["target"]

    if game["target_word2"] and game["target_embedding2"] is not None:
        all_emb.append(game["target_embedding2"].reshape(1, -1))
        all_words_list.append(game["target_word2"])
        all_cats.append("target")

    if len(answer_words) > 0:
        all_emb.append(np.array(answer_embeddings))
        all_words_list.extend(answer_words)
        all_cats.extend(["answer"] * len(answer_words))

    combined = np.vstack(all_emb)
    reducer = umap.UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
    proj = reducer.fit_transform(combined)

    points = []
    for i, word in enumerate(all_words_list):
        points.append({
            "word": word,
            "category": all_cats[i],
            "x": float(proj[i, 0]),
            "y": float(proj[i, 1]),
        })
    return points


# ── SocketIO events ──────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    code = sid_to_room.pop(sid, None)
    if code and code in rooms:
        room = rooms[code]
        room["players"].pop(sid, None)
        if not room["players"]:
            del rooms[code]
        else:
            broadcast_players(code)


@socketio.on("create_room")
def on_create_room(data):
    name = data.get("name", "").strip()
    if not name:
        emit("game_error", {"msg": "Name is required"})
        return
    code = generate_room_code()
    rooms[code] = {"players": {}, "game": new_game_state()}
    rooms[code]["players"][request.sid] = {"name": name, "score": 0}
    sid_to_room[request.sid] = code
    join_room(code)
    emit("room_created", {"code": code})
    broadcast_players(code)


@socketio.on("join_room_request")
def on_join_room_request(data):
    name = data.get("name", "").strip()
    code = data.get("code", "").strip().upper()
    if not name:
        emit("game_error", {"msg": "Name is required"})
        return
    if code not in rooms:
        emit("game_error", {"msg": f"Room {code} not found"})
        return
    room = rooms[code]
    room["players"][request.sid] = {"name": name, "score": 0}
    sid_to_room[request.sid] = code
    join_room(code)
    emit("room_joined", {"code": code})
    broadcast_players(code)

    # If game already in progress, catch them up
    game = room["game"]
    if game["state"] == "playing":
        emit_data = {
            "round_num": game["round_num"],
            "total_rounds": game["total_rounds"],
            "round_type": game["round_type"],
            "target_word": "???" if game["round_type"] == "blind" else game["target_word"],
            "duration": game["config"].get("round_duration", ROUND_DURATION),
        }
        if game["target_category"]:
            emit_data["target_category"] = game["target_category"]
        if game["target_word2"]:
            emit_data["target_word2"] = game["target_word2"]
        if game["bullseye_target"] is not None:
            emit_data["bullseye_target"] = game["bullseye_target"]
        emit("round_start", emit_data)


@socketio.on("start_game")
def on_start_game(data=None):
    code = sid_to_room.get(request.sid)
    if not code or code not in rooms:
        return
    room = rooms[code]
    game = room["game"]

    if game["state"] not in ("lobby", "game_over", "results"):
        emit("game_error", {"msg": "Game already in progress"})
        return
    if len(room["players"]) < 1:
        emit("game_error", {"msg": "Need at least 1 player"})
        return

    data = data or {}
    modes = data.get("modes", ALL_MODES)
    modes = [m for m in modes if m in ALL_MODES]
    if not modes:
        modes = ["furthest"]
    total_rounds = max(1, min(30, data.get("total_rounds", 7)))
    round_duration = max(5, min(60, data.get("round_duration", ROUND_DURATION)))

    # Build shuffled queue: distribute modes evenly across total_rounds
    queue = []
    while len(queue) < total_rounds:
        batch = list(modes)
        random.shuffle(batch)
        queue.extend(batch)
    queue = queue[:total_rounds]

    game.update(new_game_state())
    game["config"] = {"round_duration": round_duration}
    game["round_queue"] = queue
    game["total_rounds"] = total_rounds

    for p in room["players"].values():
        p["score"] = 0
    broadcast_players(code)
    start_countdown(code)


@socketio.on("next_round")
def on_next_round():
    code = sid_to_room.get(request.sid)
    if not code or code not in rooms:
        return
    game = rooms[code]["game"]
    if game["state"] != "results":
        return
    if not game["round_queue"]:
        end_game(code)
    else:
        start_countdown(code)


@socketio.on("submit_answer")
def on_submit_answer(data):
    code = sid_to_room.get(request.sid)
    if not code or code not in rooms:
        return
    game = rooms[code]["game"]
    if game["state"] != "playing":
        return
    word = data.get("word", "").strip().lower()
    if not word:
        return
    game["answers"][request.sid] = word
    emit("answer_confirmed", {"word": word})


# ── HTTP routes ──────────────────────────────────────────────────────────────

@app.route("/")
def game_page():
    return render_template("game.html")


@app.route("/compare")
def compare_page():
    return render_template("index.html")


@app.route("/api/embed", methods=["POST"])
def embed():
    data = request.get_json()
    word1 = data.get("word1", "").strip()
    word2 = data.get("word2", "").strip()

    if not word1 or not word2:
        return jsonify({"error": "Both words are required"}), 400

    input_embeddings = model.encode([word1, word2])
    similarity = cosine_similarity(input_embeddings[0], input_embeddings[1])
    distance = 1.0 - similarity

    all_embeddings = np.vstack([ref_embeddings, input_embeddings])
    all_words = ref_words + [word1, word2]
    all_categories = ref_categories + ["input", "input"]

    reducer_2d = umap.UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
    proj_2d = reducer_2d.fit_transform(all_embeddings)

    reducer_3d = umap.UMAP(n_components=3, random_state=42, n_neighbors=15, min_dist=0.1)
    proj_3d = reducer_3d.fit_transform(all_embeddings)

    points = []
    for i, word in enumerate(all_words):
        points.append({
            "word": word,
            "category": all_categories[i],
            "x2d": float(proj_2d[i, 0]),
            "y2d": float(proj_2d[i, 1]),
            "x3d": float(proj_3d[i, 0]),
            "y3d": float(proj_3d[i, 1]),
            "z3d": float(proj_3d[i, 2]),
        })

    return jsonify({
        "similarity": round(similarity, 4),
        "distance": round(distance, 4),
        "points": points,
        "input_words": [word1, word2],
    })


if __name__ == "__main__":
    local_ip = get_local_ip()
    print(f"\n{'='*50}")
    print(f"  Word Distance Game")
    print(f"  Open on your phone: http://{local_ip}:5001")
    print(f"  Compare tool:       http://{local_ip}:5001/compare")
    print(f"{'='*50}\n")
    socketio.run(app, host="0.0.0.0", port=5001, debug=False, allow_unsafe_werkzeug=True)
