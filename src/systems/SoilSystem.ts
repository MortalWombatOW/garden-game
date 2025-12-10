
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";

/**
 * SoilSystem manages per-tile soil data with diffusion and absorption.
 * The world is divided into a grid of cells.
 */
export class SoilSystem extends System {
    private groundMaterial: BABYLON.StandardMaterial | null;
    private scene: BABYLON.Scene;

    // Per-tile moisture data (0-100)
    // Map key is "cellX,cellZ"
    private soilMoisture: Map<string, number> = new Map();
    public readonly CELL_SIZE = 1.0; // 1 unit per cell
    public readonly GRID_SIZE = 50;  // 50x50 grid
    private readonly HALF_SIZE = 25;

    // Diffusion parameters
    private readonly DIFFUSION_RATE = 0.01; // % of excess moisture to share per tick (reduced 80%)
    private readonly EVAPORATION_RATE = 0.001; // % moisture lost per tick globally
    private textureDirty = true;

    // Highlighting
    private highlightMesh: BABYLON.Mesh;

    // Texture for visualization
    private moistureTexture: BABYLON.DynamicTexture;
    private ctx: CanvasRenderingContext2D;

    constructor(world: World) {
        // Use FIXED for tick-based simulation
        super(world, SystemType.FIXED);
        const engine = Engine.getInstance();
        this.scene = engine.getScene();
        this.groundMaterial = engine.getGroundMaterial();

        // Create dynamic texture for soil visualization
        this.moistureTexture = new BABYLON.DynamicTexture("soilMoisture", { width: 512, height: 512 }, this.scene, false);
        this.ctx = this.moistureTexture.getContext() as unknown as CanvasRenderingContext2D;

        if (this.groundMaterial) {
            this.groundMaterial.diffuseTexture = this.moistureTexture;
            this.moistureTexture.vScale = 1;
            this.moistureTexture.uScale = 1;
        }

        // Initialize grid with baseline moisture
        this.initializeSoil();

        // Create highlight mesh
        this.highlightMesh = BABYLON.MeshBuilder.CreatePlane("soilHighlight", { size: this.CELL_SIZE }, this.scene);
        this.highlightMesh.rotation.x = Math.PI / 2;
        this.highlightMesh.position.y = 0.01;

        const hlMat = new BABYLON.StandardMaterial("soilHighlightMat", this.scene);
        hlMat.diffuseColor = new BABYLON.Color3(0, 0, 1);
        hlMat.alpha = 0.3;
        hlMat.zOffset = -1;
        this.highlightMesh.material = hlMat;
        this.highlightMesh.isVisible = false;
        this.highlightMesh.isPickable = false;

        // Initial render
        this.updateTexture();
    }

    private initializeSoil(): void {
        for (let x = -this.HALF_SIZE; x < this.HALF_SIZE; x++) {
            for (let z = -this.HALF_SIZE; z < this.HALF_SIZE; z++) {
                // Natural noise pattern (10-30% base moisture)
                const noise = Math.sin(x * 0.2) * Math.cos(z * 0.2) * 10;
                const baseMoisture = 20 + noise;
                this.soilMoisture.set(`${x},${z}`, Math.max(5, Math.min(35, baseMoisture)));
            }
        }
    }

    public getKey(x: number, z: number): string {
        const cellX = Math.floor(x / this.CELL_SIZE);
        const cellZ = Math.floor(z / this.CELL_SIZE);
        return `${cellX},${cellZ}`;
    }

    public getCellCoords(x: number, z: number): { cellX: number; cellZ: number } {
        return {
            cellX: Math.floor(x / this.CELL_SIZE),
            cellZ: Math.floor(z / this.CELL_SIZE)
        };
    }

    public getMoistureAt(x: number, z: number): number {
        const key = this.getKey(x, z);
        return this.soilMoisture.get(key) || 0;
    }

    public getMoistureAtCell(cellX: number, cellZ: number): number {
        return this.soilMoisture.get(`${cellX},${cellZ}`) || 0;
    }

    public modifyMoistureAt(x: number, z: number, amount: number): void {
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const key = `${cellX},${cellZ}`;

        const current = this.soilMoisture.get(key) || 0;
        const newVal = Math.max(0, Math.min(100, current + amount));
        this.soilMoisture.set(key, newVal);
        this.textureDirty = true;
    }

    /**
     * Absorb water from soil within a given radius of a world position.
     * Returns the total amount actually absorbed.
     */
    public absorbWater(worldX: number, worldZ: number, radius: number, maxAmount: number): number {
        const { cellX: centerX, cellZ: centerZ } = this.getCellCoords(worldX, worldZ);
        const cellRadius = Math.ceil(radius / this.CELL_SIZE);

        let totalAvailable = 0;
        const cellsInRange: { key: string; moisture: number }[] = [];

        // Scan cells in radius
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const cx = centerX + dx;
                const cz = centerZ + dz;

                // Check bounds
                if (cx < -this.HALF_SIZE || cx >= this.HALF_SIZE) continue;
                if (cz < -this.HALF_SIZE || cz >= this.HALF_SIZE) continue;

                // Check distance (circle, not square)
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > cellRadius) continue;

                const key = `${cx},${cz}`;
                const moisture = this.soilMoisture.get(key) || 0;
                if (moisture > 0) {
                    cellsInRange.push({ key, moisture });
                    totalAvailable += moisture;
                }
            }
        }

        if (totalAvailable === 0 || cellsInRange.length === 0) return 0;

        // Take proportionally from each cell, up to maxAmount
        const toAbsorb = Math.min(maxAmount, totalAvailable * 0.5); // Take at most 50% of available
        let absorbed = 0;

        for (const cell of cellsInRange) {
            const share = (cell.moisture / totalAvailable) * toAbsorb;
            const newMoisture = Math.max(0, cell.moisture - share);
            this.soilMoisture.set(cell.key, newMoisture);
            absorbed += share;
        }

        this.textureDirty = true;
        return absorbed;
    }

    public showHighlight(x: number, z: number, visible: boolean): void {
        if (!visible) {
            this.highlightMesh.isVisible = false;
            return;
        }

        const { cellX, cellZ } = this.getCellCoords(x, z);
        this.highlightMesh.position.x = cellX * this.CELL_SIZE + this.CELL_SIZE / 2;
        this.highlightMesh.position.z = cellZ * this.CELL_SIZE + this.CELL_SIZE / 2;
        this.highlightMesh.isVisible = true;
    }

    private updateTexture(): void {
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(0, 0, 512, 512);

        const pxPerCell = 512 / this.GRID_SIZE;

        this.soilMoisture.forEach((moisture, key) => {
            const [cx, cz] = key.split(',').map(Number);

            const tx = (cx + this.HALF_SIZE) * pxPerCell;
            const gridZ = cz + this.HALF_SIZE;
            const ty = (this.GRID_SIZE - 1 - gridZ) * pxPerCell;

            const t = moisture / 100;
            const r = 180 - t * 120;
            const g = 140 - t * 100;
            const b = 100 - t * 75;

            this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            this.ctx.fillRect(tx, ty, pxPerCell + 1, pxPerCell + 1);
        });

        this.moistureTexture.update();
        this.textureDirty = false;
    }

    public update(_deltaTime: number): void {
        // Run diffusion simulation
        this.diffuse();

        // Global evaporation
        this.evaporate();

        // Update texture if dirty
        if (this.textureDirty) {
            this.updateTexture();
        }
    }

    private diffuse(): void {
        // Create a copy to read from while writing
        const newMoisture = new Map<string, number>();

        for (let x = -this.HALF_SIZE; x < this.HALF_SIZE; x++) {
            for (let z = -this.HALF_SIZE; z < this.HALF_SIZE; z++) {
                const key = `${x},${z}`;
                const current = this.soilMoisture.get(key) || 0;

                // Get neighbors
                const neighbors = [
                    { nx: x - 1, nz: z },
                    { nx: x + 1, nz: z },
                    { nx: x, nz: z - 1 },
                    { nx: x, nz: z + 1 }
                ];

                let outflow = 0;
                let inflow = 0;

                for (const { nx, nz } of neighbors) {
                    if (nx < -this.HALF_SIZE || nx >= this.HALF_SIZE) continue;
                    if (nz < -this.HALF_SIZE || nz >= this.HALF_SIZE) continue;

                    const neighborMoisture = this.soilMoisture.get(`${nx},${nz}`) || 0;
                    const diff = current - neighborMoisture;

                    if (diff > 0) {
                        // We are wetter - give water away
                        outflow += diff * this.DIFFUSION_RATE;
                    } else {
                        // Neighbor is wetter - receive water
                        inflow += (-diff) * this.DIFFUSION_RATE;
                    }
                }

                // Calculate new value
                const newVal = Math.max(0, Math.min(100, current - outflow + inflow));
                newMoisture.set(key, newVal);
            }
        }

        // Apply changes
        this.soilMoisture = newMoisture;
        this.textureDirty = true;
    }

    private evaporate(): void {
        this.soilMoisture.forEach((moisture, key) => {
            const newVal = Math.max(0, moisture - this.EVAPORATION_RATE);
            this.soilMoisture.set(key, newVal);
        });
    }
}
