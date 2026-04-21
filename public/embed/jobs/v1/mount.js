(() => {
  function resolveScriptElement() {
    const current = document.currentScript;
    if (current instanceof HTMLScriptElement) return current;
    const scripts = Array.from(document.getElementsByTagName("script"));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      const src = s && typeof s.src === "string" ? s.src : "";
      if (!src) continue;
      if (src.includes("/embed/jobs/v1/mount.js")) return s;
      if (src.endsWith("mount.js") && src.includes("/embed/jobs/")) return s;
    }
    return null;
  }

  const scriptEl = resolveScriptElement();
  const scriptUrl = (() => {
    try {
      const src = scriptEl && scriptEl.src ? scriptEl.src : "";
      if (src) return new URL(src, window.location.href);
    } catch {
      // ignore
    }
    return new URL(window.location.href);
  })();

  function normalizeBase(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    try {
      return new URL(raw, window.location.href).toString().replace(/\/+$/, "");
    } catch {
      return raw.replace(/\/+$/, "");
    }
  }

  function readDataAttribute(element, name) {
    if (!element) return "";
    const direct = element.getAttribute(`data-${name}`) || "";
    if (direct) return direct;
    const wanted = `data-${name}`;
    const attrs = element.attributes ? Array.from(element.attributes) : [];
    for (const attr of attrs) {
      const normalized = String(attr.name).replace(/[‐‑‒–—−]/g, "-");
      if (normalized === wanted) return attr.value || "";
    }
    return "";
  }

  const apiBase =
    normalizeBase(readDataAttribute(scriptEl, "api-base")) || scriptUrl.origin;
  const targetSelector = readDataAttribute(scriptEl, "target").trim();

  function asString(value) {
    return typeof value === "string" ? value : "";
  }

  function escapeHtml(input) {
    return String(input ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function containsHtml(value) {
    return /<\/?[a-z][\s\S]*>/i.test(value);
  }

  function sanitizeHtml(input) {
    if (!input || !String(input).trim()) return "";
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(String(input), "text/html");

      const blockedTags = new Set([
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "link",
        "meta",
        "base",
        "form",
        "input",
        "button",
        "textarea",
        "select",
        "option",
      ]);

      const removeNodes = Array.from(
        doc.querySelectorAll(Array.from(blockedTags).join(","))
      );
      removeNodes.forEach((node) => node.remove());

      const elements = Array.from(doc.body.querySelectorAll("*"));
      elements.forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          const value = attr.value;

          if (name.startsWith("on") || name === "style") {
            el.removeAttribute(attr.name);
            return;
          }

          if (name === "href" || name === "src") {
            const trimmed = value.trim();
            const lower = trimmed.toLowerCase();
            const allowed =
              lower.startsWith("https://") ||
              lower.startsWith("http://") ||
              lower.startsWith("mailto:") ||
              lower.startsWith("tel:") ||
              (name === "src" && lower.startsWith("data:image/"));
            if (!allowed || lower.startsWith("javascript:")) {
              el.removeAttribute(attr.name);
            }
          }

          const allowedAttrs = new Set([
            "href",
            "src",
            "alt",
            "title",
            "target",
            "rel",
            "width",
            "height",
          ]);
          if (!allowedAttrs.has(name)) {
            el.removeAttribute(attr.name);
          }
        });

        if (el.tagName.toLowerCase() === "a") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }

        if (el.tagName.toLowerCase() === "img") {
          if (!el.getAttribute("alt")) el.setAttribute("alt", "");
          el.setAttribute("loading", "lazy");
          el.setAttribute("decoding", "async");
          el.setAttribute("referrerpolicy", "no-referrer");
        }
      });

      return doc.body.innerHTML;
    } catch {
      return "";
    }
  }

  function pickDescription(details) {
    if (!details || !isRecord(details)) return "";
    const keys = ["description", "job_description", "jobDescription", "content", "html"];
    for (const key of keys) {
      const value = details[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function formatLocationValue(value) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      const items = value
        .map((item) => formatLocationValue(item))
        .map((item) => item.trim())
        .filter(Boolean);
      return Array.from(new Set(items)).join(", ");
    }
    if (isRecord(value)) {
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (name) return name;
      const label = typeof value.label === "string" ? value.label.trim() : "";
      if (label) return label;
      const val = typeof value.value === "string" ? value.value.trim() : "";
      if (val) return val;
      const city = typeof value.city === "string" ? value.city.trim() : "";
      const country = typeof value.country === "string" ? value.country.trim() : "";
      const region = typeof value.region === "string" ? value.region.trim() : "";
      const parts = [city, region, country].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
    }
    return "";
  }

  function getFirstStringField(payload, keys) {
    if (!payload) return "";
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function formatPositionLocation(details) {
    if (!details || !isRecord(details)) return "";

    const explicit = getFirstStringField(details, [
      "location_name",
      "locationName",
      "location_label",
      "locationLabel",
    ]);
    if (explicit) return explicit;

    const raw =
      details.locations ??
      details.location ??
      details.office_location ??
      details.officeLocation ??
      null;

    const location = formatLocationValue(raw);

    const remoteLabel = getFirstStringField(details, [
      "remote",
      "remote_type",
      "remoteType",
      "remote_label",
      "remoteLabel",
    ]);
    const isRemote =
      typeof details.remote === "boolean"
        ? details.remote
        : typeof details.is_remote === "boolean"
        ? details.is_remote
        : typeof details.isRemote === "boolean"
        ? details.isRemote
        : false;

    const remote = remoteLabel || (isRemote ? "Remote" : "");
    if (remote && location) return `${remote} ${location}`.trim();
    return location || remote;
  }

  function buildSearch(job) {
    const org = asString(job.org_type || "position").toLowerCase();
    const blob = ` ${asString(job.name)} ${asString(job.company)} ${asString(
      job.department
    )} ${asString(job.state)} ${asString(job.friendly_id)} ${asString(
      job.org_type
    )} ${asString(job.id)} org:${org} `;
    return blob.toLowerCase();
  }

  const CSS = `
    .ljb-wrap{background:#0b1220;padding:40px 16px;color:#fff;border-radius:18px;}
    .ljb-inner{max-width:1000px;margin:0 auto;font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;}
    .ljb-top{display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;}
    .ljb-kicker{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#10b981;font-weight:700;}
    .ljb-h{margin:8px 0 0 0;font-size:30px;line-height:1.15;font-weight:700;}
    .ljb-sub{margin:10px 0 0 0;font-size:14px;color:rgba(226,232,240,.9);}
    .ljb-btn{appearance:none;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:10px 14px;font-weight:700;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:10px;}
    .ljb-btn:disabled{opacity:.6;cursor:default;}
    .ljb-panel{margin-top:28px;background:#fff;color:#0f172a;border-radius:24px;border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 60px -40px rgba(0,0,0,.8);padding:18px;}
    .ljb-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;}
    .ljb-search{margin-top:8px;display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:16px;padding:0 14px;}
    .ljb-search input{border:0;outline:none;height:44px;width:100%;font-size:14px;background:transparent;color:#0f172a;}
    .ljb-err{margin-top:12px;border:1px solid #fecaca;background:#fff1f2;color:#be123c;border-radius:16px;padding:10px 12px;font-size:14px;display:none;}
    .ljb-grid{margin-top:16px;display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:12px;}
    @media(min-width:640px){.ljb-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    .ljb-card{appearance:none;border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:16px;text-align:left;cursor:pointer;box-shadow:0 1px 1px rgba(15,23,42,.05);transition:border-color .15s, box-shadow .15s, transform .15s;}
    .ljb-card:hover{border-color:rgba(16,185,129,.45);box-shadow:0 10px 24px -18px rgba(15,23,42,.35);transform:translateY(-1px);}
    .ljb-name{font-size:14px;font-weight:800;color:#0f172a;}
    .ljb-meta{margin-top:6px;font-size:12px;color:#64748b;}
    .ljb-chips{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:#64748b;}
    .ljb-chip{background:#f1f5f9;border-radius:999px;padding:6px 10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
    .ljb-mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;text-transform:none;letter-spacing:0;font-weight:700;}
    .ljb-empty{grid-column:1/-1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:18px;padding:34px 16px;text-align:center;font-size:14px;color:#64748b;}
    .ljb-modal{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:24px;}
    .ljb-modal.ljb-open{display:flex;}
    .ljb-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.6);backdrop-filter: blur(8px);}
    .ljb-dialog{position:relative;z-index:2;width:min(980px, 100%);max-height:80vh;overflow:hidden;border-radius:24px;background:#fff;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px -50px rgba(0,0,0,.8);color:#0f172a;display:flex;flex-direction:column;}
    .ljb-dhead{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e2e8f0;}
    .ljb-dtitle{min-width:0;}
    .ljb-dtitle .ljb-label{margin:0;}
    .ljb-dtitle .ljb-t{margin-top:6px;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .ljb-dtitle .ljb-m{margin-top:6px;font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .ljb-close{appearance:none;border:0;background:#0f172a;color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;font-size:12px;cursor:pointer;}
    .ljb-dbody{padding:16px;overflow:auto;}
    .ljb-box{border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:16px;}
    .ljb-row{display:grid;gap:12px;grid-template-columns:repeat(1,minmax(0,1fr));}
    @media(min-width:640px){.ljb-row{grid-template-columns:repeat(4,minmax(0,1fr));}}
    .ljb-col2{grid-column:span 2;}
    .ljb-col4{grid-column:1/-1;}
    .ljb-big{margin-top:6px;font-size:18px;font-weight:900;}
    .ljb-value{margin-top:6px;font-size:14px;color:#0f172a;}
    .ljb-desc{margin-top:18px;}
    .ljb-rt{margin-top:10px;border:1px solid #e2e8f0;background:rgba(241,245,249,.6);border-radius:16px;padding:14px;color:#0f172a;font-size:14px;line-height:1.6;}
    .ljb-rt p{margin:10px 0 0 0;}
    .ljb-rt p:first-child{margin-top:0;}
    .ljb-rt h1,.ljb-rt h2,.ljb-rt h3,.ljb-rt h4{margin:14px 0 0 0;}
    .ljb-rt ul,.ljb-rt ol{margin:10px 0 0 18px;}
    .ljb-rt a{color:#047857;font-weight:800;text-decoration:none;}
    .ljb-rt a:hover{text-decoration:underline;}
    .ljb-rt img{max-width:100%;height:auto;border-radius:14px;border:1px solid #e2e8f0;margin:12px 0;}
  `;

  function findTargets() {
    if (targetSelector) {
      const el = document.querySelector(targetSelector);
      return el ? [el] : [];
    }
    const byAttr = Array.from(document.querySelectorAll("[data-linas-jobs-board]"));
    if (byAttr.length > 0) return byAttr;
    const fallback = document.getElementById("linas-jobs");
    return fallback ? [fallback] : [];
  }

  function boot() {
    const targets = findTargets();
    if (targets.length === 0) return false;
    for (const target of targets) mountInto(target);
    return true;
  }

  if (!boot()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
    } else {
      // Some builders hydrate content after scripts run; retry briefly.
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (boot() || attempts > 20) window.clearInterval(timer);
      }, 250);
    }
    return;
  }

  function mountInto(container) {
    const title = asString(container.getAttribute("data-title")).trim() || "Job openings";
    const subtitle =
      asString(container.getAttribute("data-subtitle")).trim() ||
      "Browse open positions and view full job details.";
    const companyId = asString(container.getAttribute("data-company-id")).trim();

    const host = container;
    const uid = `ljb-${Math.random().toString(36).slice(2)}`;

    host.innerHTML = `
      <style>${CSS}</style>
      <div class="ljb-wrap ${uid}">
        <div class="ljb-inner">
          <div class="ljb-top">
            <div>
              <div class="ljb-kicker">Careers</div>
              <div class="ljb-h">${escapeHtml(title)}</div>
              <div class="ljb-sub">${escapeHtml(subtitle)}</div>
            </div>
            <button type="button" class="ljb-btn" data-action="refresh">
              <span aria-hidden="true">↻</span>
              <span>Refresh</span>
            </button>
          </div>
          <div class="ljb-panel">
            <div class="ljb-label">Search</div>
            <div class="ljb-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" placeholder="Search by name, state, id…" />
            </div>
            <div class="ljb-err" data-role="err"></div>
            <div class="ljb-grid" data-role="list"></div>
          </div>
        </div>
      </div>
      <div class="ljb-modal" data-role="modal" role="dialog" aria-modal="true">
        <div class="ljb-backdrop" data-action="close"></div>
        <div class="ljb-dialog">
          <div class="ljb-dhead">
            <div class="ljb-dtitle">
              <div class="ljb-label">Position</div>
              <div class="ljb-t" data-role="details-title">—</div>
              <div class="ljb-m" data-role="details-meta">—</div>
            </div>
            <button type="button" class="ljb-close" data-action="close">Close</button>
          </div>
          <div class="ljb-dbody" data-role="details-body"></div>
        </div>
      </div>
    `;

    const state = {
      jobs: [],
      filtered: [],
      query: "",
      loading: false,
      error: "",
      selectedId: "",
      details: null,
      detailsLoading: false,
      listAbort: null,
      detailsAbort: null,
      searchTimer: null,
      scrollLocked: false,
      prevOverflow: "",
    };

    const input = host.querySelector("input[type=search]");
    if (input) {
      input.addEventListener("input", (event) => {
        if (state.searchTimer) window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          state.query = asString(event.target.value).trim().toLowerCase();
          applyFilter();
        }, 60);
      });
    }

    host.addEventListener("click", (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      if (!targetEl) return;

      const actionEl = targetEl.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-action");
        if (action === "refresh") {
          void loadJobs(true);
          return;
        }
        if (action === "close") {
          closeDetails();
          return;
        }
      }

      const card = targetEl.closest("[data-job-id]");
      if (card) {
        const id = card.getAttribute("data-job-id") || "";
        if (id) void openDetails(id);
      }
    });

    void loadJobs(false);

    function buildUrl(pathname, params) {
      const url = new URL(pathname, apiBase);
      if (url.hostname.includes("ngrok")) {
        url.searchParams.set("ngrok-skip-browser-warning", "true");
      }
      if (companyId) url.searchParams.set("companyId", companyId);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value == null) continue;
          url.searchParams.set(key, String(value));
        }
      }
      return url.toString();
    }

    function setError(message) {
      state.error = asString(message);
      const err = host.querySelector("[data-role=err]");
      if (!err) return;
      if (!state.error) {
        err.style.display = "none";
        err.textContent = "";
        return;
      }
      err.style.display = "block";
      err.textContent = state.error;
    }

    function setLoading(value) {
      state.loading = Boolean(value);
      renderList();
    }

    function renderList() {
      const list = host.querySelector("[data-role=list]");
      if (!list) return;
      if (state.loading) {
        list.innerHTML = `<div class="ljb-empty">Loading positions…</div>`;
        return;
      }
      if (!state.filtered || state.filtered.length === 0) {
        list.innerHTML = `<div class="ljb-empty">No positions found.</div>`;
        return;
      }

      list.innerHTML = state.filtered
        .map((job) => {
          const title = escapeHtml(job.name || "Position");
          const meta = escapeHtml(
            [asString(job.company).trim(), asString(job.department).trim()]
              .filter(Boolean)
              .join(" · ")
          );
          const stateLabel = escapeHtml(job.state || "—");
          const id = escapeHtml(job.id || "");
          return `
            <button type="button" class="ljb-card" data-job-id="${escapeHtml(job.id)}">
              <div class="ljb-name">${title}</div>
              ${meta ? `<div class="ljb-meta">${meta}</div>` : ""}
              <div class="ljb-chips">
                <span class="ljb-chip">${stateLabel}</span>
                <span class="ljb-chip ljb-mono">${id}</span>
              </div>
            </button>
          `;
        })
        .join("");
    }

    function applyFilter() {
      const q = state.query;
      const base = state.jobs.filter((job) => !job.__search.includes(" org:pool "));
      if (!q) state.filtered = base;
      else state.filtered = base.filter((job) => job.__search.includes(q));
      renderList();
    }

    function jsonpRequest(url) {
      return new Promise((resolve, reject) => {
        const callback = `__linas_jobs_cb_${Math.random().toString(36).slice(2)}`;
        const nextUrl = new URL(url);
        nextUrl.searchParams.set("callback", callback);

        let done = false;
        const script = document.createElement("script");
        script.async = true;
        script.src = nextUrl.toString();

        const cleanup = () => {
          if (done) return;
          done = true;
          try {
            // eslint-disable-next-line no-undef
            delete window[callback];
          } catch {
            // ignore
          }
          script.remove();
          window.clearTimeout(timer);
        };

        // eslint-disable-next-line no-undef
        window[callback] = (data) => {
          cleanup();
          resolve(data);
        };

        script.onerror = () => {
          cleanup();
          reject(new Error("JSONP request failed"));
        };

        const timer = window.setTimeout(() => {
          cleanup();
          reject(new Error("JSONP request timed out"));
        }, 10_000);

        document.head.appendChild(script);
      });
    }

    async function requestJson(url, init) {
      const requestOrigin = new URL(url).origin;
      // If this is cross-origin, prefer JSONP to avoid CORS issues (and console noise).
      if (requestOrigin !== window.location.origin) {
        const data = await jsonpRequest(url);
        if (data && typeof data === "object" && data.error) {
          throw new Error(String(data.error));
        }
        return data;
      }
      try {
        const headers = new Headers((init && init.headers) || undefined);
        if (new URL(url).hostname.includes("ngrok")) {
          headers.set("ngrok-skip-browser-warning", "true");
        }
        const res = await fetch(url, { ...init, headers });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.error) || "Request failed.");
        }
        return data;
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        const data = await jsonpRequest(url);
        if (data && typeof data === "object" && data.error) {
          throw new Error(String(data.error));
        }
        return data;
      }
    }

    async function loadJobs(bypassCache) {
      if (state.listAbort) state.listAbort.abort();
      state.listAbort = new AbortController();

      setLoading(true);
      setError("");

      try {
        const url = buildUrl("/api/jobs", bypassCache ? { ts: Date.now() } : null);
        const data = await requestJson(url, {
          signal: state.listAbort.signal,
          credentials: "omit",
          cache: bypassCache ? "no-store" : "default",
        });

        const list = Array.isArray(data) ? data : [];
        state.jobs = list
          .map((job) => {
            const id = asString(job && job.id).trim();
            if (!id) return null;
            const normalized = {
              id,
              name: asString(job.name).trim() || "Position",
              state: asString(job.state).trim() || "",
              friendly_id: asString(job.friendly_id).trim() || "",
              org_type: asString(job.org_type).trim() || "",
              company: asString(job.company).trim() || "",
              department: asString(job.department).trim() || "",
            };
            normalized.__search = buildSearch(normalized);
            return normalized;
          })
          .filter(Boolean);

        state.query = "";
        if (input) input.value = "";
        applyFilter();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        state.jobs = [];
        state.filtered = [];
        setError(err instanceof Error ? err.message : "Failed to load jobs.");
        renderList();
      } finally {
        setLoading(false);
      }
    }

    function lockScroll() {
      if (state.scrollLocked) return;
      state.scrollLocked = true;
      state.prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    }

    function unlockScroll() {
      if (!state.scrollLocked) return;
      document.documentElement.style.overflow = state.prevOverflow || "";
      state.scrollLocked = false;
    }

    function openModal() {
      const modal = host.querySelector("[data-role=modal]");
      if (!modal) return;
      modal.classList.add("ljb-open");
      lockScroll();
    }

    function closeDetails() {
      const modal = host.querySelector("[data-role=modal]");
      if (modal) modal.classList.remove("ljb-open");
      state.selectedId = "";
      state.details = null;
      state.detailsLoading = false;
      const body = host.querySelector("[data-role=details-body]");
      if (body) body.innerHTML = "";
      unlockScroll();
    }

    async function openDetails(id) {
      const positionId = asString(id).trim();
      if (!positionId) return;

      if (state.detailsAbort) state.detailsAbort.abort();
      state.detailsAbort = new AbortController();

      state.selectedId = positionId;
      state.details = null;
      state.detailsLoading = true;
      setError("");
      openModal();
      renderDetails();

      try {
        const url = buildUrl(`/api/jobs/${encodeURIComponent(positionId)}`);
        const data = await requestJson(url, {
          signal: state.detailsAbort.signal,
          credentials: "omit",
          cache: "default",
        });
        state.details = data;
      } catch (err) {
        if (err && err.name === "AbortError") return;
        state.details = null;
        setError(err instanceof Error ? err.message : "Failed to load job.");
      } finally {
        state.detailsLoading = false;
        renderDetails();
      }
    }

    function renderDetails() {
      const titleEl = host.querySelector("[data-role=details-title]");
      const metaEl = host.querySelector("[data-role=details-meta]");
      const bodyEl = host.querySelector("[data-role=details-body]");
      if (!titleEl || !metaEl || !bodyEl) return;

      const details = state.details;
      const title =
        (isRecord(details) && (asString(details.name) || asString(details.title)).trim()) ||
        state.selectedId ||
        "—";
      titleEl.textContent = title;

      if (isRecord(details)) {
        const company = asString(details.company).trim();
        const department = asString(details.department).trim();
        const location = formatPositionLocation(details);
        const first = [company, department].filter(Boolean).join(" · ");
        metaEl.textContent =
          (first && location ? `${first} · ${location}` : first || location || "—");
      } else {
        metaEl.textContent = "—";
      }

      if (state.detailsLoading) {
        bodyEl.innerHTML = `<div class="ljb-box"><div class="ljb-empty">Loading job details…</div></div>`;
        return;
      }

      if (!isRecord(details)) {
        bodyEl.innerHTML = `<div class="ljb-box"><div class="ljb-empty">No details returned.</div></div>`;
        return;
      }

      const company = asString(details.company).trim() || "—";
      const department = asString(details.department).trim() || "—";
      const location = formatPositionLocation(details) || "—";
      const idValue = asString(details._id).trim() || asString(details.id).trim() || state.selectedId || "—";

      const rawDesc = pickDescription(details);
      const descHtml = containsHtml(rawDesc) ? sanitizeHtml(rawDesc) : "";
      const descText = !descHtml ? escapeHtml(rawDesc.trim() || "—") : "";

      bodyEl.innerHTML = `
        <div class="ljb-box">
          <div class="ljb-row">
            <div class="ljb-col2">
              <div class="ljb-label">Title</div>
              <div class="ljb-big">${escapeHtml(title)}</div>
            </div>
            <div>
              <div class="ljb-label">ID</div>
              <div class="ljb-value"><span class="ljb-chip ljb-mono">${escapeHtml(idValue)}</span></div>
            </div>
            <div class="ljb-col4">
              <div class="ljb-row">
                <div>
                  <div class="ljb-label">Company</div>
                  <div class="ljb-value">${escapeHtml(company)}</div>
                </div>
                <div>
                  <div class="ljb-label">Department</div>
                  <div class="ljb-value">${escapeHtml(department)}</div>
                </div>
                <div>
                  <div class="ljb-label">Location</div>
                  <div class="ljb-value">${escapeHtml(location)}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="ljb-desc">
            <div class="ljb-label">Description</div>
            <div class="ljb-rt">${descHtml || descText}</div>
          </div>
        </div>
      `;
    }
  }
})();
