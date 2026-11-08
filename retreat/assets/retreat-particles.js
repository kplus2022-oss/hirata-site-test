/* Holistic Retreat 2027 — 光の粒子（素のWebGL1。Three.js は使わない）
   金色の塵が静かに昇り、夜は明るい塵（加算合成）と星になる。手前ほど大きく淡い。 */
(() => {
  'use strict';
  const VS = `
    attribute vec3 aPos;
    attribute vec4 aSeed;
    uniform float uTime, uPR, uScroll, uSize, uRise, uH, uPar, uTwinkle, uAspect, uF;
    uniform vec2 uCam;
    varying float vA;
    void main() {
      vec3 p = aPos;
      float depthN = clamp((p.z + 10.0) / 18.0, 0.0, 1.0);
      float par = mix(0.35, 1.6, depthN) * uPar;
      p.y = mod(p.y + uTime * aSeed.y * uRise + uScroll * par + uH, uH * 2.0) - uH;
      p.x += sin(uTime * 0.25 * aSeed.y + aSeed.x) * 0.7;
      p.z += cos(uTime * 0.18 + aSeed.x) * 0.25;
      vec3 v = p - vec3(uCam, 16.0);
      float dist = -v.z;
      gl_Position = vec4(v.x * uF / uAspect, v.y * uF, 0.0, dist);
      gl_PointSize = uSize * aSeed.z * uPR * (16.0 / max(dist, 0.1));
      float nearF = smoothstep(9.5, 4.5, dist);
      float tw = mix(1.0, 0.5 + 0.5 * sin(uTime * aSeed.w * 1.6 + aSeed.x * 3.0), uTwinkle);
      vA = tw * mix(1.0, 0.28, nearF);
    }`;
  const FS = `
    precision mediump float;
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = pow(smoothstep(0.5, 0.0, d), 1.7) * vA * uOpacity;
      gl_FragColor = vec4(uColor * a, a);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function field(count, o) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * o.w;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * o.h;
      pos[i * 3 + 2] = o.z0 + Math.random() * (o.z1 - o.z0);
      seed[i * 4] = Math.random() * Math.PI * 2;
      seed[i * 4 + 1] = 0.25 + Math.random() * 0.75;
      seed[i * 4 + 2] = o.s0 + Math.random() * (o.s1 - o.s0);
      seed[i * 4 + 3] = 0.5 + Math.random() * 1.5;
    }
    return { count, pos, seed, o };
  }

  function create(canvas, opts) {
    if (canvas.__retreatParticles) { canvas.__retreatParticles.resize(); return canvas.__retreatParticles; }
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' }); } catch (_) { gl = null; }
    if (!gl) return null;
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (_) { return null; }
    gl.useProgram(prog);
    const loc = {};
    ['uTime', 'uPR', 'uScroll', 'uSize', 'uRise', 'uH', 'uPar', 'uTwinkle', 'uAspect', 'uF', 'uCam', 'uColor', 'uOpacity'].forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
    const aPos = gl.getAttribLocation(prog, 'aPos'), aSeed = gl.getAttribLocation(prog, 'aSeed');
    const mobile = !!(opts && opts.mobile);
    const layers = [
      field(mobile ? 240 : 680, { w: 22, h: 12, z0: -10, z1: 8, s0: 0.5, s1: 1.7, size: 3.4, rise: 0.16, par: 1, twinkle: 0.6 }),
      field(mobile ? 110 : 240, { w: 30, h: 15, z0: -26, z1: -14, s0: 0.45, s1: 1.1, size: 3.2, rise: 0, par: 0.22, twinkle: 1 })
    ];
    layers.forEach(l => {
      l.bPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, l.bPos); gl.bufferData(gl.ARRAY_BUFFER, l.pos, gl.STATIC_DRAW);
      l.bSeed = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, l.bSeed); gl.bufferData(gl.ARRAY_BUFFER, l.seed, gl.STATIC_DRAW);
    });
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    const maxDpr = mobile ? 1.5 : 1.75;
    let dpr = 1, aspect = 1, running = true;
    const F = 1 / Math.tan((55 / 2) * Math.PI / 180);
    const cam = { x: 0, y: 0 };
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      aspect = w / h;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    function draw(l, color, opacity, additive) {
      if (opacity <= 0.002) return;
      gl.blendFunc(gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, l.bPos); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, l.bSeed); gl.enableVertexAttribArray(aSeed); gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0);
      gl.uniform1f(loc.uSize, Math.min(l.o.size, range[1]));
      gl.uniform1f(loc.uRise, l.o.rise);
      gl.uniform1f(loc.uH, l.o.h);
      gl.uniform1f(loc.uPar, l.o.par);
      gl.uniform1f(loc.uTwinkle, l.o.twinkle);
      gl.uniform3f(loc.uColor, color[0] / 255, color[1] / 255, color[2] / 255);
      gl.uniform1f(loc.uOpacity, opacity);
      gl.drawArrays(gl.POINTS, 0, l.count);
    }

    const api = {
      /* s: { color: [r,g,b], nf: 0..1, mx: -0.5..0.5, my: -0.5..0.5 } */
      render(time, s) {
        if (!running || gl.isContextLost()) return;
        cam.x += (s.mx * 1.4 - cam.x) * 0.05;
        cam.y += (-s.my * 0.8 - cam.y) * 0.05;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(loc.uTime, time);
        gl.uniform1f(loc.uPR, dpr);
        gl.uniform1f(loc.uScroll, (window.scrollY || 0) / (window.innerHeight || 800) * 1.5);
        gl.uniform1f(loc.uAspect, aspect);
        gl.uniform1f(loc.uF, F);
        gl.uniform2f(loc.uCam, cam.x, cam.y);
        const nf = s.nf || 0;
        draw(layers[0], s.color, 0.58 - 0.08 * nf, nf > 0.5);
        draw(layers[1], [251, 242, 220], nf * 0.95, true);
      },
      resize,
      start() { running = true; resize(); },
      stop() { running = false; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    };
    canvas.__retreatParticles = api;
    return api;
  }

  window.RetreatParticles = { create };
})();
