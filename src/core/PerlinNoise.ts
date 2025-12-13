/**
 * Perlin Noise implementation for procedural terrain generation.
 * Based on Ken Perlin's improved noise algorithm.
 */

export class PerlinNoise {
    private permutation: number[];
    private gradients: { x: number; y: number }[];

    constructor(seed?: number) {
        // Generate permutation table
        this.permutation = this.generatePermutation(seed);

        // Pre-compute gradients
        this.gradients = [
            { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
            { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
        ];
        // Normalize diagonal gradients
        const sqrt2 = Math.SQRT2;
        for (let i = 4; i < 8; i++) {
            this.gradients[i].x /= sqrt2;
            this.gradients[i].y /= sqrt2;
        }
    }

    private generatePermutation(seed?: number): number[] {
        const perm: number[] = [];
        for (let i = 0; i < 256; i++) {
            perm[i] = i;
        }

        // Shuffle using seed
        const random = seed !== undefined
            ? this.seededRandom(seed)
            : Math.random.bind(Math);

        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }

        // Duplicate for overflow
        return [...perm, ...perm];
    }

    private seededRandom(seed: number): () => number {
        return () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }

    private fade(t: number): number {
        // Improved smoothstep: 6t^5 - 15t^4 + 10t^3
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    private dot(grad: { x: number; y: number }, x: number, y: number): number {
        return grad.x * x + grad.y * y;
    }

    /**
     * Get noise value at (x, y). Returns value in range [-1, 1].
     */
    public noise(x: number, y: number): number {
        // Grid cell coordinates
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;

        // Relative position within cell
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        // Fade curves
        const u = this.fade(xf);
        const v = this.fade(yf);

        // Hash corner coordinates
        const aa = this.permutation[this.permutation[xi] + yi] & 7;
        const ab = this.permutation[this.permutation[xi] + yi + 1] & 7;
        const ba = this.permutation[this.permutation[xi + 1] + yi] & 7;
        const bb = this.permutation[this.permutation[xi + 1] + yi + 1] & 7;

        // Dot products
        const x1 = this.lerp(
            this.dot(this.gradients[aa], xf, yf),
            this.dot(this.gradients[ba], xf - 1, yf),
            u
        );
        const x2 = this.lerp(
            this.dot(this.gradients[ab], xf, yf - 1),
            this.dot(this.gradients[bb], xf - 1, yf - 1),
            u
        );

        return this.lerp(x1, x2, v);
    }

    /**
     * Get fractal Brownian motion (fBm) noise with multiple octaves.
     * Returns value approximately in range [-1, 1].
     */
    public fbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2, persistence: number = 0.5): number {
        let result = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxAmplitude = 0;

        for (let i = 0; i < octaves; i++) {
            result += this.noise(x * frequency, y * frequency) * amplitude;
            maxAmplitude += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return result / maxAmplitude;
    }

    /**
     * Get noise value normalized to [0, 1] range.
     */
    public noise01(x: number, y: number): number {
        return (this.noise(x, y) + 1) / 2;
    }

    /**
     * Get fBm noise normalized to [0, 1] range.
     */
    public fbm01(x: number, y: number, octaves: number = 4, lacunarity: number = 2, persistence: number = 0.5): number {
        return (this.fbm(x, y, octaves, lacunarity, persistence) + 1) / 2;
    }
}
