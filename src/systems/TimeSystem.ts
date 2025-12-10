
import { System, SystemType, World } from "../core/ECS";

export class TimeSystem extends System {
    public totalTime: number = 0;
    public dayLength: number = 120; // Real seconds per in-game day (2 minutes for testing)

    // Time scale: how many in-game hours pass per real second
    // With dayLength=120, we have 24 hours in 120 seconds = 0.2 hours/sec = 12 min/sec
    public readonly HOURS_PER_REAL_SECOND = 24 / 120; // 0.2 hours per real second

    constructor(world: World) {
        super(world, SystemType.FIXED);
    }

    public update(deltaTime: number): void {
        this.totalTime += deltaTime;
    }

    /**
     * Convert real-time delta to in-game time delta (in hours)
     */
    public toGameTime(realDeltaSeconds: number): number {
        return realDeltaSeconds * this.HOURS_PER_REAL_SECOND;
    }

    /**
     * Get current day number (0-indexed)
     */
    public getCurrentDay(): number {
        return Math.floor(this.totalTime / this.dayLength);
    }

    /**
     * Get the current time of day as a fraction (0-1) where:
     * 0.0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm
     */
    public getTimeOfDayFraction(): number {
        return (this.totalTime % this.dayLength) / this.dayLength;
    }

    /**
     * Get formatted 24-hour time string (HH:MM)
     */
    public getFormattedTime(): string {
        const fraction = this.getTimeOfDayFraction();
        const totalMinutes = Math.floor(fraction * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Get sun icon based on time of day
     */
    public getSunIcon(): string {
        const fraction = this.getTimeOfDayFraction();
        if (fraction < 0.25 || fraction >= 0.85) {
            return "🌙"; // Night
        } else if (fraction < 0.35 || fraction >= 0.75) {
            return "🌅"; // Dawn/Dusk
        } else {
            return "☀️"; // Day
        }
    }
}
