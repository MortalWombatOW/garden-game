
import { System, SystemType, World, Entity } from "../core/ECS";
import { BuildingState } from "../components/BuildingState";
import { TransformComponent } from "../components/TransformComponent";
import { SoilSystem } from "./SoilSystem";
import { TimeSystem } from "./TimeSystem";
import * as BABYLON from "@babylonjs/core";
import { Engine } from "../core/Engine";

export class BuildingSystem extends System {
    private soilSystem: SoilSystem;
    private timeSystem: TimeSystem;
    private scene: BABYLON.Scene;
    private lights: Map<string, BABYLON.PointLight> = new Map();

    constructor(world: World, soilSystem: SoilSystem, timeSystem: TimeSystem) {
        super(world, SystemType.FIXED);
        this.soilSystem = soilSystem;
        this.timeSystem = timeSystem;
        this.scene = Engine.getInstance().getScene();
    }

    public update(deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(BuildingState);

        for (const entity of entities) {
            const state = entity.getComponent(BuildingState);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !state.type || !transform) continue;

            if (state.type === "hose") {
                this.updateHose(transform, deltaTime);
            } else if (state.type === "lightpost") {
                this.updateLightpost(entity, transform);
            }
        }
    }

    private updateHose(transform: TransformComponent, deltaTime: number): void {
        // Hose waters the soil directly underneath
        // Rate: 20% moisture per second
        this.soilSystem.modifyMoistureAt(transform.x, transform.z, 20 * deltaTime);
    }

    private updateLightpost(entity: Entity, transform: TransformComponent): void {
        const lightId = `light_${entity.id}`;
        let light = this.lights.get(lightId);

        // Check time of day
        const timeOfDay = this.timeSystem.getTimeOfDayFraction();
        const isDark = timeOfDay < 0.25 || timeOfDay > 0.75;

        if (isDark) {
            if (!light) {
                // Create light
                light = new BABYLON.PointLight(lightId, new BABYLON.Vector3(transform.x, 1.5, transform.z), this.scene);
                light.intensity = 2.4;
                light.diffuse = new BABYLON.Color3(1, 0.9, 0.7);
                light.range = 5;
                this.lights.set(lightId, light);
            }
        } else {
            if (light) {
                light.dispose();
                this.lights.delete(lightId);
            }
        }
    }
}
