
import { System, SystemType, World } from "../core/ECS";

export class TimeSystem extends System {
    public totalTime: number = 0;
    public dayLength: number = 120; // Real seconds per in-game day (2 minutes for testing)

    // Time scale: how many in-game hours pass per real second
    // With dayLength=120, we have 24 hours in 120 seconds = 0.2 hours/sec = 12 min/sec
    public readonly HOURS_PER_REAL_SECOND = 24 / 120; // 0.2 hours per real second

    // Sleep state
    private isSleeping: boolean = false;
    private sleepStartTime: number = 0;
    private sleepTargetTime: number = 0;
    private readonly MAX_SLEEP_TIME_SCALE = 20; // Peak time acceleration during sleep
    private onSleepComplete: (() => void) | null = null;

    // Weather state
    public rainIntensity: number = 0; // 0.0 to 1.0 (0=Dry, 1=Heavy Rain)
    private weatherTimer: number = 0;
    private nextWeatherChange: number = 10; // First change soon for testing
    private targetRainIntensity: number = 0;

    constructor(world: World) {
        super(world, SystemType.FIXED);
    }

    public update(deltaTime: number): void {
        this.totalTime += deltaTime;

        // Check if sleep is complete
        if (this.isSleeping && this.totalTime >= this.sleepTargetTime) {
            this.isSleeping = false;
            this.totalTime = this.sleepTargetTime; // Snap to exact target
            if (this.onSleepComplete) {
                this.onSleepComplete();
                this.onSleepComplete = null;
            }
        }

        this.updateWeather(deltaTime);
    }

    private updateWeather(deltaTime: number): void {
        this.weatherTimer += deltaTime;

        // Try to change weather
        if (this.weatherTimer >= this.nextWeatherChange) {
            this.weatherTimer = 0;
            // Randomize next change time (between 1/4 day and 1 day)
            this.nextWeatherChange = (0.25 + Math.random() * 0.75) * this.dayLength;

            // 30% chance of rain
            if (Math.random() < 0.3) {
                this.targetRainIntensity = 0.5 + Math.random() * 0.5; // 0.5 to 1.0 intensity
            } else {
                this.targetRainIntensity = 0;
            }
        }

        // Smoothly transition rain intensity
        const changeRate = 0.1 * deltaTime; // Change over ~10 seconds
        if (this.rainIntensity < this.targetRainIntensity) {
            this.rainIntensity = Math.min(this.targetRainIntensity, this.rainIntensity + changeRate);
        } else if (this.rainIntensity > this.targetRainIntensity) {
            this.rainIntensity = Math.max(this.targetRainIntensity, this.rainIntensity - changeRate);
        }
    }

    /**
     * Start sleeping until 6 AM. Returns a callback to restore time scale when done.
     */
    public startSleep(onComplete: () => void): boolean {
        if (this.isSleeping) return false;

        const currentFraction = this.getTimeOfDayFraction();
        const targetFraction = 0.25; // 6 AM

        let hoursToSleep: number;
        if (currentFraction < targetFraction) {
            // It's before 6 AM, sleep until 6 AM today
            hoursToSleep = (targetFraction - currentFraction) * 24;
        } else {
            // It's after 6 AM, sleep until 6 AM tomorrow
            hoursToSleep = (1 - currentFraction + targetFraction) * 24;
        }

        // Calculate target time
        const secondsToSleep = hoursToSleep / this.HOURS_PER_REAL_SECOND;

        this.isSleeping = true;
        this.sleepStartTime = this.totalTime;
        this.sleepTargetTime = this.totalTime + secondsToSleep;
        this.onSleepComplete = onComplete;

        return true;
    }

    /**
     * Get the current time scale multiplier for sleeping.
     * Uses a smooth sine curve: ramps up, peaks, then ramps down.
     */
    public getSleepTimeScale(): number {
        if (!this.isSleeping) return 1;

        const totalSleepDuration = this.sleepTargetTime - this.sleepStartTime;
        const elapsed = this.totalTime - this.sleepStartTime;
        const progress = Math.min(1, elapsed / totalSleepDuration);

        // Sine-based easing: 0 -> 1 -> 0 over the duration
        // sin(0) = 0, sin(π/2) = 1, sin(π) = 0
        const easing = Math.sin(progress * Math.PI);

        // Scale from 1x to MAX and back to 1x
        return 1 + easing * (this.MAX_SLEEP_TIME_SCALE - 1);
    }

    /**
     * Check if currently sleeping
     */
    public getIsSleeping(): boolean {
        return this.isSleeping;
    }

    /**
     * Cancel sleep early
     */
    public cancelSleep(): void {
        if (this.isSleeping) {
            this.isSleeping = false;
            if (this.onSleepComplete) {
                this.onSleepComplete();
                this.onSleepComplete = null;
            }
        }
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
        // Overlay rain icon if raining significantly
        if (this.rainIntensity > 0.2) {
            return "🌧️";
        }

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

