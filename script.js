const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const cw = canvas.width, ch = canvas.height;

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

const metrics = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, overdrive: 0, isOverdrive: false };
const config = {
    keys: ['d', 'f', 'j', 'k'], laneCount: 4, scrollSpeed: 1000, hitY: ch * 0.82,
    judgePerfect: 0.05, judgeGood: 0.12, odMax: 100, odDrainRate: 10,
    difficultyMultiplier: { easy: 1.0, normal: 1.25, hard: 1.55 }
};
const keyState = { 0: false, 1: false, 2: false, 3: false };
const laneX = [cw * 0.5 - 200, cw * 0.5 - 100, cw * 0.5 + 0, cw * 0.5 + 100], laneW = 100;
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
        Object.assign(metrics, { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, overdrive: 0, isOverdrive: false });
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
    if (idx !== -1) {
        if (isDown && !keyState[idx]) checkHit(idx);
        keyState[idx] = isDown;
    }
}

function checkHit(lane) {
    const time = getAudioTime();
    let target = null, minDiff = 999;
    for (let n of currentChart) {
        if (n.lane === lane && !n.hit && !n.missed) {
            const diff = Math.abs(n.time - time);
            if (diff < minDiff) { minDiff = diff; target = n; }
        }
    }
    if (target && minDiff <= config.judgeGood) {
        target.hit = true;
        judgeRecord(minDiff <= config.judgePerfect ? 'PERFECT' : 'GOOD');
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

function judgeMiss() {
    showJudge('MISS');
    metrics.combo = 0;
    metrics.miss++;
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

    currentChart.forEach(n => {
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
    const acc = total === 0 ? 0 : (((metrics.perfect * 100 + metrics.good * 50) / (total * 100)) * 100).toFixed(2);
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
