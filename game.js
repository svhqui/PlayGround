(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('gameShell');
  const playButton = document.getElementById('playButton');
  const againButton = document.getElementById('againButton');
  const jumpButton = document.getElementById('jumpButton');
  const soundButton = document.getElementById('soundButton');
  const startScreen = document.getElementById('startScreen');
  const endScreen = document.getElementById('endScreen');
  const beat = 60 / 112;
  const levelLength = 7100;
  let W = 0, H = 0, dpr = 1;
  let state = 'ready', lastTime = 0, elapsed = 0, distance = 0, score = 0, coins = 0;
  let player = { y: 0, vy: 0, grounded: true, rotation: 0, squash: 0 };
  let soundOn = true, audio = null, lastClickBeat = -1, toastTimer = 0;
  let best = Number(localStorage.getItem('beatbound-best') || 0);
  let particles = [];
  const obstacles = [];
  const collectibles = [];
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const groundY = () => H * .785;
  const unit = () => clamp(Math.min(W, H) * .085, 34, 54);
  const playerX = () => Math.min(W * .22, 118);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player.grounded) player.y = groundY() - unit();
    draw();
  }
  function seedLevel() {
    obstacles.length = 0; collectibles.length = 0;
    let x = 660;
    let i = 0;
    while (x < levelLength - 260) {
      const kind = i % 5 === 3 ? 'block' : (i % 6 === 4 ? 'double' : 'spike');
      obstacles.push({ x, kind, width: kind === 'double' ? 78 : kind === 'block' ? 43 : 38, height: kind === 'block' ? 45 : 35 + (i % 3) * 4 });
      const coinX = x - 115;
      collectibles.push({ x: coinX, y: (i % 2 ? -.0 : -.12), taken: false, phase: rand(0, 6) });
      if (i % 3 === 1) collectibles.push({ x: coinX + 43, y: -.22, taken: false, phase: rand(0, 6) });
      x += i % 4 === 2 ? 760 : 630 + (i % 3) * 65;
      i++;
    }
  }
  seedLevel();
  function begin() {
    state = 'running'; elapsed = 0; distance = 0; score = 0; coins = 0;
    player = { y: groundY() - unit(), vy: 0, grounded: true, rotation: 0, squash: 0 };
    particles = []; collectibles.forEach(c => c.taken = false);
    lastClickBeat = -1; startScreen.classList.add('hidden'); endScreen.classList.add('hidden'); shell.classList.add('playing');
    document.getElementById('score').textContent = '0000'; document.getElementById('coinCount').textContent = '0';
    document.getElementById('progressFill').style.width = '0%'; document.getElementById('progressText').textContent = '0%';
    initAudio(); lastTime = performance.now();
  }
  function finish(won) {
    if (state !== 'running') return;
    state = won ? 'won' : 'dead';
    const final = Math.floor(score + distance / 12 + coins * 50);
    best = Math.max(best, final); localStorage.setItem('beatbound-best', String(best));
    document.getElementById('finalScore').textContent = final.toLocaleString();
    document.getElementById('finalCoins').textContent = coins;
    document.getElementById('bestScore').textContent = best.toLocaleString();
    document.getElementById('endEyebrow').textContent = won ? 'LEVEL COMPLETE ✦' : 'NICE RUN!';
    document.getElementById('endTitle').innerHTML = won ? 'YOU FOUND<br><em>THE FLOW.</em>' : 'KEEP THE<br><em>RHYTHM.</em>';
    document.getElementById('endCopy').textContent = won ? 'A perfect little run. Ready for another?' : 'Every great run starts with one more try.';
    shell.classList.remove('playing'); endScreen.classList.remove('hidden');
  }
  function initAudio() {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (_) { audio = null; }
  }
  function clickSound(accent = false) {
    if (!soundOn || !audio) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(accent ? 660 : 430, now); osc.frequency.exponentialRampToValueAtTime(170, now + .075);
    gain.gain.setValueAtTime(accent ? .07 : .035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .09);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .1);
  }
  function showToast(text) {
    const el = document.getElementById('toast'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function jump() {
    if (state !== 'running') return;
    initAudio();
    if (!player.grounded) return;
    const phase = ((elapsed % beat) + beat) % beat;
    const offset = Math.min(phase, beat - phase);
    const perfect = offset < .105;
    player.vy = -H * (perfect ? 1.12 : 1.04); player.grounded = false; player.squash = .18;
    player.rotation = 0;
    if (perfect) { score += 25; showToast('PERFECT!'); clickSound(true); burst(playerX() + unit() / 2, player.y + unit(), '#ffe58b', 8); }
    else clickSound(false);
  }
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-120, 120), vy: rand(-170, 35), life: rand(.25, .6), max: .6, color, size: rand(2, 5) });
  }
  function update(dt) {
    if (state !== 'running') return;
    elapsed += dt;
    const speed = 300 + Math.min(95, distance / 90);
    distance += speed * dt;
    score += dt * 13;
    const floor = groundY(), size = unit();
    player.vy += H * 2.85 * dt;
    player.y += player.vy * dt;
    if (player.y >= floor - size) {
      if (!player.grounded) { player.squash = .22; burst(playerX() + size / 2, floor, '#a0f4d0', 5); }
      player.y = floor - size; player.vy = 0; player.grounded = true; player.rotation *= .65;
    } else { player.grounded = false; player.rotation += dt * (player.vy > 0 ? 2.1 : 1.1); }
    player.squash = Math.max(0, player.squash - dt * .8);
    // Rhythmic backing pulse and metronome accents.
    const beatNo = Math.floor(elapsed / beat);
    if (beatNo !== lastClickBeat) { lastClickBeat = beatNo; clickSound(beatNo % 4 === 0); }
    const px = playerX(), py = player.y + size * .15;
    for (const o of obstacles) {
      const ox = px + o.x - distance;
      if (ox < px + size && ox + o.width > px + 7) {
        const top = floor - o.height;
        if (py + size * .78 > top + 5 && player.y + size > floor - 2) { finish(false); return; }
      }
    }
    for (const c of collectibles) {
      if (c.taken) continue;
      const cx = px + c.x - distance, cy = floor - size * (.73 + c.y) + Math.sin(elapsed * 4 + c.phase) * 4;
      if (cx > px - 18 && cx < px + size + 8 && cy > player.y - 12 && cy < player.y + size + 16) {
        c.taken = true; coins++; score += 50; document.getElementById('coinCount').textContent = coins; burst(cx, cy, '#ffe58b', 10); clickSound(true);
      }
    }
    particles = particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += H * .5 * dt; return p.life > 0; });
    const pct = Math.min(100, Math.floor(distance / levelLength * 100));
    document.getElementById('score').textContent = String(Math.floor(score + distance / 12)).padStart(4, '0');
    document.getElementById('progressText').textContent = pct + '%'; document.getElementById('progressFill').style.width = pct + '%';
    if (distance >= levelLength) finish(true);
  }
  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#182346'); g.addColorStop(.52, '#42527a'); g.addColorStop(1, '#f2a06f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Distant sunset and hazy glow.
    const sunX = W * .76, sunY = H * .36, sunR = Math.min(W, H) * .15;
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunR * 1.6);
    glow.addColorStop(0, '#ffd88b88'); glow.addColorStop(1, '#ffd88b00'); ctx.fillStyle = glow; ctx.fillRect(sunX - sunR * 1.6, sunY - sunR * 1.6, sunR * 3.2, sunR * 3.2);
    ctx.fillStyle = '#ffdb91'; ctx.beginPath(); ctx.arc(sunX, sunY, sunR * .55, 0, Math.PI * 2); ctx.fill();
    // Stars.
    for (let i = 0; i < 36; i++) {
      const x = ((i * 197 + 31) % Math.max(W, 1)); const y = (i * 79 + 23) % (H * .53);
      const twinkle = .35 + .35 * Math.sin(t * 2 + i * 6);
      ctx.globalAlpha = twinkle; ctx.fillStyle = i % 6 === 0 ? '#ffe8ad' : '#eff4ff';
      ctx.beginPath(); ctx.arc(x, y, i % 8 === 0 ? 1.5 : .8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Rolling distant hills.
    const base = H * .67;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath(); ctx.moveTo(0, H);
      const step = 100 + layer * 36, shift = (distance * (.07 + layer * .07)) % step;
      for (let x = -step; x <= W + step; x += step) {
        const xx = x - shift; const yy = base + layer * 23 + Math.sin((x + layer * 70) * .013) * (26 + layer * 8);
        ctx.lineTo(xx, yy); ctx.lineTo(xx + step * .5, yy - 42 - layer * 9);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = ['#41496b', '#363f60', '#293453'][layer]; ctx.fill();
    }
    // Tiny luminous windows on the far ridge.
    for (let i = 0; i < 13; i++) {
      let x = ((i * 123 + 35 - distance * .12) % (W + 60) + W + 60) % (W + 60);
      let y = H * .62 + (i % 4) * 12;
      ctx.globalAlpha = .35 + .25 * Math.sin(t * 2 + i); ctx.fillStyle = '#ffd88b'; ctx.fillRect(x, y, 3, 5);
    }
    ctx.globalAlpha = 1;
  }
  function drawGround() {
    const floor = groundY();
    const grd = ctx.createLinearGradient(0, floor, 0, H); grd.addColorStop(0, '#26385a'); grd.addColorStop(1, '#101a36');
    ctx.fillStyle = grd; ctx.fillRect(0, floor, W, H - floor);
    ctx.fillStyle = '#91f2d0'; ctx.shadowColor = '#91f2d0'; ctx.shadowBlur = 12; ctx.fillRect(0, floor, W, 3); ctx.shadowBlur = 0;
    const offset = (distance * .8) % 70;
    for (let x = -70; x < W + 70; x += 70) {
      ctx.fillStyle = '#a4f5d01a'; ctx.beginPath(); ctx.moveTo(x - offset, floor + 3); ctx.lineTo(x + 24 - offset, floor + 3); ctx.lineTo(x + 8 - offset, floor + 13); ctx.lineTo(x - 16 - offset, floor + 13); ctx.closePath(); ctx.fill();
    }
    // little grass blades along the lit edge
    for (let x = -15; x < W + 15; x += 34) {
      const xx = x - (distance * .65 % 34);
      ctx.strokeStyle = '#a5f2c966'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(xx, floor); ctx.lineTo(xx - 4, floor - 7); ctx.moveTo(xx + 3, floor); ctx.lineTo(xx + 7, floor - 5); ctx.stroke();
    }
  }
  function drawObjects(t) {
    const floor = groundY(), px = playerX();
    for (const c of collectibles) {
      if (c.taken) continue;
      const x = px + c.x - distance, y = floor - unit() * (.73 + c.y) + Math.sin(t * 4 + c.phase) * 4;
      if (x < -30 || x > W + 30) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4 + Math.sin(t * 3 + c.phase) * .15);
      ctx.shadowColor = '#ffe58b'; ctx.shadowBlur = 15; ctx.fillStyle = '#ffe58b'; ctx.fillRect(-7, -7, 14, 14);
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff6cf'; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    for (const o of obstacles) {
      const x = px + o.x - distance, top = floor - o.height;
      if (x < -100 || x > W + 100) continue;
      ctx.shadowColor = '#fa799b88'; ctx.shadowBlur = 14;
      if (o.kind === 'block') {
        const grad = ctx.createLinearGradient(x, top, x + o.width, floor); grad.addColorStop(0, '#ffb67b'); grad.addColorStop(1, '#ed718f');
        ctx.fillStyle = grad; roundedRect(x, top, o.width, o.height, 7); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#ffe4b477'; ctx.lineWidth = 2; roundedRect(x + 5, top + 5, o.width - 10, o.height - 10, 4); ctx.stroke();
        ctx.fillStyle = '#733b65'; ctx.fillRect(x + 12, top + 15, 5, 5); ctx.fillRect(x + 26, top + 15, 5, 5);
      } else {
        const count = o.kind === 'double' ? 2 : 1, sw = o.width / count;
        for (let i = 0; i < count; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * sw, floor); ctx.lineTo(x + i * sw + sw * .52, top); ctx.lineTo(x + (i + 1) * sw, floor); ctx.closePath();
          const grad = ctx.createLinearGradient(0, top, 0, floor); grad.addColorStop(0, '#ffcf83'); grad.addColorStop(1, '#f37895'); ctx.fillStyle = grad; ctx.fill();
          ctx.shadowBlur = 0; ctx.strokeStyle = '#fff0bd'; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.fillStyle = '#a94b73'; ctx.beginPath(); ctx.arc(x + i * sw + sw * .53, floor - o.height * .45, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
    }
  }
  function drawPlayer(t) {
    const s = unit(), x = playerX(), floor = groundY();
    const run = state === 'running' && player.grounded ? Math.sin(t * 17) : 0;
    const squashX = 1 + player.squash * .55, squashY = 1 - player.squash * .35;
    ctx.save(); ctx.translate(x + s / 2, player.y + s / 2); ctx.rotate(player.rotation); ctx.scale(squashX, squashY);
    // soft little shadow
    ctx.save(); ctx.rotate(-player.rotation); ctx.globalAlpha = clamp(1 - (floor - (player.y + s)) / 130, .2, .5); ctx.fillStyle = '#10152e'; ctx.beginPath(); ctx.ellipse(0, floor - player.y - s + 3, s * .43, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // scarf tail swishes behind
    ctx.fillStyle = '#ff7497'; ctx.beginPath(); ctx.moveTo(-s * .28, s * .05); ctx.quadraticCurveTo(-s * .72, -s * .02 + run * 3, -s * .67, -s * .28); ctx.quadraticCurveTo(-s * .42, -s * .2, -s * .12, -s * .19); ctx.fill();
    // body
    const body = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); body.addColorStop(0, '#d7ffe4'); body.addColorStop(.65, '#86e8c9'); body.addColorStop(1, '#51bdd0');
    ctx.fillStyle = body; ctx.shadowColor = '#94f5d0aa'; ctx.shadowBlur = 17; roundedRect(-s * .43, -s * .43, s * .86, s * .82, s * .2); ctx.fill(); ctx.shadowBlur = 0;
    // cheek patches and eyes
    ctx.fillStyle = '#ffbb9c'; ctx.beginPath(); ctx.ellipse(-s * .17, s * .04, s * .075, s * .045, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * .17, s * .04, s * .075, s * .045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#193857'; ctx.beginPath(); ctx.ellipse(-s * .17, -s * .12, s * .055, s * .1, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * .17, -s * .12, s * .055, s * .1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * .18, -s * .16, s * .02, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(s * .16, -s * .16, s * .02, 0, Math.PI * 2); ctx.fill();
    // happy mouth
    ctx.strokeStyle = '#355b68'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, s * .01, s * .105, .15, Math.PI - .15); ctx.stroke();
    // tiny feet, little arms
    ctx.strokeStyle = '#4ab9bb'; ctx.lineWidth = s * .105; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * .18, s * .31); ctx.lineTo(-s * .2 - run * 3, s * .44); ctx.moveTo(s * .17, s * .31); ctx.lineTo(s * .2 + run * 3, s * .44); ctx.stroke();
    ctx.strokeStyle = '#83e7c9'; ctx.lineWidth = s * .08; ctx.beginPath(); ctx.moveTo(-s * .39, 0); ctx.lineTo(-s * .53, s * .08 + run); ctx.moveTo(s * .39, 0); ctx.lineTo(s * .51, -s * .08 - run); ctx.stroke();
    // head tuft
    ctx.fillStyle = '#ffd077'; ctx.beginPath(); ctx.moveTo(-s * .08, -s * .38); ctx.quadraticCurveTo(-s * .04, -s * .68, s * .06, -s * .43); ctx.quadraticCurveTo(s * .19, -s * .63, s * .2, -s * .37); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function draw(t = elapsed) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H); drawBackground(t); drawGround(); drawObjects(t); drawPlayer(t);
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (state === 'running') {
      const pulse = .07 + .05 * Math.max(0, Math.sin((elapsed % beat) / beat * Math.PI * 2));
      ctx.fillStyle = `rgba(255,221,159,${pulse})`; ctx.fillRect(0, 0, W, 4);
    }
  }
  function frame(now) {
    const dt = Math.min(.035, (now - (lastTime || now)) / 1000); lastTime = now;
    if (state === 'running') update(dt);
    draw(elapsed); requestAnimationFrame(frame);
  }
  playButton.addEventListener('click', begin); againButton.addEventListener('click', begin);
  jumpButton.addEventListener('pointerdown', e => { e.preventDefault(); jumpButton.classList.add('pressed'); jump(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => jumpButton.addEventListener(evt, () => jumpButton.classList.remove('pressed')));
  canvas.addEventListener('pointerdown', e => { if (state === 'running') { e.preventDefault(); jump(); } });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (state === 'ready') begin(); else jump(); }
    if (e.code === 'Enter' && state !== 'running') begin();
  });
  soundButton.addEventListener('click', () => {
    soundOn = !soundOn; soundButton.classList.toggle('off', !soundOn);
    document.getElementById('soundIcon').textContent = soundOn ? '♫' : '♪';
    soundButton.querySelector('.sound-label').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    if (soundOn) initAudio();
  });
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize(); requestAnimationFrame(frame);
})();
