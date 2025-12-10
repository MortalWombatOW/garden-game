
import { Engine } from "./core/Engine";
import { World } from "./core/ECS";
import { GameLoop } from "./core/GameLoop";
import { GrowthSystem } from "./systems/GrowthSystem";
import { InputSystem } from "./systems/InputSystem";
import { RenderSystem } from "./systems/RenderSystem";
import { TimeSystem } from "./systems/TimeSystem";
import { PlantState } from "./components/PlantState";
import { Needs } from "./components/Needs";
import "./style.css";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
if (!canvas) {
  throw new Error("Canvas not found");
}

// Initialize Engine
const engine = Engine.getInstance(canvas);

// Initialize World
const world = new World();

// Add Systems
world.addSystem(new InputSystem(world));
world.addSystem(new TimeSystem(world));
world.addSystem(new GrowthSystem(world));
world.addSystem(new RenderSystem(world));

// Create a test entity
const plant = world.createEntity();
plant.addComponent(new PlantState());
plant.addComponent(new Needs());

// Start Loop
const loop = new GameLoop(engine, world);
loop.start();
