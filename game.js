(() => {
  "use strict";

  const RECIPES = {
    burger: { name: "Burger", emoji: "🍔", price: 18, cookMs: 5200, burnMs: 6500 },
    coffee: { name: "Coffee", emoji: "☕", price: 8, cookMs: 2400, burnMs: null },
    fries: { name: "Fries", emoji: "🍟", price: 12, cookMs: 4200, burnMs: 5200 },
    pancakes: { name: "Pancakes", emoji: "🥞", price: 15, cookMs: 4600, burnMs: 5600 }
  };

  const LEVELS = [
    { goal: 55, customers: 4, tables: 2, arrivalMs: 7600, patience: 70, menu: ["burger"], maxItems: 1, label: "Soft Opening" },
    { goal: 80, customers: 5, tables: 2, arrivalMs: 7000, patience: 68, menu: ["burger", "coffee"], maxItems: 1, label: "Coffee Please" },
    { goal: 115, customers: 6, tables: 2, arrivalMs: 6400, patience: 66, menu: ["burger", "coffee", "fries"], maxItems: 1, label: "Lunch Starts" },
    { goal: 150, customers: 7, tables: 3, arrivalMs: 5800, patience: 64, menu: ["burger", "coffee", "fries"], maxItems: 2, label: "Three Tables" },
    { goal: 190, customers: 8, tables: 3, arrivalMs: 5200, patience: 60, menu: ["burger", "coffee", "fries", "pancakes"], maxItems: 2, label: "All-Day Breakfast" },
    { goal: 235, customers: 10, tables: 3, arrivalMs: 4700, patience: 57, menu: ["burger", "coffee", "fries", "pancakes"], maxItems: 2, label: "Real Rush" },
    { goal: 285, customers: 11, tables: 3, arrivalMs: 4200, patience: 54, menu: ["burger", "coffee", "fries", "pancakes"], maxItems: 2, label: "Keep Moving" },
    { goal: 345, customers: 13, tables: 3, arrivalMs: 3700, patience: 50, menu: ["burger", "coffee", "fries", "pancakes"], maxItems: 3, label: "Saturday Chaos" }
  ];

  const NAMES = ["Maya", "Theo", "Nina", "Jay", "Lena", "Omar", "Riley", "Sam", "Ari", "Tess", "Miles", "Zoe", "Kai", "Ivy"];
  const AVATARS = ["👩🏽", "👨🏻", "👩🏾", "🧔🏽", "👩🏻", "👨🏾", "👩🏼", "👨🏿", "🧑🏽", "👩🏿", "👨🏼", "🧑🏻"];

  const els = {
    levelLabel: document.querySelector("#levelLabel"),
    cashLabel: document.querySelector("#cashLabel"),
    goalLabel: document.querySelector("#goalLabel"),
    message: document.querySelector("#message"),
    queueCount: document.querySelector("#queueCount"),
    queue: document.querySelector("#queue"),
    tables: document.querySelector("#tables"),
    stations: document.querySelector("#stations"),
    tray: document.querySelector("#tray"),
    soundButton: document.querySelector("#soundButton"),
    levelButton: document.querySelector("#levelButton"),
    startButton: document.querySelector("#startButton"),
    modal: document.querySelector("#modal"),
    modalIcon: document.querySelector("#modalIcon"),
    modalTitle: document.querySelector("#modalTitle"),
    modalText: document.querySelector("#modalText"),
    modalDetails: document.querySelector("#modalDetails"),
    modalPrimary: document.querySelector("#modalPrimary"),
    modalSecondary: document.querySelector("#modalSecondary")
  };

  const save = loadSave();

  let state = freshState(0);
  let lastFrame = performance.now();
  let frameHandle = null;
  let audioContext = null;
  let soundOn = save.soundOn !== false;

  function freshState(levelIndex) {
    const lvl = LEVELS[levelIndex];
    return {
      levelIndex,
      running: false,
      cash: 0,
      spawned: 0,
      finished: 0,
      nextCustomerId: 1,
      selectedCustomerId: null,
      selectedTrayId: null,
      queue: [],
      tray: [],
      tables: Array.from({ length: lvl.tables }, (_, i) => ({
        id: i + 1,
        state: "empty",
        customer: null,
        order: [],
        served: [],
        eatingUntil: 0,
        cleaningUntil: 0
      })),
      stations: Object.fromEntries(lvl.menu.map(key => [key, {
        key,
        state: "idle",
        startedAt: 0,
        readyAt: 0,
        burnAt: 0
      }])),
      nextSpawnAt: 0,
      ended: false
    };
  }

  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem("orderUpSave") || "{}");
    } catch {
      return {};
    }
  }

  function persistSave() {
    localStorage.setItem("orderUpSave", JSON.stringify(save));
  }

  function message(text) {
    els.message.textContent = text;
  }

  function beep(freq = 500, duration = .06) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = freq;
      gain.gain.value = .045;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.stop(audioContext.currentTime + duration);
    } catch {}
  }

  function setSound(on) {
    soundOn = on;
    save.soundOn = on;
    persistSave();
    els.soundButton.textContent = on ? "🔊" : "🔇";
  }

  function showIntro() {
    els.modalIcon.textContent = "🍽️";
    els.modalTitle.textContent = "Order Up!";
    els.modalText.textContent = "You are the host, server, cook, cashier, and busser. Level 1 is gentle. The diner gets mean later.";
    els.modalDetails.innerHTML = `
      <div class="level-option"><span>1. Seat customers</span><strong>🪑</strong></div>
      <div class="level-option"><span>2. Take their order</span><strong>📝</strong></div>
      <div class="level-option"><span>3. Cook + collect food</span><strong>🍳</strong></div>
      <div class="level-option"><span>4. Serve, collect payment, clean</span><strong>💵</strong></div>
    `;
    els.modalPrimary.textContent = `Play Level ${state.levelIndex + 1}`;
    els.modalPrimary.onclick = () => {
      closeModal();
      startLevel(state.levelIndex);
    };
    els.modalSecondary.classList.add("hidden");
    openModal();
  }

  function openModal() {
    els.modal.classList.add("open");
  }

  function closeModal() {
    els.modal.classList.remove("open");
  }

  function showLevelPicker() {
    const unlocked = Math.max(1, save.unlocked || 1);
    els.modalIcon.textContent = "🧾";
    els.modalTitle.textContent = "Choose a Shift";
    els.modalText.textContent = "Completed levels stay unlocked on this phone.";
    els.modalDetails.innerHTML = LEVELS.map((lvl, i) => {
      const levelNum = i + 1;
      const stars = save.bestStars?.[levelNum] || 0;
      const locked = levelNum > unlocked;
      return `<button class="level-option ${i === state.levelIndex ? "current" : ""}" data-level="${i}" ${locked ? "disabled" : ""}>
        <span><strong>${levelNum}. ${lvl.label}</strong><br><small>${lvl.customers} customers • Goal $${lvl.goal}</small></span>
        <span>${locked ? "🔒" : "⭐".repeat(stars) || "—"}</span>
      </button>`;
    }).join("");

    els.modalDetails.querySelectorAll("[data-level]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.level);
        state = freshState(index);
        closeModal();
        showIntro();
        render();
      });
    });

    els.modalPrimary.textContent = "Close";
    els.modalPrimary.onclick = closeModal;
    els.modalSecondary.classList.add("hidden");
    openModal();
  }

  function startLevel(index) {
    state = freshState(index);
    state.running = true;
    state.nextSpawnAt = performance.now() + 800;
    lastFrame = performance.now();
    message("Customers are coming. Tap a waiting customer, then an empty table.");
    render();
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = requestAnimationFrame(loop);
  }

  function spawnCustomer(now) {
    const lvl = LEVELS[state.levelIndex];
    if (state.spawned >= lvl.customers) return;

    const id = state.nextCustomerId++;
    const customer = {
      id,
      name: NAMES[(id + state.levelIndex * 3) % NAMES.length],
      avatar: AVATARS[(id * 2 + state.levelIndex) % AVATARS.length],
      patience: lvl.patience,
      maxPatience: lvl.patience,
      phase: "queue",
      seatedAt: 0
    };
    state.queue.push(customer);
    state.spawned++;
    state.nextSpawnAt = now + lvl.arrivalMs;
    beep(430);
    message(`${customer.name} is waiting for a table.`);
  }

  function loop(now) {
    if (!state.running) return;

    const dt = Math.min(0.2, (now - lastFrame) / 1000);
    lastFrame = now;

    const lvl = LEVELS[state.levelIndex];
    if (state.spawned < lvl.customers && now >= state.nextSpawnAt) {
      spawnCustomer(now);
    }

    updatePatience(dt);
    updateTables(now);
    updateStations(now);
    checkLevelEnd();

    render();

    if (state.running) frameHandle = requestAnimationFrame(loop);
  }

  function updatePatience(dt) {
    const queueDrain = .78;
    const tableDrain = 1;

    [...state.queue].forEach(customer => {
      customer.patience -= dt * queueDrain;
      if (customer.patience <= 0) {
        state.queue = state.queue.filter(c => c.id !== customer.id);
        if (state.selectedCustomerId === customer.id) state.selectedCustomerId = null;
        state.finished++;
        beep(180, .12);
        message(`${customer.name} left. Too long at the door.`);
      }
    });

    state.tables.forEach(table => {
      const customer = table.customer;
      if (!customer) return;
      if (!["seated", "waitingFood"].includes(table.state)) return;

      customer.patience -= dt * tableDrain;
      if (customer.patience <= 0) {
        beep(160, .15);
        message(`${customer.name} walked out. Table ${table.id} needs cleaning.`);
        state.finished++;
        table.customer = null;
        table.order = [];
        table.served = [];
        table.state = "dirty";
      }
    });
  }

  function updateTables(now) {
    state.tables.forEach(table => {
      if (table.state === "eating" && now >= table.eatingUntil) {
        table.state = "checkout";
        beep(700);
        message(`Table ${table.id} is ready to pay.`);
      }
      if (table.state === "cleaning" && now >= table.cleaningUntil) {
        resetTable(table);
        beep(620);
        message(`Table ${table.id} is clean.`);
      }
    });
  }

  function updateStations(now) {
    Object.values(state.stations).forEach(station => {
      if (station.state === "cooking" && now >= station.readyAt) {
        station.state = "ready";
        beep(820);
      }
      if (station.state === "ready" && station.burnAt && now >= station.burnAt) {
        station.state = "burned";
        beep(120, .2);
        message(`${RECIPES[station.key].name} burned! Tap it to toss it.`);
      }
    });
  }

  function chooseOrder() {
    const lvl = LEVELS[state.levelIndex];
    const count = lvl.maxItems === 1 ? 1 : (Math.random() < .55 ? 1 : Math.min(lvl.maxItems, 2 + (Math.random() < .22 ? 1 : 0)));
    const pool = [...lvl.menu];
    const result = [];
    while (result.length < count) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      result.push(pick);
      if (pool.length > 1 && Math.random() < .75) {
        const idx = pool.indexOf(pick);
        if (idx >= 0) pool.splice(idx, 1);
      }
    }
    return result;
  }

  function onCustomerTap(id) {
    if (!state.running) return;
    state.selectedCustomerId = state.selectedCustomerId === id ? null : id;
    state.selectedTrayId = null;
    const c = state.queue.find(x => x.id === id);
    if (c && state.selectedCustomerId) message(`${c.name} selected. Tap an empty table.`);
    render();
  }

  function onTableTap(tableId) {
    if (!state.running) return;
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    if (table.state === "empty") {
      if (!state.selectedCustomerId) {
        message("Select someone waiting at the door first.");
        return;
      }
      const customer = state.queue.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;
      state.queue = state.queue.filter(c => c.id !== customer.id);
      state.selectedCustomerId = null;
      customer.phase = "table";
      table.customer = customer;
      table.state = "seated";
      beep(560);
      message(`${customer.name} is seated at Table ${table.id}. Tap the table to take the order.`);
      render();
      return;
    }

    if (table.state === "seated") {
      table.order = chooseOrder();
      table.served = table.order.map(() => false);
      table.state = "waitingFood";
      beep(650);
      const names = table.order.map(k => `${RECIPES[k].emoji} ${RECIPES[k].name}`).join(" + ");
      message(`Table ${table.id} ordered ${names}. Start cooking.`);
      render();
      return;
    }

    if (table.state === "waitingFood") {
      if (!state.selectedTrayId) {
        message("Select a finished item from your tray, then tap the table.");
        return;
      }
      const trayIndex = state.tray.findIndex(item => item.id === state.selectedTrayId);
      if (trayIndex < 0) return;
      const trayItem = state.tray[trayIndex];
      const targetIndex = table.order.findIndex((key, i) => key === trayItem.key && !table.served[i]);

      if (targetIndex < 0) {
        beep(180);
        message(`Table ${table.id} didn't order that.`);
        return;
      }

      table.served[targetIndex] = true;
      state.tray.splice(trayIndex, 1);
      state.selectedTrayId = null;
      beep(760);
      if (table.served.every(Boolean)) {
        table.state = "eating";
        table.eatingUntil = performance.now() + 4200 + Math.random() * 1800;
        message(`Table ${table.id} has everything. They're eating.`);
      } else {
        message(`Nice. Table ${table.id} still needs ${remainingOrderText(table)}.`);
      }
      render();
      return;
    }

    if (table.state === "checkout") {
      const base = table.order.reduce((sum, key) => sum + RECIPES[key].price, 0);
      const patienceRatio = table.customer ? Math.max(0, table.customer.patience / table.customer.maxPatience) : 0;
      const tip = Math.round(base * (.08 + patienceRatio * .28));
      const total = base + tip;
      state.cash += total;
      state.finished++;
      beep(980, .08);
      message(`Table ${table.id} paid $${base} + $${tip} tip. Clean the table!`);
      table.customer = null;
      table.state = "dirty";
      render();
      return;
    }

    if (table.state === "dirty") {
      table.state = "cleaning";
      table.cleaningUntil = performance.now() + 1600;
      beep(500);
      message(`Cleaning Table ${table.id}...`);
      render();
      return;
    }

    if (table.state === "cleaning") {
      message("Still wiping that table.");
      return;
    }

    if (table.state === "eating") {
      message(`Table ${table.id} is eating. Use the time wisely.`);
    }
  }

  function resetTable(table) {
    table.state = "empty";
    table.customer = null;
    table.order = [];
    table.served = [];
    table.eatingUntil = 0;
    table.cleaningUntil = 0;
  }

  function remainingOrderText(table) {
    return table.order
      .filter((_, i) => !table.served[i])
      .map(key => RECIPES[key].emoji)
      .join(" ");
  }

  function onStationTap(key) {
    if (!state.running) return;
    const station = state.stations[key];
    const recipe = RECIPES[key];
    const now = performance.now();

    if (station.state === "idle") {
      station.state = "cooking";
      station.startedAt = now;
      station.readyAt = now + recipe.cookMs;
      station.burnAt = recipe.burnMs ? station.readyAt + recipe.burnMs : 0;
      beep(520);
      message(`${recipe.name} started.`);
    } else if (station.state === "cooking") {
      message(`${recipe.name} isn't ready yet.`);
    } else if (station.state === "ready") {
      const item = { id: `${key}-${Date.now()}-${Math.random()}`, key };
      state.tray.push(item);
      station.state = "idle";
      station.startedAt = station.readyAt = station.burnAt = 0;
      beep(880);
      message(`${recipe.name} added to your tray.`);
    } else if (station.state === "burned") {
      station.state = "idle";
      station.startedAt = station.readyAt = station.burnAt = 0;
      beep(210);
      message(`Burned ${recipe.name} tossed. Start another.`);
    }

    render();
  }

  function onTrayTap(id) {
    state.selectedTrayId = state.selectedTrayId === id ? null : id;
    state.selectedCustomerId = null;
    const item = state.tray.find(x => x.id === id);
    if (item && state.selectedTrayId) message(`${RECIPES[item.key].name} selected. Tap the correct table.`);
    render();
  }

  function checkLevelEnd() {
    if (state.ended || !state.running) return;
    const lvl = LEVELS[state.levelIndex];
    const customersAccountedFor = state.finished >= lvl.customers;
    const noQueue = state.queue.length === 0;
    const noActiveTables = state.tables.every(t => !t.customer);

    if (state.spawned >= lvl.customers && customersAccountedFor && noQueue && noActiveTables) {
      endLevel();
    }
  }

  function endLevel() {
    state.running = false;
    state.ended = true;

    const lvl = LEVELS[state.levelIndex];
    const ratio = state.cash / lvl.goal;
    const won = state.cash >= lvl.goal;
    let stars = 0;
    if (won) stars = ratio >= 1.45 ? 3 : ratio >= 1.2 ? 2 : 1;

    if (won) {
      const levelNum = state.levelIndex + 1;
      save.unlocked = Math.max(save.unlocked || 1, Math.min(LEVELS.length, levelNum + 1));
      save.bestStars ||= {};
      save.bestStars[levelNum] = Math.max(save.bestStars[levelNum] || 0, stars);
      persistSave();
    }

    els.modalIcon.textContent = won ? "🎉" : "😵";
    els.modalTitle.textContent = won ? "Shift Complete!" : "Not Quite";
    els.modalText.textContent = won
      ? `You made $${state.cash} on a $${lvl.goal} goal. ${"⭐".repeat(stars)}`
      : `You made $${state.cash}. You needed $${lvl.goal}. The diner wins this round.`;

    els.modalDetails.innerHTML = `
      <div class="level-option"><span>Customers finished</span><strong>${state.finished}/${lvl.customers}</strong></div>
      <div class="level-option"><span>Cash</span><strong>$${state.cash}</strong></div>
      <div class="level-option"><span>Best</span><strong>${"⭐".repeat(save.bestStars?.[state.levelIndex + 1] || 0) || "—"}</strong></div>
    `;

    if (won && state.levelIndex < LEVELS.length - 1) {
      els.modalPrimary.textContent = `Play Level ${state.levelIndex + 2}`;
      els.modalPrimary.onclick = () => {
        closeModal();
        startLevel(state.levelIndex + 1);
      };
    } else {
      els.modalPrimary.textContent = "Retry";
      els.modalPrimary.onclick = () => {
        closeModal();
        startLevel(state.levelIndex);
      };
    }

    els.modalSecondary.textContent = "Choose Level";
    els.modalSecondary.classList.remove("hidden");
    els.modalSecondary.onclick = showLevelPicker;
    openModal();
    render();
  }

  function render() {
    const lvl = LEVELS[state.levelIndex];
    els.levelLabel.textContent = `Level ${state.levelIndex + 1}: ${lvl.label}`;
    els.cashLabel.textContent = `$${state.cash}`;
    els.goalLabel.textContent = `$${state.cash} / $${lvl.goal}`;
    els.queueCount.textContent = state.queue.length;
    els.startButton.textContent = state.running ? "Restart Shift" : "Start Shift";
    els.soundButton.textContent = soundOn ? "🔊" : "🔇";

    renderQueue();
    renderTables();
    renderStations();
    renderTray();
  }

  function renderQueue() {
    if (!state.queue.length) {
      els.queue.innerHTML = `<div class="tray-empty">${state.running ? "Door is clear... for now." : "No customers yet."}</div>`;
      return;
    }

    els.queue.innerHTML = "";
    state.queue.forEach(customer => {
      const btn = document.createElement("button");
      btn.className = `customer-card ${state.selectedCustomerId === customer.id ? "selected" : ""}`;
      const pct = Math.max(0, customer.patience / customer.maxPatience * 100);
      btn.innerHTML = `
        <div class="customer-avatar">${customer.avatar}</div>
        <div class="customer-copy">
          <strong class="customer-name">${customer.name}</strong>
          <span class="customer-status">Needs a table</span>
          <div class="patience-track"><div class="patience-fill" style="width:${pct}%; background:${patienceColor(pct)}"></div></div>
        </div>`;
      btn.addEventListener("click", () => onCustomerTap(customer.id));
      els.queue.appendChild(btn);
    });
  }

  function renderTables() {
    els.tables.innerHTML = "";
    state.tables.forEach(table => {
      const btn = document.createElement("button");
      btn.className = `table-card ${["seated","waitingFood","checkout","dirty"].includes(table.state) ? "action" : ""} ${table.state === "dirty" ? "dirty" : ""}`;
      btn.addEventListener("click", () => onTableTap(table.id));

      let stateLabel = "OPEN";
      let main = `<div class="table-main"><div class="table-avatar">🪑</div><div class="table-copy"><strong>Empty table</strong><span>${state.selectedCustomerId ? "Tap to seat selected customer" : "Select a waiting customer"}</span></div></div>`;
      let chips = "";

      if (table.customer) {
        const c = table.customer;
        const pct = Math.max(0, c.patience / c.maxPatience * 100);
        if (table.state === "seated") stateLabel = "TAKE ORDER";
        if (table.state === "waitingFood") stateLabel = "WAITING FOOD";
        if (table.state === "eating") stateLabel = "EATING";
        if (table.state === "checkout") stateLabel = "PAYMENT";
        main = `<div class="table-main">
          <div class="table-avatar">${c.avatar}</div>
          <div class="table-copy"><strong>${c.name}</strong><span>${tableInstruction(table)}</span>
            <div class="patience-track"><div class="patience-fill" style="width:${pct}%; background:${patienceColor(pct)}"></div></div>
          </div>
        </div>`;
        chips = `<div class="order-chips">${table.order.map((key, i) => `<span class="order-chip ${table.served[i] ? "served" : ""}">${RECIPES[key].emoji} ${RECIPES[key].name}</span>`).join("")}</div>`;
      } else if (table.state === "dirty" || table.state === "cleaning") {
        stateLabel = table.state === "dirty" ? "DIRTY" : "CLEANING";
        main = `<div class="table-main"><div class="table-avatar">🧽</div><div class="table-copy"><strong>${table.state === "dirty" ? "Needs cleaning" : "Wiping down..."}</strong><span>${table.state === "dirty" ? "Tap to clean" : "Almost ready"}</span></div></div>`;
      }

      btn.innerHTML = `
        <div class="table-topline"><span class="table-number">TABLE ${table.id}</span><span class="table-state">${stateLabel}</span></div>
        ${main}
        ${chips}`;
      els.tables.appendChild(btn);
    });
  }

  function tableInstruction(table) {
    if (table.state === "seated") return "Tap to take order";
    if (table.state === "waitingFood") return `Needs ${remainingOrderText(table)}`;
    if (table.state === "eating") return "Eating";
    if (table.state === "checkout") return "Tap to collect payment";
    return "";
  }

  function renderStations() {
    const now = performance.now();
    els.stations.innerHTML = "";
    Object.values(state.stations).forEach(station => {
      const recipe = RECIPES[station.key];
      const btn = document.createElement("button");
      btn.className = `station ${station.state}`;
      btn.addEventListener("click", () => onStationTap(station.key));

      let status = "Tap to start";
      let progress = 0;
      if (station.state === "cooking") {
        progress = Math.min(100, (now - station.startedAt) / (station.readyAt - station.startedAt) * 100);
        status = `${Math.max(0, (station.readyAt - now) / 1000).toFixed(1)}s`;
      } else if (station.state === "ready") {
        progress = 100;
        status = recipe.burnMs ? "READY — collect!" : "READY";
      } else if (station.state === "burned") {
        progress = 100;
        status = "BURNED — toss";
      }

      btn.innerHTML = `
        <div class="station-head"><span class="station-food">${recipe.name}</span><span class="station-emoji">${recipe.emoji}</span></div>
        <div class="station-status">${status}</div>
        <div class="station-progress"><div style="width:${progress}%"></div></div>`;
      els.stations.appendChild(btn);
    });
  }

  function renderTray() {
    if (!state.tray.length) {
      els.tray.innerHTML = `<div class="tray-empty">Nothing ready yet.</div>`;
      return;
    }

    els.tray.innerHTML = "";
    state.tray.forEach(item => {
      const recipe = RECIPES[item.key];
      const btn = document.createElement("button");
      btn.className = `tray-item ${state.selectedTrayId === item.id ? "selected" : ""}`;
      btn.innerHTML = `<span>${recipe.emoji}</span>${recipe.name}`;
      btn.addEventListener("click", () => onTrayTap(item.id));
      els.tray.appendChild(btn);
    });
  }

  function patienceColor(pct) {
    if (pct > 55) return "#67946a";
    if (pct > 25) return "#e0a335";
    return "#b94335";
  }

  els.soundButton.addEventListener("click", () => setSound(!soundOn));
  els.levelButton.addEventListener("click", showLevelPicker);
  els.startButton.addEventListener("click", () => {
    if (state.running) {
      const ok = confirm("Restart this shift?");
      if (!ok) return;
    }
    startLevel(state.levelIndex);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  setSound(soundOn);
  render();
  showIntro();
})();
