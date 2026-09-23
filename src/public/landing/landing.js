(() => {
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const chapterEls = Array.from(document.querySelectorAll("[data-chapter]"));
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const menuBtn = document.querySelector("[data-nav-menu]");
  const popover = document.querySelector("[data-nav-popover]");

  function setChapterStep(chapter, step) {
    const phones = document.querySelectorAll(
      `.phone[data-chapter-phone="${chapter}"]`,
    );
    phones.forEach((phone) => {
      phone.dataset.scene = chapter;
      phone.dataset.step = String(step);
    });

    const steps = document.querySelectorAll(
      `[data-chapter="${chapter}"] .step[data-step]`,
    );
    steps.forEach((el) => {
      const n = Number(el.getAttribute("data-step"));
      el.classList.toggle("is-active", n === step);
    });
  }

  function syncNav(activeId) {
    navLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      link.classList.toggle("is-active", href === `#${activeId}`);
    });
  }

  // Sticky chapter step observer
  chapterEls.forEach((chapter) => {
    const id = chapter.getAttribute("data-chapter");
    if (!id) return;

    const steps = Array.from(chapter.querySelectorAll(".step[data-step]"));
    if (steps.length === 0) return;

    if (reduced) {
      setChapterStep(id, steps.length - 1);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const step = Number(entry.target.getAttribute("data-step"));
          if (Number.isFinite(step)) setChapterStep(id, step);
        });
      },
      {
        root: null,
        rootMargin: "-35% 0px -45% 0px",
        threshold: 0.2,
      },
    );

    steps.forEach((step) => io.observe(step));
    setChapterStep(id, 0);
  });

  // Section nav highlight
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        if (id) syncNav(id);
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0.1 },
  );

  ["swipe", "nearby", "offers", "chat"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) sectionObserver.observe(el);
  });

  // Replay buttons
  document.querySelectorAll("[data-replay]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chapter = btn.getAttribute("data-replay");
      if (!chapter) return;
      setChapterStep(chapter, 0);
      const first = document.querySelector(
        `[data-chapter="${chapter}"] .step[data-step="0"]`,
      );
      if (first) {
        first.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }
      if (reduced) return;

      const max = Number(btn.getAttribute("data-replay-max") || "3");
      let step = 0;
      const timer = window.setInterval(() => {
        step += 1;
        if (step > max) {
          window.clearInterval(timer);
          return;
        }
        setChapterStep(chapter, step);
      }, 900);
    });
  });

  // Hero phone loop
  const heroPhone = document.querySelector(".phone--hero");
  if (heroPhone) {
    if (reduced) {
      heroPhone.dataset.loop = "offer";
      heroPhone.dataset.scene = "swipe";
      heroPhone.dataset.step = "3";
    } else {
      const sequence = ["idle", "idle", "like", "offer", "idle"];
      let i = 0;
      heroPhone.dataset.loop = "idle";
      heroPhone.dataset.scene = "swipe";
      heroPhone.dataset.step = "0";

      window.setInterval(() => {
        i = (i + 1) % sequence.length;
        const state = sequence[i];
        heroPhone.dataset.loop = state;
        if (state === "like") {
          heroPhone.dataset.step = "2";
        } else if (state === "offer") {
          heroPhone.dataset.step = "3";
        } else {
          heroPhone.dataset.step = "0";
        }
      }, 2400);
    }
  }

  // Mobile nav popover
  if (menuBtn && popover) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.toggle("is-open");
    });
    document.addEventListener("click", () => {
      popover.classList.remove("is-open");
    });
    popover.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => popover.classList.remove("is-open"));
    });
  }

  // Background mosaic of the most swiped and viewed listings.
  const mosaicRoot = document.querySelector("[data-listing-mosaic]");
  if (mosaicRoot) {
    const SWAP_MS = 3200;
    let pool = [];
    let tiles = [];
    let layoutKey = "";

    function layoutSpec() {
      if (window.innerWidth < 720) {
        return {
          key: "narrow",
          cols: 4,
          rows: 7,
          larges: [
            [0, 0],
            [2, 0],
            [0, 3],
            [2, 3],
            [1, 5],
          ],
        };
      }
      return {
        key: "wide",
        cols: 8,
        rows: 6,
        larges: [
          [0, 0],
          [3, 0],
          [6, 1],
          [1, 2],
          [4, 3],
          [0, 4],
          [6, 4],
        ],
      };
    }

    function cellsFor(spec) {
      const taken = Array.from({ length: spec.rows }, () => Array(spec.cols).fill(false));
      const placed = [];

      function free(c, r, w, h) {
        if (c < 0 || r < 0 || c + w > spec.cols || r + h > spec.rows) return false;
        for (let y = r; y < r + h; y += 1) {
          for (let x = c; x < c + w; x += 1) {
            if (taken[y][x]) return false;
          }
        }
        return true;
      }

      function take(c, r, w, h) {
        for (let y = r; y < r + h; y += 1) {
          for (let x = c; x < c + w; x += 1) taken[y][x] = true;
        }
        placed.push({ c, r, w, h });
      }

      spec.larges.forEach(([c, r]) => {
        if (free(c, r, 2, 2)) take(c, r, 2, 2);
      });
      for (let r = 0; r < spec.rows; r += 1) {
        for (let c = 0; c < spec.cols; c += 1) {
          if (!taken[r][c]) take(c, r, 1, 1);
        }
      }
      return placed;
    }

    function usedIds(except) {
      const ids = new Set();
      tiles.forEach((tile) => {
        if (tile === except) return;
        const id = tile.pendingId || (tile.item && tile.item.id);
        if (id) ids.add(id);
      });
      return ids;
    }

    function pickSpare(except) {
      const used = usedIds(except);
      const avoid = except && (except.pendingId || (except.item && except.item.id));
      let choices = pool.filter((item) => !used.has(item.id) && item.id !== avoid);
      if (!choices.length) {
        choices = pool.filter((item) => item.id !== avoid);
      }
      if (!choices.length) return null;
      return choices[Math.floor(Math.random() * choices.length)];
    }

    function nextInOrder(except) {
      const used = usedIds(except);
      const fresh = pool.find((item) => !used.has(item.id));
      if (fresh) return fresh;
      return pickSpare(except);
    }

    function show(tile, item) {
      if (!item) return;
      if (tile.item && tile.item.id === item.id) return;
      tile.pendingId = item.id;
      const incoming = tile.front.classList.contains("is-shown") ? tile.back : tile.front;
      const outgoing = incoming === tile.front ? tile.back : tile.front;
      incoming.alt = "";
      incoming.referrerPolicy = "no-referrer";
      incoming.onload = () => {
        if (tile.pendingId !== item.id) return;
        incoming.classList.add("is-shown");
        outgoing.classList.remove("is-shown");
        tile.item = item;
      };
      incoming.onerror = () => {
        if (tile.pendingId !== item.id) return;
        incoming.onerror = null;
        const next = pickSpare(tile);
        if (next && next.id !== item.id) show(tile, next);
      };
      if (incoming.src === item.imageUrl && incoming.complete && incoming.naturalWidth > 0) {
        incoming.onload();
        return;
      }
      incoming.src = item.imageUrl;
    }

    function fillEmpty() {
      tiles.forEach((tile) => {
        if (tile.item) return;
        if (tile.pendingId && pool.some((item) => item.id === tile.pendingId)) return;
        const item = nextInOrder(tile);
        if (item) show(tile, item);
      });
    }

    function buildTiles(spec) {
      mosaicRoot.replaceChildren();
      mosaicRoot.style.gridTemplateColumns = `repeat(${spec.cols}, minmax(0, 1fr))`;
      mosaicRoot.style.gridTemplateRows = `repeat(${spec.rows}, minmax(0, 1fr))`;
      tiles = cellsFor(spec).map((cell) => {
        const el = document.createElement("div");
        el.className = cell.w > 1 ? "bg-tile bg-tile--lg" : "bg-tile";
        el.style.gridColumn = `${cell.c + 1} / span ${cell.w}`;
        el.style.gridRow = `${cell.r + 1} / span ${cell.h}`;
        const front = document.createElement("img");
        const back = document.createElement("img");
        front.alt = "";
        back.alt = "";
        el.append(front, back);
        mosaicRoot.append(el);
        return { el, front, back, item: null };
      });
      layoutKey = spec.key;
      fillEmpty();
      if (pool.length) mosaicRoot.classList.add("is-ready");
    }

    function applyPool(items) {
      pool = Array.isArray(items) ? items.filter((item) => item && item.id && item.imageUrl) : [];
      const live = new Set(pool.map((item) => item.id));
      tiles.forEach((tile) => {
        const id = tile.item && tile.item.id;
        if (id && !live.has(id)) {
          tile.item = null;
          tile.pendingId = null;
        }
      });
      if (!tiles.length || layoutKey !== layoutSpec().key) {
        buildTiles(layoutSpec());
        return;
      }
      fillEmpty();
      if (pool.length) mosaicRoot.classList.add("is-ready");
    }

    async function refresh() {
      try {
        const res = await fetch("/api/listings/spotlight", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const body = await res.json();
        applyPool(body.items);
      } catch {
        /* Keep the gradient if the listing API is unreachable. */
      }
    }

    function swapOne() {
      if (pool.length < 2 || tiles.length === 0) return;
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      const next = pickSpare(tile);
      if (next) show(tile, next);
    }

    refresh();
    if (!reduced) window.setInterval(swapOne, SWAP_MS);

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const spec = layoutSpec();
        if (spec.key !== layoutKey) buildTiles(spec);
      }, 150);
    });
  }

  // Optional: light drag nudge on swipe front card
  document.querySelectorAll(".phone[data-chapter-phone='swipe'] .card--front").forEach((card) => {
    let startX = null;
    card.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener("pointerup", (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      const phone = card.closest(".phone");
      if (!phone || phone.dataset.scene !== "swipe") return;
      if (dx > 40) setChapterStep("swipe", 2);
      else if (dx < -40) setChapterStep("swipe", 1);
    });
  });
})();
