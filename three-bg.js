/* =====================================================
   THREE.JS BACKGROUND — IMMERSIVE GOLDEN BOKEH
   • Round, smooth, blurred particles (custom shader)
   • Soft glowing orbs (bokeh aesthetic)
   • Mouse parallax + gentle drift
   • Golden palette matching brand
   • Mobile-optimized (reduced count, capped DPR)
   • Cloudflare Pages compatible (CDN loaded)
   • Respects prefers-reduced-motion
   ===================================================== */
(function initThree() {
  /* ---------- GUARDS ---------- */
  if (typeof THREE === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  /* ---------- RENDERER ---------- */
  const isMobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 24;

  /* =====================================================
     SOFT ROUND PARTICLE — Custom Shader Material
     Makes circular, blurred, bokeh-like glowing orbs
     ===================================================== */
  const vertShader = `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3  aColor;
    varying float vAlpha;
    varying vec3  vColor;
    void main() {
      vAlpha = aAlpha;
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (300.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `;

  const fragShader = `
    varying float vAlpha;
    varying vec3  vColor;
    void main() {
      // gl_PointCoord is 0..1 across the point sprite
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);
      // soft round falloff → smooth blurred edge
      float smooth_ = smoothstep(0.5, 0.0, d);
      // extra inner glow (bright core)
      float core = smoothstep(0.35, 0.0, d) * 0.6;
      float alpha = (smooth_ + core) * vAlpha;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  const uniforms = {
    uTime: { value: 0 }
  };

  /* =====================================================
     PARTICLE COUNT — mobile-optimized
     ===================================================== */
  const COUNT = isMobile ? 180 : 340;

  /* ---------- GEOMETRY BUFFERS ---------- */
  const positions  = new Float32Array(COUNT * 3);
  const sizes      = new Float32Array(COUNT);
  const alphas     = new Float32Array(COUNT);
  const colors     = new Float32Array(COUNT * 3);
  const baseSpeeds = new Float32Array(COUNT);
  const phases     = new Float32Array(COUNT);
  const wobbles    = new Float32Array(COUNT);

  /* ---------- GOLDEN PALETTE (RGB 0-1) ---------- */
  const PALETTE = [
    [0.964, 0.827, 0.396], // #f6d365 — light gold
    [0.831, 0.627, 0.090], // #d4a017 — deep gold
    [1.000, 0.702, 0.278], // #ffb347 — amber
    [1.000, 0.882, 0.580], // #ffe194 — pale gold
    [0.984, 0.749, 0.141]  // #fbbf24 — warm gold
  ];

  for (let i = 0; i < COUNT; i++) {
    // Position spread wider than camera view for depth
    positions[i * 3 + 0] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 45;

    // Size: mostly small with occasional large bokeh
    const sizeBias = Math.pow(Math.random(), 2.2);      // skew small
    sizes[i] = 6 + sizeBias * 42;                        // 6 → 48

    // Alpha: larger ones slightly more transparent (bokeh depth)
    alphas[i] = 0.25 + Math.random() * 0.55;

    // Color from palette
    const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    colors[i * 3 + 0] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];

    // Motion
    baseSpeeds[i] = 0.008 + Math.random() * 0.022;
    phases[i]     = Math.random() * Math.PI * 2;
    wobbles[i]    = 0.4 + Math.random() * 1.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertShader,
    fragmentShader: fragShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  /* =====================================================
     SECOND LAYER — DEEPER, SLOWER, DIMMER PARTICLES
     Adds parallax depth
     ===================================================== */
  const COUNT_DEEP = isMobile ? 80 : 140;
  const deepPos     = new Float32Array(COUNT_DEEP * 3);
  const deepSizes   = new Float32Array(COUNT_DEEP);
  const deepAlphas  = new Float32Array(COUNT_DEEP);
  const deepColors  = new Float32Array(COUNT_DEEP * 3);
  const deepSpeeds  = new Float32Array(COUNT_DEEP);

  for (let i = 0; i < COUNT_DEEP; i++) {
    deepPos[i * 3 + 0] = (Math.random() - 0.5) * 90;
    deepPos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    deepPos[i * 3 + 2] = -20 - Math.random() * 35;     // behind

    deepSizes[i]  = 10 + Math.random() * 26;
    deepAlphas[i] = 0.10 + Math.random() * 0.18;

    const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    deepColors[i * 3 + 0] = c[0] * 0.85;
    deepColors[i * 3 + 1] = c[1] * 0.85;
    deepColors[i * 3 + 2] = c[2] * 0.85;

    deepSpeeds[i] = 0.004 + Math.random() * 0.010;
  }

  const deepGeo = new THREE.BufferGeometry();
  deepGeo.setAttribute('position', new THREE.BufferAttribute(deepPos, 3));
  deepGeo.setAttribute('aSize',    new THREE.BufferAttribute(deepSizes, 1));
  deepGeo.setAttribute('aAlpha',   new THREE.BufferAttribute(deepAlphas, 1));
  deepGeo.setAttribute('aColor',   new THREE.BufferAttribute(deepColors, 3));

  const deepMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertShader,
    fragmentShader: fragShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const deepParticles = new THREE.Points(deepGeo, deepMaterial);
  scene.add(deepParticles);

  /* =====================================================
     MOUSE / TOUCH PARALLAX
     ===================================================== */
  let targetX = 0, targetY = 0;
  let currX   = 0, currY   = 0;

  window.addEventListener('pointermove', e => {
    targetX = (e.clientX / window.innerWidth  - 0.5) * 2;
    targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    targetX = 0; targetY = 0;
  }, { passive: true });

  // Device orientation tilt (mobile)
  window.addEventListener('deviceorientation', e => {
    if (e.gamma == null || e.beta == null) return;
    targetX = Math.max(-1, Math.min(1, e.gamma / 45));
    targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
  }, { passive: true });

  /* =====================================================
     ANIMATION LOOP
     ===================================================== */
  let lastT = performance.now();
  let time  = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    time += dt;

    uniforms.uTime.value = time;

    /* ---- Layer 1: main particles drift upward + wobble ---- */
    const pos1 = geometry.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;

      pos1[iy] += baseSpeeds[i] * 60 * dt;
      pos1[ix] += Math.sin(time * wobbles[i] + phases[i]) * 0.008;

      // Wrap around when out of view
      if (pos1[iy] > 36) {
        pos1[iy] = -36;
        pos1[ix] = (Math.random() - 0.5) * 70;
        pos1[iz] = (Math.random() - 0.5) * 45;
      }
    }
    geometry.attributes.position.needsUpdate = true;

    /* ---- Layer 2: deep layer, slower + subtle ---- */
    const pos2 = deepGeo.attributes.position.array;
    for (let i = 0; i < COUNT_DEEP; i++) {
      const iy = i * 3 + 1;
      pos2[iy] += deepSpeeds[i] * 60 * dt;
      if (pos2[iy] > 45) pos2[iy] = -45;
    }
    deepGeo.attributes.position.needsUpdate = true;

    /* ---- Parallax easing ---- */
    currX += (targetX - currX) * 0.045;
    currY += (targetY - currY) * 0.045;

    camera.position.x = currX * 3.2;
    camera.position.y = currY * 3.2;
    camera.lookAt(scene.position);

    /* ---- Very subtle rotation for organic feel ---- */
    particles.rotation.z     = Math.sin(time * 0.15) * 0.035;
    deepParticles.rotation.z = Math.sin(time * 0.08 + 1.2) * 0.02;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  /* =====================================================
     RESIZE
     ===================================================== */
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.75 : 2));
    }, 120);
  }, { passive: true });

  /* =====================================================
     PAGE VISIBILITY — pause when hidden (battery save)
     ===================================================== */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Throttle: mark lastT so dt on resume doesn't spike
      lastT = performance.now();
    }
  });

  /* =====================================================
     THEME-AWARE OPACITY
     Light theme par particles halkay, dark theme par prominent
     ===================================================== */
  const applyCanvasOpacity = () => {
    const theme = document.documentElement.dataset.theme;
    canvas.style.opacity = theme === 'light' ? '0.5' : '0.85';
  };
  applyCanvasOpacity();

  new MutationObserver(applyCanvasOpacity).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

})();