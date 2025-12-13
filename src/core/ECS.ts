
export type EntityID = number;

export enum SystemType {
    FIXED = "fixed",
    RENDER = "render",
}

export abstract class Component {
    public entityID: EntityID = -1;
}

export abstract class System {
    protected world: World;
    public readonly systemType: SystemType;

    constructor(world: World, systemType: SystemType = SystemType.FIXED) {
        this.world = world;
        this.systemType = systemType;
    }

    public abstract update(deltaTime: number): void;
}

export class Entity {
    public id: EntityID;
    private components: Map<string, Component> = new Map();

    constructor(id: EntityID) {
        this.id = id;
    }

    public addComponent(component: Component): void {
        component.entityID = this.id;
        this.components.set(component.constructor.name, component);
    }

    public getComponent<T extends Component>(componentClass: { new(...args: any[]): T }): T | undefined {
        return this.components.get(componentClass.name) as T;
    }

    public hasComponent(componentClass: { new(...args: any[]): Component }): boolean {
        return this.components.has(componentClass.name);
    }

    public removeComponent(componentClass: { new(...args: any[]): Component }): void {
        this.components.delete(componentClass.name);
    }
}

export class World {
    private entities: Map<EntityID, Entity> = new Map();
    private fixedSystems: System[] = [];
    private renderSystems: System[] = [];
    private nextEntityID: EntityID = 0;

    public createEntity(): Entity {
        const entity = new Entity(this.nextEntityID++);
        this.entities.set(entity.id, entity);
        return entity;
    }

    public removeEntity(id: EntityID): void {
        this.entities.delete(id);
    }

    public getEntity(id: EntityID): Entity | undefined {
        return this.entities.get(id);
    }

    public addSystem(system: System): void {
        if (system.systemType === SystemType.FIXED) {
            this.fixedSystems.push(system);
        } else {
            this.renderSystems.push(system);
        }
    }

    public getSystem<T extends System>(systemClass: { new(...args: any[]): T }): T | undefined {
        for (const system of this.fixedSystems) {
            if (system instanceof systemClass) {
                return system as T;
            }
        }
        for (const system of this.renderSystems) {
            if (system instanceof systemClass) {
                return system as T;
            }
        }
        return undefined;
    }

    public updateFixed(deltaTime: number): void {
        for (const system of this.fixedSystems) {
            system.update(deltaTime);
        }
    }

    public updateRender(deltaTime: number): void {
        for (const system of this.renderSystems) {
            system.update(deltaTime);
        }
    }

    public getEntitiesWithComponent<T extends Component>(componentClass: { new(...args: any[]): T }): Entity[] {
        const result: Entity[] = [];
        for (const entity of this.entities.values()) {
            if (entity.hasComponent(componentClass)) {
                result.push(entity);
            }
        }
        return result;
    }

    public getAllEntities(): Entity[] {
        return Array.from(this.entities.values());
    }
}
