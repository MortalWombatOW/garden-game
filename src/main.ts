
import { Engine } from "./core/Engine";
import { World } from "./core/ECS";
import { GameLoop } from "./core/GameLoop";
import { SpatialHashGrid } from "./core/SpatialHashGrid";
import { GrowthSystem } from "./systems/GrowthSystem";
import { InputSystem } from "./systems/InputSystem";
import { RenderSystem } from "./systems/RenderSystem";
import { TimeSystem } from "./systems/TimeSystem";
import { SoilSystem } from "./systems/SoilSystem";
import { LightingSystem } from "./systems/LightingSystem";
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

// Create Player Entity
import { PlayerState } from "./components/PlayerState";
import { TransformComponent } from "./components/TransformComponent";

const playerEntity = world.createEntity();
playerEntity.addComponent(new PlayerState());
// Give player a transform so they exist somewhere (optional, but good for spatial queries if needed later)
playerEntity.addComponent(new TransformComponent(0, 0, 0));

const inputSystem = new InputSystem(world, spatialHash, toolManager, soilSystem, playerEntity);

// Wire dependencies

world.addSystem(timeSystem);
world.addSystem(soilSystem);
const lightingSystem = new LightingSystem(world, timeSystem);
world.addSystem(lightingSystem);

// Wire lighting dependencies after lightingSystem is created
soilSystem.setLightingSystem(lightingSystem);
const growthSystem = new GrowthSystem(world, timeSystem, soilSystem, spatialHash);
growthSystem.setLightingSystem(lightingSystem);
world.addSystem(growthSystem);

import { BuildingSystem } from "./systems/BuildingSystem";
const buildingSystem = new BuildingSystem(world, soilSystem, timeSystem);
world.addSystem(buildingSystem);

import { DecaySystem } from "./systems/DecaySystem";
const decaySystem = new DecaySystem(world, timeSystem, soilSystem);
world.addSystem(decaySystem);


world.addSystem(inputSystem);

const renderSystem = new RenderSystem(world);
renderSystem.setLightingSystem(lightingSystem);
world.addSystem(renderSystem);

import { WaterGraphSystem } from "./systems/WaterGraphSystem";
const waterGraphSystem = new WaterGraphSystem(world);
world.addSystem(waterGraphSystem);

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
  if (e.key === "i" || e.key === "I") {
    engine.toggleInspector();
  }
});

// Water View Controls
const waterBtn = document.getElementById("overlay-water");
let waterOverlayActive = false;

function toggleWaterOverlay(): void {
  waterOverlayActive = !waterOverlayActive;
  waterBtn?.classList.toggle("active", waterOverlayActive);
  soilSystem.setWaterOverlay(waterOverlayActive);
  renderSystem.setWaterOverlay(waterOverlayActive);
  waterGraphSystem.setVisible(waterOverlayActive);
}

waterBtn?.addEventListener("click", toggleWaterOverlay);
window.addEventListener("keydown", (e) => {
  if (e.key === "p" || e.key === "P") {
    toggleWaterOverlay();
  }
});

// Start Loop
const loop = new GameLoop(engine, world);
loop.setTimeSystem(timeSystem);
loop.start();

// Time Controls
const speedButtons = document.querySelectorAll<HTMLButtonElement>(".speed-btn:not(#sleep-btn)");
const sleepBtn = document.getElementById("sleep-btn");

speedButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    // Cancel any active sleep when manually changing speed
    timeSystem.cancelSleep();
    sleepBtn?.classList.remove("active");

    const speed = parseFloat(btn.dataset.speed || "1");
    loop.timeScale = speed;
    speedButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// Sleep Button
sleepBtn?.addEventListener("click", () => {
  if (timeSystem.getIsSleeping()) {
    // Cancel sleep if already sleeping
    timeSystem.cancelSleep();
    return;
  }

  // Visual feedback - mark sleep button as active
  sleepBtn.classList.add("active");

  timeSystem.startSleep(() => {
    // Sleep complete - restore normal visuals
    sleepBtn.classList.remove("active");
  });
});

console.log("Verdant started. Use toolbar or switch tools (1=Plant, 2=Inspect, 3=Water), O for overlay, Escape to deselect.");
