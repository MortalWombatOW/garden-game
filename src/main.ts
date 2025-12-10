
import { Engine } from "./core/Engine";
import { World } from "./core/ECS";
import { GameLoop } from "./core/GameLoop";
import { SpatialHashGrid } from "./core/SpatialHashGrid";
import { GrowthSystem } from "./systems/GrowthSystem";
import { InputSystem } from "./systems/InputSystem";
import { RenderSystem } from "./systems/RenderSystem";
import { TimeSystem } from "./systems/TimeSystem";
import { SoilSystem } from "./systems/SoilSystem";
import { ToolManager } from "./ui/ToolManager";
import "./style.css";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
if (!canvas) {
  throw new Error("Canvas not found");
}

// Initialize Engine
const engine = Engine.getInstance(canvas);

// Initialize World and managers
const world = new World();
const spatialHash = new SpatialHashGrid(2);
const toolManager = new ToolManager();

// Add Systems
const timeSystem = new TimeSystem(world);
const soilSystem = new SoilSystem(world);
const inputSystem = new InputSystem(world, spatialHash, toolManager);

// Wire dependencies
inputSystem.setSoilSystem(soilSystem);

world.addSystem(timeSystem);
world.addSystem(soilSystem);
world.addSystem(new GrowthSystem(world, timeSystem, soilSystem));
world.addSystem(inputSystem);
world.addSystem(new RenderSystem(world));

// HUD Update
const timeDisplay = document.getElementById("time-display");
function updateHUD(): void {
  if (timeDisplay) {
    timeDisplay.textContent = `${timeSystem.getSunIcon()} ${timeSystem.getFormattedTime()}`;
  }
  requestAnimationFrame(updateHUD);
}
updateHUD();

// Overlay Controls
const overlayBtn = document.getElementById("overlay-satisfaction");
const statusLabels = document.getElementById("status-labels");
let overlayActive = false;

function toggleOverlay(): void {
  overlayActive = !overlayActive;
  overlayBtn?.classList.toggle("active", overlayActive);
  statusLabels?.classList.toggle("hidden", !overlayActive);
}

overlayBtn?.addEventListener("click", toggleOverlay);
window.addEventListener("keydown", (e) => {
  if (e.key === "o" || e.key === "O") {
    toggleOverlay();
  }
});

// Start Loop
const loop = new GameLoop(engine, world);
loop.start();

// Time Controls
const speedButtons = document.querySelectorAll<HTMLButtonElement>(".speed-btn");
speedButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const speed = parseFloat(btn.dataset.speed || "1");
    loop.timeScale = speed;
    speedButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

console.log("Verdant started. Use toolbar or switch tools (1=Plant, 2=Inspect, 3=Water), O for overlay, Escape to deselect.");
