/**
 * ----------------------------------------------------------------------------
 * @file Gateway.ino (Block 1 of 2)
 * @brief Open ColorGame Gateway with Captive Portal Bypass Probes
 * ----------------------------------------------------------------------------
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

const char* ssid = "ColorGame"; 
const char* password = NULL; 

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
WebServer server(80);

String latestPiData = "";

void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, orientation=landscape'>";
  html += "<title>NES Controller</title>";
  html += "<style>";
  html += "body { background: #222; color: #fff; font-family: 'Courier New', sans-serif; text-align: center; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; overflow: hidden; }";
  html += "#setup-screen { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background: #111; overflow-y: auto; padding: 10px; }";
  html += ".team-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 90%; max-width: 500px; }";
  html += ".team-btn { height: 50px; font-size: 16px; font-weight: bold; border-radius: 8px; border: none; color: white; cursor: pointer; text-shadow: 1px 1px 2px #000; }";
  html += "#nes-pad { display: none; width: 100vw; height: 100vh; background: #ccd0d4; border-top: 15px solid #9ba0a4; box-sizing: border-box; position: relative; }";
  html += "#dark-stripe { width: 100%; height: 60%; background: #4f5358; position: absolute; top: 20%; border-top: 4px solid #3a3c40; border-bottom: 4px solid #3a3c40; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; }";
  html += "#phone-hud { position: absolute; top: 2px; left: 0; width: 100%; height: 18px; display: flex; justify-content: space-around; font-size: 11px; font-weight: bold; color: #333; z-index: 100; text-transform: uppercase; }";
  html += ".hud-val { color: #ff3333; font-weight: 900; }";
  html += ".dpad-container { position: relative; width: 140px; height: 140px; }";
  html += ".dpad-cross { background: #1a1a1a; position: absolute; border-radius: 6px; box-shadow: inset 0 0 5px #000; }";
  html += ".dpad-vert { width: 44px; height: 140px; left: 48px; top: 0; }";
  html += ".dpad-horiz { width: 140px; height: 44px; left: 0; top: 48px; }";
  html += ".dpad-btn { position: absolute; background: transparent; border: none; outline: none; z-index: 10; touch-action: none; -webkit-tap-highlight-color: transparent; }";
  html += ".dpad-btn:active { background: rgba(255,255,255,0.1); border-radius: 4px; }";
  html += ".center-buttons { display: flex; gap: 20px; position: absolute; left: 50%; transform: translateX(-50%); bottom: 25%; }";
  html += ".pill-button { display: flex; flex-direction: column; align-items: center; font-size: 11px; font-weight: bold; color: #ff3333; letter-spacing: 1px; }";
  html += ".pill-src { width: 45px; height: 12px; background: #7c8185; border-radius: 6px; border: 2px solid #1a1a1a; box-shadow: 2px 2px #333; }";
  html += ".action-container { display: flex; gap: 25px; background: #a2a6aa; padding: 10px 15px; border-radius: 20px; border: 3px solid #7c8185; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3); }";
  html += ".red-btn-wrapper { display: flex; flex-direction: column-reverse; align-items: center; font-size: 18px; font-weight: bold; color: #ff3333; }";
  html += ".red-circle { width: 54px; height: 54px; background: #b81c22; border-radius: 50%; border: 3px solid #1a1a1a; box-shadow: 3px 3px 0px #4f5358; touch-action: none; -webkit-tap-highlight-color: transparent; }";
  html += ".red-circle:active { background: #901217; transform: translate(2px, 2px); box-shadow: 1px 1px 0px #4f5358; }";
  html += "</style></head><body>";
  
  html += "<div id='setup-screen'>";
  html += "  <h2 style='color:#fff; margin-bottom:10px;'>SELECT YOUR TEAM</h2>";
  html += "  <div class='team-grid'>";
  html += "    <button class='team-btn' style='background:#ff3333;' onclick='join(1)'>RED</button>";
  html += "    <button class='team-btn' style='background:#00aaff;' onclick='join(2)'>BLUE</button>";
  html += "    <button class='team-btn' style='background:#33cc33;' onclick='join(3)'>GREEN</button>";
  html += "    <button class='team-btn' style='background:#e6b800;' onclick='join(4)'>YELLOW</button>";
  html += "    <button class='team-btn' style='background:#ff00ff;' onclick='join(5)'>MAGENTA</button>";
  html += "    <button class='team-btn' style='background:#00ffff; color:#000; text-shadow:none;' onclick='join(6)'>CYAN</button>";
  html += "  </div>";
  html += "</div>";
/**
 * ----------------------------------------------------------------------------
 * @file Gateway.ino (Block 2 of 2)
 * @brief OS Connectivity Probe Targets, API Handlers, & Asynchronous Touch Events
 * ----------------------------------------------------------------------------
 */

  html += "<div id='nes-pad'>";
  html += "  <div id='phone-hud'>";
  html += "    <span>TEAM: <span id='hud-team' class='hud-val'>---</span></span>";
  html += "    <span>POS: <span id='hud-pos' class='hud-val'>00,00</span></span>";
  html += "    <span>SCORE: <span id='hud-score' class='hud-val'>0000</span></span>";
  html += "  </div>";
  html += "  <div id='dark-stripe'>";
  html += "    <div class='dpad-container'>";
  html += "      <div class='dpad-cross dpad-vert'></div>";
  html += "      <div class='dpad-cross dpad-horiz'></div>";
  html += "      <button class='dpad-btn' style='width:44px; height:48px; left:48px; top:0;' id='btn-UP'></button>";
  html += "      <button class='dpad-btn' style='width:44px; height:48px; left:48px; bottom:0;' id='btn-DOWN'></button>";
  html += "      <button class='dpad-btn' style='width:48px; height:44px; left:0; top:48px;' id='btn-LEFT'></button>";
  html += "      <button class='dpad-btn' style='width:48px; height:44px; right:0; top:48px;' id='btn-RIGHT'></button>";
  html += "    </div>";
  html += "    <div class='action-container'>";
  html += "      <div class='red-btn-wrapper'><span>B</span><button class='red-circle' id='btn-ESC'></button></div>";
  html += "      <div class='red-btn-wrapper'><span>A</span><button class='red-circle' id='btn-FIRE'></button></div>";
  html += "    </div>";
  html += "  </div>";
  html += "  <div class='center-buttons'>";
  html += "    <div class='pill-button'><span>SELECT</span><div class='pill-src'></div></div>";
  html += "    <div class='pill-button'><span>START</span><div class='pill-src'></div></div>";
  html += "  </div>";
  html += "</div>";
  
  html += "<script>";
  html += "let pID = 'P' + Math.floor(Math.random()*9000+1000);";
  html += "let myFaction = 0;";
  html += "const colors = {1:'#ff3333', 2:'#00aaff', 3:'#33cc33', 4:'#e6b800', 5:'#ff00ff', 6:'#00ffff'};";
  html += "const names = {1:'RED', 2:'BLUE', 3:'GREEN', 4:'YELLOW', 5:'MAGENTA', 6:'CYAN'};";
  html += "let activeMoveCmd = null;";
  html += "let animationFrameId = null;";
  html += "let lastSentTime = 0;";
  html += "const SEND_INTERVAL = 65; "; 
  
  html += "function join(team) {";
  html += "  myFaction = team;";
  html += "  let xhr = new XMLHttpRequest();";
  html += "  xhr.open('GET', '/action?id='+pID+'&team='+myFaction+'&cmd=JOIN', true);";
  html += "  xhr.send();";
  html += "  document.getElementById('setup-screen').style.display = 'none';";
  html += "  document.getElementById('nes-pad').style.display = 'block';";
  html += "  updateHUD(myFaction, '64,64', 0);";
  html += "  bindTouchControls();";
  html += "}";
  
  html += "function sendAction(cmd) {";
  html += "  let xhr = new XMLHttpRequest();";
  html += "  xhr.open('GET', '/action?id='+pID+'&team='+myFaction+'&cmd='+cmd, true);";
  html += "  xhr.send();";
  html += "}";
  
  html += "function processHeldMovement(timestamp) {";
  html += "  if (!activeMoveCmd) return;";
  html += "  if (timestamp - lastSentTime >= SEND_INTERVAL) {";
  html += "    sendAction(activeMoveCmd);";
  html += "    lastSentTime = timestamp;";
  html += "  }";
  html += "  animationFrameId = requestAnimationFrame(processHeldMovement);";
  html += "}";
  
  html += "function bindTouchControls() {";
  html += "  ['UP','DOWN','LEFT','RIGHT'].forEach(dir => {";
  html += "    let el = document.getElementById('btn-' + dir);";
  html += "    const startHandler = (e) => {";
  html += "      e.preventDefault();";
  html += "      if(activeMoveCmd !== dir) {";
  html += "        activeMoveCmd = dir;";
  html += "        lastSentTime = 0;";
  html += "        if(!animationFrameId) animationFrameId = requestAnimationFrame(processHeldMovement);";
  html += "      }";
  html += "    };";
  html += "    const endHandler = (e) => {";
  html += "      e.preventDefault();";
  html += "      if(activeMoveCmd === dir) {";
  html += "        activeMoveCmd = null;";
  html += "        cancelAnimationFrame(animationFrameId);";
  html += "        animationFrameId = null;";
  html += "      }";
  html += "    };";
  html += "    el.addEventListener('touchstart', startHandler, {passive:false});";
  html += "    el.addEventListener('touchend', endHandler, {passive:false});";
  html += "    el.addEventListener('mousedown', startHandler);";
  html += "    el.addEventListener('mouseup', endHandler);";
  html += "    el.addEventListener('mouseleave', endHandler);";
  html += "  });";
  
  html += "  ['FIRE','ESC'].forEach(cmd => {";
  html += "    let el = document.getElementById('btn-' + cmd);";
  html += "    const trigger = (e) => { e.preventDefault(); sendAction(cmd); };";
  html += "    el.addEventListener('touchstart', trigger, {passive:false});";
  html += "    el.addEventListener('mousedown', trigger);";
  html += "  });";
  html += "}";
  
  html += "function updateHUD(team, pos, score) {";
  html += "  myFaction = team;";
  html += "  let tEl = document.getElementById('hud-team');";
  html += "  tEl.innerText = names[team]; tEl.style.color = colors[team];";
  html += "  document.getElementById('hud-pos').innerText = pos;";
  html += "  document.getElementById('hud-score').innerText = String(score).padStart(4,'0');";
  html += "}";
  
  html += "setInterval(() => {";
  html += "  let xhr = new XMLHttpRequest();";
  html += "  xhr.open('GET', '/sync?id='+pID, true);";
  html += "  xhr.onload = function() {";
  html += "    if (xhr.status === 200 && xhr.responseText.startsWith('DATA:')) {";
  html += "       let d = xhr.responseText.split(':');";
  html += "       // FIXED: Safe explicit element lookup array handles telemetry properly";
  html += "       updateHUD(parseInt(d[1]), d[2]+','+d[3], parseInt(d[4]));";
  html += "    }";
  html += "  };";
  html += "  xhr.send();";
  html += "}, 250);";
  html += "</script></body></html>";

  server.send(200, "text/html", html);
} 

void handleAction() {
  if (server.hasArg("id") && server.hasArg("team") && server.hasArg("cmd")) {
    String pID = server.arg("id");
    String team = server.arg("team");
    String cmd = server.arg("cmd");
    // FIXED: Delivers un-jammable modern 3-parameter packet layout structure: "ID:TEAM:CMD"
    Serial.println(pID + ":" + team + ":" + cmd); 
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "BAD REQUEST");
  }
}

void handleSync() {
  if (server.hasArg("id")) {
    String clientID = server.arg("id");
    int idx = latestPiData.indexOf(clientID);
    if (idx != -1) {
      int endIdx = latestPiData.indexOf("\n", idx);
      if (endIdx == -1) endIdx = latestPiData.length();
      String playerLine = latestPiData.substring(idx, endIdx);
      server.send(200, "text/plain", "DATA:" + playerLine);
      return;
    }
  }
  server.send(200, "text/plain", "WAIT");
}

void handleCaptivePortalProbeBypass() {
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "0");
  server.send(200, "text/plain", "Microsoft NCSI");
}

void handleNotFound() {
  server.sendHeader("Location", "http://192.168.4", true);
  server.send(302, "text/plain", "");
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(ssid, password);
  dnsServer.start(DNS_PORT, "*", apIP);
  
  server.on("/", handleRoot);
  server.on("/action", handleAction);
  server.on("/sync", handleSync);
  
  server.on("/generate_204", handleRoot);            
  server.on("/hotspot-detect.html", handleRoot);    
  server.on("/ncsi.txt", handleCaptivePortalProbeBypass);  
  server.on("/success.txt", handleCaptivePortalProbeBypass);
  
  server.onNotFound(handleNotFound);
  server.begin();
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\0'); 
    if (input.startsWith("HUD_SYNC:")) {
      latestPiData = input;
    }
  }
}
