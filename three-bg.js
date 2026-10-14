/* =====================================================
   THREE.JS BACKGROUND — FUTURISTIC ROAD + REALISTIC BUS
   =====================================================
   v2.1 FIXES:
   • Bus transparency bug fixed (removed unsupported
     'transmission' prop on r128, fixed glass material)
   • Theme-aware scene: dark→lights ON, light→lights OFF
   • Buildings fully visible in light theme
   • Smooth fade transitions on theme switch
   • Materials stored in refs for runtime toggling
   ===================================================== */

(function initThree() {
  /* ---------- GUARDS ---------- */
  if (typeof THREE === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  /* =====================================================
     ⚙️ CONFIG
     ===================================================== */
  const CONFIG = {
    busType: 'single-decker',
    cameraMode: 'chase',
    mood: 'night-neon',
    roadType: 'highway-grid',

    goldPrimary:   0xf6d365,
    goldDeep:      0xd4a017,
    goldWarm:      0xffb347,
    roadBase:      0x0a0a12,
    skyTop:        0x05060f,
    skyBottom:     0x1a1228,
    fogColor:      0x1a1228,

    pixelRatioMax: 2,
    enableShadows: false,
  };

  /* ---------- RENDERER ---------- */
  const isMobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : CONFIG.pixelRatioMax));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  if (CONFIG.enableShadows && !isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CONFIG.fogColor, 0.014);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 4.5, 14);

  /* =====================================================
     LIGHTING — store refs for theme toggling
     ===================================================== */
  const ambient = new THREE.AmbientLight(0x8090b0, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(CONFIG.skyTop, CONFIG.roadBase, 0.45);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffc460, 0.85);
  keyLight.position.set(-8, 12, -6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x6a90d0, 0.35);
  fillLight.position.set(6, 6, 10);
  scene.add(fillLight);

  /* =====================================================
     SKY
     ===================================================== */
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop:    { value: new THREE.Color(CONFIG.skyTop) },
      uBottom: { value: new THREE.Color(CONFIG.skyBottom) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(t, 0.85));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  /* =====================================================
     STARS
     ===================================================== */
  const STAR_COUNT = isMobile ? 220 : 450;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starPhase = new Float32Array(STAR_COUNT);
  const starSizeAttr = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 120 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starPhase[i] = Math.random() * Math.PI * 2;
    starSizeAttr[i] = 0.8 + Math.random() * 2.2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize',  new THREE.BufferAttribute(starSizeAttr, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));

  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe6a8) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float tw = 0.55 + 0.45 * sin(uTime * 2.2 + aPhase);
        vAlpha = tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  scene.add(starPoints);

  /* =====================================================
     SHOOTING STARS
     ===================================================== */
  const shootingStars = [];
  const MAX_SHOOTING = isMobile ? 1 : 2;
  const starLineMat = () => new THREE.LineBasicMaterial({
    color: 0xffe194, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  function spawnShootingStar() {
    if (shootingStars.length >= MAX_SHOOTING) return;
    const len = 8 + Math.random() * 8;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -len, -len * 0.5, 0
    ], 3));
    const mat = starLineMat();
    const line = new THREE.Line(geo, mat);
    line.position.set(
      (Math.random() - 0.5) * 120,
      40 + Math.random() * 30,
      -60 - Math.random() * 40
    );
    scene.add(line);
    shootingStars.push({
      line, mat, life: 0,
      maxLife: 1.2 + Math.random() * 0.8,
      vx: 40 + Math.random() * 30,
      vy: -(20 + Math.random() * 15)
    });
  }
  let nextShoot = performance.now() + 4000 + Math.random() * 6000;

  /* =====================================================
     ROAD
     ===================================================== */
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const ROAD_WIDTH = 14;
  const ROAD_LENGTH = 400;

  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH, 1, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    color: CONFIG.roadBase,
    roughness: 0.85,
    metalness: 0.15
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -ROAD_LENGTH / 2 + 20;
  roadGroup.add(road);

  // Golden grid overlay
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 128;
  gridCanvas.height = 128;
  const gctx = gridCanvas.getContext('2d');
  gctx.fillStyle = 'rgba(0,0,0,0)';
  gctx.fillRect(0, 0, 128, 128);
  gctx.strokeStyle = 'rgba(246,211,101,0.55)';
  gctx.lineWidth = 2;
  gctx.strokeRect(0, 0, 128, 128);
  gctx.beginPath();
  gctx.moveTo(64, 0); gctx.lineTo(64, 128);
  gctx.moveTo(0, 64); gctx.lineTo(128, 64);
  gctx.stroke();
  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(6, 80);
  const gridPlaneGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
  const gridPlaneMat = new THREE.MeshBasicMaterial({
    map: gridTex, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const gridPlane = new THREE.Mesh(gridPlaneGeo, gridPlaneMat);
  gridPlane.rotation.x = -Math.PI / 2;
  gridPlane.position.set(0, 0.01, -ROAD_LENGTH / 2 + 20);
  roadGroup.add(gridPlane);

  // Dashes
  const dashMat = new THREE.MeshBasicMaterial({
    color: CONFIG.goldPrimary,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const dashGeo = new THREE.PlaneGeometry(0.22, 1.8);
  const dashes = [];
  for (let z = 20; z > -ROAD_LENGTH + 20; z -= 4) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(0, 0.02, z);
    roadGroup.add(d);
    dashes.push(d);
  }

  // Edge lines
  const edgeMat = new THREE.MeshBasicMaterial({
    color: CONFIG.goldWarm, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const edgeGeo = new THREE.PlaneGeometry(0.15, ROAD_LENGTH);
  [-1, 1].forEach(side => {
    const e = new THREE.Mesh(edgeGeo, edgeMat);
    e.rotation.x = -Math.PI / 2;
    e.position.set(side * (ROAD_WIDTH / 2 - 0.4), 0.02, -ROAD_LENGTH / 2 + 20);
    roadGroup.add(e);
  });

  /* =====================================================
     ROADSIDE — Light poles (store glow sprites for toggle)
     ===================================================== */
  const polesGroup = new THREE.Group();
  scene.add(polesGroup);

  const polePoleGeo = new THREE.CylinderGeometry(0.06, 0.08, 6, 6);
  const polePoleMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a22, roughness: 0.7, metalness: 0.4
  });
  const poleHeadGeo = new THREE.SphereGeometry(0.22, 12, 12);
  const poleHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe194 });

  // Reusable glow texture
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gc = glowCanvas.getContext('2d');
  const grd = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,225,148,1)');
  grd.addColorStop(0.4, 'rgba(255,200,100,0.5)');
  grd.addColorStop(1, 'rgba(255,200,100,0)');
  gc.fillStyle = grd;
  gc.fillRect(0, 0, 64, 64);
  const poleGlowTex = new THREE.CanvasTexture(glowCanvas);

  const poleSpacing = 18;
  const poleCount = Math.ceil(ROAD_LENGTH / poleSpacing);
  const polesData = [];
  const poleGlowSprites = [];   // for theme toggle
  const poleHeadMeshes = [];    // for theme toggle

  for (let i = 0; i < poleCount; i++) {
    const z = 20 - i * poleSpacing;
    [-1, 1].forEach(side => {
      const g = new THREE.Group();

      const pole = new THREE.Mesh(polePoleGeo, polePoleMat);
      pole.position.y = 3;
      g.add(pole);

      const head = new THREE.Mesh(poleHeadGeo, poleHeadMat);
      head.position.set(side * -0.4, 6, 0);
      g.add(head);
      poleHeadMeshes.push(head);

      const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: poleGlowTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.9
      }));
      glowSprite.scale.set(2.2, 2.2, 1);
      glowSprite.position.set(side * -0.4, 6, 0);
      g.add(glowSprite);
      poleGlowSprites.push(glowSprite);

      g.position.set(side * (ROAD_WIDTH / 2 + 0.8), 0, z);
      polesGroup.add(g);
      polesData.push(g);
    });
  }

  /* =====================================================
     CITY SKYLINE — buildings + windows
     (buildings group + window materials stored for theme toggle)
     ===================================================== */
  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  const cityBuildingGeo = new THREE.BoxGeometry(1, 1, 1);

  // Building body material (dark silhouette — used in dark theme)
  const cityBuildingMat = new THREE.MeshStandardMaterial({
    color: 0x0f0d1a, roughness: 0.95, metalness: 0.1,
    emissive: 0x1a1030, emissiveIntensity: 0.15
  });

  // Light-theme version (brighter concrete)
  const cityBuildingMatLight = new THREE.MeshStandardMaterial({
    color: 0x8a7c68, roughness: 0.85, metalness: 0.15,
    emissive: 0x000000, emissiveIntensity: 0
  });

  const windowMaterials = [];   // collect all window materials so we can fade them
  const buildingMeshes = [];    // store refs so we can swap material on theme

  const buildingCount = isMobile ? 30 : 55;
  for (let i = 0; i < buildingCount; i++) {
    const w = 2 + Math.random() * 5;
    const h = 6 + Math.random() * 22;
    const d = 2 + Math.random() * 5;
    const b = new THREE.Mesh(cityBuildingGeo, cityBuildingMat);
    b.scale.set(w, h, d);
    const side = Math.random() < 0.5 ? -1 : 1;
    const distX = (ROAD_WIDTH / 2) + 25 + Math.random() * 60;
    b.position.set(side * distX, h / 2 - 2, -80 - Math.random() * 140);
    cityGroup.add(b);
    buildingMeshes.push(b);

    // Window dots
    const windowMat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.7 ? 0xffd27a : 0x7ab8ff,
      transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    windowMaterials.push(windowMat);

    const winGeo = new THREE.PlaneGeometry(0.25, 0.35);
    const rows = Math.floor(h / 1.8);
    const cols = Math.floor(w / 1.1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.55) {
          const wm = new THREE.Mesh(winGeo, windowMat);
          wm.position.set(
            b.position.x - side * (w / 2 + 0.01),
            (r + 0.5) * 1.8 - h / 2 + b.position.y,
            b.position.z + (c - cols / 2 + 0.5) * 1.1
          );
          wm.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          cityGroup.add(wm);
        }
      }
    }
  }

  /* =====================================================
     🚌 BUS — FIXED MATERIALS (no transmission, proper opacity)
     ===================================================== */
  function createBus() {
    const bus = new THREE.Group();

    /* ---------- Materials (r128-compatible) ---------- */
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4d8,
      roughness: 0.32,
      metalness: 0.55,
      transparent: false,
      depthWrite: true
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: CONFIG.goldDeep,
      roughness: 0.35,
      metalness: 0.85,
      transparent: false,
      depthWrite: true
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x14141a,
      roughness: 0.55,
      metalness: 0.4,
      transparent: false,
      depthWrite: true
    });

    /* Glass — FIX: no transmission, subtle opacity, proper depthWrite */
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420,
      roughness: 0.15,
      metalness: 0.55,
      transparent: true,
      opacity: 0.92,
      depthWrite: true
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.9,
      metalness: 0.1,
      transparent: false
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xb0b0b8,
      roughness: 0.25,
      metalness: 0.9,
      transparent: false
    });

    /* Emissive (light) materials — these toggle with theme */
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const destBoardMat = new THREE.MeshBasicMaterial({ color: 0xffbb33 });

    /* ---------- Dimensions ---------- */
    const L = 11;
    const W = 2.7;
    const H = 3.1;
    const FLOOR_Y = 0.55;

    /* ---------- Main body ---------- */
    const bodyGeo = new THREE.BoxGeometry(W, H, L);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = FLOOR_Y + H / 2;
    bus.add(body);

    // Lower skirt (accent)
    const skirtGeo = new THREE.BoxGeometry(W + 0.02, 0.6, L - 0.2);
    const skirt = new THREE.Mesh(skirtGeo, accentMat);
    skirt.position.y = FLOOR_Y + 0.15;
    bus.add(skirt);

    // Roof cap
    const roofGeo = new THREE.BoxGeometry(W + 0.1, 0.18, L - 0.1);
    const roof = new THREE.Mesh(roofGeo, darkMat);
    roof.position.y = FLOOR_Y + H + 0.05;
    bus.add(roof);

    // Roof AC
    const acGeo = new THREE.BoxGeometry(1.4, 0.35, 2.2);
    const ac = new THREE.Mesh(acGeo, bodyMat);
    ac.position.set(0, FLOOR_Y + H + 0.3, -1.5);
    bus.add(ac);
    const acTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 2.1), darkMat);
    acTop.position.set(0, FLOOR_Y + H + 0.5, -1.5);
    bus.add(acTop);

    /* ---------- Side windows (inset to avoid z-fight) ---------- */
    const winGeo = new THREE.PlaneGeometry(1.05, 1.15);
    const winCount = 6;
    const winStartZ = -L / 2 + 1.2;
    const winSpacing = (L - 2.4) / (winCount - 1);

    for (let i = 0; i < winCount; i++) {
      const z = winStartZ + i * winSpacing;
      [-1, 1].forEach(side => {
        const w = new THREE.Mesh(winGeo, glassMat);
        // slight inset (0.015) to prevent z-fighting with body
        w.position.set(side * (W / 2 - 0.015), FLOOR_Y + H * 0.62, z);
        w.rotation.y = side * Math.PI / 2;
        bus.add(w);
      });
    }

    /* ---------- Windshield ---------- */
    const wsGeo = new THREE.PlaneGeometry(W - 0.3, 1.35);
    const ws = new THREE.Mesh(wsGeo, glassMat);
    ws.position.set(0, FLOOR_Y + H * 0.68, L / 2 - 0.015);
    bus.add(ws);

    /* ---------- Rear window ---------- */
    const rwGeo = new THREE.PlaneGeometry(W - 0.5, 1.0);
    const rw = new THREE.Mesh(rwGeo, glassMat);
    rw.position.set(0, FLOOR_Y + H * 0.65, -L / 2 + 0.015);
    rw.rotation.y = Math.PI;
    bus.add(rw);

    /* ---------- Front bumper + grill ---------- */
    const bumperGeo = new THREE.BoxGeometry(W + 0.05, 0.35, 0.35);
    const bumper = new THREE.Mesh(bumperGeo, darkMat);
    bumper.position.set(0, FLOOR_Y + 0.15, L / 2 + 0.1);
    bus.add(bumper);

    const grillGeo = new THREE.BoxGeometry(W - 0.6, 0.55, 0.08);
    const grill = new THREE.Mesh(grillGeo, darkMat);
    grill.position.set(0, FLOOR_Y + 0.55, L / 2 + 0.03);
    bus.add(grill);
    for (let i = 0; i < 4; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(W - 0.6, 0.03, 0.1),
        rimMat
      );
      strip.position.set(0, FLOOR_Y + 0.4 + i * 0.12, L / 2 + 0.04);
      bus.add(strip);
    }

    /* ---------- Headlights ---------- */
    const headGeo = new THREE.CircleGeometry(0.22, 16);
    [-0.85, 0.85].forEach(x => {
      const h = new THREE.Mesh(headGeo, headlightMat);
      h.position.set(x, FLOOR_Y + 0.55, L / 2 + 0.05);
      bus.add(h);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.28, 20),
        rimMat
      );
      ring.position.set(x, FLOOR_Y + 0.55, L / 2 + 0.052);
      bus.add(ring);
    });

    /* ---------- Taillights + glow sprites ---------- */
    const tailGeo = new THREE.PlaneGeometry(0.35, 0.22);
    const tailSprites = [];
    [-1.05, 1.05].forEach(x => {
      const t = new THREE.Mesh(tailGeo, taillightMat);
      t.position.set(x, FLOOR_Y + 0.55, -L / 2 - 0.02);
      t.rotation.y = Math.PI;
      bus.add(t);

      // Reuse glowCanvas gradient (red version)
      const redCanvas = document.createElement('canvas');
      redCanvas.width = redCanvas.height = 64;
      const rc = redCanvas.getContext('2d');
      const rg = rc.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,60,60,1)');
      rg.addColorStop(0.4, 'rgba(255,30,30,0.45)');
      rg.addColorStop(1, 'rgba(255,0,0,0)');
      rc.fillStyle = rg;
      rc.fillRect(0, 0, 64, 64);
      const redTex = new THREE.CanvasTexture(redCanvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: redTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.9
      }));
      sprite.scale.set(1.1, 1.1, 1);
      sprite.position.set(x, FLOOR_Y + 0.55, -L / 2 - 0.15);
      bus.add(sprite);
      tailSprites.push(sprite);
    });

    /* ---------- Destination board ---------- */
    const destGeo = new THREE.PlaneGeometry(W - 0.5, 0.4);
    const dest = new THREE.Mesh(destGeo, destBoardMat);
    dest.position.set(0, FLOOR_Y + H - 0.35, L / 2 + 0.02);
    bus.add(dest);
    for (let i = 0; i < 6; i++) {
      const letter = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x2a1a00 })
      );
      letter.position.set(-1 + i * 0.4, FLOOR_Y + H - 0.35, L / 2 + 0.025);
      bus.add(letter);
    }

    /* ---------- Side mirrors ---------- */
    const mirrorArmGeo = new THREE.BoxGeometry(0.05, 0.05, 0.5);
    const mirrorHeadGeo = new THREE.BoxGeometry(0.08, 0.3, 0.18);
    [-1, 1].forEach(side => {
      const arm = new THREE.Mesh(mirrorArmGeo, darkMat);
      arm.position.set(side * (W / 2 + 0.15), FLOOR_Y + H * 0.75, L / 2 - 0.3);
      bus.add(arm);

      const mh = new THREE.Mesh(mirrorHeadGeo, darkMat);
      mh.position.set(side * (W / 2 + 0.4), FLOOR_Y + H * 0.75, L / 2 - 0.3);
      bus.add(mh);
    });

    /* ---------- Door ---------- */
    const doorGeo = new THREE.PlaneGeometry(0.9, 1.9);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22, roughness: 0.3, metalness: 0.45,
      transparent: true, opacity: 0.88, depthWrite: true
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(W / 2 - 0.015, FLOOR_Y + 1.0, L / 2 - 1.2);
    door.rotation.y = Math.PI / 2;
    bus.add(door);

    /* ---------- Wheels ---------- */
    const wheelRadius = 0.55;
    const wheelThick  = 0.35;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThick, 24);
    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.62, wheelRadius * 0.62, wheelThick + 0.02, 12);

    const wheels = [];
    const wheelPositions = [
      { x:  W / 2 - 0.15, z:  L / 2 - 1.6 },
      { x: -W / 2 + 0.15, z:  L / 2 - 1.6 },
      { x:  W / 2 - 0.15, z: -L / 2 + 2.0 },
      { x: -W / 2 + 0.15, z: -L / 2 + 2.0 }
    ];

    wheelPositions.forEach(p => {
      const w = new THREE.Mesh(wheelGeo, rubberMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p.x, wheelRadius, p.z);
      bus.add(w);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.copy(w.position);
      rim.position.x += (p.x > 0 ? 1 : -1) * 0.01;
      bus.add(rim);

      wheels.push(w);
    });

    /* ---------- Headlight BEAM ---------- */
    const beamGeo = new THREE.ConeGeometry(2.6, 12, 24, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe194,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, FLOOR_Y + 0.5, L / 2 + 6);
    bus.add(beam);

    /* ---------- Under-glow ---------- */
    const underGlowGeo = new THREE.PlaneGeometry(W + 2, L + 3);
    const underGlowMat = new THREE.MeshBasicMaterial({
      color: CONFIG.goldPrimary,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const underGlow = new THREE.Mesh(underGlowGeo, underGlowMat);
    underGlow.rotation.x = -Math.PI / 2;
    underGlow.position.y = 0.02;
    bus.add(underGlow);

    /* ---------- Refs for animation + theme toggle ---------- */
    bus.userData = {
      wheels,
      beam,
      underGlow,
      headlightMat,
      taillightMat,
      destBoardMat,
      tailSprites,
      baseY: 0,
      bouncePhase: Math.random() * Math.PI * 2,
      // Baseline opacities for theme fading
      baseline: {
        beam: 0.14,
        underGlow: 0.18,
        tailSprite: 0.9
      }
    };

    return bus;
  }

  const bus = createBus();
  bus.position.set(0, 0, 0);
  scene.add(bus);

  /* =====================================================
     SPEED STREAKS
     ===================================================== */
  const streaks = [];
  const streakCount = isMobile ? 12 : 22;
  const streakMat = new THREE.LineBasicMaterial({
    color: 0xffe194, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  for (let i = 0; i < streakCount; i++) {
    const len = 0.8 + Math.random() * 2.5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -len], 3));
    const line = new THREE.Line(geo, streakMat);
    const side = Math.random() < 0.5 ? -1 : 1;
    line.position.set(
      side * (2 + Math.random() * 2.5),
      0.3 + Math.random() * 2.5,
      (Math.random() - 0.5) * 60
    );
    scene.add(line);
    streaks.push({
      line,
      speed: 20 + Math.random() * 30,
      startZ: 15
    });
  }

  /* =====================================================
     🎨 THEME-AWARE SCENE CONTROLLER
     =====================================================
     Dark theme  → lights ON, buildings dim silhouette
     Light theme → lights OFF, buildings fully visible
     ===================================================== */
  const themeState = {
    current: 'dark',      // 'dark' | 'light'
    lightLevel: 1,        // 0 = lights OFF, 1 = lights ON (smoothly interpolated)
    targetLevel: 1,
  };

  function applyThemeToScene(theme, animate = true) {
    const isLight = theme === 'light';
    themeState.current = isLight ? 'light' : 'dark';
    themeState.targetLevel = isLight ? 0 : 1;

    // ---- Background clear-color & fog ----
    if (isLight) {
      scene.fog.color.set(0xd8cfbc);
      scene.fog.density = 0.008;
    } else {
      scene.fog.color.set(CONFIG.fogColor);
      scene.fog.density = 0.014;
    }

    // ---- Sky colors ----
    if (isLight) {
      skyMat.uniforms.uTop.value.set(0xdfe6f5);
      skyMat.uniforms.uBottom.value.set(0xfaf2e0);
    } else {
      skyMat.uniforms.uTop.value.set(CONFIG.skyTop);
      skyMat.uniforms.uBottom.value.set(CONFIG.skyBottom);
    }

    // ---- Stars fade out in light theme ----
    starPoints.visible = !isLight;

    // ---- Lighting ----
    ambient.intensity = isLight ? 0.95 : 0.55;
    ambient.color.set(isLight ? 0xffffff : 0x8090b0);

    hemi.intensity = isLight ? 0.85 : 0.45;
    hemi.color.set(isLight ? 0xffffff : CONFIG.skyTop);
    hemi.groundColor.set(isLight ? 0xd8cfbc : CONFIG.roadBase);

    keyLight.intensity = isLight ? 0.35 : 0.85;
    keyLight.color.set(isLight ? 0xffffff : 0xffc460);

    fillLight.intensity = isLight ? 0.55 : 0.35;

    // ---- Buildings: swap material for light theme ----
    buildingMeshes.forEach(b => {
      b.material = isLight ? cityBuildingMatLight : cityBuildingMat;
    });

    // ---- Window lights fade off in light theme ----
    windowMaterials.forEach(m => {
      m.userData = m.userData || {};
      if (m.userData.targetOpacity === undefined) {
        m.userData.targetOpacity = 0.85;
      }
      m.userData.targetOpacity = isLight ? 0.0 : 0.85;
      m.userData.transitioning = animate;
    });

    // ---- Road glow elements ----
    gridPlaneMat.opacity = isLight ? 0.10 : 0.35;
    dashMat.opacity = isLight ? 0.25 : 0.85;
    edgeMat.opacity = isLight ? 0.20 : 0.55;

    // ---- Pole heads & glows ----
    poleHeadMat.color.set(isLight ? 0x555555 : 0xffe194);
    poleGlowSprites.forEach(s => {
      s.userData = s.userData || {};
      s.userData.targetOpacity = isLight ? 0.0 : 0.9;
    });

    // ---- Bus lights (baseline targets) ----
    // We'll lerp these in animate() using themeState.lightLevel
    bus.userData.headlightMat.color.set(isLight ? 0x555555 : 0xfff3c4);
    bus.userData.taillightMat.color.set(isLight ? 0x552222 : 0xff2a2a);
    bus.userData.destBoardMat.color.set(isLight ? 0x554422 : 0xffbb33);
  }

  // Smoothly lerp lightLevel toward targetLevel each frame
  function updateThemeTransition(dt) {
    const speed = 4.0;   // higher = faster transition
    const diff = themeState.targetLevel - themeState.lightLevel;
    if (Math.abs(diff) > 0.001) {
      themeState.lightLevel += diff * Math.min(1, dt * speed);
    } else {
      themeState.lightLevel = themeState.targetLevel;
    }
    const L = themeState.lightLevel;

    // Bus beam
    bus.userData.beam.material.opacity = bus.userData.baseline.beam * L;
    bus.userData.beam.visible = L > 0.02;

    // Bus under-glow
    bus.userData.underGlow.material.opacity = bus.userData.baseline.underGlow * L;
    bus.userData.underGlow.visible = L > 0.02;

    // Bus tail sprites
    bus.userData.tailSprites.forEach(s => {
      s.material.opacity = bus.userData.baseline.tailSprite * L;
      s.visible = L > 0.02;
    });

    // Pole glows
    poleGlowSprites.forEach(s => {
      const target = s.userData?.targetOpacity ?? 0.9;
      s.material.opacity = target * L;
      s.visible = (target * L) > 0.02;
    });

    // Window materials
    windowMaterials.forEach(m => {
      const target = m.userData?.targetOpacity ?? 0.85;
      m.opacity = target * L;
      m.visible = (target * L) > 0.02;
    });
  }

  // Detect initial theme
  const detectInitialTheme = () => {
    const saved = localStorage.getItem('ff-theme') || 'system';
    if (saved === 'system') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return saved;
  };
  applyThemeToScene(detectInitialTheme(), false);

  // Watch for theme changes on <html data-theme="...">
  const themeObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.attributeName === 'data-theme') {
        const newTheme = document.documentElement.dataset.theme || 'dark';
        applyThemeToScene(newTheme, true);
      }
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  /* =====================================================
     MOUSE / GYRO PARALLAX
     ===================================================== */
  let targetX = 0, targetY = 0;
  let currX = 0, currY = 0;

  window.addEventListener('pointermove', e => {
    targetX = (e.clientX / window.innerWidth  - 0.5) * 2;
    targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; }, { passive: true });
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
  let paused = false;

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    lastT = performance.now();
  });

  function animate(now) {
    requestAnimationFrame(animate);
    if (paused) return;

    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    time += dt;

    starMat.uniforms.uTime.value = time;

    /* ---- Road scroll ---- */
    const roadSpeed = 14;
    dashes.forEach(d => {
      d.position.z += roadSpeed * dt;
      if (d.position.z > 22) d.position.z -= 4 * Math.floor((ROAD_LENGTH) / 4);
    });
    gridTex.offset.y = (gridTex.offset.y + roadSpeed * dt * 0.02) % 1;

    /* ---- Poles recycle ---- */
    polesData.forEach(p => {
      p.position.z += roadSpeed * dt;
      if (p.position.z > 22) {
        p.position.z -= poleSpacing * poleCount;
      }
    });

    /* ---- Bus bounce + wheels ---- */
    const bounce = Math.sin(time * 3.2 + bus.userData.bouncePhase) * 0.035;
    bus.position.y = bus.userData.baseY + bounce;
    bus.rotation.z = Math.sin(time * 1.6) * 0.008;

    const wheelSpeed = roadSpeed / 0.55;
    bus.userData.wheels.forEach(w => {
      w.rotation.x -= wheelSpeed * dt;
    });

    /* ---- Beam flicker (only when lights on) ---- */
    const L = themeState.lightLevel;
    if (L > 0.05) {
      bus.userData.beam.material.opacity =
        (0.12 + 0.02 * Math.sin(time * 8.3)) * L;
      bus.userData.underGlow.material.opacity =
        (0.16 + 0.04 * Math.sin(time * 2.5)) * L;
    }

    /* ---- Speed streaks (only visible in dark theme) ---- */
    streakMat.opacity = 0.65 * L;
    streaks.forEach(s => {
      s.line.position.z -= s.speed * dt;
      if (s.line.position.z < -40) {
        s.line.position.z = 20;
        s.line.position.x = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2.5);
        s.line.position.y = 0.3 + Math.random() * 2.5;
      }
    });

    /* ---- Shooting stars ---- */
    if (now > nextShoot && L > 0.5) {
      nextShoot = now + 5000 + Math.random() * 9000;
      spawnShootingStar();
    }
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.life += dt;
      const k = s.life / s.maxLife;
      s.line.position.x += s.vx * dt;
      s.line.position.y += s.vy * dt;
      s.mat.opacity = 0.95 * Math.max(0, 1 - k);
      if (k >= 1) {
        scene.remove(s.line);
        s.line.geometry.dispose();
        s.mat.dispose();
        shootingStars.splice(i, 1);
      }
    }

    /* ---- Theme transition lerp ---- */
    updateThemeTransition(dt);

    /* ---- Camera ---- */
    currX += (targetX - currX) * 0.045;
    currY += (targetY - currY) * 0.045;

    if (CONFIG.cameraMode === 'chase') {
      const baseX = 0;
      const baseY = 4.5;
      const baseZ = 14;
      camera.position.x = baseX + currX * 1.8;
      camera.position.y = baseY - currY * 1.0 + bounce * 0.5;
      camera.position.z = baseZ;
      camera.lookAt(bus.position.x + currX * 2, 2.2, bus.position.z - 8);
    } else if (CONFIG.cameraMode === 'side') {
      camera.position.x = 12 + currX * 2;
      camera.position.y = 3.5 + currY * 1.5;
      camera.position.z = 4;
      camera.lookAt(bus.position.x, 2, bus.position.z - 3);
    } else {
      const r = 14;
      const a = time * 0.15;
      camera.position.x = Math.cos(a) * r;
      camera.position.y = 5 + Math.sin(time * 0.3) * 1.5;
      camera.position.z = Math.sin(a) * r + 2;
      camera.lookAt(bus.position.x, 2.2, bus.position.z - 4);
    }

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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
    }, 120);
  }, { passive: true });

  /* =====================================================
     CANVAS OPACITY (theme-aware)
     ===================================================== */
  const applyCanvasOpacity = () => {
    const theme = document.documentElement.dataset.theme;
    canvas.style.opacity = theme === 'light' ? '0.55' : '0.95';
  };
  applyCanvasOpacity();
  new MutationObserver(applyCanvasOpacity).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

})();