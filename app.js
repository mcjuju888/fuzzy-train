(function () {
  "use strict";

  const STORAGE_KEY = "money-tracker-state-v1";

  const defaultState = {
    debit: 0,
    cash: 0,
    amex: [],   // { id, amount, pending }
    td: [],     // { id, amount, pending }
    owe: [],    // { id, name, amount, note }
    owed: [],   // { id, name, amount, note, photo }
    tuition: 0,
    piggy: 0
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(defaultState), parsed);
    } catch (e) {
      console.warn("Failed to load saved data, starting fresh.", e);
      return structuredClone(defaultState);
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function fmt(n) {
    const num = round2(n);
    const sign = num < 0 ? "-" : "";
    return sign + "$" + Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function sum(list) {
    return round2(list.reduce((acc, item) => acc + (Number(item.amount) || 0), 0));
  }

  function sumPending(list) {
    return round2(list.filter(i => i.pending).reduce((acc, item) => acc + (Number(item.amount) || 0), 0));
  }

  // ---------- Rendering ----------

  function renderChargeList(listEl, items, key) {
    listEl.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");

      const main = document.createElement("div");
      main.className = "item-main";
      const amtMain = document.createElement("span");
      amtMain.className = "item-desc";
      amtMain.textContent = fmt(item.amount);
      main.appendChild(amtMain);

      const right = document.createElement("div");
      right.className = "item-right";

      if (item.pending) {
        const tag = document.createElement("span");
        tag.className = "pending-tag";
        tag.textContent = "pending";
        right.appendChild(tag);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "remove";
      removeBtn.addEventListener("click", () => {
        state[key] = state[key].filter(i => i.id !== item.id);
        saveState();
        renderAll();
      });
      right.appendChild(removeBtn);

      li.appendChild(main);
      li.appendChild(right);
      listEl.appendChild(li);
    });
  }

  function renderPersonList(listEl, items, key) {
    listEl.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");

      const main = document.createElement("div");
      main.className = "item-main";
      const nameEl = document.createElement("span");
      nameEl.className = "item-desc";
      nameEl.textContent = item.name;
      main.appendChild(nameEl);
      if (item.note) {
        const noteEl = document.createElement("span");
        noteEl.className = "item-note";
        noteEl.textContent = item.note;
        main.appendChild(noteEl);
      }

      const right = document.createElement("div");
      right.className = "item-right";

      if (item.photo) {
        const img = document.createElement("img");
        img.src = item.photo;
        img.className = "thumb";
        img.title = "the evidence 📸";
        img.addEventListener("click", () => openLightbox(item.photo));
        right.appendChild(img);
      }

      const amt = document.createElement("span");
      amt.className = "item-amount";
      amt.textContent = fmt(item.amount);
      right.appendChild(amt);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "remove";
      removeBtn.addEventListener("click", () => {
        state[key] = state[key].filter(i => i.id !== item.id);
        saveState();
        renderAll();
      });
      right.appendChild(removeBtn);

      li.appendChild(main);
      li.appendChild(right);
      listEl.appendChild(li);
    });
  }

  function renderAll() {
    document.getElementById("debitInput").value = state.debit || "";
    document.getElementById("cashInput").value = state.cash || "";

    const amexTotal = sum(state.amex);
    const amexPending = sumPending(state.amex);
    document.getElementById("amexTotal").textContent = fmt(amexTotal);
    document.getElementById("amexPending").textContent = fmt(amexPending);
    renderChargeList(document.getElementById("amexList"), state.amex, "amex");

    const tdTotal = sum(state.td);
    const tdPending = sumPending(state.td);
    document.getElementById("tdTotal").textContent = fmt(tdTotal);
    document.getElementById("tdPending").textContent = fmt(tdPending);
    renderChargeList(document.getElementById("tdList"), state.td, "td");

    const oweTotal = sum(state.owe);
    document.getElementById("oweTotal").textContent = fmt(oweTotal);
    renderPersonList(document.getElementById("oweList"), state.owe, "owe");

    const owedTotal = sum(state.owed);
    document.getElementById("owedTotal").textContent = fmt(owedTotal);
    renderPersonList(document.getElementById("owedList"), state.owed, "owed");

    updateTotalsOnly();
  }

  function computeTrueBalance() {
    const debit = round2(state.debit);
    const cash = round2(state.cash);
    return round2(debit + cash + sum(state.owed) - sum(state.amex) - sum(state.td) - sum(state.owe));
  }

  // same thing but pretending the iou's don't exist
  function computeSoloBalance() {
    const debit = round2(state.debit);
    const cash = round2(state.cash);
    return round2(debit + cash - sum(state.amex) - sum(state.td));
  }

  // ---------- Inputs: debit / cash ----------

  document.getElementById("debitInput").addEventListener("change", e => {
    state.debit = round2(e.target.value);
    saveState();
    renderAll();
  });
  document.getElementById("debitInput").addEventListener("input", e => {
    state.debit = e.target.value === "" ? 0 : Number(e.target.value);
    saveState();
    updateTotalsOnly();
  });

  document.getElementById("cashInput").addEventListener("change", e => {
    state.cash = round2(e.target.value);
    saveState();
    renderAll();
  });
  document.getElementById("cashInput").addEventListener("input", e => {
    state.cash = e.target.value === "" ? 0 : Number(e.target.value);
    saveState();
    updateTotalsOnly();
  });

  // update both balances while typing, without re-rendering the input being typed in
  function updateTotalsOnly() {
    const trueBalance = computeTrueBalance();
    const trueBalanceEl = document.getElementById("trueBalance");
    trueBalanceEl.textContent = fmt(trueBalance);
    trueBalanceEl.classList.toggle("negative", trueBalance < 0);
    trueBalanceEl.classList.toggle("positive", trueBalance >= 0);

    const solo = computeSoloBalance();
    const soloEl = document.getElementById("soloBalance");
    soloEl.textContent = fmt(solo);
    soloEl.classList.toggle("negative", solo < 0);
    soloEl.classList.toggle("positive", solo >= 0);
  }

  // ---------- Add forms: Amex / TD ----------

  document.querySelectorAll(".add-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const target = form.dataset.target; // "amex" | "td"
      const amountInput = form.querySelector(".amount");
      const pendingToggle = form.querySelector(".pending");
      const amount = round2(amountInput.value);
      if (amountInput.value === "" || isNaN(amount)) return;

      state[target].push({ id: uid(), amount, pending: pendingToggle.checked });
      saveState();

      // keep the pending toggle where it is so you can add a bunch in a row
      amountInput.value = "";
      amountInput.focus();
      renderAll();
    });
  });

  // ---------- Add forms: Owe / Owed ----------

  document.querySelectorAll(".add-person-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const target = form.dataset.target; // "owe" | "owed"
      const name = form.querySelector(".name").value.trim();
      const amountInput = form.querySelector(".amount");
      const amount = round2(amountInput.value);
      const noteEl = form.querySelector(".note");
      const note = noteEl ? noteEl.value.trim() : "";
      if (!name || amountInput.value === "" || isNaN(amount)) return;

      const entry = { id: uid(), name, amount, note };

      const photoInput = form.querySelector(".photo");
      const finish = () => {
        state[target].push(entry);
        saveState();
        form.reset();
        const photoLabel = form.querySelector(".photo-label");
        if (photoLabel) photoLabel.classList.remove("has-photo");
        renderAll();
      };

      if (photoInput && photoInput.files && photoInput.files[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          entry.photo = reader.result;
          finish();
        };
        reader.readAsDataURL(photoInput.files[0]);
      } else {
        finish();
      }
    });
  });

  // little visual cue when a photo is attached
  document.querySelectorAll(".photo").forEach(input => {
    input.addEventListener("change", () => {
      const label = input.closest(".photo-label");
      if (label) label.classList.toggle("has-photo", input.files && input.files.length > 0);
    });
  });

  // ---------- Lightbox for evidence photos ----------

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox-overlay";
  lightbox.innerHTML = '<img id="lightboxImg" src="">';
  document.body.appendChild(lightbox);
  lightbox.addEventListener("click", () => lightbox.classList.remove("show"));

  function openLightbox(src) {
    document.getElementById("lightboxImg").src = src;
    lightbox.classList.add("show");
  }

  // ---------- Settle up ----------

  const settleModal = document.getElementById("settleModal");
  document.getElementById("settleUpBtn").addEventListener("click", () => {
    settleModal.classList.add("show");
  });
  document.getElementById("cancelSettle").addEventListener("click", () => {
    settleModal.classList.remove("show");
  });
  document.getElementById("confirmSettle").addEventListener("click", () => {
    state.debit = computeTrueBalance();
    state.amex = [];
    state.td = [];
    saveState();
    renderAll();

    settleModal.classList.remove("show");
    celebrate();
  });

  // ---------- Celebration ----------

  const celebrateOverlay = document.getElementById("celebrateOverlay");
  document.getElementById("closeCelebrate").addEventListener("click", () => {
    celebrateOverlay.classList.remove("show");
  });

  function celebrate() {
    celebrateOverlay.classList.add("show");
    launchConfetti();
  }

  function launchConfetti() {
    const layer = document.getElementById("confettiLayer");
    const emoji = ["💗", "🎀", "✨", "💸", "💖", "🩷"];
    const count = 60;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.textContent = emoji[Math.floor(Math.random() * emoji.length)];
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.fontSize = (14 + Math.random() * 14) + "px";
      piece.style.animationDuration = (2.5 + Math.random() * 2.5) + "s";
      piece.style.animationDelay = (Math.random() * 0.6) + "s";
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 6000);
    }
  }

  // ---------- Background hearts n bows ----------

  function scatterDoodles() {
    const layer = document.getElementById("bgDoodles");
    const emoji = ["🎀", "💗", "🩷", "🎀", "💕", "🎀", "💖"];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const d = document.createElement("span");
      d.className = "doodle";
      d.textContent = emoji[Math.floor(Math.random() * emoji.length)];
      d.style.left = Math.random() * 96 + "vw";
      d.style.top = Math.random() * 96 + "vh";
      d.style.fontSize = (16 + Math.random() * 26) + "px";
      d.style.animationDelay = (Math.random() * 4) + "s";
      d.style.animationDuration = (5 + Math.random() * 4) + "s";
      layer.appendChild(d);
    }
  }

  // ---------- Password lock ----------

  const PASSWORD = "ilovejai123";
  const lockOverlay = document.getElementById("lockOverlay");
  const lockForm = document.getElementById("lockForm");
  const passwordInput = document.getElementById("passwordInput");
  const lockError = document.getElementById("lockError");
  const lockBox = document.querySelector(".lock-box");

  function setLocked(locked) {
    document.body.classList.toggle("locked", locked);
    lockOverlay.classList.toggle("show", locked);
    if (locked) passwordInput.focus();
  }

  // stays unlocked for this tab; closing the tab locks it again
  if (sessionStorage.getItem("money-unlocked") === "1") {
    setLocked(false);
  } else {
    setLocked(true);
  }

  lockForm.addEventListener("submit", e => {
    e.preventDefault();
    if (passwordInput.value === PASSWORD) {
      sessionStorage.setItem("money-unlocked", "1");
      lockError.classList.remove("show");
      setLocked(false);
    } else {
      lockError.classList.add("show");
      passwordInput.value = "";
      lockBox.classList.remove("shake");
      void lockBox.offsetWidth; // restart the shake animation
      lockBox.classList.add("shake");
    }
  });

  // ---------- The evil zone ----------

  const evilModals = [
    document.getElementById("evilModal1"),
    document.getElementById("evilModal2"),
    document.getElementById("evilModal3")
  ];
  const evilScreen = document.getElementById("evilScreen");
  const evilAmountEl = document.getElementById("evilAmount");
  const tuitionInput = document.getElementById("tuitionInput");

  function renderEvil() {
    evilAmountEl.textContent = fmt(state.tuition);
  }

  document.getElementById("evilBtn").addEventListener("click", () => {
    evilModals[0].classList.add("show");
  });

  evilModals.forEach((modal, i) => {
    modal.querySelector(".evil-no").addEventListener("click", () => {
      modal.classList.remove("show");
    });
    modal.querySelector(".evil-yes").addEventListener("click", () => {
      modal.classList.remove("show");
      if (i < evilModals.length - 1) {
        evilModals[i + 1].classList.add("show");
      } else {
        tuitionInput.value = state.tuition || "";
        renderEvil();
        evilScreen.classList.add("show");
      }
    });
  });

  tuitionInput.addEventListener("input", e => {
    state.tuition = e.target.value === "" ? 0 : round2(e.target.value);
    saveState();
    renderEvil();
  });

  document.getElementById("escapeEvil").addEventListener("click", () => {
    evilScreen.classList.remove("show");
  });

  // ---------- Piggy bank buddy ----------

  const piggyBtn = document.getElementById("piggyBtn");
  const piggyCount = document.getElementById("piggyCount");

  function renderPiggy() {
    const n = state.piggy || 0;
    piggyCount.textContent = n === 0 ? "feed the piggy ♡" : "coins fed: " + n;
  }

  piggyBtn.addEventListener("click", () => {
    state.piggy = (state.piggy || 0) + 1;
    saveState();
    renderPiggy();

    piggyBtn.classList.remove("nom");
    void piggyBtn.offsetWidth;
    piggyBtn.classList.add("nom");

    const rect = piggyBtn.getBoundingClientRect();
    const coin = document.createElement("span");
    coin.className = "piggy-coin";
    coin.textContent = Math.random() < 0.15 ? "💖" : "🪙";
    coin.style.left = (rect.left + rect.width / 2 - 8 + (Math.random() * 20 - 10)) + "px";
    coin.style.top = (rect.top - 6) + "px";
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 1000);
  });

  // ---------- dug the dog ----------

  const dug = document.createElement("div");
  dug.id = "dug";
  dug.textContent = "🐕";
  dug.title = "dug!! (pet him)";
  document.body.appendChild(dug);

  const DOG_SIZE = 30;
  const DOG_SPEED = 55; // px per second
  let dogX = 0, dogY = 0;
  let dogPaused = false;

  function cardRects() {
    return [...document.querySelectorAll(".grid .card")].map(el => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left + window.scrollX,
        right: r.right + window.scrollX,
        top: r.top + window.scrollY
      };
    });
  }

  function placeDog(x, y, facingRight) {
    dogX = x;
    dogY = y;
    const bob = Math.sin(x / 9) * 2;
    dug.style.transform = "translate(" + x + "px," + (y + bob) + "px)" + (facingRight ? " scaleX(-1)" : "");
  }

  function walkTo(tx, ty, done) {
    const sx = dogX, sy = dogY;
    const dist = Math.hypot(tx - sx, ty - sy);
    const dur = Math.max(dist / DOG_SPEED * 1000, 250);
    const facingRight = tx > sx;
    let start = null;

    function step(ts) {
      if (dogPaused) { start = null; requestAnimationFrame(step); return; }
      if (start === null) start = ts - 16;
      const t = Math.min((ts - start) / dur, 1);
      placeDog(sx + (tx - sx) * t, sy + (ty - sy) * t, facingRight);
      if (t < 1) requestAnimationFrame(step);
      else done();
    }
    requestAnimationFrame(step);
  }

  function nextStroll() {
    const rects = cardRects();
    if (!rects.length) { setTimeout(nextStroll, 2000); return; }
    const card = rects[Math.floor(Math.random() * rects.length)];
    const y = card.top - DOG_SIZE + 4;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? card.left : card.right - DOG_SIZE;
    const endX = fromLeft ? card.right - DOG_SIZE : card.left;

    // amble over to the card's edge, walk across its roof, sniff around, repeat
    walkTo(startX, y, () => {
      walkTo(endX, y, () => {
        setTimeout(nextStroll, 800 + Math.random() * 2500);
      });
    });
  }

  const dogPhrases = ["woof!!", "hi kayla ♡", "i have just met you and i love you", "squirrel?!", "borf", "pay off ur cards!!"];

  dug.addEventListener("click", () => {
    dogPaused = true;

    const bubble = document.createElement("div");
    bubble.className = "dug-bubble";
    bubble.textContent = dogPhrases[Math.floor(Math.random() * dogPhrases.length)];
    bubble.style.left = (dogX - 10) + "px";
    bubble.style.top = (dogY - 26) + "px";
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1200);

    for (let i = 0; i < 4; i++) {
      const h = document.createElement("span");
      h.className = "dug-heart";
      h.textContent = "💗";
      h.style.left = (dogX + Math.random() * 30 - 5) + "px";
      h.style.top = (dogY - Math.random() * 8) + "px";
      h.style.animationDelay = (Math.random() * 0.25) + "s";
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    }

    setTimeout(() => { dogPaused = false; }, 1200);
  });

  // ---------- Init ----------

  scatterDoodles();
  renderAll();
  renderEvil();
  renderPiggy();

  // start the dog off the first card once layout settles
  setTimeout(() => {
    const rects = cardRects();
    if (rects.length) placeDog(rects[0].left, rects[0].top - DOG_SIZE + 4, true);
    nextStroll();
  }, 600);
})();
