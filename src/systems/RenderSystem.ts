
import { System, SystemType, World, EntityID } from "../core/ECS";
import { PlantState } from "../components/PlantState";
import { PlantGenome } from "../components/PlantGenome";
import { PlantMeshFactory } from "../core/PlantMeshFactory";
import { DeadPlantState } from "../components/DeadPlantState";
import { BuildingState } from "../components/BuildingState";
import { Needs } from "../components/Needs";
import { TransformComponent } from "../components/TransformComponent";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import { TimeSystem } from "./TimeSystem";
import { LightingSystem } from "./LightingSystem";

// Mesh configurations per stage
// STAGE_MESHES removed in favor of L-System generation

type PlantStatus = "happy" | "thirsty" | "wilting" | "coma" | "dead" | "growing";

export class RenderSystem extends System {
    private scene: BABYLON.Scene;
    private engine: BABYLON.Engine;
    private gameEngine: Engine;

    // Standard meshes for all entities (plants, buildings, dead plants)
    private entityMeshes: Map<EntityID, BABYLON.Mesh> = new Map();

    private statusLabelsContainer: HTMLElement | null;
    private statusLabels: Map<EntityID, HTMLElement> = new Map();
    private lightingSystem: LightingSystem | null = null;
    private waterOverlayEnabled: boolean = false;

    // Rain Particle System
    private rainSystem: BABYLON.GPUParticleSystem | null = null;
    private timeSystem: TimeSystem | null = null;

    constructor(world: World) {
        super(world, SystemType.RENDER);
        this.gameEngine = Engine.getInstance();
        this.scene = this.gameEngine.getScene();
        this.engine = this.gameEngine.getEngine();
        this.statusLabelsContainer = document.getElementById("status-labels");

        // Initialize Rain
        this.initializeRain();
    }

    private initializeRain(): void {
        // Create a procedural texture for rain drops
        const rainTexture = new BABYLON.DynamicTexture("rainTexture", { width: 32, height: 128 }, this.scene, false);
        const ctx = rainTexture.getContext();
        // Clear transparency
        ctx.clearRect(0, 0, 32, 128);
        // Draw white streak
        const gradient = ctx.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
        gradient.addColorStop(0.5, "rgba(200, 200, 255, 0.8)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(14, 0, 4, 128);
        rainTexture.update();
        rainTexture.hasAlpha = true;

        // Create GPU Particle System for performance
        this.rainSystem = new BABYLON.GPUParticleSystem("rain", { capacity: 10000 }, this.scene);
        this.rainSystem.particleTexture = rainTexture;

        // Emitter shape - large box above the ground
        this.rainSystem.emitter = new BABYLON.Vector3(0, 20, 0);
        this.rainSystem.minEmitBox = new BABYLON.Vector3(-40, 0, -20);
        this.rainSystem.maxEmitBox = new BABYLON.Vector3(40, 0, 40);

        // Life time and size
        this.rainSystem.minLifeTime = 0.5;
        this.rainSystem.maxLifeTime = 1.0;
        this.rainSystem.minSize = 0.05;
        this.rainSystem.maxSize = 0.15;
        this.rainSystem.minScaleY = 3.0;
        this.rainSystem.maxScaleY = 5.0;

        // Gravity and Direction (Falling down)
        this.rainSystem.gravity = new BABYLON.Vector3(0, -98.1, 0);
        this.rainSystem.direction1 = new BABYLON.Vector3(0, -1, 0);
        this.rainSystem.direction2 = new BABYLON.Vector3(0, -1, 0);

        // Speed
        this.rainSystem.minEmitPower = 10;
        this.rainSystem.maxEmitPower = 20;
        this.rainSystem.updateSpeed = 0.01;

        // Color
        this.rainSystem.color1 = new BABYLON.Color4(0.8, 0.8, 1.0, 0.2);
        this.rainSystem.color2 = new BABYLON.Color4(0.8, 0.8, 1.0, 0.2);
        this.rainSystem.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0.0);

        // Start
        this.rainSystem.emitRate = 0;
        this.rainSystem.start();
    }

    public setLightingSystem(lightingSystem: LightingSystem): void {
        this.lightingSystem = lightingSystem;
    }

    public setWaterOverlay(enabled: boolean): void {
        this.waterOverlayEnabled = enabled;
    }

    public update(deltaTime: number): void {
        // 1. Get TimeSystem
        if (!this.timeSystem) {
            const timeSystem = this.world.getSystem(TimeSystem);
            if (timeSystem) this.timeSystem = timeSystem as TimeSystem;
        }

        // 2. Update Rain
        if (this.rainSystem && this.timeSystem) {
            const intensity = this.timeSystem.rainIntensity;
            this.rainSystem.emitRate = intensity * 1500;
        }

        // Track active entity IDs for cleanup
        const activeEntityIds = new Set<EntityID>();

        // 3. Update Plants
        this.updatePlants(deltaTime, activeEntityIds);

        // 4. Update Buildings
        this.updateBuildings(activeEntityIds);

        // 5. Update Dead Plants
        this.updateDeadPlants(activeEntityIds);

        // 6. Cleanup removed entities
        this.cleanupMeshes(activeEntityIds);
    }

    private updatePlants(deltaTime: number, activeIds: Set<EntityID>): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const transform = entity.getComponent(TransformComponent);
            const needs = entity.getComponent(Needs);
            const genome = entity.getComponent(PlantGenome);

            if (!state || !transform) continue;
            activeIds.add(entity.id);

            let mesh = this.entityMeshes.get(entity.id);

            // Create mesh if missing (only once per plant)
            if (!mesh) {
                if (genome) {
                    mesh = this.createPlantMesh(entity.id, genome, transform);
                } else {
                    // Fallback cylinder if no genome
                    mesh = BABYLON.MeshBuilder.CreateCylinder(`plant_fallback_${entity.id}`, { height: 0.5, diameter: 0.2 }, this.scene);
                    const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
                    mesh.position.set(transform.x, terrainY + 0.25, transform.z);
                    mesh.metadata = { entityId: entity.id };
                }
                this.entityMeshes.set(entity.id, mesh);
            }

            // Scale from 0.1 to maxScale based on growth progress
            // Minimum 0.1 scale ensures reliable picking
            if (mesh && genome) {
                const maxIterations = 5;
                const progress = Math.min(1, state.growthProgress / maxIterations);
                const scale = 0.1 + progress * (genome.maxScale - 0.1);
                mesh.scaling.setAll(scale);
            }

            // Update appearance (stress effects, color, etc.)
            this.updatePlantAppearance(entity.id, mesh!, state, needs, deltaTime);
            this.updateStatusLabel(entity.id, state, needs, transform);
        }
    }

    private createPlantMesh(entityId: EntityID, genome: PlantGenome, transform: TransformComponent): BABYLON.Mesh {
        const mesh = PlantMeshFactory.createMesh(genome, this.scene);
        mesh.name = `plant_${entityId}`;

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        mesh.position = new BABYLON.Vector3(transform.x, terrainY, transform.z);
        mesh.receiveShadows = true;
        mesh.metadata = { entityId };

        // Propagate metadata to all child meshes for picking to work
        mesh.getChildMeshes().forEach(child => {
            child.metadata = { entityId };
        });

        if (this.lightingSystem) {
            this.lightingSystem.addShadowCaster(mesh);
        }

        return mesh;
    }

    private updatePlantAppearance(
        entityId: EntityID,
        mesh: BABYLON.Mesh,
        state: PlantState,
        needs: Needs | undefined,
        deltaTime: number
    ): void {
        // 1. Calculate Stress & Animations
        this.updateStressLevel(state, needs);

        const LERP_SPEED = 2.0;
        const lerpFactor = Math.min(1, LERP_SPEED * deltaTime);

        // Compute target desaturation logic (keep from original)
        state.targetDesaturation = state.stressLevel >= 2 ? Math.min(1, (state.stressLevel - 1) * 0.5) : 0;
        state.currentDesaturation += (state.targetDesaturation - state.currentDesaturation) * lerpFactor;

        // Note: L-System geometry handles structural droop via stressLevel.
        // We do NOT apply rotation.x/z leaning here to avoid double transforms,
        // unless we want a subtle wind sway or extra lean.
        // Let's keep it static for now to trust the L-System.
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;

        // 3. Update Color
        const mat = mesh.material as BABYLON.StandardMaterial;
        if (!mat) return;

        let r = 0, g = 0, b = 0;

        if (state.health <= 0) {
            r = 0.4; g = 0.25; b = 0.1;
        } else {
            // Use stem color as base (or default green)
            const baseColor = (entityId !== undefined && this.world.getEntity(entityId)?.getComponent(PlantGenome)?.stemColor) || new BABYLON.Color3(0.2, 0.6, 0.2);

            // Desaturate logic
            const gray = (baseColor.r + baseColor.g + baseColor.b) / 3;
            const desat = state.currentDesaturation;

            r = baseColor.r + (gray - baseColor.r) * desat;
            g = baseColor.g + (gray - baseColor.g) * desat;
            b = baseColor.b + (gray - baseColor.b) * desat;
        }

        // Overlay Glow
        if (this.waterOverlayEnabled && needs && needs.lastAbsorption > 0) {
            const intensity = Math.min(1, needs.lastAbsorption / 3);
            r = r * (1 - intensity) + (0.1) * intensity;
            g = g * (1 - intensity) + (0.5) * intensity;
            b = b * (1 - intensity) + (0.8) * intensity;
        }

        mat.diffuseColor = new BABYLON.Color3(r, g, b);
    }

    private updateStressLevel(state: PlantState, needs: Needs | undefined): void {
        if (state.health <= 0 || state.inComa) {
            state.stressLevel = 3;
            return;
        }
        if (!needs) {
            state.stressLevel = 0;
            return;
        }

        if (needs.water < 15) {
            state.stressLevel = 3;
        } else if (needs.water < 30) {
            state.stressLevel = 2;
        } else if (needs.water < 40) {
            state.stressLevel = 1;
        } else {
            state.stressLevel = 0;
        }
    }

    private updateDeadPlants(activeIds: Set<EntityID>): void {
        const entities = this.world.getEntitiesWithComponent(DeadPlantState);
        for (const entity of entities) {
            const state = entity.getComponent(DeadPlantState);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !transform) continue;
            activeIds.add(entity.id);

            let mesh = this.entityMeshes.get(entity.id);
            if (!mesh) {
                mesh = this.createDeadPlantMesh(entity.id, state, transform);
                this.entityMeshes.set(entity.id, mesh);
            }

            const decayScale = 1 - (state.decayProgress / 100) * 0.7;
            mesh.scaling.setAll(decayScale);

            const mat = mesh.material as BABYLON.StandardMaterial;
            const darkness = state.decayProgress / 100;
            mat.diffuseColor = new BABYLON.Color3(
                0.4 - darkness * 0.2,
                0.25 - darkness * 0.15,
                0.1 - darkness * 0.05
            );
        }
    }

    private createDeadPlantMesh(entityId: EntityID, _state: DeadPlantState, transform: TransformComponent): BABYLON.Mesh {
        // Fallback dimensions for dead plants since we don't have L-System data easily accessible for them
        const height = 0.5;
        const diameter = 0.2;

        const mesh = BABYLON.MeshBuilder.CreateCylinder(`deadplant_${entityId}`, {
            height: height,
            diameter: diameter,
            tessellation: 8,
        }, this.scene);

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        mesh.position = new BABYLON.Vector3(transform.x, terrainY + height / 2, transform.z);
        mesh.receiveShadows = true;

        const mat = new BABYLON.StandardMaterial(`deadPlantMat_${entityId}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
        mesh.material = mat;
        mesh.metadata = { entityId };

        return mesh;
    }

    private updateBuildings(activeIds: Set<EntityID>): void {
        const entities = this.world.getEntitiesWithComponent(BuildingState);
        for (const entity of entities) {
            const state = entity.getComponent(BuildingState);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !state.type || !transform) continue;
            activeIds.add(entity.id);

            let mesh = this.entityMeshes.get(entity.id);
            if (!mesh) {
                mesh = this.createBuildingMesh(entity.id, state.type, transform);
                this.entityMeshes.set(entity.id, mesh);
            }
        }
    }

    private createBuildingMesh(entityId: EntityID, type: string, transform: TransformComponent): BABYLON.Mesh {
        let mesh: BABYLON.Mesh;

        if (type === "lightpost") {
            const pole = BABYLON.MeshBuilder.CreateCylinder(`building_pole_${entityId}`, {
                height: 2,
                diameter: 0.1
            }, this.scene);

            const lamp = BABYLON.MeshBuilder.CreateSphere(`building_lamp_${entityId}`, {
                diameter: 0.5
            }, this.scene);
            lamp.position.y = 1;

            mesh = BABYLON.Mesh.MergeMeshes([pole, lamp], true, true, undefined, false, true)!;
            mesh.name = `building_${entityId}`;

            const mat = new BABYLON.StandardMaterial(`buildingMat_${entityId}`, this.scene);
            mat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            mat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            mesh.material = mat;
        } else {
            mesh = BABYLON.MeshBuilder.CreateBox(`building_${entityId}`, {
                width: 0.5,
                height: 0.2,
                depth: 0.5
            }, this.scene);

            const mat = new BABYLON.StandardMaterial(`buildingMat_${entityId}`, this.scene);
            mat.diffuseColor = new BABYLON.Color3(0.8, 0.3, 0.3);
            mesh.material = mat;
        }

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        const baseOffset = type === "lightpost" ? 1 : 0.1;
        mesh.position = new BABYLON.Vector3(transform.x, terrainY + baseOffset, transform.z);
        mesh.receiveShadows = true;
        mesh.metadata = { entityId };

        if (this.lightingSystem) {
            this.lightingSystem.addShadowCaster(mesh);
        }

        return mesh;
    }

    private cleanupMeshes(activeIds: Set<EntityID>): void {
        for (const [id, mesh] of this.entityMeshes) {
            if (!activeIds.has(id)) {
                mesh.dispose();
                this.entityMeshes.delete(id);

                const label = this.statusLabels.get(id);
                if (label) {
                    label.remove();
                    this.statusLabels.delete(id);
                }
            }
        }
    }

    private getPlantStatus(state: PlantState, needs: Needs | undefined): PlantStatus {
        if (state.inComa) return "coma";
        if (state.health <= 0) return "dead";
        if (!needs) return "happy";
        if (needs.water < 15) return "wilting";
        if (needs.water < 40) return "thirsty";
        return "happy";
    }

    private getStatusText(status: PlantStatus): string {
        switch (status) {
            case "happy": return "😊 Happy";
            case "thirsty": return "💧 Thirsty";
            case "wilting": return "🥀 Wilting";
            case "coma": return "😵 Coma";
            case "dead": return "💀 Dead";
            case "growing": return "🌱 Growing";
        }
    }

    private updateStatusLabel(entityId: EntityID, state: PlantState, needs: Needs | undefined, transform: TransformComponent): void {
        if (!this.statusLabelsContainer) return;

        const status = this.getPlantStatus(state, needs);
        let label = this.statusLabels.get(entityId);

        if (!label) {
            label = document.createElement("div");
            label.className = `status-label ${status}`;
            this.statusLabelsContainer.appendChild(label);
            this.statusLabels.set(entityId, label);
        }

        label.textContent = this.getStatusText(status);
        label.className = `status-label ${status}`;

        // Approximate height based on growth or fixed offset
        // L-System plants can vary, but we can assume ~2 units max height for label
        const heightOffset = 1.0 + (state.growthProgress * 0.2);
        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        const worldPos = new BABYLON.Vector3(transform.x, terrainY + heightOffset + 0.3, transform.z);

        const screenPos = BABYLON.Vector3.Project(
            worldPos,
            BABYLON.Matrix.Identity(),
            this.scene.getTransformMatrix(),
            this.scene.activeCamera!.viewport.toGlobal(
                this.engine.getRenderWidth(),
                this.engine.getRenderHeight()
            )
        );

        if (screenPos.z > 1) {
            label.style.display = "none";
        } else {
            label.style.display = "block";
            label.style.left = `${screenPos.x}px`;
            label.style.top = `${screenPos.y}px`;
        }
    }
}
