/**
 * ----------------------------------------------------------------------------
 * @file Gateway.ino
 * @brief ESP32 Wi-Fi Gateway with Horizontal Retro NES Controller Interface
 * ----------------------------------------------------------------------------
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

const char* ssid = "ESP32_BlasterNet";
const char* password = "cellularcombat";

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
WebServer server(80);

void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, orientation=landscape'>";
  html += "<title>NES Controller</title>";
  html += "<style>";
  html += "body { background: #222; color: #fff; font-family: 'Courier New', sans-serif; text-align: center; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; overflow: hidden; }";
  
  // Team Selection Overlay Styles
  html += "#setup-screen { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background: #111; }";
  html += ".team-btn { width: 80%; max-width: 300px; height: 50px; font-size: 20px; font-weight: bold; border-radius: 8px; border: none; margin: 10px; color: white; cursor: pointer; }";
  
  // NES Controller Shell Styles (Forces Landscape Layout)
  html += "#nes-pad { display: none; width: 100vw; height: 100vh; background: #ccd0d4; border-top: 15px solid #9ba0a4; box-sizing: border-box; position: relative; }";
  html += "#dark-stripe { width: 100%; height: 60%; background: #4f5358; position: absolute; top: 20%; border-top: 4px solid #3a3c40; border-bottom: 4px solid #3a3c40; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; }";
  
  // NES Classic D-Pad Styles
  html += ".dpad-container { position: relative; width: 140px; height: 140px; }";
  html += ".dpad-cross { background: #1a1a1a; position: absolute; border-radius: 6px; box-shadow: inset 0 0 5px #000; }";
  html += ".dpad-vert { width: 44px; height: 140px; left: 48px; top: 0; }";
  html += ".dpad-horiz { width: 140px; height: 44px; left: 0; top: 48px; }";
  html += ".dpad-btn { position: absolute; background: transparent; border: none; outline: none; z-index: 10; touch-action: manipulation; }";
  html += ".dpad-btn:active { background: rgba(255,0,0,0.2); border-radius: 4px; }";
  
  // Center Menu Option Buttons (Select/Start)
  html += ".center-buttons { display: flex; gap: 20px; position: absolute; left: 50%; transform: translateX(-50%); bottom: 25%; }";
  html += ".pill-button { display: flex; flex-direction: column; align-items: center; font-size: 11px; font-weight: bold; color: #ff3333; letter-spacing: 1px; }";
  html += ".pill-src { width: 45px; height: 12px; background: #7c8185; border-radius: 6px; border: 2px solid #1a1a1a; box-shadow: 2px 2px #333; }";
  html += ".pill-src:active { background: #5a5d5f; transform: translate(1px, 1px); box-shadow: 1px 1px #333; }";
  
  // Red Circular Action Buttons (A & B Elements)
  html += ".action-container { display: flex; gap: 25px; background: #a2a6aa; padding: 10px 15px; border-radius: 20px; border: 3px solid #7c8185; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3); }";
  html += ".red-btn-wrapper { display: flex; flex-direction: column-reverse; align-items: center; font-size: 18px; font-weight: bold; color: #ff3333; }";
  html += ".red-circle { width: 54px; height: 54px; background: #b81c22; border-radius: 50%; border: 3px solid #1a1a1a; box-shadow: 3px 3px 0px #4f5358; touch-action: manipulation; }";
  html += ".red-circle:active { background: #901217; transform: translate(2px, 2px); box-shadow: 1px 1px 0px #4f5358; }";
  
  html += "</style></head><body>";
  
  // Team Chooser Menu Panel
  html += "<div id='setup-screen'>";
  html += "<h2 style='color:#fff; margin-bottom:20px;'>SELECT YOUR TEAM</h2>";
  html += "<button class='team-btn' style='background:#ff3333;' onclick='join(1)'>RED FORCE</button>";
  html += "<button class='team-btn' style='background:#00aaff;' onclick='join(2)'>BLUE SQUAD</button>";
  html += "<button class='team-btn' style='background:#33cc33;' onclick='join(3)'>GREEN LEGION</button>";
  html += "</div>";
  
  // Horizontal NES Controller Layout Viewport Canvas
  html += "<div id='nes-pad'>";
  html += "  <div id='dark-stripe'>";
  
  // Left Side Element Block: D-Pad
  html += "    <div class='dpad-container'>";
  html += "      <div class='dpad-cross dpad-vert'></div>";
  html += "      <div class='dpad-cross dpad-horiz'></div>";
  html += "      <button class='dpad-btn' style='width:44px; height:48px; left:48px; top:0;' onclick='sendAction(\"UP\")'></button>";
  html += "      <button class='dpad-btn' style='width:44px; height:48px; left:48px; bottom:0;' onclick='sendAction(\"DOWN\")'></button>";
  html += "      <button class='dpad-btn' style='width:48px; height:44px; left:0; top:48px;' onclick='sendAction(\"LEFT\")'></button>";
  html += "      <button class='dpad-btn' style='width:48px; height:44px; right:0; top:48px;' onclick='sendAction(\"RIGHT\")'></button>";
  html += "    </div>";
  
  // Right Side Element Block: Action Core
  html += "    <div class='action-container'>";
  html += "      <div class='red-btn-wrapper'><span>B</span><button class='red-circle' onclick='sendAction(\"ESC\")'></button></div>";
  html += "      <div class='red-btn-wrapper'><span>A</span><button class='red-circle' onclick='sendAction(\"FIRE\")'></button></div>";
  html += "    </div>";
  
  html += "  </div>"; // End Dark Stripe
  
  // Center Core Elements: Select & Start
  html += "  <div class='center-buttons'>";
  html += "    <div class='pill-button'><span>SELECT</span><div class='pill-src'></div></div>";
  html += "    <div class='pill-button'><span>START</span><div class='pill-src'></div></div>";
  html += "  </div>";
  
  html += "</div>"; // End NES Pad
  
  html += "<script>";
  html += "let myFaction = 0;";
  html += "function join(team) {";
  html += "  myFaction = team;";
  html += "  fetch('http://192.168.4' + myFaction + '&cmd=JOIN');";
  html += "  document.getElementById('setup-screen').style.display = 'none';";
  html += "  document.getElementById('nes-pad').style.display = 'block';";
  html += "}";
  html += "function sendAction(cmd) {";
  html += "  fetch('http://192.168.4' + myFaction + '&cmd=' + cmd);";
  html += "}";
  html += "</script></body></html>";

  server.send(200, "text/html", html);
}

void handleAction() {
  if (server.hasArg("team") && server.hasArg("cmd")) {
    String team = server.arg("team");
    String cmd = server.arg("cmd");
    Serial.println(team + ":" + cmd); 
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "BAD REQUEST");
  }
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
  server.onNotFound(handleNotFound);
  server.begin();
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
}
