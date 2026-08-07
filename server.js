/**
 * ----------------------------------------------------------------------------
 * @file server.js
 * @brief Raspberry Pi Game Loop, 6-Team Scanner, Structure Engine & TV Renderer
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
const TEAM_YELLOW = 4;
const TEAM_MAGENTA = 5;
const TEAM_CYAN = 6;

let grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
let nextGrid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));

// History buffers for static structure detection rules
let history1 = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
let history2 = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
let history3 = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
let stableStructureMap = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(false));

// Track active connected player cursor states and score panels for 6 teams
let players = {
    [TEAM_RED]:     { cursorX: 10, cursorY: 32, score: 0, active: false },
    [TEAM_BLUE]:    { cursorX: 18, cursorY: 32, score: 0, active: false },
    [TEAM_GREEN]:   { cursorX: 26, cursorY: 32, score: 0, active: false },
    [TEAM_YELLOW]:  { cursorX: 34, cursorY: 32, score: 0, active: false },
    [TEAM_MAGENTA]: { cursorX: 42, cursorY: 32, score: 0, active: false },
    [TEAM_CYAN]:    { cursorX: 50, cursorY: 32, score: 0, active: false }
};

function seedInitialTVMatrix() {
    for (let i = 0; i < 300; i++) {
        let rx = Math.floor(Math.random() * GRID_SIZE);
        let ry = Math.floor(Math.random() * GRID_SIZE);
        grid[rx][ry] = Math.floor(Math.random() * 6) + 1;
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
                let ws = new WebSocket('ws://' + location.host);
                ws.onmessage = (event) => {
                    let data = JSON.parse(event.data);
                    if (data.type === 'SYNC') {
                        document.getElementById('s1').innerText = String(data.players[1].score).padStart(4, '0');
                        document.getElementById('s2').innerText = String(data.players[2].score).padStart(4, '0');
                        document.getElementById('s3').innerText = String(data.players[3].score).padStart(4, '0');
                        document.getElementById('s4').innerText = String(data.players[4].score).padStart(4, '0');
                        document.getElementById('s5').innerText = String(data.players[5].score).padStart(4, '0');
                        document.getElementById('s6').innerText = String(data.players[6].score).padStart(4, '0');
                        
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
                                    if(val === 4) ctx.fillStyle = '#e6b800';
                                    if(val === 5) ctx.fillStyle = '#ff00ff';
                                    if(val === 6) ctx.fillStyle = '#00ffff';
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
                                if(t == 4) ctx.strokeStyle = '#e6b800';
                                if(t == 5) ctx.strokeStyle = '#ff00ff';
                                if(t == 6) ctx.strokeStyle = '#00ffff';
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
    let targetPort = ports.find(p => p.path.toLowerCase().includes('usb') || p.path.toLowerCase().includes('acm'));
    let path = targetPort ? targetPort.path : '/dev/ttyUSB0';
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
                if (cmd === 'ESC') {
                    grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(EMPTY));
                    stableStructureMap = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(false));
                }
            }
        }
    });
}

function spawnBlobGlider(x, y, team) {
    grid[x][y] = team;
    grid[(x + 1) % GRID_SIZE][(y + 1) % GRID_SIZE] = team;
    grid[(x + 2) % GRID_SIZE][(y + 1) % GRID_SIZE] = team;
    grid[x][(y + 2) % GRID_SIZE] = team;
    grid[(x + 1) % GRID_SIZE][(y + 2) % GRID_SIZE] = team;
}

// --- Multi-Faction Conway Rules Simulation Processing Engine ---
function calculateConwayGeneration() {
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            history3[x][y] = history2[x][y];
            history2[x][y] = history1[x][y];
            history1[x][y] = grid[x][y];
        }
    }

    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            let counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    if (i === 0 && j === 0) continue;
                    let nx = (x + i + GRID_SIZE) % GRID_SIZE;
                    let ny = (y + j + GRID_SIZE) % GRID_SIZE;
                    let val = grid[nx][ny];
                    if (val !== EMPTY) counts[val]++;
                }
            }
            let total = Object.values(counts).reduce((a, b) => a + b, 0);
            let current = grid[x][y];
            
            if (current !== EMPTY) {
                nextGrid[x][y] = (total < 2 || total > 3) ? EMPTY : current;
            } else {
                if (total === 3) {
                    let maxTeam = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                    nextGrid[x][y] = parseInt(maxTeam);
                    if(grid[x][y] !== EMPTY && grid[x][y] !== nextGrid[x][y]) {
players[maxTeam].score += 5;}} else {nextGrid[x][y] = EMPTY;}}}}// Structure Lifecycle Score Triggersfor (let x = 0; x < GRID_SIZE; x++) {for (let y = 0; y < GRID_SIZE; y++) {let currentCell = nextGrid[x][y];let isStableNow = (currentCell !== EMPTY) && (currentCell === history2[x][y] || currentCell === history3[x][y]);if (isStableNow && !stableStructureMap[x][y]) {stableStructureMap[x][y] = true;if (players[currentCell]) players[currentCell].score += 50;}else if (!isStableNow && stableStructureMap[x][y]) {stableStructureMap[x][y] = false;let originalOwner = history1[x][y];let breakerFaction = currentCell !== EMPTY ? currentCell : EMPTY;if (breakerFaction !== EMPTY && breakerFaction !== originalOwner) {if (players[breakerFaction]) players[breakerFaction].score += 100;}}}}let temp = grid; grid = nextGrid; nextGrid = temp;let packet = JSON.stringify({ type: 'SYNC', grid: grid, players: players });wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(packet); });}startSerialConnection().catch(console.error);setInterval(calculateConwayGeneration, 160);server.listen(3000, () => { console.log("Central Field Server active on port 3000!"); });
