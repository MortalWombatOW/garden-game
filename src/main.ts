
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
import { DiegeticUISystem } from "./systems/DiegeticUISystem";
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

// Initialize Diegetic 3D UI System (after camera is ready)
const diegeticUISystem = new DiegeticUISystem(world, toolManager);
world.addSystem(diegeticUISystem);

// Keyboard shortcuts for overlays and inspector
window.addEventListener("keydown", (e) => {
  if (e.key === "o" || e.key === "O") {
    // Toggle plant satisfaction overlay
    const currentState = renderSystem["overlayEnabled"];
    renderSystem.setOverlayEnabled(!currentState);
  }
  if (e.key === "i" || e.key === "I") {
    engine.toggleInspector();
  }
  if (e.key === "p" || e.key === "P") {
    // Toggle water overlay
    const currentState = renderSystem["waterOverlayEnabled"];
    soilSystem.setWaterOverlay(!currentState);
    renderSystem.setWaterOverlay(!currentState);
    waterGraphSystem.setVisible(!currentState);
  }
});

// Start Loop
const loop = new GameLoop(engine, world);
loop.setTimeSystem(timeSystem);
loop.start();

console.log("Verdant started. Use 3D toolbar or keyboard shortcuts (1=Plant, 2=Inspect, 3=Water, 4=Build, 5=Compost, 6=Harvest), O for overlay, P for water view, Escape to deselect.");
