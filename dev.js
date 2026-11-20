/* anythrift DEV layer. Loaded only on dev-*.html pages, on top of the real site.
   Toolbar toggles: Numbers layer · Edit text · Rules · Notes. Pricing math mirrors tools/pricing.py.
   Needs window.AT_DEV (dev-data.js) and window.AT_SITE (site.js). */
(function () {
  "use strict";
  var DEV = window.AT_DEV, SITE = window.AT_SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var m = function (n) { return n == null || !isFinite(n) ? "–" : (n < 0 ? "−$" : "$") + Math.abs(n).toFixed(2); };
  var r2 = function (x) { return Math.round((x + 1e-9) * 100) / 100; };
  var ls = { get: function (k, d) { try { var v = localStorage.getItem("anythrift.dev." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("anythrift.dev." + k, JSON.stringify(v)); } catch (e) {} } };
  var FILE = (location.pathname.split("/").pop() || "dev-index.html").replace(/^dev-/, "") || "index.html";
  if (FILE === "" || FILE === "/") FILE = "index.html";
  var PRIV = {}; DEV.items.forEach(function (i) { PRIV[i.id] = i; });

  /* ---------------- pricing ---------------- */
  var SET = Object.assign({}, DEV.settings, ls.get("rules", {}));
  var LABELS = DEV.labels;
  function profitAt(P, tag, L) {
    var ship = r2(L + SET.handling), collected = P + ship;
    var fee = r2(collected * SET.card_pct + SET.card_fixed), ret = r2(P * SET.returns);
    return { collected: r2(collected), fee: fee, ret: ret, store: r2(tag + SET.store_extra),
      profit: r2(collected - fee - (tag + SET.store_extra) - L - SET.packaging - ret) };
  }
  function price(it) {
    var tag = +it.tag, sold = +it.sold || 0, their = +it.their_shipping || 0, L = LABELS[it.weight];
    var ship = r2(L + SET.handling);
    var floor = (SET.min_profit + tag + SET.store_extra + SET.packaging + SET.card_fixed + SET.card_pct * ship - SET.handling) / (1 - SET.card_pct - SET.returns);
    floor = Math.ceil(floor * 100) / 100;
    var g = 0; while (profitAt(floor, tag, L).profit < SET.min_profit && g++ < 500) floor = r2(floor + 0.01);
    var ceil = r2(SET.pct * (sold + their) - ship);
    var res = { tag: tag, sold: sold, their: their, L: L, ship: ship, floor: floor, ceil: ceil, hold: tag < 30 ? 3 : 5,
      market: r2(sold + their), needs: r2((floor + ship) / SET.pct - their) };
    if (sold <= 0 || ceil < floor) { res.ok = false; return res; }
    var P = Math.floor(ceil * 2) / 2; if (P < floor) P = floor;
    res.ok = true; res.price = r2(P); res.b = profitAt(P, tag, L);
    return res;
  }
  window.AT_DEV_price = price;
  function rulesChanged() { return Object.keys(DEV.settings).some(function (k) { return SET[k] !== DEV.settings[k]; }); }

  /* ---------------- storage: artifact db, else this browser ---------------- */
  var store = { db: null, mode: "local", notes: ls.get("notes", []), edits: ls.get("edits", {}) };
  function lsSave() { ls.set("notes", store.notes); ls.set("edits", store.edits); }
  function status(t) { var s = $("#dv-status"); if (s) s.textContent = t; }
  function initDb() {
    if (!window.claude || !window.claude.use) { status("Saves in this browser"); return; }
    var timer = setTimeout(function () { if (store.mode !== "db") status("Saves in this browser"); }, 10000);
    window.claude.use("db").then(function (db) {
      if (!db) { clearTimeout(timer); status("Saves in this browser"); return; }
      store.db = db; store.mode = "db"; status("Connecting…");
      db.collection("notes").onSnapshot(function (snap) {
        clearTimeout(timer);
        store.notes = snap.docs.map(function (d) { var x = Object.assign({}, d.data()); x.id = d.id; return x; })
          .sort(function (a, b) { return (b.created || "").localeCompare(a.created || ""); });
        status(snap.metadata.fromCache ? "Syncing…" : "Syncs to Claude"); paintNotes(); updateCount();
      }, function () { store.mode = "local"; status("Saves in this browser"); });
      db.collection("edits").onSnapshot(function (snap) {
        store.edits = {}; snap.docs.forEach(function (d) { var x = d.data(); store.edits[x.key] = x; });
        applyEdits(); updateCount();
      }, function () {});
    }, function () { clearTimeout(timer); status("Saves in this browser"); });
  }
  function addNote(text) {
    var n = { target: FILE, label: document.title.replace(/^dev · /, ""), text: text, created: new Date().toISOString() };
    if (store.mode === "db") return store.db.collection("notes").add(n).then(function () { toast("Note saved"); }, function () { toast("Couldn't save that note"); });
    n.id = "n" + Date.now(); store.notes.unshift(n); lsSave(); paintNotes(); updateCount(); toast("Note saved in this browser");
  }
  function delNote(id) {
    if (store.mode === "db") { store.db.collection("notes").doc(id).delete(); return; }
    store.notes = store.notes.filter(function (n) { return n.id !== id; }); lsSave(); paintNotes(); updateCount();
  }
  var pending = {};
  function saveEdit(key, original, text) {
    var e = { key: key, page: FILE, original: original, text: text, updated: new Date().toISOString() };
    store.edits[key] = e;
    if (store.mode === "db") {
      clearTimeout(pending[key]);
      pending[key] = setTimeout(function () { store.db.collection("edits").doc(key).set(e).then(function () { toast("Edit saved"); }, function () { toast("Couldn't save that edit"); }); }, 500);
    } else { lsSave(); toast("Edit saved in this browser"); }
    updateCount();
  }

  /* ---------------- toolbar ---------------- */
  var state = { layer: ls.get("layer", true), edit: false, rules: false, notes: false };
  var live = FILE;
  var bar = document.createElement("div");
  bar.className = "devbar";
  bar.innerHTML = '<div class="wrap"><b class="dv-brand">anythrift <span>dev</span></b>' +
    '<button type="button" class="dv-t" id="dv-layer">Numbers layer</button>' +
    '<button type="button" class="dv-t" id="dv-edit">Edit text</button>' +
    '<button type="button" class="dv-t" id="dv-rules">Rules</button>' +
    '<button type="button" class="dv-t" id="dv-notes">Notes &amp; edits (<span id="dv-count">0</span>)</button>' +
    '<a class="dv-l" href="dev-numbers.html">Numbers page</a>' +
    '<a class="dv-l" href="' + live + '" title="Same page without the dev tools">Live version ↗</a>' +
    '<span class="dv-sp"></span><span class="dv-status" id="dv-status" aria-live="polite">Loading…</span></div>' +
    '<div class="dv-rules" id="dv-rulesbar" hidden><div class="wrap"></div></div>';
  document.body.insertBefore(bar, document.body.firstChild);
  var drawer = document.createElement("aside");
  drawer.className = "dv-drawer"; drawer.id = "dv-drawer"; drawer.hidden = true; drawer.setAttribute("aria-label", "Notes and edits");
  document.body.appendChild(drawer);
  var toastEl = document.createElement("div"); toastEl.className = "dv-toast"; toastEl.hidden = true; document.body.appendChild(toastEl);
  function toast(t) { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.hidden = true; }, 1800); }
  function press(id, on) { $("#" + id).setAttribute("aria-pressed", String(!!on)); }
  function applyState() {
    document.body.classList.toggle("dev-off", !state.layer);
    document.body.classList.toggle("editing", state.edit);
    press("dv-layer", state.layer); press("dv-edit", state.edit); press("dv-rules", state.rules); press("dv-notes", state.notes);
    $("#dv-rulesbar").hidden = !state.rules; drawer.hidden = !state.notes;
  }
  $("#dv-layer").addEventListener("click", function () { state.layer = !state.layer; ls.set("layer", state.layer); applyState(); toast(state.layer ? "Numbers layer on" : "Looking at the real layout"); });
  $("#dv-edit").addEventListener("click", function () { state.edit = !state.edit; applyState(); markEditable(); toast(state.edit ? "Click any dashed text to change it" : "Edit text off"); });
  $("#dv-rules").addEventListener("click", function () { state.rules = !state.rules; applyState(); });
  $("#dv-notes").addEventListener("click", function () { state.notes = !state.notes; applyState(); paintNotes(); });

  /* rules bar */
  var FIELDS = [["pct", "Price vs market %", 100], ["min_profit", "Min profit $", 1], ["returns", "Returns cushion %", 100],
    ["store_extra", "Extra to store $", 1], ["packaging", "Packaging $", 1], ["minutes_per_order", "Minutes / order", 1]];
  $("#dv-rulesbar .wrap").innerHTML = FIELDS.map(function (f) {
    return '<label for="dv-' + f[0] + '">' + f[1] + '<input id="dv-' + f[0] + '" type="number" step="any" value="' + r2(SET[f[0]] * f[2]) + '"></label>';
  }).join("") + '<button type="button" class="btn ghost" id="dv-reset">Reset to decided rules</button><p class="fine" id="dv-rnote"></p>';
  function rnote() { $("#dv-rnote").textContent = rulesChanged() ? "What-if rules: numbers show what would change. The listed prices stay as built until the rules are changed for real." : "These are the decided rules."; }
  FIELDS.forEach(function (f) {
    $("#dv-" + f[0]).addEventListener("input", function (e) { var v = parseFloat(e.target.value); if (isFinite(v)) { SET[f[0]] = v / f[2]; ls.set("rules", diffRules()); rnote(); decorate(); } });
  });
  function diffRules() { var o = {}; Object.keys(DEV.settings).forEach(function (k) { if (SET[k] !== DEV.settings[k]) o[k] = SET[k]; }); return o; }
  $("#dv-reset").addEventListener("click", function () { SET = Object.assign({}, DEV.settings); ls.set("rules", {}); FIELDS.forEach(function (f) { $("#dv-" + f[0]).value = r2(SET[f[0]] * f[2]); }); rnote(); decorate(); });
  rnote();

  /* ---------------- numbers layer ---------------- */
  function line(label, value, why, cls) {
    return "<details" + (cls ? ' class="' + cls + '"' : "") + "><summary><span>" + label + "</span><span>" + value + "</span></summary><p>" + why + "</p></details>";
  }
  function chipFor(id, built) {
    var it = PRIV[id]; if (!it) return "";
    var p = price(it);
    var top = p.ok ? '<b>profit ' + m(p.b.profit) + "</b>" : "<b>in-store · needs " + m(p.needs) + " sold</b>";
    var diff = p.ok && built != null && p.price !== built ? " · at your rules " + m(p.price) : (!p.ok && built != null ? " · at your rules: in-store" : "");
    return '<div class="dev-layer dv-chip' + (p.ok && p.b.profit >= SET.min_profit + 2 ? "" : " low") + '">' + top + "<span>tag " + m(p.tag) + " · sold " + m(p.sold) + diff + "</span></div>";
  }
  function builtPrice(id) { var x = (SITE.data && SITE.data.items || []).filter(function (i) { return i.id === id; })[0]; return x ? x.ship_price : null; }
  function itemPanel(id) {
    var it = PRIV[id]; if (!it) return "";
    var p = price(it), pub = (SITE.data.items || []).filter(function (i) { return i.id === id; })[0] || {};
    var math = p.ok
      ? line("Buyer pays", m(p.b.collected), "Item " + m(p.price) + " + shipping " + m(p.ship) + ". Shipping = USPS label " + m(p.L) + " + " + m(SET.handling) + " handling.") +
        line("Card fee (Stripe)", "−" + m(p.b.fee), "<code>" + (SET.card_pct * 100).toFixed(1) + "% × " + m(p.b.collected) + " + " + m(SET.card_fixed) + "</code>, taken from every order.") +
        line("Shop gets", "−" + m(p.b.store), "The shop's tag price" + (SET.store_extra ? " + " + m(SET.store_extra) + " extra" : "") + ", paid at pickup.") +
        line("Shipping label", "−" + m(p.L), "USPS Ground Advantage estimate for " + esc(it.weight) + " (cost model zone blend). Pirate Ship shows the exact price.") +
        line("Packaging", "−" + m(SET.packaging), "Box, tape and padding per order (assumption).") +
        line("Returns cushion", "−" + m(p.b.ret), "<code>" + Math.round(SET.returns * 100) + "% × " + m(p.price) + "</code> set aside for refunds, damage and lost packages.") +
        line("Your profit", m(p.b.profit), "Before your time. At ~" + SET.minutes_per_order + " min of work per order that's about " + m(p.b.profit / SET.minutes_per_order * 60) + "/hour.", "total")
      : line("Verdict", "In-store only", "No price works: the highest you can charge (" + m(p.ceil) + ") is below the lowest that still makes " + m(SET.min_profit) + " (" + m(p.floor) + ").", "total");
    var how = line("Market (delivered)", m(p.market), "Usually sells for " + m(p.sold) + " + what those buyers paid to ship (" + m(p.their) + ").") +
      line("Highest you can list", m(p.ceil), "<code>" + Math.round(SET.pct * 100) + "% × " + m(p.market) + " − your shipping " + m(p.ship) + "</code>.") +
      line("Lowest that still pays", m(p.floor), "Where profit is exactly " + m(SET.min_profit) + " after every cost.") +
      (p.ok ? line("List at", m(p.price), "Highest price, rounded down to a clean $0.50." + (pub.ship_price != null && pub.ship_price !== p.price ? " The site currently shows " + m(pub.ship_price) + " (built with the decided rules)." : "")) : line("Would need to sell for", m(p.needs), "Sold price needed (with " + m(p.their) + " buyer shipping) for this to work.")) +
      line("Hold fee (locals)", m(p.hold), "$3 if the tag is under $30, else $5. $1 goes to the shop; Stripe takes ~" + m(r2(p.hold * SET.card_pct + SET.card_fixed)) + ".");
    return '<section class="dev-layer dv-panel" data-for="' + esc(id) + '"><h2>The math <small>dev only</small></h2><div class="dv-cols">' +
      '<div class="dv-box"><h3>' + (p.ok ? "Listed at " + m(p.price) + " + " + m(p.ship) + " shipping" : "In-store only") + '</h3><p class="fine">Tap any line to see how it\'s worked out.</p><div class="dv-math">' + math + "</div></div>" +
      '<div class="dv-box"><h3>How the price was set</h3><div class="dv-math">' + how + "</div>" +
      (it.comps_note ? '<p class="fine"><strong>Price research:</strong> ' + esc(it.comps_note) + "</p>" : "") +
      '<h3 style="margin-top:12px">What if?</h3><div class="dv-whatif">' +
      '<label for="wi-tag">Shop tag<input id="wi-tag" type="number" step="0.5" value="' + p.tag + '"></label>' +
      '<label for="wi-sold">Usually sells for<input id="wi-sold" type="number" step="0.5" value="' + p.sold + '"></label>' +
      '<label for="wi-their">Their shipping<input id="wi-their" type="number" step="0.5" value="' + p.their + '"></label>' +
      '<label for="wi-wt">Weight<select id="wi-wt">' + Object.keys(LABELS).map(function (w) { return "<option" + (w === it.weight ? " selected" : "") + ">" + w + "</option>"; }).join("") + "</select></label>" +
      '</div><p class="fine" id="wi-out"></p></div></div></section>';
  }
  function wireWhatIf(id) {
    var it = PRIV[id], out = $("#wi-out"); if (!out) return;
    var go = function () {
      var p = price(Object.assign({}, it, { tag: $("#wi-tag").value, sold: $("#wi-sold").value, their_shipping: $("#wi-their").value, weight: $("#wi-wt").value }));
      out.innerHTML = p.ok ? "→ list at <b>" + m(p.price) + "</b>, profit <b>" + m(p.b.profit) + "</b>" : "→ <b>in-store only</b> (needs " + m(p.needs) + " sold)";
    };
    ["wi-tag", "wi-sold", "wi-their", "wi-wt"].forEach(function (f) { $("#" + f).addEventListener("input", go); });
    go();
  }
  function numbersPage() {
    var host = $("#dev-numbers"); if (!host) return;
    var rows = DEV.items.filter(function (i) { return i.status !== "removed"; }).map(function (it) { return { it: it, p: price(it) }; });
    var ship = rows.filter(function (r) { return r.p.ok; }), ins = rows.length - ship.length;
    var sum = function (f) { return r2(ship.reduce(function (a, r) { return a + f(r); }, 0)); };
    var revenue = sum(function (r) { return r.p.b.collected; }), fees = sum(function (r) { return r.p.b.fee; }), shops = sum(function (r) { return r.p.b.store; }),
      labels = sum(function (r) { return r.p.L; }), pack = r2(ship.length * SET.packaging), ret = sum(function (r) { return r.p.b.ret; }), profit = sum(function (r) { return r.p.b.profit; });
    var hours = ship.length * SET.minutes_per_order / 60;
    var kpi = function (l, v, why) { return '<details class="dv-kpi"><summary><span>' + l + "</span><b>" + v + '</b></summary><p class="fine">' + why + "</p></details>"; };
    var byStore = (DEV.stores || []).map(function (s) {
      var rs = rows.filter(function (r) { return r.it.store === s.name; }), sh = rs.filter(function (r) { return r.p.ok; });
      return "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.town) + '</td><td class="n">' + rs.length + '</td><td class="n">' + sh.length + '</td><td class="n">' +
        m(r2(sh.reduce(function (a, r) { return a + r.p.b.profit; }, 0))) + '</td><td class="n">' + m(r2(sh.reduce(function (a, r) { return a + r.p.b.store; }, 0))) + "</td></tr>";
    }).join("");
    var byItem = rows.map(function (r) {
      return '<tr><td><a href="dev-item-' + esc(r.it.id) + '.html">' + esc(r.it.id) + "</a></td><td>" + esc(r.it.title) + '</td><td class="n">' + m(r.p.tag) + '</td><td class="n">' + m(r.p.sold) +
        '</td><td class="n">' + (r.p.ok ? m(r.p.price) : "in-store") + '</td><td class="n">' + (r.p.ok ? m(r.p.b.profit) : "–") + "</td></tr>";
    }).join("");
    host.innerHTML = '<div class="dv-kpis">' +
      kpi("Items for shipping", ship.length + " of " + rows.length, ins + " are in-store only: no price beats the market and still makes " + m(SET.min_profit) + ".") +
      kpi("Buyers pay", m(revenue), "Item price + shipping, every shippable item.") +
      kpi("Your profit", m(profit), "Buyers pay − card fees − shop payouts − labels − packaging − returns cushion.") +
      kpi("Avg profit / order", m(ship.length ? profit / ship.length : 0), "Profit ÷ " + ship.length + " orders.") +
      kpi("Profit / hour", m(hours ? profit / hours : 0), "Assumes " + SET.minutes_per_order + " min of your work per shipped order. Change it under Rules.") +
      kpi("Margin", (revenue ? Math.round(profit / revenue * 100) : 0) + "%", "Profit ÷ what buyers pay.") + "</div>" +
      '<div class="dv-box" style="margin-top:18px"><h3>Where the money goes</h3><div class="dv-math">' +
      line("Buyers pay", m(revenue), "Items + shipping charges.") + line("Card fees", "−" + m(fees), "Stripe on every order.") + line("Shop payouts", "−" + m(shops), "Tag prices paid to the shops.") +
      line("Shipping labels", "−" + m(labels), "USPS estimates by weight.") + line("Packaging", "−" + m(pack), m(SET.packaging) + " × " + ship.length + " orders.") + line("Returns cushion", "−" + m(ret), Math.round(SET.returns * 100) + "% of item prices.") +
      line("Profit", m(profit), "Before your time and before monthly costs (~$8: email + domain). All items are samples, and this assumes every one sells.", "total") + "</div></div>" +
      '<h2 style="margin:24px 0 10px">By shop</h2><div class="dv-table"><table><thead><tr><th>Shop</th><th>Town</th><th class="n">Items</th><th class="n">Ship</th><th class="n">Profit</th><th class="n">Shop earns</th></tr></thead><tbody>' + byStore + "</tbody></table></div>" +
      '<h2 style="margin:24px 0 10px">By item</h2><div class="dv-table"><table><thead><tr><th>#</th><th>Item</th><th class="n">Tag</th><th class="n">Sold</th><th class="n">List</th><th class="n">Profit</th></tr></thead><tbody>' + byItem + "</tbody></table></div>";
  }
  function decorate() {
    $$(".dv-chip").forEach(function (n) { n.remove(); });
    $$("a.card[data-id]").forEach(function (a) { var b = $(".body", a); if (b) b.insertAdjacentHTML("beforeend", chipFor(a.getAttribute("data-id"), builtPrice(a.getAttribute("data-id")))); });
    var box = $("#item[data-shown]");
    if (box) { var old = $(".dv-panel"); if (old) old.remove(); var id = box.getAttribute("data-shown"); box.insertAdjacentHTML("beforeend", itemPanel(id)); wireWhatIf(id); }
    var sh = $(".store-head");
    if (sh) {
      var out = $("#store-items"), st = (DEV.stores || []).filter(function (s) { return s.id === out.getAttribute("data-store"); })[0];
      var old2 = $(".dv-store"); if (old2) old2.remove();
      if (st) {
        var its = DEV.items.filter(function (i) { return i.store === st.name; }), ps = its.map(price), ok = ps.filter(function (p) { return p.ok; });
        sh.insertAdjacentHTML("beforeend", '<p class="dev-layer dv-store">' + ok.length + " of " + its.length + " ship · potential profit <b>" + m(r2(ok.reduce(function (a, p) { return a + p.b.profit; }, 0))) +
          "</b> · shop would earn " + m(r2(ok.reduce(function (a, p) { return a + p.b.store; }, 0))) + "</p>");
      }
    }
    numbersPage();
    applyEdits(); markEditable();
  }

  /* ---------------- edit text ---------------- */
  var EDITABLE = "h1,h2,h3,p,li,dd,dt,.cat,.fact span,.meta,.lede,.box strong";
  function candidates() {
    var main = $("#main"); if (!main) return [];
    return $$(EDITABLE, main).filter(function (el) {
      return !el.closest(".dev-layer") && !el.closest(".dv-drawer") && !el.closest("form") && !el.querySelector("p,li,h1,h2,h3,dd,div") && el.textContent.trim();
    });
  }
  function keyOf(el, n) {
    var id = el.closest("[data-id]"); var scope = id ? id.getAttribute("data-id") : FILE;
    return (scope + ":" + n).replace(/[^\w\-.~:@+]/g, "_");
  }
  function applyEdits() {
    candidates().forEach(function (el, n) {
      var k = keyOf(el, n); el.setAttribute("data-dvkey", k);
      if (!el.hasAttribute("data-dvorig")) el.setAttribute("data-dvorig", el.textContent.trim());
      var e = store.edits[k];
      if (e && e.original === el.getAttribute("data-dvorig") && el.textContent.trim() !== e.text) { el.textContent = e.text; }
      el.toggleAttribute("data-dvedited", !!e);
    });
  }
  function markEditable() {
    candidates().forEach(function (el) {
      if (state.edit) el.setAttribute("contenteditable", "true"); else el.removeAttribute("contenteditable");
      if (!el._dvw) {
        el._dvw = true;
        el.addEventListener("blur", function () {
          if (!state.edit) return;
          var k = el.getAttribute("data-dvkey"), orig = el.getAttribute("data-dvorig"), now = el.textContent.trim();
          var was = store.edits[k] ? store.edits[k].text : orig;
          if (now !== was) saveEdit(k, orig, now);
        });
      }
    });
  }
  document.addEventListener("click", function (e) {
    if (state.edit && e.target.closest("#main a") && !e.target.closest(".dev-layer")) e.preventDefault();
  }, true);

  /* ---------------- notes drawer ---------------- */
  function paintNotes() {
    if (drawer.hidden) return;
    var here = store.notes.filter(function (n) { return n.target === FILE; });
    var others = store.notes.filter(function (n) { return n.target !== FILE; });
    var edits = Object.keys(store.edits).map(function (k) { return store.edits[k]; });
    var noteHtml = function (n) { return '<div class="dv-note"><small>' + esc(n.label || n.target) + " · " + esc((n.created || "").slice(0, 16).replace("T", " ")) + "</small><div>" + esc(n.text) + '</div><button type="button" data-del="' + esc(n.id) + '">Delete</button></div>'; };
    drawer.innerHTML = '<div class="dv-dhead"><h2>Notes &amp; edits</h2><button type="button" class="dv-x" id="dv-close" aria-label="Close">×</button></div>' +
      '<p class="fine">' + (store.mode === "db" ? "These sync to Claude, who reads them and makes the changes." : "Saved in this browser only. Use Copy all to send them to Claude.") + "</p>" +
      '<form id="dv-add"><label class="skip" for="dv-text">New note</label><textarea id="dv-text" placeholder="Note about this page…"></textarea><button class="btn primary" type="submit">Add note</button></form>' +
      "<h3>This page (" + here.length + ")</h3>" + (here.map(noteHtml).join("") || '<p class="fine">No notes here yet.</p>') +
      "<h3>Other pages (" + others.length + ")</h3>" + (others.map(noteHtml).join("") || '<p class="fine">None.</p>') +
      "<h3>Text edits (" + edits.length + ")</h3>" + (edits.map(function (e) { return '<div class="dv-note"><small>' + esc(e.page) + "</small><div><s>" + esc(e.original) + "</s></div><div>" + esc(e.text) + "</div></div>"; }).join("") || '<p class="fine">Turn on Edit text and click any dashed text.</p>') +
      (store.mode === "db" ? "" : '<button type="button" class="btn ghost" id="dv-copy">Copy all</button>');
    $("#dv-close").addEventListener("click", function () { state.notes = false; applyState(); });
    $("#dv-add").addEventListener("submit", function (e) { e.preventDefault(); var t = $("#dv-text").value.trim(); if (t) addNote(t); });
    $$("[data-del]", drawer).forEach(function (b) { b.addEventListener("click", function () { delNote(b.getAttribute("data-del")); }); });
    var c = $("#dv-copy");
    if (c) c.addEventListener("click", function () {
      var t = JSON.stringify({ notes: store.notes, edits: store.edits }, null, 1);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied"); }, function () { toast("Couldn't copy"); });
    });
  }
  function updateCount() { $("#dv-count").textContent = store.notes.length + Object.keys(store.edits).length; }

  document.addEventListener("at:render", decorate);
  applyState(); decorate(); updateCount(); initDb();
})();
