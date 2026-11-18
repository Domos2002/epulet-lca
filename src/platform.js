/* Épület-LCA – platformréteg az önálló (asztali és webes) változathoz.
 * Ugyanazt a felületet adja, amit a program a Claude-oldalon kap (window.claude.use):
 *   db        – felhős tárhely (Supabase / PostgREST), felhasználónként elkülönítve (RLS)
 *   user      – a bejelentkezett felhasználó azonosítója
 *   downloads – fájl mentése (asztali programban mentés-párbeszéd, böngészőben letöltés)
 *   sample    – MI-hívás (fordító, EPD-kitöltés) – csak ha a felhasználó megadott Anthropic API-kulcsot
 * Külső függőség nincs: a Supabase REST-felületét közvetlenül hívja.
 */
(function () {
  "use strict";
  if (window.claude && typeof window.claude.use === "function") return; // Claude-oldalon a beépítettet használjuk

  const CFG = window.LCA_CONFIG || {};
  const URL0 = String(CFG.supabaseUrl || "").replace(/\/+$/, "");
  const KEY = CFG.supabaseKey || "";
  const SKEY = "lca-auth-v1", AIKEY = "lca-anthropic-key";
  const isDesktop = !!window.lcaDesktop;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const err = (code, message) => Object.assign(new Error(message || code), { code });

  // ---------- munkamenet
  let session = null;
  try { session = JSON.parse(ls.get(SKEY) || "null"); } catch (e) { session = null; }
  function keep(s) {
    if (!s || !s.access_token) return;
    session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)), user: s.user || (session && session.user) || null };
    ls.set(SKEY, JSON.stringify(session));
  }
  function drop() { session = null; ls.del(SKEY); }

  // e-mailes visszaigazoló / jelszó-visszaállító link: a token a címsor #-része után érkezik.
  // Még a program saját (#-alapú) útválasztása előtt kiolvassuk és eltávolítjuk.
  let pendingRecovery = false, linkError = "";
  (function readHash() {
    const h = location.hash.slice(1);
    if (!/access_token=|error_description=/.test(h)) return;
    const q = new URLSearchParams(h);
    if (q.get("error_description")) linkError = q.get("error_description").replace(/\+/g, " ");
    if (q.get("access_token")) {
      keep({ access_token: q.get("access_token"), refresh_token: q.get("refresh_token"), expires_in: +q.get("expires_in") || 3600 });
      if (q.get("type") === "recovery") pendingRecovery = true;
    }
    history.replaceState(null, "", location.pathname + location.search);
  })();

  async function api(path, opt) {
    opt = opt || {};
    const headers = Object.assign({ apikey: KEY, "Content-Type": "application/json" }, opt.headers || {});
    if (opt.auth !== false && session) headers.Authorization = "Bearer " + session.access_token;
    let r;
    try { r = await fetch(URL0 + path, { method: opt.method || "GET", headers, body: opt.body == null ? undefined : JSON.stringify(opt.body) }); }
    catch (e) { throw err("unavailable", "Nincs kapcsolat a szerverrel."); }
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (!r.ok) {
      const msg = (j && (j.msg || j.message || j.error_description || j.error)) || ("HTTP " + r.status);
      throw err(r.status === 401 ? "unauthenticated" : r.status === 413 ? "invalid_argument" : r.status >= 500 ? "unavailable" : "failed", msg);
    }
    return j;
  }
  async function refresh() {
    if (!session || !session.refresh_token) throw err("unauthenticated");
    const s = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: session.refresh_token } });
    keep(s); return session;
  }
  async function fresh() {
    if (!session) throw err("unauthenticated");
    if (session.expires_at - 90 < Date.now() / 1000) await refresh();
    if (!session.user) { try { session.user = await api("/auth/v1/user"); keep(session); } catch (e) { } }
    return session;
  }
  // adatkérés lejárt token esetén egy frissítéssel és újrapróbálással
  async function authed(path, opt) {
    await fresh();
    try { return await api(path, opt); }
    catch (e) { if (e.code !== "unauthenticated") throw e; await refresh(); return api(path, opt); }
  }

  // ---------- belépési felület
  const CSS = `
#lca-auth{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:radial-gradient(120% 120% at 0% 0%,#1d6a5a 0%,#0b1a17 65%);font-family:"Source Sans 3","Segoe UI",Roboto,Arial,sans-serif;color:#16222a}
#lca-auth .box{width:min(420px,100%);background:#fff;border-radius:14px;padding:28px 26px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
#lca-auth h1{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:30px;margin:0 0 2px;font-weight:600}
#lca-auth .sub{color:#567;margin:0 0 18px;font-size:15px}
#lca-auth label{display:grid;gap:4px;margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#456}
#lca-auth input{font:inherit;font-size:16px;padding:9px 11px;border:1px solid #c9d3d0;border-radius:8px;text-transform:none;letter-spacing:0;color:#16222a;background:#fff}
#lca-auth input:focus{outline:2px solid #1d6a5a;outline-offset:1px;border-color:#1d6a5a}
#lca-auth button.pri{width:100%;font:inherit;font-size:16px;font-weight:600;padding:10px;border:0;border-radius:8px;background:#1d6a5a;color:#fff;cursor:pointer;margin-top:4px}
#lca-auth button.pri:disabled{opacity:.6;cursor:default}
#lca-auth .links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:14.5px}
#lca-auth .links button{background:none;border:0;padding:0;color:#1d6a5a;cursor:pointer;font:inherit;text-decoration:underline;text-underline-offset:2px}
#lca-auth .msg{font-size:14.5px;margin:10px 0 0;min-height:1em}
#lca-auth .msg.bad{color:#b3261e}#lca-auth .msg.ok{color:#1d6a5a}
#lca-auth .cfg{background:#fff4e5;border:1px solid #f0c27b;border-radius:8px;padding:10px 12px;font-size:14.5px}
.lca-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9998;background:#16222a;color:#fff;border-radius:10px;padding:10px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:"Source Sans 3","Segoe UI",Arial,sans-serif;font-size:15px;max-width:calc(100% - 32px)}
.lca-banner button{font:inherit;font-weight:600;background:#2fa58a;color:#fff;border:0;border-radius:7px;padding:6px 12px;cursor:pointer}
.lca-banner button.x{background:none;padding:6px}
.lca-dlg{position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px}
.lca-dlg .box{width:min(520px,100%);background:var(--surface,#fff);color:var(--ink,#16222a);border-radius:12px;padding:22px;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.lca-dlg h2{margin:0 0 8px;font-size:22px}.lca-dlg p{margin:0 0 10px;font-size:15px;line-height:1.45}
.lca-dlg input{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid var(--line,#c9d3d0);border-radius:8px;background:var(--bg,#fff);color:inherit}
.lca-dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
.lca-dlg button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid var(--line,#c9d3d0);background:var(--surface,#fff);color:inherit;cursor:pointer}
.lca-dlg button.pri{background:#1d6a5a;border-color:#1d6a5a;color:#fff}`;
  function style() { if (document.getElementById("lca-plat-css")) return; const s = document.createElement("style"); s.id = "lca-plat-css"; s.textContent = CSS; document.head.appendChild(s); }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HU = {
    "Invalid login credentials": "Hibás e-mail-cím vagy jelszó.",
    "Email not confirmed": "Az e-mail-címed még nincs megerősítve. Nézd meg a postafiókodat (a levélszemét mappát is).",
    "User already registered": "Ezzel az e-mail-címmel már van fiók. Lépj be, vagy kérj új jelszót.",
    "Password should be at least 6 characters.": "A jelszó legalább 6 karakter legyen."
  };
  const hu = m => HU[m] || HU[String(m).replace(/\.$/, "") + "."] || m;

  let authResolve = null;
  const authReady = new Promise(res => { authResolve = res; });
  function showAuth(mode, note) {
    style();
    let el = document.getElementById("lca-auth");
    if (!el) { el = document.createElement("div"); el.id = "lca-auth"; document.body.appendChild(el); }
    if (!URL0 || !KEY) {
      el.innerHTML = `<div class="box"><h1>Épület-LCA</h1><p class="sub">A program még nincs összekötve a felhős tárhellyel.</p><div class="cfg">Hiányzik a Supabase-beállítás (config). Ha a programot most állítod be, add meg a Supabase Project URL-t és a publishable kulcsot.</div></div>`;
      return;
    }
    const titles = { in: ["Belépés", "Lépj be, és minden eszközön ugyanazokat a projekteket éred el."], up: ["Regisztráció", "Hozz létre egy fiókot. A projektjeid ehhez a fiókhoz mentődnek."], reset: ["Új jelszó kérése", "Küldünk egy linket, amellyel új jelszót adhatsz meg."], newpw: ["Új jelszó megadása", "Add meg az új jelszavadat."] };
    const [t, s] = titles[mode];
    const em = mode === "newpw" ? "" : `<label>E-mail-cím<input id="la-email" type="email" autocomplete="email" required></label>`;
    const pw = mode === "reset" ? "" : `<label>${mode === "newpw" ? "Új jelszó" : "Jelszó"}<input id="la-pw" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="6" required></label>`;
    const btn = { in: "Belépés", up: "Fiók létrehozása", reset: "Link küldése", newpw: "Jelszó mentése" }[mode];
    const links = mode === "in" ? `<button type="button" data-m="up">Még nincs fiókom</button><button type="button" data-m="reset">Elfelejtett jelszó</button>`
      : mode === "newpw" ? "" : `<button type="button" data-m="in">Vissza a belépéshez</button>`;
    el.innerHTML = `<form class="box" novalidate><h1>Épület-LCA</h1><p class="sub"><b>${t}.</b> ${s}</p>${em}${pw}<button class="pri" type="submit">${btn}</button><p class="msg" id="la-msg" role="status"></p><div class="links">${links}</div></form>`;
    const msg = (m, ok) => { const x = el.querySelector("#la-msg"); x.textContent = m || ""; x.className = "msg " + (ok ? "ok" : "bad"); };
    if (note) msg(note, !/hib|nem|lejárt|invalid|expired/i.test(note));
    el.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => showAuth(b.dataset.m)));
    const f = el.querySelector("form"), first = el.querySelector("input"); if (first) setTimeout(() => first.focus(), 30);
    const saved = ls.get("lca-last-email"); if (saved && el.querySelector("#la-email")) el.querySelector("#la-email").value = saved;
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const email = (el.querySelector("#la-email") || {}).value, pass = (el.querySelector("#la-pw") || {}).value;
      if (mode !== "newpw" && !/^\S+@\S+\.\S+$/.test(email || "")) return msg("Adj meg egy érvényes e-mail-címet.");
      if (mode !== "reset" && (!pass || pass.length < 6)) return msg("A jelszó legalább 6 karakter legyen.");
      const b = f.querySelector("button.pri"); b.disabled = true; msg("Pillanat…", true);
      const redirect = CFG.siteUrl || (location.protocol.startsWith("http") ? location.origin + location.pathname : undefined);
      try {
        if (email) ls.set("lca-last-email", email);
        if (mode === "in") {
          keep(await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password: pass } }));
          done();
        } else if (mode === "up") {
          const r = await api("/auth/v1/signup" + (redirect ? "?redirect_to=" + encodeURIComponent(redirect) : ""), { method: "POST", auth: false, body: { email, password: pass } });
          if (r && r.access_token) { keep(r); done(); }
          else showAuth("in", "Elküldtük a megerősítő e-mailt. Kattints a benne lévő linkre, majd lépj be itt.");
        } else if (mode === "reset") {
          await api("/auth/v1/recover" + (redirect ? "?redirect_to=" + encodeURIComponent(redirect) : ""), { method: "POST", auth: false, body: { email } });
          showAuth("in", "Ha van fiók ezzel a címmel, elküldtük a linket. Az e-mailben kattints rá; utána itt az új jelszóval lépj be.");
        } else if (mode === "newpw") {
          await authed("/auth/v1/user", { method: "PUT", body: { password: pass } });
          pendingRecovery = false; done();
        }
      } catch (ex) { b.disabled = false; msg(hu(ex.message)); }
    });
  }
  async function done() {
    try { await fresh(); } catch (e) { }
    const el = document.getElementById("lca-auth"); if (el) el.remove();
    authResolve(session);
  }
  async function start() {
    if (linkError) { showAuth("in", "A link érvénytelen vagy lejárt: " + linkError); return; }
    if (session) {
      try { await fresh(); if (pendingRecovery) { showAuth("newpw"); return; } return done(); }
      catch (e) { if (e.code === "unavailable") return done(); drop(); }
    }
    showAuth("in");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  // ---------- adatbázis: a program "collection / doc" felülete egy docs(user_id, id, data) táblára
  function docRef(id) {
    return {
      async set(data) {
        await authed("/rest/v1/docs?on_conflict=user_id,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { user_id: session.user && session.user.id, id, data } });
      },
      async delete() { await authed("/rest/v1/docs?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { Prefer: "return=minimal" } }); }
    };
  }
  const db = {
    collection() {
      return {
        async get() {
          const out = []; let from = 0;
          for (; ;) {
            const rows = await authed("/rest/v1/docs?select=id,data&order=id", { headers: { Range: `${from}-${from + 499}`, "Range-Unit": "items" } }) || [];
            rows.forEach(r => out.push({ id: r.id, exists: true, data: () => r.data }));
            if (rows.length < 500) break; from += 500;
          }
          return { docs: out };
        },
        doc: docRef
      };
    }
  };
  const user = { async id() { await authReady; await fresh(); return session.user && session.user.id; }, async email() { return session && session.user && session.user.email; } };

  // ---------- letöltés
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      if (isDesktop && window.lcaDesktop.saveFile) {
        const r = await window.lcaDesktop.saveFile(filename, new Uint8Array(await blob.arrayBuffer()));
        if (r === "cancel") throw err("declined");
        return;
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
  };

  // ---------- MI (opcionális, saját Anthropic API-kulccsal)
  const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" };
  const sample = {
    async json(prompt, opts) {
      const key = ls.get(AIKEY);
      if (!key) throw err("not_granted", "Nincs megadva Anthropic API-kulcs.");
      let r;
      try {
        r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal: opts && opts.signal,
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: MODELS[(opts && opts.modelTier) || "default"] || MODELS.default, max_tokens: 2048, messages: [{ role: "user", content: prompt + "\n\nVálaszolj kizárólag egyetlen érvényes JSON-objektummal, magyarázat nélkül." }] })
        });
      } catch (e) { if (e && e.name === "AbortError") throw err("cancelled"); throw err("unavailable", "Az MI-szolgáltatás nem érhető el."); }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw err(r.status === 401 ? "not_granted" : "failed", (j && j.error && j.error.message) || ("HTTP " + r.status));
      const txt = (j.content || []).map(c => c.text || "").join("");
      const m = txt.match(/\{[\s\S]*\}/); if (!m) throw err("failed", "Az MI nem adott értelmezhető választ.");
      return JSON.parse(m[0]);
    }
  };

  window.claude = {
    async use(name) {
      if (name === "db") { await authReady; return db; }
      if (name === "user") { await authReady; return user; }
      if (name === "downloads") return downloads;
      if (name === "sample") { if (!ls.get(AIKEY)) throw err("not_granted"); return sample; }
      throw err("not_declared");
    }
  };

  // ---------- menüpontok: fiók, MI-kulcs, kijelentkezés
  function dlg(html, onOk) {
    style();
    const d = document.createElement("div"); d.className = "lca-dlg"; d.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    const close = () => d.remove();
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-x]")) close(); });
    const ok = d.querySelector("[data-ok]"); if (ok) ok.addEventListener("click", () => { onOk && onOk(d); close(); });
    const inp = d.querySelector("input"); if (inp) setTimeout(() => inp.focus(), 30);
  }
  function addMenu() {
    document.querySelectorAll(".kb-menu").forEach(m => {
      if (m.querySelector("[data-plat]")) return;
      m.insertAdjacentHTML("beforeend", `<hr style="border:0;border-top:1px solid var(--line);margin:4px 0"><button type="button" role="menuitem" data-plat="acct">Fiók: <span data-plat-email></span></button><button type="button" role="menuitem" data-plat="ai">MI-funkciók (API-kulcs)</button><button type="button" role="menuitem" data-plat="ver">Verzió és frissítés</button><button type="button" role="menuitem" data-plat="out">Kijelentkezés</button>`);
    });
    const em = (session && session.user && session.user.email) || "";
    document.querySelectorAll("[data-plat-email]").forEach(x => { x.textContent = em; });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-plat]"); if (!b) return;
    const k = b.dataset.plat;
    if (k === "out") {
      dlg(`<h2>Kijelentkezés</h2><p>Biztosan kijelentkezel? A projektjeid a fiókodban maradnak, újra belépve elérheted őket.</p><div class="row"><button data-x>Mégse</button><button class="pri" data-ok>Kijelentkezés</button></div>`, async () => {
        try { await api("/auth/v1/logout", { method: "POST" }); } catch (e) { }
        drop(); location.hash = ""; location.reload();
      });
    } else if (k === "ai") {
      const has = !!ls.get(AIKEY);
      dlg(`<h2>MI-funkciók</h2><p>A fordító (magyar → német/angol keresőszavak) és az EPD-ből való automatikus kitöltés MI-t használ. Az önálló programban ehhez saját Anthropic API-kulcs kell (console.anthropic.com → API Keys). A kulcs csak ezen az eszközön tárolódik, a felhőbe nem kerül fel; a hívások díját az Anthropic a kulcsodhoz tartozó fiókban számolja el.</p><p>${has ? "<b>Van megadva kulcs ezen az eszközön.</b> Új kulcs beírásával lecserélheted, üresen hagyva törlöd." : "Jelenleg nincs megadva kulcs: a fordító ilyenkor csak a beépített szótárat használja."}</p><input type="password" id="ai-key" placeholder="sk-ant-…" autocomplete="off"><div class="row"><button data-x>Mégse</button><button class="pri" data-ok>Mentés</button></div>`, d => {
        const v = d.querySelector("#ai-key").value.trim();
        if (v) ls.set(AIKEY, v); else ls.del(AIKEY);
        location.reload();
      });
    } else if (k === "ver") {
      dlg(`<h2>Verzió</h2><p>Programverzió: <b>${esc(CFG.version || "–")}</b>${isDesktop ? `<br>Asztali program: <b>${esc(window.lcaDesktop.version || "–")}</b>` : ""}</p><p>A program minden indításkor a legfrissebb változatot tölti be. Ha futás közben jelenik meg új változat, alul értesítést kapsz.</p><div class="row"><button data-x>Bezárás</button><button class="pri" data-ok>Frissítés most</button></div>`, () => location.reload());
    } else if (k === "acct") {
      dlg(`<h2>Fiók</h2><p>Bejelentkezve: <b>${esc(em())}</b></p><p>A projektjeid ehhez a fiókhoz mentődnek, és bármely eszközön elérhetők, ahol ugyanezzel a fiókkal belépsz (asztali program vagy böngésző: <b>${esc(CFG.siteUrl || location.origin)}</b>).</p><div class="row"><button class="pri" data-x>Rendben</button></div>`);
    }
    function em() { return (session && session.user && session.user.email) || ""; }
  });
  authReady.then(() => { addMenu(); setTimeout(addMenu, 500); });

  // ---------- új verzió figyelése
  async function checkVersion() {
    if (!CFG.version || !location.protocol.startsWith("http")) return;
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return;
      const v = (await r.json()).version;
      if (v && v !== CFG.version && !document.querySelector(".lca-banner")) {
        style();
        const b = document.createElement("div"); b.className = "lca-banner"; b.setAttribute("role", "status");
        b.innerHTML = `<span>Elérhető a program új változata.</span><button type="button">Frissítés</button><button type="button" class="x" aria-label="Később">✕</button>`;
        b.querySelector("button").addEventListener("click", () => location.reload());
        b.querySelector(".x").addEventListener("click", () => b.remove());
        document.body.appendChild(b);
      }
    } catch (e) { }
  }
  setInterval(checkVersion, 20 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });
  window.addEventListener("load", () => setTimeout(checkVersion, 5000));

  // ---------- másik eszközön tett változások: visszatéréskor a kezdőlapon frissítjük a listát
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const home = !location.hash || location.hash === "#projektek";
    if (session && home && hiddenAt && Date.now() - hiddenAt > 3 * 60 * 1000) location.reload();
  });
})();
