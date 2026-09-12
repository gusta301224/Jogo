const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0;
const keys = {};
const mouse = { x: 0, y: 0, down: false };

const world = { width: 3600, height: 2400 };
const camera = { x: 0, y: 0 };

const player = {
    x: 1800, y: 1200, radius: 18,
    speed: 3.6,
    maxHealth: 100, health: 100,
    level: 1, xp: 0, xpNeeded: 100,
    damage: 25,
    fireRate: 180,
    lastShot: 0,
    angle: 0,
    speedMultiplier: 1,
    damageMultiplier: 1,
    projectileSpeed: 11,
    pickupRange: 75,
    regen: 0
};

const weapons = [
    { name: "🔫 Pistola", damage: 25, fireRate: 180, maxAmmo: 12, reload: 900, spread: 0, pellets: 1, speed: 11 },
    { name: "🔫 SMG", damage: 12, fireRate: 75, maxAmmo: 30, reload: 1200, spread: .08, pellets: 1, speed: 12 },
    { name: "💥 Escopeta", damage: 13, fireRate: 600, maxAmmo: 6, reload: 1400, spread: .48, pellets: 6, speed: 10 }
];

let weaponIndex = 0;
let ammo = weapons[0].maxAmmo;
let reloading = false;
let reloadEnd = 0;

let bullets = [], enemies = [], particles = [], pickups = [], texts = [];
let kills = 0, score = 0, wave = 1, waveKills = 0;
let spawnTimer = 0, spawnRate = 1000;
let gameOver = false, paused = false, levelUpOpen = false;
let elapsed = 0;
let shake = 0;

const buildings = [
    [450, 350, 420, 250], [1450, 230, 500, 300],
    [2600, 330, 500, 360], [850, 1250, 520, 290],
    [2050, 1250, 430, 330], [2850, 1700, 430, 300],
    [400, 1800, 520, 280]
];

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === "r") startReload();
    if (key === "escape") togglePause();
    if (["1","2","3"].includes(key)) switchWeapon(Number(key) - 1);
});
window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
canvas.addEventListener("mousedown", e => {
    if (e.button === 0) mouse.down = true;
});
window.addEventListener("mouseup", e => {
    if (e.button === 0) mouse.down = false;
});

function random(min, max) { return Math.random() * (max - min) + min; }
function distance(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
function clamp(v,min,max) { return Math.max(min, Math.min(max,v)); }

function circleRectCollision(cx, cy, r, rect) {
    const nx = clamp(cx, rect[0], rect[0] + rect[2]);
    const ny = clamp(cy, rect[1], rect[1] + rect[3]);
    return Math.hypot(cx-nx, cy-ny) < r;
}

function collidesWithBuilding(x, y, r) {
    return buildings.some(b => circleRectCollision(x,y,r,b));
}

function moveWithCollision(obj, dx, dy) {
    const nx = clamp(obj.x + dx, obj.radius, world.width - obj.radius);
    if (!collidesWithBuilding(nx, obj.y, obj.radius)) obj.x = nx;

    const ny = clamp(obj.y + dy, obj.radius, world.height - obj.radius);
    if (!collidesWithBuilding(obj.x, ny, obj.radius)) obj.y = ny;
}

function worldMouseAngle() {
    const targetX = camera.x + mouse.x;
    const targetY = camera.y + mouse.y;
    return Math.atan2(targetY - player.y, targetX - player.x);
}

function getWeapon() { return weapons[weaponIndex]; }

function switchWeapon(index) {
    if (index < 0 || index >= weapons.length || index === weaponIndex || gameOver || levelUpOpen) return;
    weaponIndex = index;
    ammo = getWeapon().maxAmmo;
    reloading = false;
    updateWeaponHUD();
}

function startReload() {
    if (gameOver || paused || levelUpOpen || reloading) return;
    const w = getWeapon();
    if (ammo >= w.maxAmmo) return;
    reloading = true;
    reloadEnd = performance.now() + w.reload;
}

function finishReloadIfReady(now) {
    if (reloading && now >= reloadEnd) {
        ammo = getWeapon().maxAmmo;
        reloading = false;
    }
}

function shoot() {
    const now = performance.now();
    const w = getWeapon();

    if (reloading || now - player.lastShot < w.fireRate) return;
    if (ammo <= 0) {
        startReload();
        return;
    }

    player.lastShot = now;
    ammo--;

    const base = worldMouseAngle();

    for (let i = 0; i < w.pellets; i++) {
        const angle = base + random(-w.spread, w.spread);
        bullets.push({
            x: player.x + Math.cos(angle) * 25,
            y: player.y + Math.sin(angle) * 25,
            vx: Math.cos(angle) * w.speed,
            vy: Math.sin(angle) * w.speed,
            radius: w.pellets > 1 ? 4 : 5,
            damage: w.damage * player.damageMultiplier,
            life: 85
        });
    }

    createParticles(
        player.x + Math.cos(base) * 27,
        player.y + Math.sin(base) * 27,
        "#ffd54f", w.pellets > 1 ? 8 : 3
    );

    shake = Math.min(7, shake + (w.pellets > 1 ? 4 : 1.5));
    if (ammo === 0) startReload();
}

function spawnEnemy() {
    let x, y, tries = 0;
    do {
        const side = Math.floor(random(0,4));
        if (side === 0) { x = random(50, world.width-50); y = 40; }
        if (side === 1) { x = random(50, world.width-50); y = world.height-40; }
        if (side === 2) { x = 40; y = random(50, world.height-50); }
        if (side === 3) { x = world.width-40; y = random(50, world.height-50); }
        tries++;
    } while (collidesWithBuilding(x,y,24) && tries < 20);

    const roll = Math.random();
    let type = "grunt";
    if (wave >= 3 && roll < .18) type = "runner";
    if (wave >= 5 && roll > .82) type = "tank";

    const data = {
        grunt: { radius:17, speed:1.25, hp:50, damage:10, xp:25, score:100 },
        runner:{ radius:13, speed:2.35, hp:30, damage:7, xp:20, score:140 },
        tank:  { radius:25, speed:.72, hp:150, damage:18, xp:60, score:350 }
    }[type];

    const scale = 1 + (wave - 1) * .055;

    enemies.push({
        x,y, radius:data.radius, type,
        speed:data.speed * (1 + Math.min(.35, (wave-1)*.018)),
        maxHealth:data.hp * scale,
        health:data.hp * scale,
        damage:data.damage * (1 + (wave-1)*.035),
        xp:data.xp, score:data.score,
        attackCooldown: random(0,30),
        hitFlash:0
    });
}

function createParticles(x,y,color,amount=5) {
    for (let i=0;i<amount;i++) {
        const angle=random(0,Math.PI*2), speed=random(1,4.5);
        particles.push({
            x,y,
            vx:Math.cos(angle)*speed,
            vy:Math.sin(angle)*speed,
            life:random(18,38),
            maxLife:38,
            color,size:random(2,5)
        });
    }
}

function createText(x,y,text,color="#fff") {
    texts.push({x,y,text,color,life:45});
}

function dropPickup(enemy) {
    const chance = enemy.type === "tank" ? .5 : .13;
    if (Math.random() > chance) return;
    const type = Math.random() < .55 ? "xp" : "heal";
    pickups.push({ x:enemy.x, y:enemy.y, type, value:type==="xp" ? 15 : 18, life:900 });
}

function gainXP(amount) {
    player.xp += amount;
    while (player.xp >= player.xpNeeded) {
        player.xp -= player.xpNeeded;
        player.level++;
        player.xpNeeded = Math.floor(player.xpNeeded * 1.35);
        player.maxHealth += 12;
        player.health = player.maxHealth;
        openLevelUp();
    }
}

const upgrades = [
    {icon:"⚔️", title:"Dano +25%", desc:"Aumenta o dano de todas as armas.", apply:()=>player.damageMultiplier *= 1.25},
    {icon:"❤️", title:"Blindagem", desc:"+30 de vida máxima e cura completamente.", apply:()=>{player.maxHealth+=30;player.health=player.maxHealth;}},
    {icon:"🏃", title:"Mobilidade", desc:"+18% de velocidade de movimento.", apply:()=>player.speedMultiplier*=1.18},
    {icon:"⚡", title:"Cadência", desc:"Dispara 15% mais rápido.", apply:()=>weapons.forEach(w=>w.fireRate*=.85)},
    {icon:"🎯", title:"Projéteis", desc:"+20% de velocidade das balas.", apply:()=>player.projectileSpeed*=1.2},
    {icon:"💚", title:"Regeneração", desc:"Recupera 0,5 de vida por segundo.", apply:()=>player.regen+=.5},
    {icon:"🧲", title:"Ímã de XP", desc:"Aumenta bastante o alcance de coleta.", apply:()=>player.pickupRange+=55}
];

function openLevelUp() {
    levelUpOpen = true;
    document.getElementById("newLevel").textContent = player.level;
    const box = document.getElementById("upgradeChoices");
    box.innerHTML = "";

    const choices = [...upgrades].sort(()=>Math.random()-.5).slice(0,3);
    choices.forEach(up => {
        const el = document.createElement("div");
        el.className = "choice";
        el.innerHTML = `<div class="icon">${up.icon}</div><h3>${up.title}</h3><p>${up.desc}</p>`;
        el.onclick = () => {
            up.apply();
            levelUpOpen = false;
            document.getElementById("levelUp").classList.add("hidden");
            createParticles(player.x,player.y,"#7c4dff",40);
        };
        box.appendChild(el);
    });
    document.getElementById("levelUp").classList.remove("hidden");
}

function damagePlayer(amount) {
    player.health -= amount;
    shake = Math.min(12, shake + 5);
    createParticles(player.x,player.y,"#ff1744",10);

    if (player.health <= 0) {
        player.health = 0;
        gameOver = true;
        document.getElementById("finalWave").textContent = wave;
        document.getElementById("finalKills").textContent = kills;
        document.getElementById("finalScore").textContent = score;
        document.getElementById("message").classList.remove("hidden");
    }
}

function updateBullets() {
    for (let i=bullets.length-1;i>=0;i--) {
        const b=bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--;

        let remove = b.life <= 0 || b.x<0 || b.y<0 || b.x>world.width || b.y>world.height;

        if (!remove && collidesWithBuilding(b.x,b.y,b.radius)) remove = true;

        for (let j=enemies.length-1;j>=0 && !remove;j--) {
            const e=enemies[j];
            if (distance(b,e) < b.radius + e.radius) {
                e.health -= b.damage;
                e.hitFlash = 4;
                createParticles(b.x,b.y,"#ffb74d",4);
                createText(e.x,e.y-25,`-${Math.round(b.damage)}`,"#ffd54f");
                remove = true;

                if (e.health <= 0) {
                    gainXP(e.xp);
                    kills++; waveKills++;
                    score += e.score;
                    createParticles(e.x,e.y,e.type==="tank"?"#ab47bc":"#ef5350",25);
                    dropPickup(e);
                    enemies.splice(j,1);

                    if (waveKills >= wave * 10) {
                        wave++;
                        waveKills = 0;
                        spawnRate = Math.max(420, 1000 - (wave-1)*45);
                        createText(player.x,player.y-45,`ONDA ${wave}`,"#61dafb");
                        createParticles(player.x,player.y,"#61dafb",35);
                    }
                }
            }
        }
        if (remove) bullets.splice(i,1);
    }
}

function updateEnemies(dt) {
    for (const e of enemies) {
        e.hitFlash = Math.max(0,e.hitFlash-1);
        const dx=player.x-e.x, dy=player.y-e.y;
        const dist=Math.hypot(dx,dy);
        const angle=Math.atan2(dy,dx);

        if (dist > e.radius + player.radius + 4) {
            let mx=Math.cos(angle)*e.speed*dt;
            let my=Math.sin(angle)*e.speed*dt;

            const oldX=e.x, oldY=e.y;
            moveWithCollision(e,mx,my);

            if (e.x===oldX && e.y===oldY) {
                moveWithCollision(e,-my,mx);
            }
        } else {
            e.attackCooldown -= dt;
            if (e.attackCooldown <= 0) {
                damagePlayer(e.damage);
                e.attackCooldown = e.type==="runner" ? 35 : 50;
            }
        }
    }
}

function updatePickups() {
    for(let i=pickups.length-1;i>=0;i--) {
        const p=pickups[i];
        p.life--;
        if (p.life<=0) { pickups.splice(i,1); continue; }

        if(distance(p,player) < player.pickupRange) {
            if(p.type==="xp") gainXP(p.value);
            else player.health=Math.min(player.maxHealth,player.health+p.value);
            createText(p.x,p.y,p.type==="xp"?`+${p.value} XP`:`+${p.value} HP`,p.type==="xp"?"#40c4ff":"#66bb6a");
            createParticles(p.x,p.y,p.type==="xp"?"#40c4ff":"#66bb6a",10);
            pickups.splice(i,1);
        }
    }
}

function updateParticles() {
    for(let i=particles.length-1;i>=0;i--) {
        const p=particles[i];
        p.x+=p.vx; p.y+=p.vy;
        p.vx*=.96; p.vy*=.96; p.life--;
        if(p.life<=0) particles.splice(i,1);
    }
}

function updateTexts() {
    for(let i=texts.length-1;i>=0;i--) {
        texts[i].y-=.5; texts[i].life--;
        if(texts[i].life<=0) texts.splice(i,1);
    }
}

function update(dt) {
    if(gameOver || paused || levelUpOpen) return;

    elapsed += dt;
    const now=performance.now();
    finishReloadIfReady(now);

    let dx=0,dy=0;
    if(keys.w) dy--; if(keys.s) dy++;
    if(keys.a) dx--; if(keys.d) dx++;

    if(dx||dy) {
        const len=Math.hypot(dx,dy);
        dx/=len; dy/=len;
        const speed=player.speed*player.speedMultiplier*dt;
        moveWithCollision(player,dx*speed,dy*speed);
    }

    player.angle=worldMouseAngle();
    if(mouse.down) shoot();

    if(player.regen>0) player.health=Math.min(player.maxHealth,player.health+player.regen*dt/60);

    updateBullets();
    updateEnemies(dt);
    updatePickups();
    updateParticles();
    updateTexts();

    spawnTimer += dt*16.6667;
    if(spawnTimer >= spawnRate) {
        spawnTimer=0;
        const maxEnemies=Math.min(65, 12+wave*4);
        if(enemies.length < maxEnemies) spawnEnemy();
    }

    camera.x=clamp(player.x-W/2,0,Math.max(0,world.width-W));
    camera.y=clamp(player.y-H/2,0,Math.max(0,world.height-H));

    shake*=.88;
    updateHUD();
}

function draw() {
    ctx.clearRect(0,0,W,H);

    ctx.save();
    const sx=random(-shake,shake), sy=random(-shake,shake);
    ctx.translate(sx-camera.x,sy-camera.y);

    drawWorld();
    drawPickups();
    drawParticles();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawTexts();

    ctx.restore();
}

function drawWorld() {
    ctx.fillStyle="#0b1019";
    ctx.fillRect(0,0,world.width,world.height);

    const grid=80;
    ctx.strokeStyle="#141d2c";
    ctx.lineWidth=1;
    for(let x=0;x<world.width;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.height);ctx.stroke();}
    for(let y=0;y<world.height;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.width,y);ctx.stroke();}

    ctx.strokeStyle="#2b3c58";
    ctx.lineWidth=10;
    ctx.strokeRect(0,0,world.width,world.height);

    buildings.forEach(drawBuilding);
}

function drawBuilding(b) {
    const [x,y,w,h]=b;
    ctx.fillStyle="#111a29";
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle="#30425e";
    ctx.lineWidth=4;
    ctx.strokeRect(x,y,w,h);

    ctx.fillStyle="#1a2940";
    for(let xx=x+28;xx<x+w-25;xx+=72)
        for(let yy=y+28;yy<y+h-20;yy+=62)
            ctx.fillRect(xx,yy,36,24);

    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.fillRect(x+8,y+h-10,w-16,10);
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x,player.y);
    ctx.rotate(player.angle);

    ctx.fillStyle="rgba(0,0,0,.4)";
    ctx.beginPath();ctx.ellipse(0,8,22,13,0,0,Math.PI*2);ctx.fill();

    ctx.fillStyle="#2196f3";
    ctx.beginPath();ctx.arc(0,0,player.radius,0,Math.PI*2);ctx.fill();

    ctx.strokeStyle="#90caf9";ctx.lineWidth=3;ctx.stroke();

    ctx.fillStyle="#cfd8dc";ctx.fillRect(7,-5,31,10);
    ctx.fillStyle="#37474f";ctx.fillRect(8,5,11,8);

    ctx.restore();
}

function drawEnemies() {
    for(const e of enemies) {
        const color=e.type==="tank"?"#8e44ad":e.type==="runner"?"#ff8f00":"#e53935";
        ctx.fillStyle="rgba(0,0,0,.35)";
        ctx.beginPath();ctx.ellipse(e.x,e.y+7,e.radius+2,e.radius-5,0,0,Math.PI*2);ctx.fill();

        ctx.fillStyle=e.hitFlash>0?"#fff":color;
        ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=e.type==="tank"?"#ce93d8":e.type==="runner"?"#ffcc80":"#ff8a80";
        ctx.lineWidth=2;ctx.stroke();

        if(e.type!=="tank"){
            ctx.fillStyle="#fff";
            ctx.beginPath();ctx.arc(e.x-5,e.y-4,3,0,Math.PI*2);ctx.arc(e.x+5,e.y-4,3,0,Math.PI*2);ctx.fill();
        } else {
            ctx.strokeStyle="#fff";ctx.lineWidth=3;
            ctx.beginPath();ctx.moveTo(e.x-7,e.y);ctx.lineTo(e.x+7,e.y);ctx.stroke();
        }

        const bw=e.radius*2.3, hp=Math.max(0,e.health/e.maxHealth);
        ctx.fillStyle="#222";ctx.fillRect(e.x-bw/2,e.y-e.radius-12,bw,5);
        ctx.fillStyle="#66bb6a";ctx.fillRect(e.x-bw/2,e.y-e.radius-12,bw*hp,5);
    }
}

function drawBullets() {
    for(const b of bullets) {
        ctx.fillStyle="#ffeb3b";
        ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.fill();
    }
}

function drawParticles() {
    for(const p of particles) {
        ctx.globalAlpha=Math.max(0,p.life/p.maxLife);
        ctx.fillStyle=p.color;
        ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
}

function drawPickups() {
    for(const p of pickups) {
        const pulse=1+Math.sin(elapsed*.012+p.x)*.12;
        ctx.save();ctx.translate(p.x,p.y);ctx.scale(pulse,pulse);
        ctx.fillStyle=p.type==="xp"?"#40c4ff":"#66bb6a";
        ctx.shadowBlur=14;ctx.shadowColor=ctx.fillStyle;
        ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle="#fff";ctx.font="bold 11px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(p.type==="xp"?"★":"+ ",0,0);
        ctx.restore();
    }
}

function drawTexts() {
    ctx.textAlign="center";
    ctx.font="bold 14px Arial";
    for(const t of texts) {
        ctx.globalAlpha=t.life/45;
        ctx.fillStyle=t.color;
        ctx.fillText(t.text,t.x,t.y);
    }
    ctx.globalAlpha=1;
}

function updateHUD() {
    const hp=Math.max(0,player.health/player.maxHealth*100);
    const xp=player.xp/player.xpNeeded*100;
    document.getElementById("healthBar").style.width=hp+"%";
    document.getElementById("xpBar").style.width=xp+"%";
    document.getElementById("healthText").textContent=`${Math.ceil(player.health)} / ${player.maxHealth}`;
    document.getElementById("xpText").textContent=`${player.xp} / ${player.xpNeeded}`;
    document.getElementById("level").textContent=player.level;
    document.getElementById("kills").textContent=kills;
    document.getElementById("wave").textContent=wave;
    document.getElementById("enemyCount").textContent=enemies.length;
    document.getElementById("score").textContent=score;
    document.getElementById("combo").textContent="x1";
    updateWeaponHUD();
}

function updateWeaponHUD() {
    const w=getWeapon();
    document.getElementById("weaponName").textContent=w.name;
    document.getElementById("ammoText").textContent=`${ammo} / ∞`;
    document.getElementById("reloadText").textContent=reloading ? "RECARREGANDO" : "";
}

function togglePause() {
    if(gameOver || levelUpOpen) return;
    paused=!paused;
    document.getElementById("pause").classList.toggle("hidden",!paused);
}

function restartGame() {
    player.x=world.width/2;
    player.y=world.height/2;
    player.maxHealth=100; player.health=100;
    player.level=1; player.xp=0; player.xpNeeded=100;
    player.damage=25; player.speedMultiplier=1; player.damageMultiplier=1;
    player.projectileSpeed=11; player.pickupRange=75; player.regen=0;

    weapons[0].damage=25; weapons[0].fireRate=180;
    weapons[1].damage=12; weapons[1].fireRate=75;
    weapons[2].damage=13; weapons[2].fireRate=600;

    weaponIndex=0; ammo=weapons[0].maxAmmo; reloading=false;
    bullets=[]; enemies=[]; particles=[]; pickups=[]; texts=[];
    kills=0; score=0; wave=1; waveKills=0;
    spawnTimer=0; spawnRate=1000; elapsed=0; shake=0;
    gameOver=false; paused=false; levelUpOpen=false;

    document.getElementById("message").classList.add("hidden");
    document.getElementById("pause").classList.add("hidden");
    document.getElementById("levelUp").classList.add("hidden");
    updateHUD();
}

let lastTime=performance.now();
function gameLoop(now) {
    const dt=Math.min(2.2,(now-lastTime)/16.6667);
    lastTime=now;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

restartGame();
requestAnimationFrame(gameLoop);
