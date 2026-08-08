# ============================================================================
# BLOCK 1 OF 2: IMPORTS, MATRIX CONFIGURATION, AND TV INTERFACE ROUTINES
# ============================================================================

import asyncio
import json
import random
import os
import glob
import sys
import serial
from websockets.server import serve
from flask import Flask, Response, request

app = Flask(__name__)
connected_clients = set()

GRID_SIZE = 64
EMPTY = 0
TEAM_RED = 1
TEAM_BLUE = 2
TEAM_GREEN = 3
TEAM_YELLOW = 4
TEAM_MAGENTA = 5
TEAM_CYAN = 6

grid = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

history1 = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
history2 = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
history3 = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

stable_structure_map = [[False for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
structure_awarded_map = [[False for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

teams_config = {
    "1": {"color": "#ff3333", "name": "RED", "tag": "R"},
    "2": {"color": "#00aaff", "name": "BLUE", "tag": "B"},
    "3": {"color": "#33cc33", "name": "GREEN", "tag": "G"},
    "4": {"color": "#e6b800", "name": "YELLOW", "tag": "Y"},
    "5": {"color": "#ff00ff", "name": "MAGENTA", "tag": "M"},
    "6": {"color": "#00ffff", "name": "CYAN", "tag": "C"}
}

players = {}

def seed_initial_tv_matrix():
    global grid
    for _ in range(300):
        rx = random.randint(0, GRID_SIZE - 1)
        ry = random.randint(0, GRID_SIZE - 1)
        grid[rx][ry] = random.randint(1, 6)

seed_initial_tv_matrix()

@app.route('/tv')
def tv_dashboard():
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Cell Combat TV Dashboard</title>
        <style>
            body { background: #050505; color: white; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
            canvas { background: #000; border: 4px solid #222; box-shadow: 0 0 30px rgba(255,255,255,0.05); }
            #scoreboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 700px; margin-bottom: 15px; font-size: 20px; font-weight: bold; background: #111; padding: 15px; border-radius: 10px; border: 2px solid #222; text-align: center; }
        </style>
    </head>
    <body>
        <div id="scoreboard">
            <span style="color:#ff3333;">RED: <span id="s1">0000</span></span>
            <span style="color:#00aaff;">BLUE: <span id="s2">0000</span></span>
            <span style="color:#33cc33;">GREEN: <span id="s3">0000</span></span>
            <span style="color:#e6b800;">YELLOW: <span id="s4">0000</span></span>
            <span style="color:#ff00ff;">MAGENTA: <span id="s5">0000</span></span>
            <span style="color:#00ffff;">CYAN: <span id="s6">0000</span></span>
        </div>
        <canvas id="gameCanvas" width="700" height="700"></canvas>
        <script>
            let canvas = document.getElementById('gameCanvas');
            let ctx = canvas.getContext('2d');
            let ws = new WebSocket('ws://' + location.hostname + ':3001');
            ws.onmessage = (event) => {
                let data = JSON.parse(event.data);
                if (data.type === 'SYNC') {
                    document.getElementById('s1').innerText = String(data.scores["1"]).padStart(4, '0');
                    document.getElementById('s2').innerText = String(data.scores["2"]).padStart(4, '0');
                    document.getElementById('s3').innerText = String(data.scores["3"]).padStart(4, '0');
                    document.getElementById('s4').innerText = String(data.scores["4"]).padStart(4, '0');
                    document.getElementById('s5').innerText = String(data.scores["5"]).padStart(4, '0');
                    document.getElementById('s6').innerText = String(data.scores["6"]).padStart(4, '0');
                    
                    // VISUALIZER TRACER ENGINE: 
                    // Draws a semi-transparent black overlay mask instead of clearing the board.
                    // Lower values = longer trails. Higher values = shorter trails.
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.fillRect(0, 0, 700, 700);
                    
                    let scale = 700 / 64;
                    for (let x = 0; x < 64; x++) {
                        for (let y = 0; y < 64; y++) {
                            let val = data.grid[x][y];
                            if (val !== 0) {
                                if(val === 1) ctx.fillStyle = '#ff3333';
                                if(val === 2) ctx.fillStyle = '#00aaff';
                                if(val === 3) ctx.fillStyle = '#33cc33';
                                if(val === 4) ctx.fillStyle = '#e6b800';
                                if(val === 5) ctx.fillStyle = '#ff00ff';
                                if(val === 6) ctx.fillStyle = '#00ffff';
                                ctx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
                            }
                        }
                    }
                    for (let id in data.players) {
                        let p = data.players[id];
                        let conf = data.config[p.team];
                        ctx.strokeStyle = conf.color;
                        ctx.lineWidth = 3;
                        ctx.strokeRect(p.cursorX * scale, p.cursorY * scale, scale, scale);
                        ctx.fillStyle = conf.color;
                        ctx.font = "bold 12px monospace";
                        ctx.fillText(conf.tag, (p.cursorX * scale) - 2, (p.cursorY * scale) - 6);
                    }
                }
            };
        </script>
    </body>
    </html>
    """
    return Response(html_content, mimetype='text/html')

def spawn_blob_glider(x, y, team):
    global grid
    try:
        grid[x][y] = team
        grid[(x + 1) % GRID_SIZE][(y + 1) % GRID_SIZE] = team
        grid[(x + 2) % GRID_SIZE][(y + 1) % GRID_SIZE] = team
        grid[x][(y + 2) % GRID_SIZE] = team
        grid[(x + 1) % GRID_SIZE][(y + 2) % GRID_SIZE] = team
    except Exception:
        pass
# ============================================================================
# BLOCK 2 OF 2: SERIAL RUNTIME PARSING, PHYSICS ENGINE, AND SOCKET BROADCASTS
# ============================================================================

team_scores = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0}

def get_balanced_team(requested_team):
    counts = {str(i): 0 for i in range(1, 7)}
    for p in players.values():
        counts[str(p["team"])] += 1
    min_team = min(counts, key=counts.get)
    if counts[str(requested_team)] > counts[min_team]:
        return int(min_team)
    return int(requested_team)

def check_serial_input(ser):
    global grid, stable_structure_map, structure_awarded_map, players
    if ser and ser.in_waiting > 0:
        try:
            line = ser.readline().decode('utf-8').strip()
            parts = line.split(':')
            if len(parts) == 3:
                player_id = str(parts[0]).strip()
                team_req = str(parts[1]).strip()
                cmd = str(parts[2]).strip()
                
                if player_id not in players and cmd == 'JOIN':
                    assigned_team = get_balanced_team(team_req)
                    players[player_id] = {
                        "cursorX": random.randint(10, 50),
                        "cursorY": random.randint(10, 50),
                        "team": assigned_team
                    }
                
                if player_id in players:
                    p = players[player_id]
                    if cmd == 'UP':      p["cursorY"] = (p["cursorY"] - 1 + GRID_SIZE) % GRID_SIZE
                    elif cmd == 'DOWN':  p["cursorY"] = (p["cursorY"] + 1) % GRID_SIZE
                    elif cmd == 'LEFT':  p["cursorX"] = (p["cursorX"] - 1 + GRID_SIZE) % GRID_SIZE
                    elif cmd == 'RIGHT': p["cursorX"] = (p["cursorX"] + 1) % GRID_SIZE
                    elif cmd == 'FIRE':  spawn_blob_glider(p["cursorX"], p["cursorY"], p["team"])
                    elif cmd == 'ESC':
                        grid = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
                        stable_structure_map = [[False for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
                        structure_awarded_map = [[False for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
        except Exception:
            pass

def calculate_conway_generation():
    global grid, history1, history2, history3, stable_structure_map, structure_awarded_map, team_scores
    
    for x in range(GRID_SIZE):
        for y in range(GRID_SIZE):
            history3[x][y] = history2[x][y]
            history2[x][y] = history1[x][y]
            history1[x][y] = grid[x][y]

    next_grid = [[EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

    for x in range(GRID_SIZE):
        for y in range(GRID_SIZE):
            counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
            for i in range(-1, 2):
                for j in range(-1, 2):
                    if i == 0 and j == 0:
                        continue
                    nx = (x + i + GRID_SIZE) % GRID_SIZE
                    ny = (y + j + GRID_SIZE) % GRID_SIZE
                    val = grid[nx][ny]
                    if val != EMPTY:
                        counts[val] += 1
                        
            total = sum(counts.values())
            current = grid[x][y]
            
            if current != EMPTY:
                next_grid[x][y] = current if (total == 2 or total == 3) else EMPTY
            else:
                if total == 3:
                    max_team = max(counts, key=counts.get)
                    next_grid[x][y] = max_team
                    if grid[x][y] != EMPTY and grid[x][y] != max_team:
                        team_scores[str(max_team)] += 5
                else:
                    next_grid[x][y] = EMPTY

    for x in range(GRID_SIZE):
        for y in range(GRID_SIZE):
            current_cell = next_grid[x][y]
            is_stable_now = (current_cell != EMPTY) and (current_cell == history2[x][y] or current_cell == history3[x][y])

            if is_stable_now:
                stable_structure_map[x][y] = True
                if not structure_awarded_map[x][y]:
                    structure_awarded_map[x][y] = True
                    if str(current_cell) in team_scores:
                        team_scores[str(current_cell)] += 50
            else:
                stable_structure_map[x][y] = False
                if structure_awarded_map[x][y]:
                    structure_awarded_map[x][y] = False
                    original_owner = history1[x][y]
                    if current_cell != EMPTY and current_cell != original_owner:
                        if str(current_cell) in team_scores:
                            team_scores[str(current_cell)] += 100

    grid = next_grid

async def broadcast_sync(ser):
    if connected_clients:
        packet = json.dumps({
            "type": "SYNC", 
            "grid": grid, 
            "players": players, 
            "scores": team_scores,
            "config": teams_config
        })
        await asyncio.gather(*[client.send(packet) for client in connected_clients])
    
    if ser and players:
        try:
            sync_string = "HUD_SYNC:"
            for pID, p in players.items():
                score = team_scores.get(str(p["team"]), 0)
                sync_string += f"{pID}:{p['team']}:{p['cursorX']}:{p['cursorY']}:{score}\n"
            sync_string += "\0"
            ser.write(sync_string.encode('utf-8'))
        except Exception:
            pass

async def ws_handler(websocket):
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            pass  
    finally:
        connected_clients.remove(websocket)

async def main_game_loop():
    ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    ser = None
    if ports:
        try:
            ser = serial.Serial(ports[0], 115200, timeout=0.01)
            print(f"-> Successfully opened Bidirectional Link on: {ports[0]}")
        except Exception as e:
            print(f"Serial Connection Warning: {e}")

    async def run_simulation_intervals():
        while True:
            check_serial_input(ser)
            calculate_conway_generation()
            await broadcast_sync(ser)
            await asyncio.sleep(0.16)

    asyncio.create_task(run_simulation_intervals())

def start_servers():
    from threading import Thread
    print("=========================================")
    print("   Central Field Server Active!           ")
    print("  📺 TV Address: http://localhost:3000/tv ")
    print("=========================================")
    
    def run_flask():
        app.run(host='0.0.0.0', port=3000, debug=False, use_reloader=False)
        
    Thread(target=run_flask, daemon=True).start()

async def run_all():
    start_servers()
    async with serve(ws_handler, "0.0.0.0", 3001):
        await main_game_loop()
        await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(run_all())
    except KeyboardInterrupt:
        sys.exit(0)
