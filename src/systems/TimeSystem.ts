
import { System, World } from "../core/ECS";

export class TimeSystem extends System {
    public totalTime: number = 0;
    public dayLength: number = 600; // Seconds per day

    constructor(world: World) {
        super(world);
    }

    public update(deltaTime: number): void {
        this.totalTime += deltaTime;
        // const _timeOfDay = this.totalTime % this.dayLength;
        // console.log(`Time: ${timeOfDay}`);
    }
}
