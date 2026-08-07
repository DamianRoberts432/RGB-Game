/**
 * ----------------------------------------------------------------------------
 * @file server.js
 * @brief Raspberry Pi Central Game Loop, Auto-Serial Scanner & TV Renderer
 * ----------------------------------------------------------------------------
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Game Engine Matrix Configuration ---
const GRID_SIZE = 64; 
const EMPTY = 0;
const TEAM_RED = 1;
const TEAM_BLUE = 2;
const TEAM_GREEN = 3;

let grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
let nextGrid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));

// Track active connected player cursor states and score tracking panels
let players = {
    [TEAM_RED]:   { cursorX: 16, cursorY: 32, score: 0, active: false },
    [TEAM_BLUE]:  { cursorX: 32, cursorY: 32, score: 0, active: false },
    [TEAM_GREEN]: { cursorX: 48, cursorY: 32, score: 0, active: false }
};

// Seed a few initial blocks right away so the TV board isn't completely empty at launch
function seedInitialTVMatrix() {
    for (let i = 0; i < 150; i++) {
        let rx = Math.floor(Math.random() * GRID_SIZE);
        let ry = Math.floor(Math.random() * GRID_SIZE);
        grid[rx][ry] = Math.floor(Math.random() * 3) + 1;
    }
}
seedInitialTVMatrix();

// --- TV Screen Dashboard Delivery Template ---
app.get('/tv', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cell Combat TV Dashboard</title>
            <style>
                body { background: #050505; color: white; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
                canvas { background: #000; border: 4px solid #222; box-shadow: 0 0 30px rgba(255,255,255,0.05); }
                #scoreboard { display: flex; width: 700px; justify-content: space-between; margin-bottom: 20px; font-size: 28px; font-weight: bold; background: #111; padding: 15px; border-radius: 10px; border: 2px solid #222;}
            </style>
        </head>
        <body>
            <div id="scoreboard">
                <span style="color:#ff3333;">RED: <span id="s1">0000</span></span>
                <span style="color:#00aaff;">BLUE: <span id="s2">0000</span></span>
                <span style="color:#33cc33;">GREEN: <span id="s3">0000</span></span>
            </div>
            <canvas id="gameCanvas" width="700" height="700"></canvas>
            <script>
                let canvas = document.getElementById('gameCanvas');
                let ctx = canvas.getContext('2d');
                let ws = new WebSocket('ws://' + location.host);
                ws.onmessage = (event) => {
                    let data = JSON.parse(event.data);
                    if (data.type === 'SYNC') {
                        document.getElementById('s1').innerText = String(data.players[1].score).padStart(4, '0');
                        document.getElementById('s2').innerText = String(data.players[2].score).padStart(4, '0');
                        document.getElementById('s3').innerText = String(data.players[3].score).padStart(4, '0');
                        
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, 700, 700);
                        
                        let scale = 700 / 64;
                        for (let x = 0; x < 64; x++) {
                            for (let y = 0; y < 64; y++) {
                                let val = data.grid[x][y];
                                if (val !== 0) {
                                    if(val === 1) ctx.fillStyle = '#ff3333';
                                    if(val === 2) ctx.fillStyle = '#00aaff';
                                    if(val === 3) ctx.fillStyle = '#33cc33';
                                    ctx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
                                }
                            }
                        }
                        for (let t in data.players) {
                            let p = data.players[t];
                            if(p.active) {
                                if(t == 1) ctx.strokeStyle = '#ff3333';
                                if(t == 2) ctx.strokeStyle = '#00aaff';
                                if(t == 3) ctx.strokeStyle = '#33cc33';
                                ctx.lineWidth = 3;
                                ctx.strokeRect(p.cursorX * scale, p.cursorY * scale, scale, scale);
                            }
                        }
                    }
                };
            </script>
        </body>
        </html>
    `);
});

// --- AUTOMATIC USB SERIAL PORT SCANNER ---
async function startSerialConnection() {
    let ports = await SerialPort.list();
    // Dynamically look for any active device matching standard ESP32/CH340/ACM profiles
    let targetPort = ports.find(p => p.path.toLowerCase().includes('usb') || p.path.toLowerCase().includes('acm'));
    
    let path = targetPort ? targetPort.path : '/dev/ttyUSB0'; // Fallback address profile
    console.log(`-> Connecting to ESP32 Gateway on port: ${path}`);
    
    const port = new SerialPort({ path: path, baudRate: 115200 });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', (data) => {
        let cleanStr = data.toString().trim();
        let parts = cleanStr.split(':');
        
        if (parts.length === 2) {
            let team = parseInt(parts[0]);
            let cmd = parts[1].trim();
            let p = players[team];
            
            if (p) {
                if (cmd === 'JOIN')  p.active = true;
                if (cmd === 'UP')    p.cursorY = (p.cursorY - 1 + GRID_SIZE) % GRID_SIZE;
                if (cmd === 'DOWN')  p.cursorY = (p.cursorY + 1) % GRID_SIZE;
                if (cmd === 'LEFT')  p.cursorX = (p.cursorX - 1 + GRID_SIZE) % GRID_SIZE;
                if (cmd === 'RIGHT') p.cursorX = (p.cursorX + 1) % GRID_SIZE;
                if (cmd === 'FIRE')  spawnBlobGlider(p.cursorX, p.cursorY, team);
                if (cmd === 'ESC')   grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY)); // B Button manual board clear
            }
        }
    });

    port.on('error', (err) => {
        console.error("Serial Port Error: ", err.message);
    });
}

function spawnBlobGlider(x, y, team) {
    grid[x][y] = team;
    grid[(x + 1) % GRID_SIZE][(y + 1) % GRID_SIZE] = team;
    grid[(x + 2) % GRID_SIZE][(y + 1) % GRID_SIZE] = team;
    grid[x][(y + 2) % GRID_SIZE] = team;
    grid[(x + 1) % GRID_SIZE][(y + 2) % GRID_SIZE] = team;
}

// --- Tri-Faction Conway Rules Simulation Processing Engine ---
function calculateConwayGeneration() {
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            let rN = 0, bN = 0, gN = 0;
            
            // Check full 8-neighbor bounding fields
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    if (i === 0 && j === 0) continue;
                    let nx = (x + i + GRID_SIZE) % GRID_SIZE;
                    let ny = (y + j + GRID_SIZE) % GRID_SIZE;
                    if (grid[nx][ny] === TEAM_RED)   rN++;
                    if (grid[nx][ny] === TEAM_BLUE)  bN++;
                    if (grid[nx][ny] === TEAM_GREEN) gN++;
                }
            }
            let total = rN + bN + gN;
            let current = grid[x][y];
            
            if (current !== EMPTY) {
                // Living spaces survive if they touch 2 or 3 neighbors
                nextGrid[x][y] = (total < 2 || total > 3) ? EMPTY : current;
            } else {
                // Birth rule modifier for empty slots
                if (total === 3) {
                    // Battle Check: Dominant neighbor faction claims the point
                    let max = Math.max(rN, bN, gN);
                    if (max === rN) {
                        nextGrid[x][y] = TEAM_RED;
                        if(grid[x][y] !== EMPTY && grid[x][y] !== TEAM_RED) players[TEAM_RED].score += 10;
                    } else if (max === bN) {
                        nextGrid[x][y] = TEAM_BLUE;
                        if(grid[x][y] !== EMPTY && grid[x][y] !== TEAM_BLUE) players[TEAM_BLUE].score += 10;
                    } else {
                        nextGrid[x][y] = TEAM_GREEN;
                        if(grid[x][y] !== EMPTY && grid[x][y] !== TEAM_GREEN) players[TEAM_GREEN].score += 10;
                    }
                } else {
                    nextGrid[x][y] = EMPTY;
                }
            }
        }
    }
    let temp = grid; grid = nextGrid; nextGrid = temp;
    
    // Pushes synchronized frames out to the browser window lines instantly
    let packet = JSON.stringify({ type: 'SYNC', grid: grid, players: players });
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(packet); });
}

// Start serial reader tracking
startSerialConnection().catch(console.error);

// Set simulation tick processing frame loop speed (approx 6 ticks per second)
setInterval(calculateConwayGeneration, 160);

server.listen(3000, () => { 
    console.log("=========================================");
    console.log("  Central Field Server active on port 3000! ");
    console.log("  📺 TV Address: http://localhost:3000/tv ");
    console.log("=========================================");
});
