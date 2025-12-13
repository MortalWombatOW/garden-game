
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

    // Legacy support for non-thin-instance entities (Buildings, DeadPlants)
    private entityMeshes: Map<EntityID, BABYLON.Mesh> = new Map();

    private statusLabelsContainer: HTMLElement | null;
    private statusLabels: Map<EntityID, HTMLElement> = new Map();
    private lightingSystem: LightingSystem | null = null;
    private waterOverlayEnabled: boolean = false;

    // Thin Instance Management for Plants
    private sourceMeshes: Map<PlantStage, BABYLON.Mesh> = new Map();
    // Maps EntityID to { stage, thinInstanceIndex }
    private entityInstanceMap: Map<EntityID, { stage: PlantStage, index: number }> = new Map();
    // Maps PlantStage to list of copy-of-EntityIDs physically located at that index
    // instanceOwners.get("sprout")[5] is the EntityID owning the 5th thin instance of sprout mesh
    private instanceOwners: Map<PlantStage, EntityID[]> = new Map();

    // Rain Particle System
    private rainSystem: BABYLON.GPUParticleSystem | null = null;
    private timeSystem: TimeSystem | null = null;

    constructor(world: World) {
        super(world, SystemType.RENDER);
        this.gameEngine = Engine.getInstance();
        this.scene = this.gameEngine.getScene();
        this.engine = this.gameEngine.getEngine();
        this.statusLabelsContainer = document.getElementById("status-labels");

        // Initialize reusable source meshes for plants
        this.initializeSourceMeshes();

        // Initialize Rain
        this.initializeRain();
    }

    private initializeSourceMeshes(): void {
        const stages: PlantStage[] = ["seed", "sprout", "vegetative", "flowering"];

        for (const stage of stages) {
            const config = STAGE_MESHES[stage];
            const mesh = BABYLON.MeshBuilder.CreateCylinder(`source_${stage}`, {
                height: config.height,
                diameter: config.diameter,
                tessellation: 8,
                subdivisions: 1
            }, this.scene);

            // Hide the source mesh itself, but enable it for instances
            mesh.isVisible = false;

            const mat = new BABYLON.StandardMaterial(`mat_${stage}`, this.scene);
            mat.diffuseColor = new BABYLON.Color3(1, 1, 1); // White base, tinted by instance color
            mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            mesh.material = mat;

            // Register instance buffer for Color (4 floats)
            mesh.registerInstancedBuffer("color", 4);
            mesh.instancedBuffers.color = new BABYLON.Color4(0.2, 0.6, 0.2, 1); // Default green

            // Prevent culling issues if instances spread wide
            mesh.alwaysSelectAsActiveMesh = true;

            this.sourceMeshes.set(stage, mesh);
            this.instanceOwners.set(stage, []);
        }
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
        // Register shadow casters for the source meshes
        for (const mesh of this.sourceMeshes.values()) {
            this.lightingSystem.addShadowCaster(mesh);
        }
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

        // 3. Update Plants (Thin Instances)
        this.updatePlants(deltaTime);

        const activeEntityIds = new Set<EntityID>();
        const plantEntities = this.world.getEntitiesWithComponent(PlantState);
        for (const e of plantEntities) activeEntityIds.add(e.id);

        // 4. Update Buildings and Dead Plants (Standard Meshes)
        this.updateBuildings(activeEntityIds);
        this.updateDeadPlants(activeEntityIds);

        // 5. Cleanup removed entities (Standard Meshes)
        this.cleanupStandardMeshes(activeEntityIds);
    }

    private updatePlants(deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);
        const currentTickPlantIds = new Set<EntityID>();

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const transform = entity.getComponent(TransformComponent);
            const needs = entity.getComponent(Needs);

            if (!state || !transform) continue;
            currentTickPlantIds.add(entity.id);

            // Check if existing
            const instanceRecord = this.entityInstanceMap.get(entity.id);

            // Case 1: New Plant or Stage Changed
            if (!instanceRecord || state.stageChanged) {
                // If existed but stage changed, remove old instance first
                if (instanceRecord) {
                    this.removeInstance(entity.id, instanceRecord.stage, instanceRecord.index);
                    state.stageChanged = false;
                }

                // Add new instance
                this.addInstance(entity.id, state.stage, transform);
            }

            // Case 2: Update Appearance (Color, Transform/Droop)
            // We need to re-fetch the potentially new index/record
            const currentRecord = this.entityInstanceMap.get(entity.id);
            if (currentRecord) {
                this.updatePlantAppearance(entity.id, currentRecord, state, needs, transform, deltaTime);
                this.updateStatusLabel(entity.id, state, needs, transform);
            }
        }

        // Cleanup Removed Plants
        // We look for IDs in our map that are NOT in currentTickPlantIds
        // IMPORTANT: We need to iterate over a COPY of the keys because we will delete from the map
        const trackedIds = Array.from(this.entityInstanceMap.keys());
        for (const id of trackedIds) {
            if (!currentTickPlantIds.has(id)) {
                const record = this.entityInstanceMap.get(id)!;
                if (record) {
                    this.removeInstance(id, record.stage, record.index);
                }

                // Cleanup label
                const label = this.statusLabels.get(id);
                if (label) {
                    label.remove();
                    this.statusLabels.delete(id);
                }
            }
        }
    }

    private addInstance(entityId: EntityID, stage: PlantStage, transform: TransformComponent): void {
        const mesh = this.sourceMeshes.get(stage);
        const ownerList = this.instanceOwners.get(stage);

        if (!mesh || !ownerList) return;

        // Calculate initial matrix
        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        const meshY = terrainY + STAGE_MESHES[stage].height / 2;

        const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(1, 1, 1), // Scaling
            new BABYLON.Quaternion(),     // Rotation
            new BABYLON.Vector3(transform.x, meshY, transform.z) // Translation
        );

        // Add instance to mesh
        const index = mesh.thinInstanceAdd(matrix);

        // Track ownership
        ownerList[index] = entityId; // Should correspond to the returned index usually, which is count-1

        this.entityInstanceMap.set(entityId, { stage, index });
    }

    private removeInstance(entityId: EntityID, stage: PlantStage, indexToRemove: number): void {
        const mesh = this.sourceMeshes.get(stage);
        const ownerList = this.instanceOwners.get(stage);

        if (!mesh || !ownerList) return;

        // ThinInstance "Swap and Remove" logic
        const count = mesh.thinInstanceCount;
        if (count === 0) return;

        if (indexToRemove === count - 1) {
            // Simple remove if it's the last one
            mesh.thinInstanceCount--;
            ownerList.pop();
            this.entityInstanceMap.delete(entityId);
        } else {
            // Swap with last
            const lastIndex = count - 1;
            const lastOwnerId = ownerList[lastIndex];

            // 1. Move last instance's matrix to the hole
            // We need to copy matrix from lastIndex to indexToRemove
            const matrices = mesh.thinInstanceGetWorldMatrices();
            matrices[indexToRemove].copyFrom(matrices[lastIndex]);

            // 2. Decrement count (removes the last one conceptually)
            mesh.thinInstanceCount--;

            // 3. Update Instance Map for the swapped entity
            const swappedRecord = this.entityInstanceMap.get(lastOwnerId);
            if (swappedRecord) {
                swappedRecord.index = indexToRemove;
            }

            // 4. Update Owner List
            ownerList[indexToRemove] = lastOwnerId;
            ownerList.pop();

            // 5. Remove the deleted entity from map
            this.entityInstanceMap.delete(entityId);

            // 6. Force update appearance of the swapped entity to ensure color buffer is correct
            // (Since we didn't manually copy the color buffer)
            const swappedEntity = this.world.getEntity(lastOwnerId);
            if (swappedEntity) {
                const state = swappedEntity.getComponent(PlantState);
                const transform = swappedEntity.getComponent(TransformComponent);
                const needs = swappedEntity.getComponent(Needs);
                if (state && transform) {
                    // Start of frame deltaTime is good enough, or just 0 since we just want to set the static attrs
                    this.updatePlantAppearance(lastOwnerId, { stage, index: indexToRemove }, state, needs, transform, 0.016);
                }
            }
        }
    }

    private updatePlantAppearance(
        entityId: EntityID,
        record: { stage: PlantStage, index: number },
        state: PlantState,
        needs: Needs | undefined,
        transform: TransformComponent,
        deltaTime: number
    ): void {
        const mesh = this.sourceMeshes.get(record.stage);
        if (!mesh) return;

        // 1. Calculate Stress & Animations
        this.updateStressLevel(state, needs);

        const LERP_SPEED = 2.0;
        const lerpFactor = Math.min(1, LERP_SPEED * deltaTime);

        state.targetDroop = state.stressLevel >= 1 ? Math.min(1, state.stressLevel * 0.4) : 0;
        state.targetDesaturation = state.stressLevel >= 2 ? Math.min(1, (state.stressLevel - 1) * 0.5) : 0;

        state.currentDroop += (state.targetDroop - state.currentDroop) * lerpFactor;
        state.currentDesaturation += (state.targetDesaturation - state.currentDesaturation) * lerpFactor;

        // 2. Update Matrix (Approximating Droop with Rotation/Leaning)
        // A simple "lean" based on droop amount. Randomize direction based on ID
        const randomSeed = entityId * 12345;
        const leanDirX = Math.sin(randomSeed);
        const leanDirZ = Math.cos(randomSeed);
        const leanAngle = state.currentDroop * (Math.PI / 4); // Max 45 deg lean

        const rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
            leanAngle * leanDirX,
            0,
            leanAngle * leanDirZ
        );

        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        const config = STAGE_MESHES[state.stage];
        const meshY = terrainY + config.height / 2;

        const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(1, 1, 1),
            rotationQuaternion,
            new BABYLON.Vector3(transform.x, meshY, transform.z)
        );

        mesh.thinInstanceSetMatrixAt(record.index, matrix);

        // 3. Update Color
        let r = 0, g = 0, b = 0;

        if (state.health <= 0) {
            // Dead brown
            r = 0.4; g = 0.25; b = 0.1;
        } else {
            // Base Green
            const greenIntensity = state.stage === "flowering" ? 0.4 :
                state.stage === "vegetative" ? 0.55 : 0.6;
            const baseR = 0.2, baseG = greenIntensity, baseB = 0.2;

            // Desaturation
            const gray = (baseR + baseG + baseB) / 3;
            const desat = state.currentDesaturation;

            r = baseR + (gray - baseR) * desat;
            g = baseG + (gray - baseG) * desat;
            b = baseB + (gray - baseB) * desat;
        }

        // Overlay Glow (Mixing into base color or just brightening)
        if (this.waterOverlayEnabled && needs && needs.lastAbsorption > 0) {
            const intensity = Math.min(1, needs.lastAbsorption / 3);
            // Mix with Blue
            r = r * (1 - intensity) + (0.1) * intensity;
            g = g * (1 - intensity) + (0.5) * intensity;
            b = b * (1 - intensity) + (0.8) * intensity;
            // Also boost value?
        }

        mesh.thinInstanceSetAttributeAt("color", record.index, [r, g, b, 1.0]);
    }

    /**
     * Calculate stress level (0-3) based on plant needs
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

    private cleanupStandardMeshes(activeIds: Set<EntityID>): void {
        for (const [id, mesh] of this.entityMeshes) {
            if (!activeIds.has(id)) {
                mesh.dispose();
                this.entityMeshes.delete(id);
            }
        }
    }

    // Helper for labels (also refactored to take transform instead of mesh)
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

        // Project 3D position to 2D screen
        const config = STAGE_MESHES[state.stage];
        const terrainY = this.gameEngine.getTerrainHeightAt(transform.x, transform.z);
        // Use transform directly instead of mesh position
        const worldPos = new BABYLON.Vector3(transform.x, terrainY + config.height + 0.3, transform.z); // Top of plant + offset

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
}
