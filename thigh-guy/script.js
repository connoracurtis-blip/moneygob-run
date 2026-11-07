(() => {
  "use strict";

  // Thigh Guy Saves the Day — self-contained browser-only raycaster prototype.
  // No packages, Node.js, build tools, or external libraries are required.

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d");
  const ui = {
    title: document.getElementById("title"), pause: document.getElementById("pause"),
    ending: document.getElementById("ending"), hud: document.getElementById("hud"),
    health: document.getElementById("health"), ammo: document.getElementById("ammo"),
    objective: document.getElementById("objective"), message: document.getElementById("message"),
    endingTitle: document.getElementById("ending-title"), endingMessage: document.getElementById("ending-message")
  };

  const MAP = [
    "################",
    "#..............#",
    "#..##......##..#",
    "#..#........#..#",
    "#..#..##....#..#",
    "#.....##.......#",
    "#..............#",
    "#.####....####.#",
    "#..............#",
    "#..##......##..#",
    "#..##......##..#",
    "#..............#",
    "#......D.......#",
    "#..............#",
    "#..............#",
    "################"
  ];
  const TILE = 1;
  const player = { x: 2.5, y: 2.5, angle: 0, health: 100, ammo: 12, reserve: 48, keycard: false };
  let running = false, paused = false, ended = false, lastTime = 0, lastShot = 0;
  let keys = Object.create(null), zBuffer = [];
  let noticeTimer = 0, damageFlash = 0, recoil = 0;
  const FOV = Math.PI / 3;
  const enemies = [
    makeEnemy(8.5, 3.5, "BIRD"),
    makeEnemy(12.5, 7.5, "DONKEY"),
    makeEnemy(5.5, 12.5, "BIRD")
  ];
  const pickups = [
    { x: 4.5, y: 2.5, type: "key", taken: false },
    { x: 11.5, y: 11.5, type: "ammo", taken: false },
    { x: 2.5, y: 10.5, type: "health", taken: false }
  ];

  function makeEnemy(x, y, type) {
    return { x, y, homeX: x, homeY: y, type, hp: 100, alive: true, attack: 0, phase: Math.random() * 6 };
  }
  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(innerWidth * scale);
    canvas.height = Math.floor(innerHeight * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  addEventListener("resize", resize); resize();

  function wallAt(x, y) {
    const mx = Math.floor(x), my = Math.floor(y);
    if (my < 0 || my >= MAP.length || mx < 0 || mx >= MAP[0].length) return true;
    return MAP[my][mx] === "#";
  }
  function doorAt(x, y) {
    return Math.floor(x) === 7 && Math.floor(y) === 12 && !player.keycard;
  }
  function solidAt(x, y) { return wallAt(x, y) || doorAt(x, y); }
  function movePlayer(dx, dy) {
    const r = .19;
    if (!solidAt(player.x + dx + Math.sign(dx) * r, player.y)) player.x += dx;
    if (!solidAt(player.x, player.y + dy + Math.sign(dy) * r)) player.y += dy;
  }
  function showMessage(text, seconds = 2) {
    ui.message.textContent = text; ui.message.classList.add("show"); noticeTimer = seconds;
  }
  function updateHud() {
    ui.health.textContent = player.health;
    ui.ammo.textContent = `${player.ammo} / ${player.reserve}`;
    ui.objective.textContent = player.keycard ? "Reach the executive exit" : "Find the keycard";
  }
  function startGame() {
    ui.title.classList.add("hidden"); ui.ending.classList.add("hidden"); ui.pause.classList.add("hidden");
    ui.hud.classList.remove("hidden");
    running = true; paused = false; ended = false;
    canvas.requestPointerLock?.();
    showMessage("Welcome to Shrine Eggo Media. Please ignore the suspicious hallway.", 3);
    lastTime = performance.now();
  }
  function pauseGame() {
    if (!running || ended) return;
    paused = !paused;
    ui.pause.classList.toggle("hidden", !paused);
    if (paused) document.exitPointerLock?.(); else canvas.requestPointerLock?.();
  }
  function finishGame(won) {
    ended = true; running = false; paused = false; document.exitPointerLock?.();
    ui.hud.classList.add("hidden");
    ui.endingTitle.textContent = won ? "MISSION COMPLETE" : "MISSION FAILED";
    ui.endingMessage.textContent = won
      ? "Dr. Hornettis Asserettis has been inconvenienced. Thigh Guy saves the day!"
      : "Thigh Guy has been temporarily removed from the employee directory.";
    ui.ending.classList.remove("hidden");
  }

  function castRay(angle) {
    const sin = Math.sin(angle), cos = Math.cos(angle);
    let distance = 0, hitX = player.x, hitY = player.y, side = 0;
    while (distance < 24) {
      distance += .025;
      hitX = player.x + cos * distance;
      hitY = player.y + sin * distance;
      if (wallAt(hitX, hitY) || doorAt(hitX, hitY)) {
        side = Math.abs((hitX % 1) - .5) > Math.abs((hitY % 1) - .5) ? 1 : 0;
        break;
      }
    }
    return { distance, hitX, hitY, side, door: doorAt(hitX, hitY) };
  }
  function renderWorld() {
    const w = innerWidth, h = innerHeight;
    ctx.fillStyle = "#303c43"; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#514b40"; ctx.fillRect(0, h / 2, w, h / 2);
    // Ceiling lights and floor bands give the corridors a chunky retro look.
    for (let i = 0; i < 7; i++) {
      const yy = h * .5 + i * i * (h / 110);
      ctx.fillStyle = i % 2 ? "rgba(20,20,18,.08)" : "rgba(220,205,160,.035)";
      ctx.fillRect(0, yy, w, 2);
    }
    const strips = Math.ceil(w / 3);
    zBuffer = new Array(strips);
    for (let i = 0; i < strips; i++) {
      const rayAngle = player.angle - FOV / 2 + (i / strips) * FOV;
      const hit = castRay(rayAngle);
      const corrected = Math.max(.001, hit.distance * Math.cos(rayAngle - player.angle));
      zBuffer[i] = corrected;
      const wallHeight = Math.min(h * 2, h / corrected * .82);
      const x = i * 3, top = (h - wallHeight) / 2;
      let shade = Math.max(35, 185 - corrected * 11);
      if (hit.side) shade *= .78;
      if (hit.door) {
        ctx.fillStyle = `rgb(${shade * .65},${shade * .43},${shade * .25})`;
      } else {
        const stripe = Math.floor((hit.hitX + hit.hitY) * 3) % 2;
        ctx.fillStyle = stripe ? `rgb(${shade},${shade * .92},${shade * .78})` : `rgb(${shade * .83},${shade * .86},${shade * .78})`;
      }
      ctx.fillRect(x, top, 3.2, wallHeight);
      ctx.fillStyle = "rgba(0,0,0,.16)";
      ctx.fillRect(x, top, 1, wallHeight);
    }
    renderSprites(w, h);
    renderWeapon(w, h);
    if (damageFlash > 0) {
      ctx.fillStyle = `rgba(180,20,20,${damageFlash})`; ctx.fillRect(0,0,w,h);
    }
  }
  function renderSprites(w, h) {
    const sprites = [];
    for (const e of enemies) if (e.alive) sprites.push({ ...e, spriteType: "enemy" });
    for (const p of pickups) if (!p.taken) sprites.push({ ...p, spriteType: "pickup" });
    sprites.push({ x: 7.5, y: 12.5, spriteType: "elevator" });
    sprites.sort((a,b) => distanceSq(b.x,b.y) - distanceSq(a.x,a.y));
    for (const s of sprites) {
      const dx = s.x - player.x, dy = s.y - player.y;
      const dist = Math.hypot(dx,dy);
      let rel = Math.atan2(dy,dx) - player.angle;
      while (rel < -Math.PI) rel += Math.PI * 2;
      while (rel > Math.PI) rel -= Math.PI * 2;
      if (Math.abs(rel) > FOV * .7 || dist < .15) continue;
      const screenX = (0.5 + rel / FOV) * w;
      const rayIndex = Math.max(0, Math.min(zBuffer.length - 1, Math.floor(screenX / w * zBuffer.length)));
      if (dist > zBuffer[rayIndex] + .2) continue;
      const size = Math.min(h * 1.1, h / dist * (s.spriteType === "enemy" ? .68 : .28));
      const bottom = h / 2 + size * .48;
      if (s.spriteType === "elevator") {
    const ew = size * .65;
    const eh = size * 1.5;
    ctx.fillStyle = "#333b42";
    ctx.fillRect(screenX-ew/2, bottom-eh, ew, eh);
    ctx.fillStyle = "#aab8bd";
    ctx.fillRect(screenX-ew*.4, bottom-eh*.95, ew*.8, eh*.95);
    ctx.fillStyle = "#26343b";
    ctx.fillRect(screenX-ew*.32, bottom-eh*.88, ew*.64, eh*.84);
    ctx.fillStyle = "#54e5d0";
    ctx.fillRect(screenX-ew*.08, bottom-eh*.82, ew*.16, eh*.04);
} else if (s.spriteType === "pickup") {
        const color = s.type === "key" ? "#e6d15d" : s.type === "ammo" ? "#d59b4b" : "#72c77a";
        ctx.fillStyle = color; ctx.fillRect(screenX - size*.18, bottom-size*.55, size*.36, size*.36);
        ctx.fillStyle = "#17191a"; ctx.fillRect(screenX-size*.12,bottom-size*.49,size*.24,size*.24);
      } else {
        const bw = size * .48, top = bottom - size;
        ctx.fillStyle = s.type === "BIRD" ? "#765038" : "#aaa69b";
        ctx.fillRect(screenX-bw/2, top+size*.25, bw, size*.67);
        ctx.fillStyle = s.type === "BIRD" ? "#9b704c" : "#c3bfb2";
        ctx.fillRect(screenX-bw*.34, top+size*.03, bw*.68, size*.3);
        ctx.fillStyle = "#171717";
        ctx.fillRect(screenX-bw*.18, top+size*.14, bw*.08, size*.06);
        ctx.fillRect(screenX+bw*.1, top+size*.14, bw*.08, size*.06);
        if (s.type === "BIRD") {
          ctx.fillStyle = "#e0a43e"; ctx.fillRect(screenX-bw*.08, top+size*.25, bw*.3, size*.1);
        } else {
          ctx.fillStyle = "#e3e0d5"; ctx.beginPath();
          ctx.moveTo(screenX, top-size*.18); ctx.lineTo(screenX-size*.09,top+size*.08); ctx.lineTo(screenX+size*.09,top+size*.08); ctx.fill();
        }
        ctx.fillStyle = "#211c19"; ctx.fillRect(screenX-bw*.42, bottom-size*.12, bw*.3, size*.12);
        ctx.fillRect(screenX+bw*.12, bottom-size*.12, bw*.3, size*.12);
      }
    }
  }
  function distanceSq(x,y) { return (x-player.x)**2 + (y-player.y)**2; }
  function renderWeapon(w,h) {
    const bob = Math.sin(performance.now() * .009) * 3;
    const x = w * .5, y = h - 18 + recoil * 8 + bob;
    ctx.fillStyle = "#282b2c"; ctx.fillRect(x-34,y-105,68,95);
    ctx.fillStyle = "#555b59"; ctx.fillRect(x-20,y-128,40,65);
    ctx.fillStyle = "#171a1b"; ctx.fillRect(x-10,y-138,20,55);
    ctx.fillStyle = "#82704e"; ctx.fillRect(x-26,y-38,52,30);
  }

  function update(dt) {
    if (!running || paused || ended) return;
    const speed = (keys.ShiftLeft ? 3.6 : 2.55) * dt;
    let forward = 0, strafe = 0;
    if (keys.KeyW) forward++;
    if (keys.KeyS) forward--;
    if (keys.KeyD) strafe++;
    if (keys.KeyA) strafe--;
    if (forward || strafe) {
      const len = Math.hypot(forward,strafe); forward /= len; strafe /= len;
      const dx = (Math.cos(player.angle)*forward + Math.cos(player.angle+Math.PI/2)*strafe)*speed;
      const dy = (Math.sin(player.angle)*forward + Math.sin(player.angle+Math.PI/2)*strafe)*speed;
      const nx = player.x + dx, ny = player.y + dy;
      if (!solidAt(nx + Math.sign(dx)*.18, player.y)) player.x = nx;
      if (!solidAt(player.x, ny + Math.sign(dy)*.18)) player.y = ny;
    }
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = player.x-e.x, dy = player.y-e.y, d = Math.hypot(dx,dy);
      if (d < 7.5 && d > .8) {
        const step = 1.05 * dt;
        const nx = e.x + dx/d*step, ny = e.y + dy/d*step;
        if (!solidAt(nx,ny)) { e.x = nx; e.y = ny; }
      } else if (d <= .8) {
        e.attack -= dt;
        if (e.attack <= 0) {
          player.health = Math.max(0, player.health - 7);
          e.attack = 1.15; damageFlash = .25; updateHud();
          if (player.health <= 0) finishGame(false);
        }
      } else {
        e.phase += dt;
        e.x = e.homeX + Math.sin(e.phase*.7)*.22;
        e.y = e.homeY + Math.cos(e.phase*.7)*.22;
      }
    }
    if (noticeTimer > 0) { noticeTimer -= dt; if (noticeTimer <= 0) ui.message.classList.remove("show"); }
    damageFlash = Math.max(0, damageFlash - dt*.8);
    recoil = Math.max(0, recoil - dt*5);
    updateHud();
  }

  function fire() {
    if (!running || paused || ended) return;
    const now = performance.now();
    if (now - lastShot < 280) return;
    if (player.ammo <= 0) { showMessage("Click R to reload. The budget department says no infinite bullets."); return; }
    lastShot = now; player.ammo--; recoil = 1;
    // Find the living enemy closest to the center of the player's view.
    let target = null, best = .095;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x-player.x, dy = e.y-player.y, d = Math.hypot(dx,dy);
      let angle = Math.atan2(dy,dx)-player.angle;
      while (angle < -Math.PI) angle += Math.PI*2;
      while (angle > Math.PI) angle -= Math.PI*2;
      if (Math.abs(angle) < best && d < 9 && !rayBlocked(d, angle)) { best = Math.abs(angle); target = e; }
    }
    if (target) {
      target.hp -= 34;
      showMessage(target.type === "BIRD" ? "Birdmenace Humpettis: reconsidering employment." : "Donkey Unicorn: neigh-gotiations failed.", .9);
      if (target.hp <= 0) { target.alive = false; showMessage("Security creature neutralized. Very professional.", 1.5); }
    }
    updateHud();
  }
  function rayBlocked(distance, angle) {
    const steps = Math.ceil(distance*12);
    for (let i=1;i<steps;i++) {
      const d = distance*i/steps;
      if (wallAt(player.x+Math.cos(player.angle+angle)*d, player.y+Math.sin(player.angle+angle)*d)) return true;
    }
    return false;
  }
  function interact() {
    if (!running || paused || ended) return;
    for (const p of pickups) {
      if (!p.taken && Math.hypot(p.x-player.x,p.y-player.y) < .85) {
        p.taken = true;
        if (p.type === "key") { player.keycard = true; showMessage("Keycard acquired. Executive access granted."); }
        if (p.type === "ammo") { player.reserve += 24; showMessage("Picked up 24 rounds."); }
        if (p.type === "health") { player.health = Math.min(100,player.health+30); showMessage("Health restored by 30."); }
        updateHud(); return;
      }
    }
    if (Math.hypot(7.5-player.x,12.5-player.y) < 1.25) {
      if (player.keycard) finishGame(true);
      else showMessage("ACCESS DENIED. Find the yellow keycard first.");
      return;
    }
    showMessage("Nothing to interact with here. Try the suspiciously shiny items.");
  }
  function reload() {
    const amount = Math.min(12-player.ammo,player.reserve);
    if (amount <= 0) { showMessage("No reserve ammunition."); return; }
    player.ammo += amount; player.reserve -= amount; updateHud(); showMessage("Reloaded.");
  }
  function reset() {
    player.x=2.5; player.y=2.5; player.angle=0; player.health=100; player.ammo=12; player.reserve=48; player.keycard=false;
    enemies.splice(0,enemies.length,makeEnemy(8.5,3.5,"BIRD"),makeEnemy(12.5,7.5,"DONKEY"),makeEnemy(5.5,12.5,"BIRD"));
    pickups.forEach(p=>p.taken=false); updateHud(); startGame();
  }

  document.getElementById("start").addEventListener("click", startGame);
  document.getElementById("resume").addEventListener("click", pauseGame);
  document.getElementById("again").addEventListener("click", reset);
  document.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "Escape" && running) pauseGame();
    if (e.code === "KeyE") interact();
    if (e.code === "KeyR") reload();
  });
  document.addEventListener("keyup", e => { keys[e.code] = false; });
  document.addEventListener("mousemove", e => {
    if (running && !paused && document.pointerLockElement === canvas) player.angle += e.movementX * .0025;
  });
  canvas.addEventListener("click", () => {
    if (running && !paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    else fire();
  });
  document.addEventListener("pointerlockchange", () => {
    // Pointer lock is optional; the game remains playable with keyboard and click.
  });

  function frame(now) {
    const dt = Math.min((now-lastTime)/1000 || 0, .05); lastTime = now;
    update(dt);
    renderWorld();
    requestAnimationFrame(frame);
  }
  updateHud(); requestAnimationFrame(frame);
})();
