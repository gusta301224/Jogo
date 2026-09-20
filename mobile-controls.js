(() => {
  "use strict";

  const isTouch =
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  if (!isTouch) return;

  document.documentElement.classList.add("touch-device");

  // ---------- Tela cheia ----------
  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (_) {
      // Alguns navegadores só permitem fullscreen após uma ação do usuário.
    }
  }

  // Tentativa automática e, se o navegador bloquear, a primeira interação ativa.
  enterFullscreen();
  window.addEventListener("pointerdown", enterFullscreen, { once: true, passive: true });

  const root = document.createElement("div");
  root.id = "mobileControls";
  root.innerHTML = `
    <div class="touch-stick" id="moveStick">
      <div class="stick-base"><div class="stick-knob"></div></div>
      <span class="stick-label">MOVER</span>
    </div>

    <div class="touch-stick" id="aimStick">
      <div class="stick-base"><div class="stick-knob"></div></div>
      <span class="stick-label">MIRAR</span>
    </div>

    <div class="touch-actions">
      <button type="button" class="touch-btn fire" id="fireBtn">ATIRAR</button>
      <button type="button" class="touch-btn reload" id="reloadBtn">↻</button>
      <button type="button" class="touch-btn weapon" id="weaponBtn">ARMA</button>

      <div class="touch-abilities">
        <button type="button" class="touch-btn ability-q" id="mobileQ">Q<br><small>EMP</small></button>
        <button type="button" class="touch-btn ability-e" id="mobileE">E<br><small>DASH</small></button>
        <button type="button" class="touch-btn ability-f" id="mobileF">F<br><small>BOMBA</small></button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const canvas = document.getElementById("game");

  ["touchstart", "touchmove", "touchend", "touchcancel", "gesturestart"].forEach(type => {
    document.addEventListener(type, e => {
      if (e.target.closest("#mobileControls") || e.target === canvas) {
        e.preventDefault();
      }
    }, { passive: false });
  });

  document.addEventListener("contextmenu", e => {
    if (e.target.closest("#mobileControls") || e.target === canvas) e.preventDefault();
  });

  // ---------- Comunicação com o game.js ----------
  // O V2 original pode ter os handlers registrados no window/document.
  // Em vez de depender de funções globais, enviamos eventos reais para o
  // próprio elemento do jogo e também mantemos estado de mouse.
  function emitKey(key, type = "keydown") {
    window.dispatchEvent(new KeyboardEvent(type, {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true
    }));
  }

  function clickKey(key) {
    emitKey(key, "keydown");
    setTimeout(() => emitKey(key, "keyup"), 20);
  }

  let firing = false;

  function setFire(on) {
    firing = on;
    if (on) {
      window.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, buttons: 1
      }));
      document.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, buttons: 1
      }));
    } else {
      window.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, buttons: 0
      }));
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, buttons: 0
      }));
    }
  }

  function moveMouse(clientX, clientY) {
    const event = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      buttons: firing ? 1 : 0
    });
    window.dispatchEvent(event);
    document.dispatchEvent(event);
    canvas.dispatchEvent(event);
  }

  // ---------- Joystick ----------
  function setupStick(el, onMove, onEnd) {
    const base = el.querySelector(".stick-base");
    const knob = el.querySelector(".stick-knob");
    let pointerId = null;
    let rect;
    let max = 52;

    function move(clientX, clientY) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy);

      if (len > max) {
        dx = dx / len * max;
        dy = dy / len * max;
      }

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      onMove(dx / max, dy / max);
    }

    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      enterFullscreen();
      pointerId = e.pointerId;
      rect = base.getBoundingClientRect();
      max = Math.max(42, rect.width * 0.36);
      el.setPointerCapture(pointerId);
      move(e.clientX, e.clientY);
    });

    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    });

    function end(e) {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      pointerId = null;
      knob.style.transform = "translate(0,0)";
      onEnd();
    }

    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function updateMovement(x, y) {
    ["w", "a", "s", "d"].forEach(k => emitKey(k, "keyup"));

    const dead = 0.20;
    if (Math.hypot(x, y) < dead) return;

    if (y < -dead) emitKey("w");
    if (y > dead) emitKey("s");
    if (x < -dead) emitKey("a");
    if (x > dead) emitKey("d");
  }

  setupStick(
    document.getElementById("moveStick"),
    updateMovement,
    () => ["w", "a", "s", "d"].forEach(k => emitKey(k, "keyup"))
  );

  // ---------- Mira ----------
  setupStick(
    document.getElementById("aimStick"),
    (x, y) => {
      const len = Math.hypot(x, y);
      if (len < 0.18) return;

      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const reach = Math.min(innerWidth, innerHeight) * 0.32;

      moveMouse(
        cx + (x / len) * reach,
        cy + (y / len) * reach
      );

      // Atira enquanto o analógico direito estiver sendo usado.
      setFire(true);
    },
    () => setFire(false)
  );

  // ---------- Botões ----------
  const fireBtn = document.getElementById("fireBtn");

  fireBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();
    enterFullscreen();
    fireBtn.setPointerCapture?.(e.pointerId);
    setFire(true);
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
    fireBtn.addEventListener(type, e => {
      e.preventDefault();
      e.stopPropagation();
      setFire(false);
    });
  });

  document.getElementById("reloadBtn").addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();
    enterFullscreen();
    clickKey("r");
  });

  let weaponIndex = 0;
  document.getElementById("weaponBtn").addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();
    enterFullscreen();
    weaponIndex = (weaponIndex + 1) % 5;
    clickKey(String(weaponIndex + 1));
  });

  // Usa as mesmas teclas do V2 original, garantindo que o handler existente
  // receba a ação da bomba/EMP/Dash.
  function bindAbility(id, key) {
    const btn = document.getElementById(id);
    btn.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      enterFullscreen();
      clickKey(key);
    });
  }

  bindAbility("mobileQ", "q");
  bindAbility("mobileE", "e");
  bindAbility("mobileF", "f");

  window.addEventListener("blur", () => {
    ["w", "a", "s", "d"].forEach(k => emitKey(k, "keyup"));
    setFire(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ["w", "a", "s", "d"].forEach(k => emitKey(k, "keyup"));
      setFire(false);
    }
  });
})();
