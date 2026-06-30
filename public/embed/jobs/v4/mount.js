(() => {
  "use strict";

  const scriptElement = document.currentScript;
  const globalConfig =
    window.IsmiraJobsFeedConfig && typeof window.IsmiraJobsFeedConfig === "object"
      ? window.IsmiraJobsFeedConfig
      : {};

  function readAttribute(name) {
    return scriptElement ? scriptElement.getAttribute(`data-${name}`) || "" : "";
  }

  function normalizeBase(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    try {
      return new URL(raw, window.location.href).toString().replace(/\/+$/, "");
    } catch {
      return raw.replace(/\/+$/, "");
    }
  }

  const scriptOrigin = (() => {
    try {
      return scriptElement && scriptElement.src
        ? new URL(scriptElement.src, window.location.href).origin
        : window.location.origin;
    } catch {
      return window.location.origin;
    }
  })();
  const apiBase =
    normalizeBase(readAttribute("api-base") || globalConfig.apiBase) || scriptOrigin;
  const targetSelector =
    (readAttribute("target") || globalConfig.target || "#ismira-jobs").trim();
  const refreshSeconds = Math.max(
    30,
    Number(readAttribute("refresh-seconds") || globalConfig.refreshSeconds || 60) || 60
  );
  const debug = ["1", "true", "yes"].includes(
    String(readAttribute("debug") || globalConfig.debug || "").toLowerCase()
  );

  function log(...args) {
    if (debug) console.log("[ismira-jobs]", ...args);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function asString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function asStringArray(value) {
    return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
  }

  function safeUrl(value) {
    try {
      const url = new URL(asString(value), window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function iconSvg(kind) {
    const paths = {
      home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/>',
      compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/>',
      meals: '<path d="M7 3v7M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3v18M17 3c-2 2-3 5-3 8h3"/>',
      heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
      trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
      plane: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
      coins: '<circle cx="8" cy="8" r="5"/><path d="M12 6.5A5 5 0 1 1 8.5 12M8 5v6M6.5 6.5h2.25a1.25 1.25 0 0 1 0 2.5H7.25a1.25 1.25 0 0 0 0 2.5H9.5"/>',
      wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a14 14 0 0 1 20 0"/>',
      certificate: '<circle cx="12" cy="8" r="5"/><path d="m8.5 12-1 9 4.5-2 4.5 2-1-9"/>',
      person: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${
      paths[kind] || paths.check
    }</svg>`;
  }

  const benefitIcons = {
    free_accommodation: "home",
    free_accommodations: "home",
    travel_opportunity: "compass",
    free_meals: "meals",
    free_meals_on_board: "meals",
    paid_medical: "heart",
    visa_fee_refunded: "shield",
    safety_certificates_not_needed: "certificate",
    stable_contract: "file",
    career_growth: "trend",
    travel_expenses_covered: "plane",
    bonus_tips: "coins",
    free_wifi: "wifi",
    free_wifi_for_crew: "wifi",
  };

  const fallbackBenefitLabels = {
    free_accommodation: "Free Accommodation",
    free_accommodations: "Free Accommodations",
    travel_opportunity: "Travel Opportunity",
    free_meals: "Free Meals On Board",
    free_meals_on_board: "Free Meals On Board",
    paid_medical: "Paid Medical",
    visa_fee_refunded: "Visa Fee Refunded",
    safety_certificates_not_needed: "Safety Certificates Not Needed",
    stable_contract: "Stable Contract",
    career_growth: "Career Growth",
    travel_expenses_covered: "Travel Expenses Covered",
    bonus_tips: "Bonus / Tips",
    free_wifi: "Free Wi-Fi For Crew",
    free_wifi_for_crew: "Free Wi-Fi For Crew",
  };

  const css = `
    .ijf-root{--ijf-ink:#172033;--ijf-muted:#63728e;--ijf-line:#dfe6ef;--ijf-orange:#ff9f2f;--ijf-cyan:#25c7dc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ijf-ink);width:100%}
    .ijf-toolbar{display:flex;align-items-center;justify-content:space-between;gap:14px;margin:0 0 18px}
    .ijf-search{position:relative;flex:1;max-width:440px}.ijf-search svg{position:absolute;left:15px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:#7b8aa5}.ijf-search input{box-sizing:border-box;width:100%;height:46px;border:1px solid var(--ijf-line);border-radius:999px;background:#fff;padding:0 18px 0 43px;color:var(--ijf-ink);font:inherit;font-size:14px;outline:none;transition:.18s ease}.ijf-search input:focus{border-color:#60cfe2;box-shadow:0 0 0 4px rgba(37,199,220,.13)}
    .ijf-count{font-size:12px;font-weight:700;color:var(--ijf-muted);white-space:nowrap}
    .ijf-list{display:grid;gap:16px}
    .ijf-card{position:relative;display:grid;grid-template-columns:86px minmax(0,1fr) 42px;gap:20px;align-items:start;border:1px solid var(--ijf-line);border-radius:24px;background:#fff;padding:21px 22px;box-shadow:0 2px 3px rgba(15,23,42,.08);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;animation:ijf-in .35s ease both}
    .ijf-card:hover{transform:translateY(-2px);border-color:#cbd7e6;box-shadow:0 15px 34px -24px rgba(15,23,42,.55)}
    .ijf-logo{display:grid;width:82px;height:82px;place-items:center;overflow:hidden;border:1px solid var(--ijf-line);border-radius:50%;background:#fff;color:#60708a;font-size:15px;font-weight:800}.ijf-logo img{width:100%;height:100%;object-fit:contain;padding:10px;box-sizing:border-box}
    .ijf-head{display:flex;align-items:center;gap:10px;min-width:0}.ijf-type{display:inline-flex;flex:none;align-items:center;border-radius:999px;background:linear-gradient(90deg,#ffab3d,#ff8a2f);padding:6px 11px;color:#fff;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 5px 12px -8px #f97316}.ijf-title{margin:0;min-width:0;font-size:20px;line-height:1.18;font-weight:800;letter-spacing:-.015em;color:var(--ijf-ink)}
    .ijf-benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px 22px;margin-top:17px}.ijf-benefit{display:flex;align-items:center;gap:9px;min-width:0;font-size:12px;font-weight:650;color:#20283a}.ijf-benefit-icon{display:grid;width:30px;height:30px;flex:none;place-items:center;border-radius:50%;background:#f1f5f9;color:#172033}.ijf-benefit-icon svg{width:15px;height:15px}.ijf-benefit span:last-child{min-width:0}
    .ijf-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.ijf-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #ffd06f;border-radius:999px;background:#fff7d7;padding:7px 11px;color:#63431c;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 3px 8px -7px #f59e0b}.ijf-pill svg{width:14px;height:14px;color:#f59e0b}.ijf-pill--ship{border-color:#8ce7f0;background:#ddfbff;color:#176173}.ijf-pill--ship svg{color:#0891b2}
    .ijf-go{display:grid;width:40px;height:40px;place-items:center;align-self:center;border-radius:50%;background:#f4f7fa;color:#52617b;transition:.18s ease}.ijf-go svg{width:18px;height:18px}.ijf-card:hover .ijf-go{background:linear-gradient(135deg,#ffb23f,#f472b6);color:#172033;transform:translateX(2px)}
    .ijf-link{position:absolute;inset:0;border-radius:24px}.ijf-link:focus-visible{outline:3px solid rgba(37,199,220,.55);outline-offset:3px}
    .ijf-status{border:1px solid var(--ijf-line);border-radius:20px;background:#fff;padding:28px;text-align:center;color:var(--ijf-muted);font-size:14px}.ijf-status--error{border-color:#fecaca;background:#fff1f2;color:#be123c}
    .ijf-skeleton{height:166px;border:1px solid var(--ijf-line);border-radius:24px;background:linear-gradient(90deg,#f8fafc 25%,#eef2f7 38%,#f8fafc 63%);background-size:400% 100%;animation:ijf-shimmer 1.25s infinite}
    @keyframes ijf-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes ijf-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
    @media(max-width:760px){.ijf-card{grid-template-columns:64px minmax(0,1fr);gap:14px;padding:17px;border-radius:20px}.ijf-logo{width:62px;height:62px}.ijf-head{align-items:flex-start;flex-direction:column;gap:7px}.ijf-title{font-size:17px}.ijf-benefits{grid-template-columns:1fr;margin-top:14px;gap:9px}.ijf-benefit:nth-child(n+5){display:none}.ijf-meta{margin-top:14px}.ijf-go{display:none}.ijf-link{border-radius:20px}.ijf-toolbar{align-items:stretch;flex-direction:column}.ijf-search{max-width:none}.ijf-count{padding-left:5px}}
  `;

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const callback = `__ismira_jobs_${Math.random().toString(36).slice(2)}`;
      const requestUrl = new URL(url);
      requestUrl.searchParams.set("callback", callback);
      const script = document.createElement("script");
      let complete = false;
      const cleanup = () => {
        if (complete) return;
        complete = true;
        delete window[callback];
        script.remove();
        window.clearTimeout(timeout);
      };
      window[callback] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to load jobs."));
      };
      script.async = true;
      script.src = requestUrl.toString();
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Jobs request timed out."));
      }, 12000);
      document.head.appendChild(script);
    });
  }

  async function requestFeed() {
    const url = new URL("/api/jobs/frontpage", apiBase).toString();
    try {
      const response = await fetch(url, { credentials: "omit", cache: "default" });
      if (!response.ok) throw new Error("Unable to load jobs.");
      return await response.json();
    } catch (error) {
      log("Fetch failed, using JSONP fallback", error);
      return jsonp(url);
    }
  }

  function labelForBenefit(key, labels) {
    return asString(labels[key]) || fallbackBenefitLabels[key] || key
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function renderJob(job, labels, index) {
    const name = asString(job.name) || "Job opening";
    const company = asString(job.company);
    const logo = safeUrl(job.company_logo_url);
    const href = safeUrl(job.details_url) || safeUrl(job.application_url) || "#";
    const initial = (company || name).charAt(0).toUpperCase();
    const benefits = asStringArray(job.benefit_tags).slice(0, 9);
    const department = asString(job.department);
    const shipType = asStringArray(job.ship_types)[0] || "";
    const logoHtml = logo
      ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(company)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : escapeHtml(initial);
    const benefitsHtml = benefits
      .map((key) => `<div class="ijf-benefit"><span class="ijf-benefit-icon">${iconSvg(benefitIcons[key] || "check")}</span><span>${escapeHtml(labelForBenefit(key, labels))}</span></div>`)
      .join("");
    const metaHtml = [
      department
        ? `<span class="ijf-pill">${iconSvg("person")} ${escapeHtml(department)}</span>`
        : "",
      shipType
        ? `<span class="ijf-pill ijf-pill--ship">${iconSvg("compass")} ${escapeHtml(shipType.replaceAll("_", " "))}</span>`
        : "",
    ].join("");

    return `<article class="ijf-card" style="animation-delay:${Math.min(index * 35, 245)}ms">
      <div class="ijf-logo">${logoHtml}</div>
      <div>
        <div class="ijf-head">
          <span class="ijf-type">${escapeHtml(job.priority_label || "Opening")}</span>
          <h3 class="ijf-title">${escapeHtml(name)}</h3>
        </div>
        ${benefitsHtml ? `<div class="ijf-benefits">${benefitsHtml}</div>` : ""}
        ${metaHtml ? `<div class="ijf-meta">${metaHtml}</div>` : ""}
      </div>
      <span class="ijf-go">${iconSvg("arrow")}</span>
      <a class="ijf-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="View ${escapeHtml(name)}"></a>
    </article>`;
  }

  function mount(target) {
    if (!(target instanceof HTMLElement) || target.dataset.ismiraJobsMounted === "1") return;
    target.dataset.ismiraJobsMounted = "1";
    target.innerHTML = `<div class="ijf-root"><style>${css}</style><div class="ijf-toolbar"><label class="ijf-search">${iconSvg("search")}<input type="search" placeholder="Search jobs" aria-label="Search jobs"></label><div class="ijf-count" data-role="count"></div></div><div class="ijf-list" data-role="list"><div class="ijf-skeleton"></div><div class="ijf-skeleton"></div></div></div>`;

    const state = { jobs: [], filtered: [], labels: {}, loading: true, error: "" };
    const listElement = target.querySelector('[data-role="list"]');
    const countElement = target.querySelector('[data-role="count"]');
    const searchElement = target.querySelector('input[type="search"]');

    function render() {
      if (!listElement) return;
      if (state.loading) {
        listElement.innerHTML = '<div class="ijf-skeleton"></div><div class="ijf-skeleton"></div>';
        return;
      }
      if (state.error) {
        listElement.innerHTML = `<div class="ijf-status ijf-status--error">${escapeHtml(state.error)}</div>`;
        return;
      }
      if (state.filtered.length === 0) {
        listElement.innerHTML = '<div class="ijf-status">No matching jobs are available right now.</div>';
      } else {
        listElement.innerHTML = state.filtered
          .map((job, index) => renderJob(job, state.labels, index))
          .join("");
      }
      if (countElement) {
        countElement.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "job" : "jobs"}`;
      }
    }

    function applyFilter() {
      const query = asString(searchElement && searchElement.value).toLowerCase();
      state.filtered = !query
        ? state.jobs
        : state.jobs.filter((job) =>
            [job.name, job.company, job.department, job.priority_label]
              .map(asString)
              .join(" ")
              .toLowerCase()
              .includes(query)
          );
      render();
    }

    async function load() {
      state.loading = state.jobs.length === 0;
      state.error = "";
      render();
      try {
        const payload = await requestFeed();
        state.jobs = payload && Array.isArray(payload.jobs) ? payload.jobs : [];
        state.labels = payload && payload.benefitLabels && typeof payload.benefitLabels === "object"
          ? payload.benefitLabels
          : {};
        applyFilter();
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Unable to load jobs.";
      } finally {
        state.loading = false;
        render();
      }
    }

    if (searchElement) searchElement.addEventListener("input", applyFilter);
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, refreshSeconds * 1000);
    window.addEventListener("pagehide", () => window.clearInterval(interval), { once: true });
  }

  function start() {
    const targets = Array.from(document.querySelectorAll(targetSelector));
    if (targets.length === 0) {
      log(`No widget target found for ${targetSelector}`);
      return;
    }
    targets.forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
