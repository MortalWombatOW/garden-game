
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import { TimeSystem } from "./TimeSystem";
import type { LightingSystem } from "./LightingSystem";

/**
 * SoilSystem manages per-tile soil data with diffusion and absorption.
 * The world is divided into a grid of cells.
 */
export class SoilSystem extends System {
    private groundMaterial: BABYLON.StandardMaterial | null;
    private scene: BABYLON.Scene;

    // Per-tile moisture data (0-100)
    // Double buffer approach: current and next state
    private moistureData: Float32Array;
    private nextMoistureData: Float32Array;



    // Per-tile nitrogen data (0-100)
    private nitrogenData: Float32Array;
    private nextNitrogenData: Float32Array;

    public readonly CELL_SIZE = 1.0; // 1 unit per cell
    public readonly GRID_SIZE = 50;  // 50x50 grid
    private readonly HALF_SIZE = 25;

    // Diffusion parameters
    private readonly DIFFUSION_RATE = 0.1; // % of excess moisture to share per tick 
    private readonly SOIL_EVAPORATION_RATE = 0.002; // Slow drying of soil (~0.1/sec)

    private readonly SATURATION_THRESHOLD = 100; // Moisture level where soil can't hold more
    private readonly SHADOW_EVAP_MULTIPLIER = 0.2; // Evaporation rate multiplier in shadow
    private textureDirty = true;

    // Lighting reference for sun-aware evaporation
    private lightingSystem: LightingSystem | null = null;
    private timeSystem: TimeSystem | null = null;

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

        // Initialize buffers
        const size = this.GRID_SIZE * this.GRID_SIZE;
        this.moistureData = new Float32Array(size);
        this.nextMoistureData = new Float32Array(size);

        this.nitrogenData = new Float32Array(size);
        this.nextNitrogenData = new Float32Array(size);

        // Create dynamic texture for soil visualization
        // Match texture size to grid size for 1:1 pixel mapping
        this.moistureTexture = new BABYLON.DynamicTexture("soilMoisture", { width: this.GRID_SIZE, height: this.GRID_SIZE }, this.scene, false);
        this.moistureTexture.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
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

    private getIndex(x: number, z: number): number {
        const gridX = x + this.HALF_SIZE;
        const gridZ = z + this.HALF_SIZE;
        if (gridX < 0 || gridX >= this.GRID_SIZE || gridZ < 0 || gridZ >= this.GRID_SIZE) {
            return -1;
        }
        return gridZ * this.GRID_SIZE + gridX;
    }

    /**
     * Get the total amount of moisture in the soil (sum of all cells)
     */
    public getTotalMoisture(): number {
        let total = 0;
        for (let i = 0; i < this.moistureData.length; i++) {
            total += this.moistureData[i];
        }
        return total;
    }

    private initializeSoil(): void {
        for (let x = -this.HALF_SIZE; x < this.HALF_SIZE; x++) {
            for (let z = -this.HALF_SIZE; z < this.HALF_SIZE; z++) {
                // Natural noise pattern (10-30% base moisture)
                const moistureNoise = Math.sin(x * 0.2) * Math.cos(z * 0.2) * 10;
                const baseMoisture = 20 + moistureNoise;

                // Nitrogen noise (10-25% base)
                const nitrogenNoise = Math.cos(x * 0.15) * Math.sin(z * 0.15) * 7;
                const baseNitrogen = 15 + nitrogenNoise;

                const index = this.getIndex(x, z);
                if (index !== -1) {
                    this.moistureData[index] = Math.max(5, Math.min(35, baseMoisture));
                    this.nitrogenData[index] = Math.max(5, Math.min(30, baseNitrogen));
                }
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
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const index = this.getIndex(cellX, cellZ);
        if (index === -1) return 0;
        return this.moistureData[index];
    }

    public getMoistureAtCell(cellX: number, cellZ: number): number {
        const index = this.getIndex(cellX, cellZ);
        if (index === -1) return 0;
        return this.moistureData[index];
    }



    public modifyMoistureAt(x: number, z: number, amount: number): void {
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const index = this.getIndex(cellX, cellZ);

        if (index !== -1) {
            const currentSoil = this.moistureData[index];
            if (amount > 0) {
                // Add water, but clamp to saturation (no pooling)
                this.moistureData[index] = Math.min(this.SATURATION_THRESHOLD, currentSoil + amount);
            } else {
                // Taking water - prevent going below 0
                this.moistureData[index] = Math.max(0, currentSoil + amount);
            }
            this.textureDirty = true;
        }
    }

    public getNitrogenAt(x: number, z: number): number {
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const index = this.getIndex(cellX, cellZ);
        if (index === -1) return 0;
        return this.nitrogenData[index];
    }

    public getNitrogenAtCell(cellX: number, cellZ: number): number {
        const index = this.getIndex(cellX, cellZ);
        if (index === -1) return 0;
        return this.nitrogenData[index];
    }

    public modifyNitrogenAt(x: number, z: number, amount: number): void {
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const index = this.getIndex(cellX, cellZ);

        if (index !== -1) {
            const current = this.nitrogenData[index];
            const newVal = Math.max(0, Math.min(100, current + amount));
            this.nitrogenData[index] = newVal;
            this.textureDirty = true;
        }
    }

    /**
     * Absorb water from soil within a given radius of a world position.
     * Returns the total amount actually absorbed.
     */
    public absorbWater(worldX: number, worldZ: number, radius: number, maxAmount: number): number {
        const { cellX: centerX, cellZ: centerZ } = this.getCellCoords(worldX, worldZ);
        const cellRadius = Math.ceil(radius / this.CELL_SIZE);

        let totalAvailable = 0;
        const cellsInRange: { index: number; moisture: number }[] = [];

        // Scan cells in radius
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const cx = centerX + dx;
                const cz = centerZ + dz;

                // Check distance (circle, not square)
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > cellRadius) continue;

                const index = this.getIndex(cx, cz);
                if (index === -1) continue;

                const moisture = this.moistureData[index];
                if (moisture > 0) {
                    cellsInRange.push({ index, moisture });
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
            // First try to take from surface water (free water) if it exists at this cell
            // But cellsInRange currently only looks at moistureData. 
            // For now, keep as is affecting moistureData, but ideally plants could drink surface water too.
            const newMoisture = Math.max(0, cell.moisture - share);
            this.moistureData[cell.index] = newMoisture;
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
        const worldX = cellX * this.CELL_SIZE + this.CELL_SIZE / 2;
        const worldZ = cellZ * this.CELL_SIZE + this.CELL_SIZE / 2;
        const terrainY = Engine.getInstance().getTerrainHeightAt(worldX, worldZ);
        this.highlightMesh.position.x = worldX;
        this.highlightMesh.position.y = terrainY + 0.01;
        this.highlightMesh.position.z = worldZ;
        this.highlightMesh.isVisible = true;
    }

    // Water Overlay
    private waterOverlayEnabled = false;

    public setWaterOverlay(enabled: boolean): void {
        this.waterOverlayEnabled = enabled;
        // When overlay is enabled, switch to Emissive for "unaffected by sunlight"
        if (this.groundMaterial) {
            if (enabled) {
                this.groundMaterial.diffuseTexture = null;
                this.groundMaterial.emissiveTexture = this.moistureTexture;
                // DON'T set emissiveColor to white - it overrides everything!
                // Keep it at default (black) so texture colors show through
                this.groundMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                this.groundMaterial.disableLighting = true;
            } else {
                this.groundMaterial.emissiveTexture = null;
                this.groundMaterial.diffuseTexture = this.moistureTexture;
                this.groundMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                this.groundMaterial.disableLighting = false;
            }
        }
        this.textureDirty = true;
    }

    private updateTexture(): void {
        const size = this.GRID_SIZE;
        const imgData = this.ctx.createImageData(size, size);
        const data = imgData.data;

        if (this.waterOverlayEnabled) {
            // HEATMAP MODE
            for (let i = 0; i < this.moistureData.length; i++) {
                const moisture = this.moistureData[i];
                const normalized = moisture / 100;

                // Index in the texture data (flip Y to match grid)
                const x = i % size;
                const z = Math.floor(i / size);
                // Grid (0,0) is bottom-left (z=0), but image (0,0) is top-left.
                // We need to map grid Z to image Y such that Z=0 -> Y=size-1
                const imgY = size - 1 - z;
                const dataIndex = (imgY * size + x) * 4;

                // Blue channel: Always bright (200-255)
                const b = Math.floor(200 + normalized * 55);
                // Green channel: 0 -> 255 (creates blue -> cyan transition)
                const g = Math.floor(normalized * 255);
                // Red channel: slight hint at high moisture for "glow" effect
                const r = Math.floor(normalized * 50);

                data[dataIndex] = r;
                data[dataIndex + 1] = g;
                data[dataIndex + 2] = b;
                data[dataIndex + 3] = 255; // Alpha
            }
        } else {
            // NORMAL MODE
            for (let i = 0; i < this.moistureData.length; i++) {
                const moisture = this.moistureData[i];

                const x = i % size;
                const z = Math.floor(i / size);
                const imgY = size - 1 - z;
                const dataIndex = (imgY * size + x) * 4;

                // Base soil color blended with moisture darkening
                const t = moisture / 100;
                const r = 180 - t * 120;
                const g = 140 - t * 100;
                const b = 100 - t * 75;

                data[dataIndex] = Math.floor(r);
                data[dataIndex + 1] = Math.floor(g);
                data[dataIndex + 2] = Math.floor(b);
                data[dataIndex + 3] = 255; // Alpha
            }
        }

        this.ctx.putImageData(imgData, 0, 0);
        this.moistureTexture.update();
        this.textureDirty = false;
    }

    private debugTimer: number = 0;

    public update(_deltaTime: number): void {
        // Find TimeSystem if missing (cannot inject in constructor due to cycle or load order)
        if (!this.timeSystem) {
            const timeSystem = this.world.getSystem(TimeSystem);
            if (timeSystem) this.timeSystem = timeSystem as TimeSystem;
        }

        // Apply rain if it's raining
        // Apply rain if it's raining
        if (this.timeSystem && this.timeSystem.rainIntensity > 0) {
            // Scale rain by deltaTime
            const rainAmount = this.timeSystem.rainIntensity * 1.5 * _deltaTime;
            for (let i = 0; i < this.moistureData.length; i++) {
                // Rain falls directly into soil, up to saturation
                const current = this.moistureData[i];
                if (current < this.SATURATION_THRESHOLD) {
                    this.moistureData[i] = Math.min(this.SATURATION_THRESHOLD, current + rainAmount);
                }
            }
            this.textureDirty = true;
        }

        // Run diffusion simulation
        this.diffuse(_deltaTime);

        // Global evaporation
        this.evaporate(_deltaTime);

        // Update texture if dirty
        if (this.textureDirty) {
            this.updateTexture();
        }

        // Debug Logging (every 1 second)
        this.debugTimer += _deltaTime;
        if (this.debugTimer > 1.0) {
            this.debugTimer = 0;
            this.logStats();
        }
    }

    private logStats(): void {
        let totalMoisture = 0;
        let maxMoisture = 0;
        let minMoisture = 100;

        for (let i = 0; i < this.moistureData.length; i++) {
            const m = this.moistureData[i];
            totalMoisture += m;
            if (m > maxMoisture) maxMoisture = m;
            if (m < minMoisture) minMoisture = m;
        }

        const avgMoisture = totalMoisture / this.moistureData.length;
        const rain = this.timeSystem ? this.timeSystem.rainIntensity.toFixed(2) : "0.00";

        console.log(`[SoilSystem] Rain: ${rain}, M_Avg: ${avgMoisture.toFixed(2)}, M_Max: ${maxMoisture.toFixed(2)}`);
    }

    private diffuse(deltaTime: number): void {
        const size = this.GRID_SIZE;
        // Adjust rates by deltaTime, but CLAMP them to prevent locking/exploding on lag spikes
        // Max safe rate per neighbor (4 neighbors) is 0.25. Let's stay well below that.
        const dt = Math.min(deltaTime, 0.05); // Cap physics step at 20fps equivalent (50ms)

        const diffusionRate = Math.min(0.2, this.DIFFUSION_RATE * dt * 60);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const index = z * size + x;
                const currentMoisture = this.moistureData[index];
                const currentNitrogen = this.nitrogenData[index];

                // Direct neighbor access using offsets
                let moistureOutflow = 0;
                let moistureInflow = 0;
                let nitrogenOutflow = 0;
                let nitrogenInflow = 0;

                // Helper to check neighbor for moisture
                const checkMoistureNeighbor = (nIndex: number) => {
                    const neighborMoisture = this.moistureData[nIndex];
                    const diff = currentMoisture - neighborMoisture;
                    if (diff > 0) {
                        moistureOutflow += diff * diffusionRate;
                    } else {
                        moistureInflow += (-diff) * diffusionRate;
                    }
                };

                // Helper to check neighbor for nitrogen
                const checkNitrogenNeighbor = (nIndex: number) => {
                    const neighborNitrogen = this.nitrogenData[nIndex];
                    const diff = currentNitrogen - neighborNitrogen;
                    if (diff > 0) {
                        nitrogenOutflow += diff * diffusionRate;
                    } else {
                        nitrogenInflow += (-diff) * diffusionRate;
                    }
                };

                // West (x-1)
                if (x > 0) {
                    const nIndex = index - 1;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                // East (x+1)
                if (x < size - 1) {
                    const nIndex = index + 1;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                // South (z-1)
                if (z > 0) {
                    const nIndex = index - size;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                // North (z+1)
                if (z < size - 1) {
                    const nIndex = index + size;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }

                // Balance flows - Ensure we don't give away more than we have

                // 2. Moisture Normalization
                const totalMoistureOut = moistureOutflow;
                let actualMoistureOutflow = moistureOutflow;

                if (totalMoistureOut > currentMoisture) {
                    const ratio = currentMoisture / totalMoistureOut;
                    actualMoistureOutflow *= ratio;
                }

                // 3. Nitrogen Normalization
                const totalNitrogenOut = nitrogenOutflow;
                let actualNitrogenOutflow = nitrogenOutflow;

                if (totalNitrogenOut > currentNitrogen) {
                    const ratio = currentNitrogen / totalNitrogenOut;
                    actualNitrogenOutflow *= ratio;
                }

                this.nextMoistureData[index] = Math.max(0, currentMoisture - actualMoistureOutflow + moistureInflow);
                this.nextNitrogenData[index] = Math.max(0, Math.min(100, currentNitrogen - actualNitrogenOutflow + nitrogenInflow));
            }
        }

        // Swap buffers
        const tempMoisture = this.moistureData;
        this.moistureData = this.nextMoistureData;
        this.nextMoistureData = tempMoisture;

        const tempNitrogen = this.nitrogenData;
        this.nitrogenData = this.nextNitrogenData;
        this.nextNitrogenData = tempNitrogen;

        this.textureDirty = true;
    }

    public setLightingSystem(lightingSystem: LightingSystem): void {
        this.lightingSystem = lightingSystem;
    }

    private evaporate(deltaTime: number): void {
        // Initialize next buffers with current data for cells that won't change
        for (let i = 0; i < this.moistureData.length; i++) {
            this.nextMoistureData[i] = this.moistureData[i];
        }

        for (let i = 0; i < this.moistureData.length; i++) {
            const current = this.moistureData[i];

            if (current <= 0) continue;

            // Scale evaporation by deltaTime
            // Surface water evaporates fast, soil moisture evaporates slow
            let soilEvapRate = this.SOIL_EVAPORATION_RATE * deltaTime * 60;

            if (this.lightingSystem) {
                // Check if in shadow (simple check for now, later use shadow map if available)
                // For now, let's assume if it's night, evaporation is lower
                if (this.timeSystem) {
                    const isDay = this.timeSystem.getSunIcon() === "☀️";
                    if (!isDay) {
                        soilEvapRate *= this.SHADOW_EVAP_MULTIPLIER;
                    }
                }
            }

            if (current > 0) {
                const change = Math.min(current, soilEvapRate);
                this.nextMoistureData[i] -= change;
            }

            // Only update texture if significant change
            if (soilEvapRate > 0) {
                this.textureDirty = true;
            }
        }

        // Swap buffers
        const tempMoisture = this.moistureData;
        this.moistureData = this.nextMoistureData;
        this.nextMoistureData = tempMoisture;
    }
}
