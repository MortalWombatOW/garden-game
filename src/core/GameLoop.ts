
import { Engine } from "./Engine";
import { World } from "./ECS";
import { TimeSystem } from "../systems/TimeSystem";

export class GameLoop {
    private engine: Engine;
    private world: World;
    private running: boolean = false;
    private timeSystem: TimeSystem | null = null;

    // Time control
    public timeScale: number = 1.0;

    // Simulation settings
    private readonly TICK_RATE = 10; // Ticks per second
    private readonly TICK_DT = 1000 / this.TICK_RATE;
    private accumulator: number = 0;

    constructor(engine: Engine, world: World) {
        this.engine = engine;
        this.world = world;
    }

    public setTimeSystem(timeSystem: TimeSystem): void {
        this.timeSystem = timeSystem;
    }

    public start(): void {
        if (this.running) return;
        this.running = true;

        this.engine.getEngine().runRenderLoop(() => {
            // Apply sleep time scale on top of user time scale
            const sleepScale = this.timeSystem?.getSleepTimeScale() ?? 1;
            const deltaTime = this.engine.getEngine().getDeltaTime() * this.timeScale * sleepScale;

            this.accumulator += deltaTime;

            // Fixed time step for simulation systems
            while (this.accumulator >= this.TICK_DT) {
                this.world.updateFixed(this.TICK_DT / 1000); // Pass DT in seconds
                this.accumulator -= this.TICK_DT;
            }

            // Render systems run every frame
            this.world.updateRender(deltaTime / 1000);

            // Render the scene
            this.engine.getScene().render();
        });

        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }

    public stop(): void {
        this.running = false;
        this.engine.getEngine().stopRenderLoop();
    }
}
