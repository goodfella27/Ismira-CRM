(() => {
  function resolveScriptElement() {
    const current = document.currentScript;
    if (current instanceof HTMLScriptElement) return current;
    const scripts = Array.from(document.getElementsByTagName("script"));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      const src = s && typeof s.src === "string" ? s.src : "";
      if (!src) continue;
      if (src.includes("/embed/jobs/v1/widget.js")) return s;
      if (src.endsWith("widget.js") && src.includes("/embed/jobs/")) return s;
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

  const DEFAULT_API_BASE = (() => {
    const dataBase = readDataAttribute(scriptEl, "api-base");
    if (dataBase) {
      try {
        return new URL(dataBase, window.location.href)
          .toString()
          .replace(/\/+$/, "");
      } catch {
        // ignore
      }
    }
    return scriptUrl.origin;
  })();

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

  function getFirstStringField(payload, keys) {
    if (!payload) return "";
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

  function pickDescription(details) {
    if (!details || !isRecord(details)) return "";
    const keys = ["description", "job_description", "jobDescription", "content", "html"];
    for (const key of keys) {
      const value = details[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
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

  const STYLES = `
    :host{
      --lj-bg: #0b1220;
      --lj-card-bg: #ffffff;
      --lj-card-border: #e2e8f0;
      --lj-text: #0f172a;
      --lj-muted: #64748b;
      --lj-accent: #10b981;
      --lj-shadow: 0 20px 60px -40px rgba(0,0,0,0.8);
      display:block;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    }
    .wrap{background:var(--lj-bg);padding:40px 16px;color:#fff;}
    .inner{max-width:1000px;margin:0 auto;}
    .top{display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;}
    .kicker{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--lj-accent);font-weight:700;}
    h1{margin:8px 0 0 0;font-size:30px;line-height:1.15;font-weight:700;}
    .sub{margin:10px 0 0 0;font-size:14px;color:rgba(226,232,240,.9);}
    .btn{appearance:none;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:10px 14px;font-weight:700;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:10px;}
    .btn:disabled{opacity:.6;cursor:default;}
    .panel{margin-top:28px;background:var(--lj-card-bg);color:var(--lj-text);border-radius:24px;border:1px solid rgba(255,255,255,.10);box-shadow:var(--lj-shadow);padding:18px;}
    .label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--lj-muted);font-weight:700;}
    .search{margin-top:8px;display:flex;align-items:center;gap:10px;border:1px solid var(--lj-card-border);border-radius:16px;padding:0 14px;}
    .search input{border:0;outline:none;height:44px;width:100%;font-size:14px;background:transparent;color:var(--lj-text);}
    .err{margin-top:12px;border:1px solid #fecaca;background:#fff1f2;color:#be123c;border-radius:16px;padding:10px 12px;font-size:14px;}
    .grid{margin-top:16px;display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:12px;}
    @media(min-width:640px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    .card{appearance:none;border:1px solid var(--lj-card-border);background:#fff;border-radius:18px;padding:16px;text-align:left;cursor:pointer;box-shadow:0 1px 1px rgba(15,23,42,.05);transition:border-color .15s, box-shadow .15s, transform .15s;}
    .card:hover{border-color:rgba(16,185,129,.45);box-shadow:0 10px 24px -18px rgba(15,23,42,.35);transform:translateY(-1px);}
    .name{font-size:14px;font-weight:800;color:var(--lj-text);}
    .meta{margin-top:6px;font-size:12px;color:var(--lj-muted);}
    .chips{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--lj-muted);}
    .chip{background:#f1f5f9;border-radius:999px;padding:6px 10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
    .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;text-transform:none;letter-spacing:0;font-weight:700;}
    .empty{grid-column:1/-1;border:1px solid var(--lj-card-border);background:#f8fafc;border-radius:18px;padding:34px 16px;text-align:center;font-size:14px;color:var(--lj-muted);}

    .modal{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:24px;}
    .modal.open{display:flex;}
    .backdrop{position:absolute;inset:0;background:rgba(2,6,23,.6);backdrop-filter: blur(8px);}
    .dialog{position:relative;z-index:2;width:min(980px, 100%);max-height:80vh;overflow:hidden;border-radius:24px;background:#fff;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px -50px rgba(0,0,0,.8);color:var(--lj-text);display:flex;flex-direction:column;}
    .dhead{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--lj-card-border);}
    .dtitle{min-width:0;}
    .dtitle .label{margin:0;}
    .dtitle .t{margin-top:6px;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .dtitle .m{margin-top:6px;font-size:12px;color:var(--lj-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .close{appearance:none;border:0;background:#0f172a;color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;font-size:12px;cursor:pointer;}
    .dbody{padding:16px;overflow:auto;}
    .box{border:1px solid var(--lj-card-border);border-radius:18px;background:#fff;padding:16px;}
    .row{display:grid;gap:12px;grid-template-columns:repeat(1,minmax(0,1fr));}
    @media(min-width:640px){.row{grid-template-columns:repeat(4,minmax(0,1fr));}}
    .col2{grid-column:span 2;}
    .col4{grid-column:1/-1;}
    .big{margin-top:6px;font-size:18px;font-weight:900;}
    .value{margin-top:6px;font-size:14px;color:var(--lj-text);}
    .desc{margin-top:18px;}
    .rt{margin-top:10px;border:1px solid var(--lj-card-border);background:rgba(241,245,249,.6);border-radius:16px;padding:14px;color:var(--lj-text);font-size:14px;line-height:1.6;}
    .rt p{margin:10px 0 0 0;}
    .rt p:first-child{margin-top:0;}
    .rt h1,.rt h2,.rt h3,.rt h4{margin:14px 0 0 0;}
    .rt ul,.rt ol{margin:10px 0 0 18px;}
    .rt a{color:#047857;font-weight:800;text-decoration:none;}
    .rt a:hover{text-decoration:underline;}
    .rt img{max-width:100%;height:auto;border-radius:14px;border:1px solid var(--lj-card-border);margin:12px 0;}
  `;

  class LinasJobsBoard extends HTMLElement {
    static get observedAttributes() {
      return ["api-base", "company-id", "title", "subtitle"];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._jobs = [];
      this._filtered = [];
      this._query = "";
      this._loading = false;
      this._error = "";
      this._selectedId = "";
      this._details = null;
      this._detailsLoading = false;
      this._listAbort = null;
      this._detailsAbort = null;
      this._searchTimer = null;
      this._renderScheduled = false;
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (!this.isConnected) return;
      if (name === "api-base" || name === "company-id") {
        void this.loadJobs({ bypassCache: false });
      } else {
        this.renderShell();
        this.renderAll();
      }
    }

    connectedCallback() {
      this.renderShell();
      void this.loadJobs({ bypassCache: false });
    }

    disconnectedCallback() {
      if (this._listAbort) this._listAbort.abort();
      if (this._detailsAbort) this._detailsAbort.abort();
      if (this._searchTimer) window.clearTimeout(this._searchTimer);
      this.unlockScroll();
    }

    get apiBase() {
      const raw = asString(this.getAttribute("api-base")).trim();
      if (!raw) return DEFAULT_API_BASE;
      return raw.replace(/\/+$/, "");
    }

    get companyId() {
      return asString(this.getAttribute("company-id")).trim();
    }

    get title() {
      return asString(this.getAttribute("title")).trim() || "Job openings";
    }

    get subtitle() {
      return (
        asString(this.getAttribute("subtitle")).trim() ||
        "Browse open positions and view full job details."
      );
    }

    buildUrl(pathname, params) {
      const url = new URL(pathname, this.apiBase);
      if (url.hostname.includes("ngrok")) {
        url.searchParams.set("ngrok-skip-browser-warning", "true");
      }
      if (this.companyId) url.searchParams.set("companyId", this.companyId);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value == null) continue;
          url.searchParams.set(key, String(value));
        }
      }
      return url.toString();
    }

    setLoading(value) {
      this._loading = Boolean(value);
      this.renderAll();
    }

    setError(message) {
      this._error = asString(message);
      this.renderAll();
    }

    scheduleFilter(query) {
      if (this._searchTimer) window.clearTimeout(this._searchTimer);
      this._searchTimer = window.setTimeout(() => {
        this._query = asString(query).trim().toLowerCase();
        this.applyFilter();
      }, 60);
    }

    applyFilter() {
      const q = this._query;
      const base = this._jobs.filter((job) => !job.__search.includes(" org:pool "));
      if (!q) {
        this._filtered = base;
      } else {
        this._filtered = base.filter((job) => job.__search.includes(q));
      }
      this.renderList();
    }

    scheduleRender(fn) {
      if (this._renderScheduled) return;
      this._renderScheduled = true;
      window.requestAnimationFrame(() => {
        this._renderScheduled = false;
        fn();
      });
    }

    renderShell() {
      const root = this._shadow;
      if (!root) return;

      root.innerHTML = `
        <style>${STYLES}</style>
        <div class="wrap">
          <div class="inner">
            <div class="top">
              <div>
                <div class="kicker">Careers</div>
                <h1>${escapeHtml(this.title)}</h1>
                <p class="sub">${escapeHtml(this.subtitle)}</p>
              </div>
              <button type="button" class="btn" data-action="refresh">
                <span aria-hidden="true">↻</span>
                <span>Refresh</span>
              </button>
            </div>

            <div class="panel">
              <div class="label">Search</div>
              <div class="search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="Search by name, state, id…" />
              </div>
              <div class="err" style="display:none"></div>
              <div class="grid" data-role="list"></div>
            </div>
          </div>
        </div>

        <div class="modal" data-role="modal" role="dialog" aria-modal="true">
          <div class="backdrop" data-action="close"></div>
          <div class="dialog">
            <div class="dhead">
              <div class="dtitle">
                <div class="label">Position</div>
                <div class="t" data-role="details-title">—</div>
                <div class="m" data-role="details-meta">—</div>
              </div>
              <button type="button" class="close" data-action="close">Close</button>
            </div>
            <div class="dbody" data-role="details-body"></div>
          </div>
        </div>
      `;

      const input = root.querySelector("input[type=search]");
      if (input) {
        input.addEventListener("input", (event) => {
          this.scheduleFilter(event.target.value);
        });
      }

      root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const actionEl = target.closest("[data-action]");
        if (actionEl) {
          const action = actionEl.getAttribute("data-action");
          if (action === "refresh") {
            void this.loadJobs({ bypassCache: true });
            return;
          }
          if (action === "close") {
            this.closeDetails();
            return;
          }
        }

        const card = target.closest("[data-job-id]");
        if (card) {
          const id = card.getAttribute("data-job-id") || "";
          if (id) void this.openDetails(id);
        }
      });
    }

    renderAll() {
      this.scheduleRender(() => {
        this.renderError();
        this.renderList();
      });
    }

    renderError() {
      const err = this._shadow.querySelector(".err");
      if (!err) return;
      if (!this._error) {
        err.style.display = "none";
        err.textContent = "";
        return;
      }
      err.style.display = "block";
      err.textContent = this._error;
    }

    renderList() {
      const list = this._shadow.querySelector("[data-role=list]");
      if (!list) return;

      if (this._loading) {
        list.innerHTML = `<div class="empty">Loading positions…</div>`;
        return;
      }

      const items = this._filtered;
      if (!items || items.length === 0) {
        list.innerHTML = `<div class="empty">No positions found.</div>`;
        return;
      }

      list.innerHTML = items
        .map((job) => {
          const title = escapeHtml(job.name || "Position");
          const company = asString(job.company).trim();
          const dept = asString(job.department).trim();
          const meta = escapeHtml([company, dept].filter(Boolean).join(" · "));
          const state = escapeHtml(job.state || "—");
          const id = escapeHtml(job.id || "");
          return `
            <button type="button" class="card" data-job-id="${escapeHtml(job.id)}">
              <div class="name">${title}</div>
              ${meta ? `<div class="meta">${meta}</div>` : ""}
              <div class="chips">
                <span class="chip">${state}</span>
                <span class="chip mono">${id}</span>
              </div>
            </button>
          `;
        })
        .join("");
    }

    lockScroll() {
      if (this._scrollLocked) return;
      this._scrollLocked = true;
      this._prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    }

    unlockScroll() {
      if (!this._scrollLocked) return;
      document.documentElement.style.overflow = this._prevOverflow || "";
      this._scrollLocked = false;
    }

    openModal() {
      const modal = this._shadow.querySelector("[data-role=modal]");
      if (!modal) return;
      modal.classList.add("open");
      this.lockScroll();
    }

    closeDetails() {
      const modal = this._shadow.querySelector("[data-role=modal]");
      if (modal) modal.classList.remove("open");
      this._selectedId = "";
      this._details = null;
      this._detailsLoading = false;
      const body = this._shadow.querySelector("[data-role=details-body]");
      if (body) body.innerHTML = "";
      this.unlockScroll();
    }

    async loadJobs(options) {
      if (this._listAbort) this._listAbort.abort();
      this._listAbort = new AbortController();

      this.setLoading(true);
      this.setError("");

      try {
        const url = this.buildUrl("/api/jobs", options && options.bypassCache ? { ts: Date.now() } : null);
        const data = await requestJson(url, {
          signal: this._listAbort.signal,
          credentials: "omit",
          cache: options && options.bypassCache ? "no-store" : "default",
        });
        const list = Array.isArray(data) ? data : [];
        this._jobs = list
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

        this._query = "";
        const input = this._shadow.querySelector("input[type=search]");
        if (input) input.value = "";

        this.applyFilter();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        this._jobs = [];
        this._filtered = [];
        this.setError(err instanceof Error ? err.message : "Failed to load jobs.");
        this.renderList();
      } finally {
        this.setLoading(false);
      }
    }

    async openDetails(id) {
      const positionId = asString(id).trim();
      if (!positionId) return;

      if (this._detailsAbort) this._detailsAbort.abort();
      this._detailsAbort = new AbortController();

      this._selectedId = positionId;
      this._details = null;
      this._detailsLoading = true;
      this.setError("");
      this.openModal();
      this.renderDetails();

      try {
        const url = this.buildUrl(`/api/jobs/${encodeURIComponent(positionId)}`);
        const data = await requestJson(url, {
          signal: this._detailsAbort.signal,
          credentials: "omit",
          cache: "default",
        });
        this._details = data;
      } catch (err) {
        if (err && err.name === "AbortError") return;
        this._details = null;
        this.setError(err instanceof Error ? err.message : "Failed to load job.");
      } finally {
        this._detailsLoading = false;
        this.renderDetails();
      }
    }

    renderDetails() {
      const titleEl = this._shadow.querySelector("[data-role=details-title]");
      const metaEl = this._shadow.querySelector("[data-role=details-meta]");
      const bodyEl = this._shadow.querySelector("[data-role=details-body]");
      if (!titleEl || !metaEl || !bodyEl) return;

      const details = this._details;
      const title =
        (isRecord(details) && (asString(details.name) || asString(details.title)).trim()) ||
        this._selectedId ||
        "—";
      titleEl.textContent = title;

      if (isRecord(details)) {
        const company = asString(details.company).trim();
        const department = asString(details.department).trim();
        const location = formatPositionLocation(details);
        const first = [company, department].filter(Boolean).join(" · ");
        metaEl.textContent = (first && location ? `${first} · ${location}` : first || location || "—");
      } else {
        metaEl.textContent = "—";
      }

      if (this._detailsLoading) {
        bodyEl.innerHTML = `<div class="box"><div class="empty">Loading job details…</div></div>`;
        return;
      }

      if (!isRecord(details)) {
        bodyEl.innerHTML = `<div class="box"><div class="empty">No details returned.</div></div>`;
        return;
      }

      const company = asString(details.company).trim() || "—";
      const department = asString(details.department).trim() || "—";
      const location = formatPositionLocation(details) || "—";
      const id =
        asString(details._id).trim() || asString(details.id).trim() || this._selectedId || "—";

      const rawDesc = pickDescription(details);
      const descHtml = containsHtml(rawDesc) ? sanitizeHtml(rawDesc) : "";
      const descText = !descHtml ? escapeHtml(rawDesc.trim() || "—") : "";

      const link =
        asString(details.application_url || details.apply_url || details.public_url || details.url)
          .trim();
      const safeLink = link && /^https?:\/\//i.test(link) ? link : "";

      bodyEl.innerHTML = `
        <div class="box">
          <div class="row">
            <div class="col2">
              <div class="label">Title</div>
              <div class="big">${escapeHtml(title)}</div>
            </div>
            <div>
              <div class="label">ID</div>
              <div class="value"><span class="chip mono">${escapeHtml(id)}</span></div>
            </div>
            <div class="col4">
              <div class="row">
                <div>
                  <div class="label">Company</div>
                  <div class="value">${escapeHtml(company)}</div>
                </div>
                <div>
                  <div class="label">Department</div>
                  <div class="value">${escapeHtml(department)}</div>
                </div>
                <div>
                  <div class="label">Location</div>
                  <div class="value">${escapeHtml(location)}</div>
                </div>
                ${
                  safeLink
                    ? `<div>
                         <div class="label">Apply</div>
                         <div class="value"><a href="${escapeHtml(
                           safeLink
                         )}" target="_blank" rel="noopener noreferrer">Open application</a></div>
                       </div>`
                    : ""
                }
              </div>
            </div>
          </div>

          <div class="desc">
            <div class="label">Description</div>
            <div class="rt">${descHtml || descText}</div>
          </div>
        </div>
      `;
    }
  }

  if (!window.customElements || window.customElements.get("linas-jobs-board")) return;
  window.customElements.define("linas-jobs-board", LinasJobsBoard);
})();
