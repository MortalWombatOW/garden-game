import { Component } from "../core/ECS";

/**
 * Global player state for tracking resources like seeds.
 * Attached to a singleton "player" entity.
 */
export class PlayerState extends Component {
    /** Number of seeds available for planting */
    public seeds: number = 5;
}
