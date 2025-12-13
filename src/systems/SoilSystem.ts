import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import { TimeSystem } from "./TimeSystem";
import type { LightingSystem } from "./LightingSystem";
import { visualizationFragmentShader } from "../shaders/visualizationFragment";

// Register visualization shader
BABYLON.Effect.ShadersStore["soilVisualizationPixelShader"] = visualizationFragmentShader;

/**
 * SoilSystem manages per-tile soil data with diffusion and absorption.
 * Uses CPU for simulation, GPU (CustomProceduralTexture) for visualization only.
 */
export class SoilSystem extends System {
    private groundMaterial: BABYLON.StandardMaterial | null;
    private scene: BABYLON.Scene;

    // Grid Constants
    public readonly CELL_SIZE = 1.0;
    public readonly GRID_SIZE = 50;
    private readonly HALF_SIZE = 25;

    // Simulation Parameters
    private readonly SATURATION_THRESHOLD = 100;
    private readonly DIFFUSION_RATE = 0.1;
    private readonly SOIL_EVAPORATION_RATE = 0.002;
    private readonly SHADOW_EVAP_MULTIPLIER = 0.2;

    // --- CPU Simulation State ---
    private moistureData: Float32Array;
    private nextMoistureData: Float32Array;
    private nitrogenData: Float32Array;
    private nextNitrogenData: Float32Array;

    // --- GPU Visualization ---
    // RawTexture holds simulation state (uploaded from CPU)
    private stateTexture!: BABYLON.RawTexture;
    private stateTextureData: Float32Array;

    // CustomProceduralTexture for visualization (converts state to colors)
    private visTexture!: BABYLON.CustomProceduralTexture;

    // Time references
    private timeSystem: TimeSystem | null = null;

    // Highlighting
    private highlightMesh!: BABYLON.Mesh;
    private textureDirty: boolean = true;

    private debugTimer: number = 0;

    constructor(world: World) {
        super(world, SystemType.FIXED);
        const gameEngine = Engine.getInstance();
        this.scene = gameEngine.getScene();
        this.groundMaterial = gameEngine.getGroundMaterial();

        const size = this.GRID_SIZE;
        const totalPixels = size * size;

        // Initialize CPU Buffers
        this.moistureData = new Float32Array(totalPixels);
        this.nextMoistureData = new Float32Array(totalPixels);
        this.nitrogenData = new Float32Array(totalPixels);
        this.nextNitrogenData = new Float32Array(totalPixels);
        this.stateTextureData = new Float32Array(totalPixels * 4); // RGBA

        // Initialize soil
        this.initializeSoil();

        // Initialize GPU resources
        this.initializeTextures();
        this.initializeHighlight();

        // Setup ground material
        if (this.groundMaterial) {
            this.groundMaterial.diffuseTexture = this.visTexture;
        }

        // Initial render
        this.updateStateTexture();
    }

    private initializeTextures(): void {
        const size = this.GRID_SIZE;

        // State texture (CPU -> GPU, holds moisture/nitrogen as RGBA floats)
        this.stateTexture = new BABYLON.RawTexture(
            this.stateTextureData,
            size,
            size,
            BABYLON.Engine.TEXTUREFORMAT_RGBA,
            this.scene,
            false,
            false,
            BABYLON.Texture.NEAREST_SAMPLINGMODE,
            BABYLON.Constants.TEXTURETYPE_FLOAT
        );
        this.stateTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.stateTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // Visualization texture (GPU shader converts state to colors)
        this.visTexture = new BABYLON.CustomProceduralTexture(
            "soilVis",
            "soilVisualization",
            size,
            this.scene
        );
        this.visTexture.refreshRate = 1; // Render every frame
        this.visTexture.setTexture("uSimulation", this.stateTexture);
        this.visTexture.setFloat("uOverlayEnabled", 0.0);
    }

    private initializeSoil(): void {
        for (let x = -this.HALF_SIZE; x < this.HALF_SIZE; x++) {
            for (let z = -this.HALF_SIZE; z < this.HALF_SIZE; z++) {
                const moistureNoise = Math.sin(x * 0.2) * Math.cos(z * 0.2) * 10;
                const baseMoisture = 20 + moistureNoise;
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

    private initializeHighlight(): void {
        this.highlightMesh = BABYLON.MeshBuilder.CreatePlane(
            "soilHighlight",
            { size: this.CELL_SIZE },
            this.scene
        );
        this.highlightMesh.rotation.x = Math.PI / 2;
        this.highlightMesh.position.y = 0.01;
        const hlMat = new BABYLON.StandardMaterial("soilHighlightMat", this.scene);
        hlMat.diffuseColor = new BABYLON.Color3(0, 0, 1);
        hlMat.alpha = 0.3;
        hlMat.zOffset = -1;
        this.highlightMesh.material = hlMat;
        this.highlightMesh.isVisible = false;
        this.highlightMesh.isPickable = false;
    }

    private getIndex(x: number, z: number): number {
        const gridX = x + this.HALF_SIZE;
        const gridZ = z + this.HALF_SIZE;
        if (gridX < 0 || gridX >= this.GRID_SIZE || gridZ < 0 || gridZ >= this.GRID_SIZE) {
            return -1;
        }
        return gridZ * this.GRID_SIZE + gridX;
    }

    public getKey(x: number, z: number): string {
        const cellX = Math.floor(x / this.CELL_SIZE);
        const cellZ = Math.floor(z / this.CELL_SIZE);
        return `${cellX},${cellZ}`;
    }

    public getCellCoords(x: number, z: number): { cellX: number; cellZ: number } {
        return {
            cellX: Math.floor(x / this.CELL_SIZE),
            cellZ: Math.floor(z / this.CELL_SIZE),
        };
    }

    public getTotalMoisture(): number {
        let total = 0;
        for (let i = 0; i < this.moistureData.length; i++) {
            total += this.moistureData[i];
        }
        return total;
    }

    // --- Public API (Reading) ---

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

    // --- Public API (Writing) ---

    public modifyMoistureAt(x: number, z: number, amount: number): void {
        const { cellX, cellZ } = this.getCellCoords(x, z);
        const index = this.getIndex(cellX, cellZ);

        if (index !== -1) {
            const currentSoil = this.moistureData[index];
            if (amount > 0) {
                this.moistureData[index] = Math.min(this.SATURATION_THRESHOLD, currentSoil + amount);
            } else {
                this.moistureData[index] = Math.max(0, currentSoil + amount);
            }
            this.textureDirty = true;
        }
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

    public absorbWater(worldX: number, worldZ: number, radius: number, maxAmount: number): number {
        const { cellX: centerX, cellZ: centerZ } = this.getCellCoords(worldX, worldZ);
        const cellRadius = Math.ceil(radius / this.CELL_SIZE);

        let totalAvailable = 0;
        const cellsInRange: { index: number; moisture: number }[] = [];

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const cx = centerX + dx;
                const cz = centerZ + dz;
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

        const toAbsorb = Math.min(maxAmount, totalAvailable * 0.5);
        let absorbed = 0;

        for (const cell of cellsInRange) {
            const share = (cell.moisture / totalAvailable) * toAbsorb;
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

    public setWaterOverlay(enabled: boolean): void {
        this.visTexture.setFloat("uOverlayEnabled", enabled ? 1.0 : 0.0);

        if (this.groundMaterial) {
            if (enabled) {
                this.groundMaterial.diffuseTexture = null;
                this.groundMaterial.emissiveTexture = this.visTexture;
                this.groundMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                this.groundMaterial.disableLighting = true;
            } else {
                this.groundMaterial.emissiveTexture = null;
                this.groundMaterial.diffuseTexture = this.visTexture;
                this.groundMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                this.groundMaterial.disableLighting = false;
            }
        }
    }

    // --- Update State Texture (CPU -> GPU) ---

    private updateStateTexture(): void {
        const size = this.GRID_SIZE;

        for (let i = 0; i < this.moistureData.length; i++) {
            const x = i % size;
            const z = Math.floor(i / size);
            // Flip Y for texture coordinates
            const imgY = size - 1 - z;
            const texIndex = (imgY * size + x) * 4;

            this.stateTextureData[texIndex] = this.moistureData[i];     // R = Moisture
            this.stateTextureData[texIndex + 1] = this.nitrogenData[i]; // G = Nitrogen
            this.stateTextureData[texIndex + 2] = 0;                    // B = unused
            this.stateTextureData[texIndex + 3] = 1;                    // A = 1
        }

        this.stateTexture.update(this.stateTextureData);
        this.textureDirty = false;
    }

    // --- System Update ---

    public update(deltaTime: number): void {
        if (!this.timeSystem) {
            const timeSystem = this.world.getSystem(TimeSystem);
            if (timeSystem) this.timeSystem = timeSystem as TimeSystem;
        }

        // Apply rain
        if (this.timeSystem && this.timeSystem.rainIntensity > 0) {
            const rainAmount = this.timeSystem.rainIntensity * 1.5 * deltaTime;
            for (let i = 0; i < this.moistureData.length; i++) {
                const current = this.moistureData[i];
                if (current < this.SATURATION_THRESHOLD) {
                    this.moistureData[i] = Math.min(this.SATURATION_THRESHOLD, current + rainAmount);
                }
            }
            this.textureDirty = true;
        }

        // Run CPU diffusion
        this.diffuse(deltaTime);

        // Run CPU evaporation
        this.evaporate(deltaTime);

        // Upload to GPU if dirty
        if (this.textureDirty) {
            this.updateStateTexture();
        }

        // Debug
        this.debugTimer += deltaTime;
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
        const dt = Math.min(deltaTime, 0.05);
        const diffusionRate = Math.min(0.2, this.DIFFUSION_RATE * dt * 60);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const index = z * size + x;
                const currentMoisture = this.moistureData[index];
                const currentNitrogen = this.nitrogenData[index];

                let moistureOutflow = 0;
                let moistureInflow = 0;
                let nitrogenOutflow = 0;
                let nitrogenInflow = 0;

                const checkMoistureNeighbor = (nIndex: number) => {
                    const neighborMoisture = this.moistureData[nIndex];
                    const diff = currentMoisture - neighborMoisture;
                    if (diff > 0) {
                        moistureOutflow += diff * diffusionRate;
                    } else {
                        moistureInflow += (-diff) * diffusionRate;
                    }
                };

                const checkNitrogenNeighbor = (nIndex: number) => {
                    const neighborNitrogen = this.nitrogenData[nIndex];
                    const diff = currentNitrogen - neighborNitrogen;
                    if (diff > 0) {
                        nitrogenOutflow += diff * diffusionRate;
                    } else {
                        nitrogenInflow += (-diff) * diffusionRate;
                    }
                };

                if (x > 0) {
                    const nIndex = index - 1;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                if (x < size - 1) {
                    const nIndex = index + 1;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                if (z > 0) {
                    const nIndex = index - size;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }
                if (z < size - 1) {
                    const nIndex = index + size;
                    checkMoistureNeighbor(nIndex);
                    checkNitrogenNeighbor(nIndex);
                }

                const totalMoistureOut = moistureOutflow;
                let actualMoistureOutflow = moistureOutflow;

                if (totalMoistureOut > currentMoisture) {
                    const ratio = currentMoisture / totalMoistureOut;
                    actualMoistureOutflow *= ratio;
                }

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

    private evaporate(deltaTime: number): void {
        for (let i = 0; i < this.moistureData.length; i++) {
            this.nextMoistureData[i] = this.moistureData[i];
        }

        for (let i = 0; i < this.moistureData.length; i++) {
            const current = this.moistureData[i];
            if (current <= 0) continue;

            let soilEvapRate = this.SOIL_EVAPORATION_RATE * deltaTime * 60;

            if (this.timeSystem) {
                const isDay = this.timeSystem.getSunIcon() === "☀️";
                if (!isDay) {
                    soilEvapRate *= this.SHADOW_EVAP_MULTIPLIER;
                }
            }

            if (current > 0) {
                const change = Math.min(current, soilEvapRate);
                this.nextMoistureData[i] -= change;
            }

            if (soilEvapRate > 0) {
                this.textureDirty = true;
            }
        }

        const tempMoisture = this.moistureData;
        this.moistureData = this.nextMoistureData;
        this.nextMoistureData = tempMoisture;
    }

    public setLightingSystem(_lightingSystem: LightingSystem): void {
        // Not used
    }
}
