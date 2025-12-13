// Visualization shader for CustomProceduralTexture
// Converts simulation state to visual colors

export const visualizationFragmentShader = `
#ifdef GL_ES
precision highp float;
#endif

// Varyings from vertex shader
varying vec2 vUV;
varying vec2 vPosition;

// Uniforms
uniform sampler2D uSimulation;      // Current simulation state (R=Moisture, G=Nitrogen)
uniform float uOverlayEnabled;      // 1.0 if overlay mode, 0.0 otherwise

void main() {
    vec4 state = texture2D(uSimulation, vUV);
    float moisture = state.r;

    if (uOverlayEnabled > 0.5) {
        // --- HEATMAP MODE (Water Overlay) ---
        float normalized = moisture / 100.0;
        
        float r = normalized * 0.2;
        float g = normalized;
        float b = 0.78 + normalized * 0.21;
        
        gl_FragColor = vec4(r, g, b, 1.0);
    } else {
        // --- NORMAL MODE ---
        float t = moisture / 100.0;
        float r = 0.706 - t * 0.47;
        float g = 0.549 - t * 0.39;
        float b = 0.392 - t * 0.29;

        gl_FragColor = vec4(r, g, b, 1.0);
    }
}
`;
