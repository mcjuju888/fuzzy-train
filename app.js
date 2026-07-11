(function () {
  "use strict";

  const STORAGE_KEY = "money-tracker-state-v1";

  const defaultState = {
    debit: 0,
    cash: 0,
    amex: [],   // { id, desc, amount, pending }
    td: [],     // { id, desc, amount, pending }
    owe: [],    // { id, name, amount, note }   -- who I owe
    owed: []    // { id, name, amount, note, photo } -- who owes me
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

  function fmt(n) {
    const num = Number(n) || 0;
    const sign = num < 0 ? "-" : "";
    return sign + "$" + Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function sum(list) {
    return list.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  function sumPending(list) {
    return list.filter(i => i.pending).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  // ---------- Rendering ----------

  function renderChargeList(listEl, items, key) {
    listEl.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");

      const main = document.createElement("div");
      main.className = "item-main";
      const desc = document.createElement("span");
      desc.className = "item-desc";
      desc.textContent = item.desc;
      main.appendChild(desc);

      const right = document.createElement("div");
      right.className = "item-right";

      if (item.pending) {
        const tag = document.createElement("span");
        tag.className = "pending-tag";
        tag.textContent = "pending";
        right.appendChild(tag);
      }

      const amt = document.createElement("span");
      amt.className = "item-amount";
      amt.textContent = fmt(item.amount);
      right.appendChild(amt);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove";
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
        img.title = "Click to view evidence";
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
      removeBtn.title = "Remove";
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

    const debit = Number(state.debit) || 0;
    const cash = Number(state.cash) || 0;
    const trueBalance = debit + cash + owedTotal - amexTotal - tdTotal - oweTotal;

    const trueBalanceEl = document.getElementById("trueBalance");
    trueBalanceEl.textContent = fmt(trueBalance);
    trueBalanceEl.classList.toggle("negative", trueBalance < 0);
    trueBalanceEl.classList.toggle("positive", trueBalance >= 0);
  }

  // ---------- Inputs: debit / cash ----------

  document.getElementById("debitInput").addEventListener("input", e => {
    state.debit = e.target.value === "" ? 0 : Number(e.target.value);
    saveState();
    renderAll();
  });

  document.getElementById("cashInput").addEventListener("input", e => {
    state.cash = e.target.value === "" ? 0 : Number(e.target.value);
    saveState();
    renderAll();
  });

  // ---------- Add forms: Amex / TD ----------

  document.querySelectorAll(".add-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const target = form.dataset.target; // "amex" | "td"
      const desc = form.querySelector(".desc").value.trim();
      const amount = Number(form.querySelector(".amount").value);
      const pending = form.querySelector(".pending").checked;
      if (!desc || isNaN(amount)) return;

      state[target].push({ id: uid(), desc, amount, pending });
      saveState();
      form.reset();
      renderAll();
    });
  });

  // ---------- Add forms: Owe / Owed ----------

  document.querySelectorAll(".add-person-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const target = form.dataset.target; // "owe" | "owed"
      const name = form.querySelector(".name").value.trim();
      const amount = Number(form.querySelector(".amount").value);
      const noteEl = form.querySelector(".note");
      const note = noteEl ? noteEl.value.trim() : "";
      if (!name || isNaN(amount)) return;

      const entry = { id: uid(), name, amount, note };

      const photoInput = form.querySelector(".photo");
      if (photoInput && photoInput.files && photoInput.files[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          entry.photo = reader.result;
          state[target].push(entry);
          saveState();
          form.reset();
          renderAll();
        };
        reader.readAsDataURL(photoInput.files[0]);
      } else {
        state[target].push(entry);
        saveState();
        form.reset();
        renderAll();
      }
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
    const amexTotal = sum(state.amex);
    const tdTotal = sum(state.td);
    const oweTotal = sum(state.owe);
    const owedTotal = sum(state.owed);
    const debit = Number(state.debit) || 0;
    const cash = Number(state.cash) || 0;
    const trueBalance = debit + cash + owedTotal - amexTotal - tdTotal - oweTotal;

    state.debit = trueBalance;
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
    const colors = ["#6c8cff", "#3ddc97", "#ffb84d", "#ff6b6b", "#e7ebf5"];
    const count = 80;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (2 + Math.random() * 2) + "s";
      piece.style.animationDelay = (Math.random() * 0.5) + "s";
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 5000);
    }
  }

  // ---------- Init ----------

  renderAll();
})();
