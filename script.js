const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let cw = canvas.width, ch = canvas.height;

const screens = {
    title: document.getElementById('screen-title'),
    select: document.getElementById('screen-song-select'),
    hud: document.getElementById('screen-hud'),
    result: document.getElementById('screen-result')
};

let songs = [], currentSong = null, currentChart = [], gameState = 'title';
let audioObj = new Audio();
let dummyStartTime = 0, useDummyAudio = false;
let animationId;
let currentDifficulty = 'easy';

const metrics = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, extraMiss: 0, overdrive: 0, isOverdrive: false };
const config = {
    keys: ['d', 'f', 'j', 'k'], laneCount: 4, scrollSpeed: 1000, hitY: ch * 0.82,
    judgePerfect: 0.045, judgeGood: 0.105, odMax: 100, odDrainRate: 10,
    difficultyMultiplier: { easy: 1.0, normal: 1.25, hard: 1.55 }
};
const keyState = { 0: false, 1: false, 2: false, 3: false };
let laneW = 100;
let laneX = [cw * 0.5 - 200, cw * 0.5 - 100, cw * 0.5, cw * 0.5 + 100];
const keyboardHeld = [false, false, false, false];
const activePointers = new Map();
const queuedInputs = new Map();
let inputTimer = null;
const CHORD_WINDOW_MS = 28; // Give multi-touch and keyboard chords one short grouping window.

function resizeStage() {
    const portrait = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    const targetW = portrait ? 720 : 1280;
    const ratio = portrait ? (canvas.clientHeight / canvas.clientWidth || window.innerHeight / window.innerWidth) : 9 / 16;
    const targetH = portrait ? Math.max(1100, Math.round(targetW * ratio)) : 720;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    cw = canvas.width;
    ch = canvas.height;
    laneW = portrait ? 150 : 100;
    config.hitY = ch * 0.82;
    const left = (cw - config.laneCount * laneW) / 2;
    laneX = Array.from({ length: config.laneCount }, (_, i) => left + i * laneW);
    if (gameState === 'play') render(getAudioTime());
}

function clearInputs() {
    if (inputTimer !== null) clearTimeout(inputTimer);
    inputTimer = null;
    queuedInputs.clear();
    activePointers.clear();
    keyboardHeld.fill(false);
    for (let i = 0; i < config.laneCount; i++) keyState[i] = false;
}
const laneColors = ['#ff4ae3', '#49d5ff', '#c36bff', '#ff4a8d'];

function makeImage(src) { const img = new Image(); img.src = src; return img; }
const assets = {
    laneNormal: makeImage('assets/ui/lane_purple.png'),
    laneOverdrive: makeImage('assets/ui/lane_overdrive.png'),
    keyNormal: [
        makeImage('assets/ui/key_d_normal.png'),
        makeImage('assets/ui/key_f_normal.png'),
        makeImage('assets/ui/key_j_normal.png'),
        makeImage('assets/ui/key_k_normal.png')
    ],
    keyActive: [
        makeImage('assets/ui/key_d_active.png'),
        makeImage('assets/ui/key_f_active.png'),
        makeImage('assets/ui/key_j_active.png'),
        makeImage('assets/ui/key_k_active.png')
    ],
    judge: {
        PERFECT: makeImage('assets/ui/judge_perfect.png'),
        GOOD: makeImage('assets/ui/judge_good.png'),
        MISS: makeImage('assets/ui/judge_miss.png')
    },
    rank: {
        S: 'assets/ui/rank_s.png',
        A: 'assets/ui/rank_a.png',
        B: 'assets/ui/rank_b.png',
        C: 'assets/ui/rank_c.png'
    }
};

async function init() {
    try {
        const res = await fetch('songs.json');
        songs = await res.json();
    } catch (e) {
        songs = [{
            title: 'Test Track (No Audio)', artist: 'System', audio: '',
            difficulties: { easy: 'charts/tutorial.json' }
        }];
    }
    renderSongList();
    resizeStage();
    window.addEventListener('resize', resizeStage);
    window.addEventListener('blur', clearInputs);
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointerup', handlePointerEnd, { passive: false });
    canvas.addEventListener('pointercancel', handlePointerEnd, { passive: false });
    canvas.addEventListener('lostpointercapture', handlePointerEnd);
    document.getElementById('btn-start').addEventListener('click', () => switchScreen('select'));
    document.getElementById('btn-retry').addEventListener('click', () => startGame(currentSong, currentDifficulty));
    document.getElementById('btn-back').addEventListener('click', () => switchScreen('select'));
    window.addEventListener('keydown', e => handleKey(e, true));
    window.addEventListener('keyup', e => handleKey(e, false));
}

function switchScreen(state) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[state]) screens[state].classList.remove('hidden');
    gameState = state;
    if (state !== 'hud') clearInputs();
    if (state === 'select') audioObj.pause();
}

function renderSongList() {
    const list = document.getElementById('song-list');
    list.innerHTML = '';
    songs.forEach(song => {
        const div = document.createElement('div');
        div.className = 'song-item';
        div.innerHTML = `<span>${song.title}</span><span>${song.artist}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.song-item').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            currentSong = song;
            document.getElementById('difficulty-select').classList.remove('hidden');
            document.querySelectorAll('.btn-diff').forEach(btn => {
                const diff = btn.dataset.diff;
                btn.style.display = song.difficulties[diff] ? 'inline-block' : 'inline-block';
                btn.onclick = () => {
                    document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    startGame(song, diff);
                };
            });
        };
        list.appendChild(div);
    });
}

async function startGame(song, diff) {
    try {
        currentDifficulty = diff;
        const res = await fetch(song.difficulties[diff]);
        const chartData = await res.json();
        clearInputs();
        Object.assign(metrics, { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, extraMiss: 0, overdrive: 0, isOverdrive: false });
        updateHUD();
        currentChart = chartData.map(n => ({ ...n, hit: false, missed: false })).sort((a, b) => a.time - b.time);
        document.getElementById('hud-judgment').innerHTML = '';
        document.getElementById('hud-od-gauge').classList.remove('active');
        lastTime = performance.now();

        if (song.audio) {
            useDummyAudio = false;
            audioObj.src = song.audio;
            audioObj.currentTime = 0;
            audioObj.play();
        } else {
            useDummyAudio = true;
            dummyStartTime = performance.now();
        }
        switchScreen('hud');
        gameState = 'play';
        if (animationId) cancelAnimationFrame(animationId);
        gameLoop(performance.now());
    } catch (e) {
        alert('譜面の読み込みに失敗しました。ローカルサーバーで実行していますか？');
    }
}

function getAudioTime() {
    return useDummyAudio ? (performance.now() - dummyStartTime) / 1000 : audioObj.currentTime;
}

function handleKey(e, isDown) {
    if (gameState !== 'play') return;
    const idx = config.keys.indexOf(e.key.toLowerCase());
    if (idx === -1) return;
    e.preventDefault();
    if (isDown) {
        if (e.repeat || keyboardHeld[idx]) return;
        const alreadyHeld = keyState[idx];
        keyboardHeld[idx] = true;
        keyState[idx] = true;
        if (!alreadyHeld) queueHit(idx);
    } else {
        keyboardHeld[idx] = false;
        keyState[idx] = [...activePointers.values()].includes(idx);
    }
}

function handlePointerDown(e) {
    if (gameState !== 'play' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * cw / rect.width;
    const y = (e.clientY - rect.top) * ch / rect.height;
    if (x < laneX[0] || x >= laneX[0] + config.laneCount * laneW || y < 30 || y > ch) return;
    e.preventDefault();
    if (activePointers.has(e.pointerId)) return;
    const lane = Math.floor((x - laneX[0]) / laneW);
    const alreadyHeld = keyState[lane];
    activePointers.set(e.pointerId, lane);
    keyState[lane] = true;
    if (!alreadyHeld) queueHit(lane);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* Not supported on some browsers. */ }
}

function handlePointerEnd(e) {
    if (!activePointers.has(e.pointerId)) return;
    e.preventDefault();
    const lane = activePointers.get(e.pointerId);
    activePointers.delete(e.pointerId);
    keyState[lane] = keyboardHeld[lane] || [...activePointers.values()].includes(lane);
}

function queueHit(lane) {
    if (gameState !== 'play') return;
    if (!queuedInputs.has(lane)) queuedInputs.set(lane, getAudioTime());
    if (inputTimer === null) inputTimer = setTimeout(resolveHits, CHORD_WINDOW_MS);
}

function resolveHits() {
    inputTimer = null;
    if (gameState !== 'play') { queuedInputs.clear(); return; }
    const presses = new Map(queuedInputs);
    queuedInputs.clear();
    if (!presses.size) return;

    // Use the actual first input timestamp so grouping does not widen the judgment window.
    const hitTime = Math.min(...presses.values());
    let anchor = null;
    let minDiff = Infinity;
    for (const n of currentChart) {
        if (n.hit || n.missed) continue;
        const diff = Math.abs(n.time - hitTime);
        if (diff < minDiff) { minDiff = diff; anchor = n; }
    }
    if (!anchor || minDiff > config.judgeGood) {
        judgeMiss(true); // Empty-lane spam now counts against accuracy.
        return;
    }

    // Notes sharing a timestamp are a legitimate chord, including HARD two-key notes.
    const chord = currentChart.filter(n => !n.hit && !n.missed && Math.abs(n.time - anchor.time) <= 0.012);
    const validLanes = new Set(chord.map(n => n.lane));
    if ([...presses.keys()].some(lane => !validLanes.has(lane))) {
        // Reject the whole chord: pressing every lane must never score as a valid hit.
        for (const n of chord) { n.missed = true; judgeMiss(); }
        judgeMiss(true); // Separate penalty for unnecessary presses.
        return;
    }

    // A partial chord can be finished by another tap before its MISS deadline.
    for (const n of chord) {
        if (!presses.has(n.lane)) continue;
        const diff = Math.abs(n.time - presses.get(n.lane));
        if (diff > config.judgeGood) continue;
        n.hit = true;
        judgeRecord(diff <= config.judgePerfect ? 'PERFECT' : 'GOOD');
    }
}

function judgeRecord(type) {
    showJudge(type);
    const diffMult = config.difficultyMultiplier[currentDifficulty] || 1;
    metrics.score += Math.round((type === 'PERFECT' ? 100 : 50) * diffMult * (metrics.isOverdrive ? 2 : 1));
    metrics.combo++;
    if (metrics.combo > metrics.maxCombo) metrics.maxCombo = metrics.combo;
    type === 'PERFECT' ? metrics.perfect++ : metrics.good++;

    if (!metrics.isOverdrive) {
        metrics.overdrive = Math.min(config.odMax, metrics.overdrive + (type === 'PERFECT' ? 5 : 2));
        if (metrics.overdrive >= config.odMax) {
            metrics.isOverdrive = true;
            document.getElementById('hud-od-gauge').classList.add('active');
            showOverdrivePopup();
        }
    }
    updateHUD();
}

function judgeMiss(extraInput = false) {
    showJudge('MISS');
    metrics.combo = 0;
    metrics.miss++;
    if (extraInput) metrics.extraMiss++;
    if (!metrics.isOverdrive) metrics.overdrive = Math.max(0, metrics.overdrive - 10);
    updateHUD();
}

function showJudge(type) {
    const el = document.getElementById('hud-judgment');
    el.innerHTML = '';
    const img = assets.judge[type];
    if (img && img.src) {
        const node = document.createElement('img');
        node.src = img.src;
        node.alt = type;
        el.appendChild(node);
    } else {
        el.textContent = type;
    }
    el.classList.remove('judging');
    void el.offsetWidth;
    el.classList.add('judging');
}

function showOverdrivePopup() {
    const popup = document.getElementById('od-popup');
    popup.classList.remove('hidden');
    popup.classList.remove('playing');
    void popup.offsetWidth;
    popup.classList.add('playing');
    setTimeout(() => popup.classList.add('hidden'), 1150);
}

function updateHUD() {
    document.getElementById('hud-score').textContent = metrics.score;
    document.getElementById('hud-combo').textContent = metrics.combo;
    document.getElementById('hud-combo-box').classList.toggle('visible', metrics.combo > 3);
    document.getElementById('hud-od-gauge').style.width = `${(metrics.overdrive / config.odMax) * 100}%`;
}

let lastTime = 0;
function gameLoop(now) {
    if (gameState !== 'play') return;
    const dt = (now - lastTime) / 1000 || 0;
    lastTime = now;
    const time = getAudioTime();

    if (metrics.isOverdrive) {
        metrics.overdrive -= config.odDrainRate * dt;
        if (metrics.overdrive <= 0) {
            metrics.overdrive = 0;
            metrics.isOverdrive = false;
            document.getElementById('hud-od-gauge').classList.remove('active');
        }
        updateHUD();
    }

    // Let already-pressed inputs resolve before their notes can expire.
    if (!queuedInputs.size) currentChart.forEach(n => {
        if (!n.hit && !n.missed && time - n.time > config.judgeGood) { n.missed = true; judgeMiss(); }
    });

    const duration = (currentChart[currentChart.length - 1]?.time + 2 || 10);
    if (time >= duration || currentChart.every(n => n.hit || n.missed)) {
        gameState = 'finished';
        setTimeout(showResult, 900);
    }

    render(time);
    if (gameState === 'play') animationId = requestAnimationFrame(gameLoop);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function render(time) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
    bgGrad.addColorStop(0, metrics.isOverdrive ? '#120a05' : '#070512');
    bgGrad.addColorStop(1, metrics.isOverdrive ? '#261402' : '#04040c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // subtle stage glow
    ctx.fillStyle = metrics.isOverdrive ? 'rgba(255,180,20,0.08)' : 'rgba(217,0,255,0.08)';
    ctx.fillRect(0, 0, cw, ch);

    // lane artwork
    const laneArt = metrics.isOverdrive ? assets.laneOverdrive : assets.laneNormal;
    const artX = laneX[0] - 62;
    const artY = 34;
    const artW = laneW * config.laneCount + 124;
    const artH = config.hitY - artY + 24;
    if (laneArt.complete) {
        ctx.drawImage(laneArt, artX, artY, artW, artH);
    }

    // light lane guides on top of art
    ctx.lineWidth = 1;
    for (let i = 0; i <= config.laneCount; i++) {
        ctx.beginPath();
        ctx.moveTo(laneX[0] + i * laneW, 30);
        ctx.lineTo(laneX[0] + i * laneW, config.hitY + 8);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.stroke();
    }

    // hit line
    ctx.beginPath();
    ctx.moveTo(laneX[0], config.hitY);
    ctx.lineTo(laneX[0] + config.laneCount * laneW, config.hitY);
    ctx.strokeStyle = metrics.isOverdrive ? '#ffd53d' : '#d900ff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 12;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // held lane glow + keycaps
    for (let i = 0; i < config.laneCount; i++) {
        const lx = laneX[i];
        if (keyState[i]) {
            const grad = ctx.createLinearGradient(0, config.hitY, 0, 30);
            grad.addColorStop(0, metrics.isOverdrive ? 'rgba(255,213,61,0.34)' : 'rgba(217,0,255,0.20)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(lx, 30, laneW, config.hitY - 20);
        }
        const img = keyState[i] ? assets.keyActive[i] : assets.keyNormal[i];
        if (img.complete) {
            ctx.drawImage(img, lx - 6, config.hitY + 6, laneW + 12, laneW + 12);
        } else {
            ctx.font = 'bold 30px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillStyle = keyState[i] ? '#fff' : 'rgba(255,255,255,0.7)';
            ctx.fillText(config.keys[i].toUpperCase(), lx + laneW / 2, config.hitY + 40);
        }
    }

    // notes
    currentChart.forEach(n => {
        if (n.hit || n.missed) return;
        const y = config.hitY - (n.time - time) * config.scrollSpeed;
        if (y > -60 && y < ch + 100) {
            const color = metrics.isOverdrive ? '#ffd53d' : laneColors[n.lane % laneColors.length];
            const x = laneX[n.lane] + 10;
            const w = laneW - 20;
            const h = 22;
            const grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, color);
            grad.addColorStop(1, color);
            ctx.save();
            ctx.shadowBlur = 16;
            ctx.shadowColor = color;
            ctx.fillStyle = grad;
            roundRect(ctx, x, y - h / 2, w, h, 7);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.stroke();
            ctx.restore();
        }
    });
}

function showResult() {
    switchScreen('result');
    audioObj.pause();
    const total = currentChart.length;
    // Extra/wrong presses must affect results too, not only the on-screen MISS counter.
    const attempts = total + metrics.extraMiss;
    const acc = attempts === 0 ? 0 : (((metrics.perfect * 100 + metrics.good * 50) / (attempts * 100)) * 100).toFixed(2);
    document.getElementById('res-score').textContent = metrics.score;
    document.getElementById('res-acc').textContent = acc;
    document.getElementById('res-combo').textContent = metrics.maxCombo;
    document.getElementById('res-perfect').textContent = metrics.perfect;
    document.getElementById('res-good').textContent = metrics.good;
    document.getElementById('res-miss').textContent = metrics.miss;

    const rank = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : 'C';
    const rankEl = document.getElementById('res-rank');
    rankEl.innerHTML = `<img src="${assets.rank[rank]}" alt="${rank}">`;
}

init();
