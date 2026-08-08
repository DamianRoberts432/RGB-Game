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
import socket
import time
from websockets.server import serve
from flask import Flask, Response, request

app = Flask(__name__)
connected_clients = set()

# High-density coordinate arena grid space footprint
GRID_SIZE = 128
EMPTY = 0
TEAM_RED = 1
TEAM_BLUE = 2
TEAM_GREEN = 3
TEAM_YELLOW = 4
TEAM_MAGENTA = 5
TEAM_CYAN = 6

# Core game state managed strictly as a flat hashing dictionary of coordinate pairs
# Formatted as {(x, y): team_id} to ensure 60 FPS sparse execution speeds
grid_cells = {}

teams_config = {
    "1": {"color": "#ff3333", "name": "RED", "tag": "R"},
    "2": {"color": "#00aaff", "name": "BLUE", "tag": "B"},
    "3": {"color": "#33cc33", "name": "GREEN", "tag": "G"},
    "4": {"color": "#e6b800", "name": "YELLOW", "tag": "Y"},
    "5": {"color": "#ff00ff", "name": "MAGENTA", "tag": "M"},
    "6": {"color": "#00ffff", "name": "CYAN", "tag": "C"}
}

players = {}
fireworks = []

# Automated Rogue Common Enemy Spawner parameters tracking
spawner_x = 64
spawner_y = 64
spawner_team = TEAM_RED

def seed_initial_tv_matrix():
    global grid_cells
    for _ in range(800): 
        rx = random.randint(0, GRID_SIZE - 1)
        ry = random.randint(0, GRID_SIZE - 1)
        grid_cells[(rx, ry)] = random.randint(1, 6)

seed_initial_tv_matrix()

@app.route('/tv')
def tv_dashboard():
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Cell Combat TV Dashboard</title>
        <style>
            body { background: #010101; color: white; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
            canvas { background: #000; border: 4px solid #111; box-shadow: 0 0 40px rgba(0,255,255,0.03); }
            #scoreboard { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, auto); gap: 10px; width: 700px; margin-bottom: 15px; font-size: 20px; font-weight: bold; background: #050505; padding: 15px; border-radius: 10px; border: 2px solid #111; text-align: center; box-sizing: border-box; }
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
            let ws = new WebSocket('ws://' + location.hostname + ':3002');
            
            let lastDrawnPlayers = {};
            let activeFireworks = [];
            
            const colors = {1:'#ff3333', 2:'#00aaff', 3:'#33cc33', 4:'#e6b800', 5:'#ff00ff', 6:'#00ffff'};
            const tags = {1:'R', 2:'B', 3:'G', 4:'Y', 5:'M', 6:'C'};

            ws.onmessage = (event) => {
                let data = JSON.parse(event.data);
                if (data.type === 'SYNC') {
                    document.getElementById('s1').innerText = String(data.scores["1"]).padStart(4, '0');
                    document.getElementById('s2').innerText = String(data.scores["2"]).padStart(4, '0');
                    document.getElementById('s3').innerText = String(data.scores["3"]).padStart(4, '0');
                    document.getElementById('s4').innerText = String(data.scores["4"]).padStart(4, '0');
                    document.getElementById('s5').innerText = String(data.scores["5"]).padStart(4, '0');
                    document.getElementById('s6').innerText = String(data.scores["6"]).padStart(4, '0');
                    
                    let scale = 700 / 128;

                    for (let id in lastDrawnPlayers) {
                        let lp = lastDrawnPlayers[id];
                        ctx.fillStyle = '#000';
                        ctx.fillRect((lp.x * scale) - 6, (lp.y * scale) - 24, scale + 14, scale + 30);
                    }

                    if (data.spawner) {
                        ctx.fillStyle = '#000';
                        ctx.fillRect((data.spawner.x * scale) - 12, (data.spawner.y * scale) - 12, scale + 24, scale + 24);
                    }

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    ctx.fillRect(0, 0, 700, 700);
                    
                    data.grid.forEach(cell => {
                        let cx = cell[0];
                        let cy = cell[1];
                        let team = cell[2];
                        ctx.fillStyle = colors[team];
                        ctx.fillRect(cx * scale, cy * scale, scale - 0.5, scale - 0.5);
                    });

                    if (data.spawner) {
                        ctx.save();
                        ctx.strokeStyle = colors[data.spawner.team];
                        ctx.lineWidth = 4;
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = colors[data.spawner.team];
                        ctx.beginPath();
                        ctx.arc((data.spawner.x * scale) + (scale/2), (data.spawner.y * scale) + (scale/2), scale * 2.5, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.font = "bold 10px monospace";
                        ctx.fillText("AI", (data.spawner.x * scale) - 1, (data.spawner.y * scale) + 4);
                        ctx.restore();
                    }

                    if (data.collisions) {
                        data.collisions.forEach(c => {
                            activeFireworks.push({ x: c.x * scale, y: c.y * scale, rad: 1, alpha: 1.0 });
                        });
                    }

                    activeFireworks = activeFireworks.filter(f => {
                        ctx.save();
                        ctx.globalAlpha = f.alpha;
                        ctx.lineWidth = 2;
                        let rainbow = ['#ff3333', '#e6b800', '#33cc33', '#00ffff', '#00aaff', '#ff00ff'];
                        for (let i = 0; i < 8; i++) {
                            let angle = (i * Math.PI * 2) / 8;
                            ctx.strokeStyle = rainbow[i % rainbow.length];
                            ctx.beginPath();
                            ctx.moveTo(f.x + Math.cos(angle) * (f.rad * 0.3), f.y + Math.sin(angle) * (f.rad * 0.3));
                            ctx.lineTo(f.x + Math.cos(angle) * f.rad, f.y + Math.sin(angle) * f.rad);
                            ctx.stroke();
                        }
                        ctx.restore();
                        f.rad += 4.0;
                        f.alpha -= 0.12; 
                        return f.alpha > 0;
                    });

                    lastDrawnPlayers = {}; 
                    for (let id in data.players) {
                        let p = data.players[id];
                        let col = colors[p.team];
                        let tag = tags[p.team];
                        
                        ctx.fillStyle = '#000';
                        ctx.fillRect((p.cursorX * scale) - 1, (p.cursorY * scale) - 1, scale + 2, scale + 2);

                        ctx.strokeStyle = col;
                        ctx.lineWidth = 3;
                        ctx.strokeRect(p.cursorX * scale, p.cursorY * scale, scale, scale);
                        
                        ctx.fillStyle = col;
                        ctx.font = "bold 12px monospace";
                        ctx.fillText(tag, (p.cursorX * scale) - 2, (p.cursorY * scale) - 6);
                        
                        lastDrawnPlayers[id] = { x: p.cursorX, y: p.cursorY };
                    }
                }
            };
        </script>
    </body>
    </html>
    """
    return Response(html_content, mimetype='text/html')

def spawn_blob_glider(x, y, team):
    global grid_cells
    try:
        grid_cells[(x % GRID_SIZE, y % GRID_SIZE)] = team
        grid_cells[((x + 1) % GRID_SIZE, (y + 1) % GRID_SIZE)] = team
        grid_cells[((x + 2) % GRID_SIZE, (y + 1) % GRID_SIZE)] = team
        grid_cells[(x % GRID_SIZE, (y + 2) % GRID_SIZE)] = team
        grid_cells[((x + 1) % GRID_SIZE, (y + 2) % GRID_SIZE)] = team
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

def route_player_input(line):
    global grid_cells, players
    if not line or ":" not in line:
        return
        
    parts = line.split(':')
    player_id = None
    team_req = None
    cmd = None
    
    # FIXED: Hardened indexing assignments to perfectly extract input segments safely
    if len(parts) == 3:
        player_id = parts[0].strip()
        team_req = parts[1].strip()
        cmd = parts[2].strip()
    elif len(parts) == 2:
        team_req = parts[0].strip()
        cmd = parts[1].strip()
        player_id = f"LEGACY_T{team_req}"
        
    if not player_id or not team_req or not cmd:
        return
    
    if player_id not in players and cmd == 'JOIN':
        assigned_team = get_balanced_team(team_req)
        players[player_id] = {
            "cursorX": random.randint(30, 90), 
            "cursorY": random.randint(30, 90),
            "team": assigned_team
        }
    
    if player_id in players:
        p = players[player_id]
        if cmd == 'UP':      p["cursorY"] = (p["cursorY"] - 1 + GRID_SIZE) % GRID_SIZE
        elif cmd == 'DOWN':  p["cursorY"] = (p["cursorY"] + 1) % GRID_SIZE
        elif cmd == 'LEFT':  p["cursorX"] = (p["cursorX"] - 1 + GRID_SIZE) % GRID_SIZE
        elif cmd == 'RIGHT': p["cursorX"] = (p["cursorX"] + 1) % GRID_SIZE
        elif cmd == 'FIRE':  spawn_blob_glider(p["cursorX"], p["cursorY"], p["team"])
        elif cmd == 'ESC':   grid_cells.clear()

def check_serial_input(ser):
    if not ser:
        return
    try:
        while ser.in_waiting > 0:
            raw_bytes = ser.readline()
            line = raw_bytes.decode('utf-8', errors='ignore').strip()
            route_player_input(line)
    except Exception:
        pass

def check_udp_socket_input(sock):
    if not sock:
        return
    try:
        while True:
            data, addr = sock.recvfrom(1024)
            line = data.decode('utf-8', errors='ignore').strip()
            route_player_input(line)
    except BlockingIOError:
        pass
    except Exception:
        pass

def calculate_conway_generation():
    global grid_cells, team_scores, fireworks
    population_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    current_frame_collisions = []

    neighbors_to_check = set()
    for (x, y) in grid_cells.keys():
        for i in range(-1, 2):
            for j in range(-1, 2):
                nx = (x + i + GRID_SIZE) % GRID_SIZE
                ny = (y + j + GRID_SIZE) % GRID_SIZE
                neighbors_to_check.add((nx, ny))

    next_cells = {}

    for (x, y) in neighbors_to_check:
        counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
        for i in range(-1, 2):
            for j in range(-1, 2):
                if i == 0 and j == 0:
                    continue
                nx = (x + i + GRID_SIZE) % GRID_SIZE
                ny = (y + j + GRID_SIZE) % GRID_SIZE
                if (nx, ny) in grid_cells:
                    counts[grid_cells[(nx, ny)]] += 1
                    
        total = sum(counts.values())
        current_owner = grid_cells.get((x, y), EMPTY)
        
        if current_owner != EMPTY:
            if total == 2 or total == 3:
                next_cells[(x, y)] = current_owner
                population_counts[current_owner] += 1
        else:
            if total == 3:
                max_team = max(counts, key=counts.get)
                next_cells[(x, y)] = max_team
                population_counts[max_team] += 1
                
                parents = [t for t, c in counts.items() if c > 0]
                if len(parents) >= 2 and random.random() < 0.35:
                    current_frame_collisions.append({"x": x, "y": y})

    max_cells = max(population_counts.values())
    if max_cells > 0:
        dominant_teams = [str(t) for t, count in population_counts.items() if count == max_cells]
        for t_str in dominant_teams:
            team_scores[t_str] += 1

    grid_cells = next_cells
    fireworks = current_frame_collisions

# FIXED: Equalizer AI Spawner operates seamlessly on its own detached routine interval
async def run_isolated_ai_spawner_loop():
    global spawner_x, spawner_y, spawner_team, team_scores
    while True:
        await asyncio.sleep(2.5) 
        try:
            spawner_team = random.randint(1, 6)
            spawner_x = random.randint(20, 100)
            spawner_y = random.randint(20, 100)
            
            if team_scores:
                underdog_team = min(team_scores, key=team_scores.get)
                leader_team = max(team_scores, key=team_scores.get)
                spawner_team = int(underdog_team)
                
                target_x, target_y = 64, 64
                for p in players.values():
                    if str(p["team"]) == leader_team:
                        target_x, target_y = p["cursorX"], p["cursorY"]
                        break
                        
                spawn_blob_glider(spawner_x, spawner_y, spawner_team)
        except Exception:
            pass

async def broadcast_sync(ser, sock):
    global fireworks, grid_cells, spawner_x, spawner_y, spawner_team
    if connected_clients:
        sparse_cells_packet = [[x, y, t] for (x, y), t in grid_cells.items()]

        packet = json.dumps({
            "type": "SYNC", 
            "grid": sparse_cells_packet, 
            "players": players, 
            "scores": team_scores,
            "collisions": fireworks,
            "spawner": {"x": spawner_x, "y": spawner_y, "team": spawner_team} 
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
            ser = serial.Serial(ports, 115200, timeout=0.01)
            print(f"-> Successfully opened Bidirectional Serial on: {ports}")
        except Exception as e:
            print(f"Serial Connection Warning: {e}")

    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", 3001))
        sock.setblocking(False)
        print("-> Successfully bound Wireless UDP Listener on Port 3001")
    except Exception as e:
        print(f"Network UDP Binding Error: {e}")

    async def run_high_speed_io_scanner():
        while True:
            check_serial_input(ser)
            check_udp_socket_input(sock)
            await asyncio.sleep(0.01)

    async def run_trippy_simulation_ticks():
        while True:
            calculate_conway_generation()
            await broadcast_sync(ser, sock)
            await asyncio.sleep(0.10) 

    asyncio.create_task(run_high_speed_io_scanner())
    asyncio.create_task(run_trippy_simulation_ticks())
    asyncio.create_task(run_isolated_ai_spawner_loop())

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
    async with serve(ws_handler, "0.0.0.0", 3002):
        await main_game_loop()
        await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(run_all())
    except KeyboardInterrupt:
        sys.exit(0)
