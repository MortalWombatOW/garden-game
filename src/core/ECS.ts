
export type EntityID = number;

export abstract class Component {
    public entityID: EntityID = -1;
}

export abstract class System {
    protected world: World;

    constructor(world: World) {
        this.world = world;
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
}

export class World {
    private entities: Map<EntityID, Entity> = new Map();
    private systems: System[] = [];
    private nextEntityID: EntityID = 0;

    public createEntity(): Entity {
        const entity = new Entity(this.nextEntityID++);
        this.entities.set(entity.id, entity);
        return entity;
    }

    public getEntity(id: EntityID): Entity | undefined {
        return this.entities.get(id);
    }

    public addSystem(system: System): void {
        this.systems.push(system);
    }

    public update(deltaTime: number): void {
        for (const system of this.systems) {
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
}
