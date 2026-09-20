(() => {
  "use strict";

  const isTouch =
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  if (!isTouch) return;

  document.documentElement.classList.add("touch-device");

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
      <button class="touch-btn fire" id="fireBtn">ATIRAR</button>
      <button class="touch-btn reload" id="reloadBtn">↻</button>
      <button class="touch-btn weapon" id="weaponBtn">ARMA</button>
      <div class="touch-abilities">
        <button class="touch-btn ability-q" id="mobileQ">Q<br><small>EMP</small></button>
        <button class="touch-btn ability-e" id="mobileE">E<br><small>DASH</small></button>
        <button class="touch-btn ability-f" id="mobileF">F<br><small>BOMBA</small></button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const canvas = document.getElementById("game");

  // Prevent browser gestures/scrolling while interacting with the game.
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

  const pressed = new Set();

  function keyDown(key) {
    if (pressed.has(key)) return;
    pressed.add(key);
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code: key }));
  }

  function keyUp(key) {
    if (!pressed.has(key)) return;
    pressed.delete(key);
    window.dispatchEvent(new KeyboardEvent("keyup", { key, code: key }));
  }

  function releaseAllMovement() {
    ["w", "a", "s", "d"].forEach(keyUp);
  }

  function updateMovement(x, y) {
    releaseAllMovement();
    const dead = 0.18;
    if (Math.hypot(x, y) < dead) return;

    if (y < -dead) keyDown("w");
    if (y > dead) keyDown("s");
    if (x < -dead) keyDown("a");
    if (x > dead) keyDown("d");
  }

  function dispatchMouseMove(clientX, clientY) {
    // V2 reads mouse coordinates from mousemove and converts them through its camera.
    const ev = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0
    });
    window.dispatchEvent(ev);
    canvas.dispatchEvent(ev);
  }

  function mouseDown() {
    window.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true, cancelable: true, button: 0
    }));
  }

  function mouseUp() {
    window.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true, cancelable: true, button: 0
    }));
  }

  function aimFromVector(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 0.18) return;

    // Aim at a point around the center of the screen. V2 will calculate its
    // world-space angle using the existing camera + mouse logic.
    const cx = innerWidth * 0.5;
    const cy = innerHeight * 0.5;
    const reach = Math.min(innerWidth, innerHeight) * 0.30;
    dispatchMouseMove(cx + (dx / len) * reach, cy + (dy / len) * reach);
  }

  function setupStick(el, onMove, onEnd) {
    const base = el.querySelector(".stick-base");
    const knob = el.querySelector(".stick-knob");
    let pointerId = null;
    let rect;
    let max = 55;

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
      pointerId = e.pointerId;
      rect = base.getBoundingClientRect();
      max = Math.max(40, rect.width * 0.36);
      el.setPointerCapture(pointerId);
      move(e.clientX, e.clientY);
    });

    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    });

    const end = e => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      pointerId = null;
      knob.style.transform = "translate(0,0)";
      onEnd();
    };

    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", () => {
      pointerId = null;
      knob.style.transform = "translate(0,0)";
      onEnd();
    });
  }

  setupStick(
    document.getElementById("moveStick"),
    updateMovement,
    releaseAllMovement
  );

  let aiming = false;

  setupStick(
    document.getElementById("aimStick"),
    (x, y) => {
      aiming = true;
      aimFromVector(x, y);
      mouseDown(); // auto-fire while the right stick is held
    },
    () => {
      aiming = false;
      mouseUp();
    }
  );

  // Dedicated fire button, useful for players who prefer aiming without firing
  // continuously with the right stick.
  const fireBtn = document.getElementById("fireBtn");
  fireBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    mouseDown();
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
    fireBtn.addEventListener(type, e => {
      e.preventDefault();
      if (!aiming) mouseUp();
    });
  });

  document.getElementById("reloadBtn").addEventListener("pointerdown", e => {
    e.preventDefault();
    if (typeof window.startReload === "function") window.startReload();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR" }));
  });

  let weaponIndex = 0;
  document.getElementById("weaponBtn").addEventListener("pointerdown", e => {
    e.preventDefault();
    weaponIndex = (weaponIndex + 1) % 5;
    if (typeof window.switchWeapon === "function") {
      window.switchWeapon(weaponIndex);
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: String(weaponIndex + 1),
        code: `Digit${weaponIndex + 1}`
      }));
    }
  });

  function ability(buttonId, key, fnName) {
    document.getElementById(buttonId).addEventListener("pointerdown", e => {
      e.preventDefault();
      if (typeof window.useAbility === "function") window.useAbility(key);
      else if (typeof window[fnName] === "function") window[fnName]();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key, code: key }));
    });
  }

  ability("mobileQ", "q", "useEMP");
  ability("mobileE", "e", "useDash");
  ability("mobileF", "f", "useBomb");

  // Hide mobile controls when menus/overlays need full-screen interaction.
  const observer = new MutationObserver(() => {
    const overlayOpen = [...document.querySelectorAll(".overlay")]
      .some(el => !el.classList.contains("hidden"));
    root.classList.toggle("menu-open", overlayOpen);
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  // Make the canvas consume touch input rather than browser gestures.
  canvas.style.touchAction = "none";

  // Releasing the page focus should never leave movement/fire stuck.
  window.addEventListener("blur", () => {
    releaseAllMovement();
    mouseUp();
  });
})();
