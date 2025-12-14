
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
    private world: World;

    constructor(id: EntityID, world: World) {
        this.id = id;
        this.world = world;
    }

    public addComponent(component: Component): void {
        component.entityID = this.id;
        const componentName = component.constructor.name;
        this.components.set(componentName, component);
        this.world.onComponentAdded(this, componentName);
    }

    public getComponent<T extends Component>(componentClass: { new(...args: any[]): T }): T | undefined {
        return this.components.get(componentClass.name) as T;
    }

    public hasComponent(componentClass: { new(...args: any[]): Component }): boolean {
        return this.components.has(componentClass.name);
    }

    public removeComponent(componentClass: { new(...args: any[]): Component }): void {
        const componentName = componentClass.name;
        if (this.components.has(componentName)) {
            this.components.delete(componentName);
            this.world.onComponentRemoved(this, componentName);
        }
    }

    public getAllComponentNames(): string[] {
        return Array.from(this.components.keys());
    }
}

export class World {
    private entities: Map<EntityID, Entity> = new Map();
    private fixedSystems: System[] = [];
    private renderSystems: System[] = [];
    private nextEntityID: EntityID = 0;

    // Cache entities by component name for O(1) access
    private componentCache: Map<string, Set<Entity>> = new Map();

    public createEntity(): Entity {
        const entity = new Entity(this.nextEntityID++, this);
        this.entities.set(entity.id, entity);
        return entity;
    }

    public removeEntity(id: EntityID): void {
        const entity = this.entities.get(id);
        if (entity) {
            // Remove from all component caches
            for (const componentName of entity.getAllComponentNames()) {
                this.onComponentRemoved(entity, componentName);
            }
            this.entities.delete(id);
        }
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

    public onComponentAdded(entity: Entity, componentName: string): void {
        if (!this.componentCache.has(componentName)) {
            this.componentCache.set(componentName, new Set());
        }
        this.componentCache.get(componentName)!.add(entity);
    }

    public onComponentRemoved(entity: Entity, componentName: string): void {
        const cache = this.componentCache.get(componentName);
        if (cache) {
            cache.delete(entity);
        }
    }

    /**
     * Returns a Set of entities with the given component.
     * This is O(1) access.
     * The returned Set is Readonly to prevent tampering.
     */
    public getEntitiesWithComponent<T extends Component>(componentClass: { new(...args: any[]): T }): ReadonlySet<Entity> {
        return this.componentCache.get(componentClass.name) || new Set();
    }

    public getAllEntities(): Entity[] {
        return Array.from(this.entities.values());
    }
}
