
import { System, SystemType, World } from "../core/ECS";
import { TimeSystem } from "./TimeSystem";
import { SoilSystem } from "./SoilSystem";
import { Needs } from "../components/Needs";
import { PlantState } from "../components/PlantState";

interface DataPoint {
    time: number; // Real time
    soilWater: number;
    plantWater: number;
}

export class WaterGraphSystem extends System {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private container: HTMLElement;
    private isVisible: boolean = false;
    private dataHistory: DataPoint[] = [];
    private timeSystem: TimeSystem | null = null;
    private soilSystem: SoilSystem | null = null;

    private readonly UPDATE_INTERVAL = 0.5; // Update every 0.5s
    private timer = 0;

    constructor(world: World) {
        super(world, SystemType.RENDER);

        // Create UI Container
        this.container = document.createElement("div");
        this.container.id = "water-graph-container";
        this.container.style.position = "absolute";
        this.container.style.top = "150px";
        this.container.style.right = "20px";
        this.container.style.width = "320px";
        this.container.style.height = "220px";
        this.container.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
        this.container.style.border = "1px solid #444";
        this.container.style.borderRadius = "8px";
        this.container.style.padding = "10px";
        this.container.style.display = "none"; // Hidden by default
        this.container.style.zIndex = "100"; // Ensure on top
        this.container.style.fontFamily = "monospace";
        this.container.style.color = "#eee";

        // Title
        const title = document.createElement("div");
        title.innerHTML = "<strong>Water Balance (last 24h)</strong>";
        title.style.fontSize = "12px";
        title.style.marginBottom = "5px";
        title.style.textAlign = "center";
        this.container.appendChild(title);

        // Legend
        const legend = document.createElement("div");
        legend.style.display = "flex";
        legend.style.justifyContent = "space-around";
        legend.style.fontSize = "10px";
        legend.style.marginBottom = "5px";
        legend.innerHTML = `
            <span style="color: #4488ff">■ Soil Moisture</span>
            <span style="color: #44ff88">■ Plant Water</span>
        `;
        this.container.appendChild(legend);

        // Canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = 300;
        this.canvas.height = 160;
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext("2d")!;

        document.body.appendChild(this.container);
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.container.style.display = visible ? "block" : "none";
        this.container.classList.toggle("visible", visible);
        if (visible) {
            this.drawGraph();
        }
    }

    public update(deltaTime: number): void {
        // Resolve dependencies lazily
        if (!this.timeSystem) {
            this.timeSystem = this.world.getSystem(TimeSystem) as TimeSystem;
        }
        if (!this.soilSystem) {
            const sys = this.world.getSystem(SoilSystem);
            if (sys) this.soilSystem = sys as SoilSystem;
        }

        // Cannot function without dependencies
        if (!this.timeSystem || !this.soilSystem) return;

        // Record data periodically
        this.timer += deltaTime;
        if (this.timer >= this.UPDATE_INTERVAL) {
            this.timer = 0;
            this.recordData();
        }

        // Draw every frame if visible (or could throttle this too)
        if (this.isVisible) {
            this.drawGraph();
        }
    }

    private recordData(): void {
        if (!this.timeSystem || !this.soilSystem) return;

        const soilWater = this.soilSystem.getTotalMoisture();

        let plantWater = 0;
        // Count water in all living plants
        const plants = this.world.getEntitiesWithComponent(Needs);
        for (const entity of plants) {
            const needs = entity.getComponent(Needs);
            const plantState = entity.getComponent(PlantState);
            // Only count if it's a plant (has plant state)
            if (needs && plantState) {
                plantWater += needs.water;
            }
        }

        const now = this.timeSystem.totalTime;
        this.dataHistory.push({
            time: now,
            soilWater,
            plantWater
        });

        // Window pruning
        // 24 game hours
        const windowRealSeconds = 24 / this.timeSystem.HOURS_PER_REAL_SECOND;

        // Remove points older than the window
        while (this.dataHistory.length > 0 && (now - this.dataHistory[0].time > windowRealSeconds)) {
            this.dataHistory.shift();
        }
    }

    private drawGraph(): void {
        if (this.dataHistory.length < 2) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        // clear
        ctx.clearRect(0, 0, width, height);

        // Background grid ?
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(width, height);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, height);
        ctx.stroke();

        // Calculate min/max for auto-scaling
        let minSoil = Infinity, maxSoil = -Infinity;
        let minPlant = Infinity, maxPlant = -Infinity;

        for (const p of this.dataHistory) {
            if (p.soilWater < minSoil) minSoil = p.soilWater;
            if (p.soilWater > maxSoil) maxSoil = p.soilWater;
            if (p.plantWater < minPlant) minPlant = p.plantWater;
            if (p.plantWater > maxPlant) maxPlant = p.plantWater;
        }

        // Add some padding to ranges
        const soilRange = (maxSoil - minSoil) * 1.1 || 100;
        const soilBase = minSoil * 0.9;

        const plantRange = (maxPlant - minPlant) * 1.1 || 100;
        const plantBase = minPlant * 0.9;

        // Helper to map time to x
        const startTime = this.dataHistory[0].time;
        const endTime = this.dataHistory[this.dataHistory.length - 1].time;
        const timeRange = endTime - startTime || 1;

        const getX = (t: number) => {
            return ((t - startTime) / timeRange) * width;
        };

        const getYSoil = (val: number) => {
            // Normalized 0-1
            const n = (val - soilBase) / soilRange;
            // Flip y (canvas 0 is top)
            return height - (n * height);
        };

        const getYPlant = (val: number) => {
            const n = (val - plantBase) / plantRange;
            return height - (n * height);
        };

        // Draw Soil Line
        ctx.strokeStyle = "#4488ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        let first = true;
        for (const p of this.dataHistory) {
            const x = getX(p.time);
            const y = getYSoil(p.soilWater);
            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw Plant Line
        ctx.strokeStyle = "#44ff88";
        ctx.lineWidth = 2;
        ctx.beginPath();
        first = true;
        for (const p of this.dataHistory) {
            const x = getX(p.time);
            const y = getYPlant(p.plantWater);
            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw Current Values (Text)
        if (this.dataHistory.length > 0) {
            const last = this.dataHistory[this.dataHistory.length - 1];

            ctx.fillStyle = "#4488ff";
            ctx.font = "10px monospace";
            ctx.fillText(last.soilWater.toFixed(0), width - 50, getYSoil(last.soilWater) - 5);

            ctx.fillStyle = "#44ff88";
            ctx.fillText(last.plantWater.toFixed(0), width - 50, getYPlant(last.plantWater) - 5);
        }
    }
}
