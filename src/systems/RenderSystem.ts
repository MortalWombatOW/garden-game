
import { System, SystemType, World, EntityID } from "../core/ECS";
import { PlantState, PlantStage } from "../components/PlantState";
import { DeadPlantState } from "../components/DeadPlantState";
import { BuildingState } from "../components/BuildingState";
import { Needs } from "../components/Needs";
import { TransformComponent } from "../components/TransformComponent";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import { TimeSystem } from "./TimeSystem";
import { LightingSystem } from "./LightingSystem";

// Mesh configurations per stage
const STAGE_MESHES: Record<PlantStage, { height: number; diameter: number }> = {
    seed: { height: 0.2, diameter: 0.3 },
    sprout: { height: 0.5, diameter: 0.3 },
    vegetative: { height: 1.0, diameter: 0.5 },
    flowering: { height: 1.5, diameter: 0.7 },
};

type PlantStatus = "happy" | "thirsty" | "wilting" | "coma" | "dead" | "growing";

export class RenderSystem extends System {
    private scene: BABYLON.Scene;
    private engine: BABYLON.Engine;
    private gameEngine: Engine;
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
        this.rainSystem.emitter = new BABYLON.Vector3(0, 20, 0); // Position will follow camera/center
        this.rainSystem.minEmitBox = new BABYLON.Vector3(-40, 0, -40);
        this.rainSystem.maxEmitBox = new BABYLON.Vector3(40, 0, 40);

        // Life time and size
        this.rainSystem.minLifeTime = 0.5;
        this.rainSystem.maxLifeTime = 1.0;
        this.rainSystem.minSize = 0.1;
        this.rainSystem.maxSize = 0.3;
        this.rainSystem.minScaleY = 3.0; // Elongate for streak effect
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
        this.rainSystem.color1 = new BABYLON.Color4(0.8, 0.8, 1.0, 0.5);
        this.rainSystem.color2 = new BABYLON.Color4(0.8, 0.8, 1.0, 0.5);
        this.rainSystem.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0.0);

        // Start
        this.rainSystem.emitRate = 0; // Start with 0
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
            // Update rain intensity
            const intensity = this.timeSystem.rainIntensity;
            this.rainSystem.emitRate = intensity * 5000; // Max 5000 particles/sec
        }

        const entities = this.world.getEntitiesWithComponent(PlantState);
        const activeEntityIds = new Set<EntityID>();

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const transform = entity.getComponent(TransformComponent);
            const needs = entity.getComponent(Needs);

            if (!state || !transform) continue;
            activeEntityIds.add(entity.id);

            let mesh = this.entityMeshes.get(entity.id);

            // Create mesh if it doesn't exist or stage changed
            if (!mesh || state.stageChanged) {
                if (mesh) mesh.dispose();
                mesh = this.createPlantMesh(entity.id, state.stage, transform);
                this.entityMeshes.set(entity.id, mesh);
                state.stageChanged = false;
            }

            // Update color based on health and needs
            this.updatePlantAppearance(mesh, state, needs, deltaTime);

            // Update status label
            this.updateStatusLabel(entity.id, mesh, state, needs);

        }

        this.updateBuildings(activeEntityIds);
        this.updateDeadPlants(activeEntityIds);

        // Cleanup removed entities
        this.cleanupRemovedEntities(activeEntityIds);
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

            // Update scale based on decay progress (shrink as it decays)
            const decayScale = 1 - (state.decayProgress / 100) * 0.7; // Shrink to 30% at full decay
            mesh.scaling.setAll(decayScale);

            // Update color to get darker as it decays
            const mat = mesh.material as BABYLON.StandardMaterial;
            const darkness = state.decayProgress / 100;
            mat.diffuseColor = new BABYLON.Color3(
                0.4 - darkness * 0.2,
                0.25 - darkness * 0.15,
                0.1 - darkness * 0.05
            );
        }
    }

    private createDeadPlantMesh(entityId: EntityID, state: DeadPlantState, transform: TransformComponent): BABYLON.Mesh {
        // Use original stage for mesh sizing
        const stageConfig = STAGE_MESHES[state.originalStage as PlantStage] || STAGE_MESHES.sprout;

        const mesh = BABYLON.MeshBuilder.CreateCylinder(`deadplant_${entityId}`, {
            height: stageConfig.height,
            diameter: stageConfig.diameter,
            tessellation: 8,
        }, this.scene);

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        mesh.position = new BABYLON.Vector3(transform.x, terrainY + stageConfig.height / 2, transform.z);
        mesh.receiveShadows = true;

        const mat = new BABYLON.StandardMaterial(`deadPlantMat_${entityId}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1); // Brown/dead color
        mesh.material = mat;
        mesh.metadata = { entityId };

        return mesh;
    }

    private createPlantMesh(entityId: EntityID, stage: PlantStage, transform: TransformComponent): BABYLON.Mesh {
        const config = STAGE_MESHES[stage];

        // Use height segments for smooth droop animation via vertex manipulation
        const mesh = BABYLON.MeshBuilder.CreateCylinder(`plant_${entityId}`, {
            height: config.height,
            diameter: config.diameter,
            tessellation: 8,
            subdivisions: 4,  // Height segments for droop animation
            updatable: true,  // Allow vertex updates
        }, this.scene);

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        mesh.position = new BABYLON.Vector3(transform.x, terrainY + config.height / 2, transform.z);
        mesh.receiveShadows = true;

        if (this.lightingSystem) {
            this.lightingSystem.addShadowCaster(mesh);
        }

        const mat = new BABYLON.StandardMaterial(`plantMat_${entityId}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
        mesh.material = mat;

        // Store original vertex positions for droop animation
        const originalPositions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        mesh.metadata = {
            entityId,
            originalPositions: originalPositions ? [...originalPositions] : null,
            meshHeight: config.height
        };

        return mesh;
    }

    private createBuildingMesh(entityId: EntityID, type: string, transform: TransformComponent): BABYLON.Mesh {
        let mesh: BABYLON.Mesh;

        if (type === "lightpost") {
            // Pole
            const pole = BABYLON.MeshBuilder.CreateCylinder(`building_pole_${entityId}`, {
                height: 2,
                diameter: 0.1
            }, this.scene);

            // Lamp
            const lamp = BABYLON.MeshBuilder.CreateSphere(`building_lamp_${entityId}`, {
                diameter: 0.5
            }, this.scene);
            lamp.position.y = 1;

            mesh = BABYLON.Mesh.MergeMeshes([pole, lamp], true, true, undefined, false, true)!;
            mesh.name = `building_${entityId}`; // Important for input picking

            const mat = new BABYLON.StandardMaterial(`buildingMat_${entityId}`, this.scene);
            mat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            mat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            mesh.material = mat;
        } else { // Hose
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

    private updatePlantAppearance(mesh: BABYLON.Mesh, state: PlantState, needs: Needs | undefined, deltaTime: number): void {
        if (!mesh || mesh.isDisposed() || !mesh.isEnabled()) return;
        const mat = mesh.material as BABYLON.StandardMaterial;
        if (!mat) return;

        // Calculate stress level based on needs
        this.updateStressLevel(state, needs);

        // Smooth animation lerp speed (units per second)
        const LERP_SPEED = 2.0;
        const lerpFactor = Math.min(1, LERP_SPEED * deltaTime);

        // Update droop animation targets based on stress level
        state.targetDroop = state.stressLevel >= 1 ? Math.min(1, state.stressLevel * 0.4) : 0;
        state.targetDesaturation = state.stressLevel >= 2 ? Math.min(1, (state.stressLevel - 1) * 0.5) : 0;

        // Smooth lerp toward targets
        state.currentDroop += (state.targetDroop - state.currentDroop) * lerpFactor;
        state.currentDesaturation += (state.targetDesaturation - state.currentDesaturation) * lerpFactor;

        // Apply droop animation via vertex manipulation
        this.applyDroopAnimation(mesh, state.currentDroop);

        // Apply desaturation to color
        if (state.health <= 0) {
            // Dead plant - brown color
            mat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
        } else {
            // Calculate base green color based on stage
            const greenIntensity = state.stage === "flowering" ? 0.4 :
                state.stage === "vegetative" ? 0.55 : 0.6;
            const baseColor = new BABYLON.Color3(0.2, greenIntensity, 0.2);

            // Apply desaturation: lerp toward gray
            const desatAmount = state.currentDesaturation;
            const gray = (baseColor.r + baseColor.g + baseColor.b) / 3;
            mat.diffuseColor = new BABYLON.Color3(
                baseColor.r + (gray - baseColor.r) * desatAmount,
                baseColor.g + (gray - baseColor.g) * desatAmount,
                baseColor.b + (gray - baseColor.b) * desatAmount
            );
        }

        // Water absorption glow when overlay is active
        if (this.waterOverlayEnabled && needs && needs.lastAbsorption > 0) {
            const intensity = Math.min(1, needs.lastAbsorption / 3);
            mat.emissiveColor = new BABYLON.Color3(0.1 * intensity, 0.5 * intensity, 0.8 * intensity);
        } else {
            mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        }
    }

    /**
     * Calculate stress level (0-3) based on plant needs
     * 0 = healthy, 1 = thirsty (droop), 2 = wilting (droop + desaturate), 3 = critical (+ icon)
     */
    private updateStressLevel(state: PlantState, needs: Needs | undefined): void {
        if (state.health <= 0 || state.inComa) {
            state.stressLevel = 3;
            return;
        }
        if (!needs) {
            state.stressLevel = 0;
            return;
        }

        // Water-based stress thresholds
        if (needs.water < 15) {
            state.stressLevel = 3; // Critical - show icon
        } else if (needs.water < 30) {
            state.stressLevel = 2; // Wilting - droop + desaturate
        } else if (needs.water < 40) {
            state.stressLevel = 1; // Thirsty - droop only
        } else {
            state.stressLevel = 0; // Healthy
        }
    }

    /**
     * Apply droop animation by tilting top vertices
     * @param mesh The plant mesh
     * @param droopAmount 0 = upright, 1 = fully drooped
     */
    private applyDroopAnimation(mesh: BABYLON.Mesh, droopAmount: number): void {
        if (!mesh.metadata?.originalPositions) return;

        const originalPositions = mesh.metadata.originalPositions as number[];
        const meshHeight = mesh.metadata.meshHeight as number || 1;
        const positions = [...originalPositions];

        // Maximum droop angle in radians (~30 degrees at full droop)
        const maxDroopAngle = Math.PI / 6 * droopAmount;

        // Apply droop: tilt vertices based on their height (Y position)
        for (let i = 0; i < positions.length; i += 3) {
            const y = originalPositions[i + 1]; // Local Y position

            // Normalize Y to 0-1 range (bottom to top of mesh)
            // Cylinder is centered, so Y ranges from -height/2 to +height/2
            const normalizedY = (y + meshHeight / 2) / meshHeight;

            // Only droop the upper portion of the plant (above 30%)
            if (normalizedY > 0.3) {
                const droopFactor = (normalizedY - 0.3) / 0.7; // 0 at 30%, 1 at top
                const xOffset = Math.sin(maxDroopAngle) * droopFactor * meshHeight * 0.3;
                const yOffset = -Math.abs(1 - Math.cos(maxDroopAngle)) * droopFactor * meshHeight * 0.1;

                positions[i] += xOffset;     // X offset
                positions[i + 1] += yOffset; // Y offset (slight droop down)
            }
        }

        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    }

    private getPlantStatus(state: PlantState, needs: Needs | undefined): PlantStatus {
        if (state.inComa) return "coma";
        if (state.health <= 0) return "dead";
        if (!needs) return "happy";
        if (needs.water < 15) return "wilting";
        if (needs.water < 40) return "thirsty";
        if (state.stageChanged) return "growing";
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

    private updateStatusLabel(entityId: EntityID, mesh: BABYLON.Mesh, state: PlantState, needs: Needs | undefined): void {
        if (!mesh || mesh.isDisposed() || !mesh.isEnabled()) return;
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

        // Project 3D position to 2D screen
        const config = STAGE_MESHES[state.stage];
        const worldPos = mesh.position.clone();
        worldPos.y += config.height / 2 + 0.3; // Above the plant

        const screenPos = BABYLON.Vector3.Project(
            worldPos,
            BABYLON.Matrix.Identity(),
            this.scene.getTransformMatrix(),
            this.scene.activeCamera!.viewport.toGlobal(
                this.engine.getRenderWidth(),
                this.engine.getRenderHeight()
            )
        );

        // Check if behind camera
        if (screenPos.z > 1) {
            label.style.display = "none";
        } else {
            label.style.display = "block";
            label.style.left = `${screenPos.x}px`;
            label.style.top = `${screenPos.y}px`;
        }
    }

    private cleanupRemovedEntities(activeIds: Set<EntityID>): void {
        for (const [id, mesh] of this.entityMeshes) {
            if (!activeIds.has(id)) {
                mesh.dispose();
                this.entityMeshes.delete(id);
            }
        }
        for (const [id, label] of this.statusLabels) {
            if (!activeIds.has(id)) {
                label.remove();
                this.statusLabels.delete(id);
            }
        }
    }
}
