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
