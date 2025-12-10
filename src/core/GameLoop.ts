
import { Engine } from "./Engine";
import { World } from "./ECS";

export class GameLoop {
    private engine: Engine;
    private world: World;
    private running: boolean = false;

    // Simulation settings
    private readonly TICK_RATE = 10; // Ticks per second
    private readonly TICK_DT = 1000 / this.TICK_RATE;
    private accumulator: number = 0;

    constructor(engine: Engine, world: World) {
        this.engine = engine;
        this.world = world;
    }

    public start(): void {
        if (this.running) return;
        this.running = true;

        this.engine.getEngine().runRenderLoop(() => {
            const deltaTime = this.engine.getEngine().getDeltaTime();

            this.accumulator += deltaTime;

            // Fixed time step for simulation
            while (this.accumulator >= this.TICK_DT) {
                this.world.update(this.TICK_DT / 1000); // Pass DT in seconds
                this.accumulator -= this.TICK_DT;
            }

            // Render every frame
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
