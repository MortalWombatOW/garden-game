
import { EntityID } from "./ECS";

interface GridCell {
    entities: Set<EntityID>;
}

export class SpatialHashGrid {
    private cellSize: number;
    private grid: Map<string, GridCell> = new Map();
    private entityPositions: Map<EntityID, { x: number; z: number }> = new Map();

    constructor(cellSize: number = 2) {
        this.cellSize = cellSize;
    }

    private getKey(x: number, z: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellZ = Math.floor(z / this.cellSize);
        return `${cellX},${cellZ}`;
    }

    public add(id: EntityID, x: number, z: number): void {
        const key = this.getKey(x, z);
        if (!this.grid.has(key)) {
            this.grid.set(key, { entities: new Set() });
        }
        this.grid.get(key)!.entities.add(id);
        this.entityPositions.set(id, { x, z });
    }

    public remove(id: EntityID): void {
        const pos = this.entityPositions.get(id);
        if (pos) {
            const key = this.getKey(pos.x, pos.z);
            const cell = this.grid.get(key);
            if (cell) {
                cell.entities.delete(id);
            }
            this.entityPositions.delete(id);
        }
    }

    public query(x: number, z: number, radius: number): EntityID[] {
        const result: EntityID[] = [];
        const minCellX = Math.floor((x - radius) / this.cellSize);
        const maxCellX = Math.floor((x + radius) / this.cellSize);
        const minCellZ = Math.floor((z - radius) / this.cellSize);
        const maxCellZ = Math.floor((z + radius) / this.cellSize);

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cz = minCellZ; cz <= maxCellZ; cz++) {
                const key = `${cx},${cz}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const id of cell.entities) {
                        const pos = this.entityPositions.get(id);
                        if (pos) {
                            const dx = pos.x - x;
                            const dz = pos.z - z;
                            if (dx * dx + dz * dz <= radius * radius) {
                                result.push(id);
                            }
                        }
                    }
                }
            }
        }
        return result;
    }

    public hasNearby(x: number, z: number, radius: number): boolean {
        return this.query(x, z, radius).length > 0;
    }
}
