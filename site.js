/* anythrift storefront. Reads window.ANYTHRIFT (items.js).
   Pages are shared with the dev copy: when <body class="is-dev"> every link points at the dev-* pages,
   and "at:render" events let dev.js add its layer on top. */
(function () {
  var D = window.ANYTHRIFT || { items: [], stores: [], sample: false };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) { return "$" + Number(n).toFixed(2); };
  var isLink = function (u) { return /^https:\/\/(buy|checkout)\.stripe\.com\//.test(u || ""); };
  var P = document.body.classList.contains("is-dev") ? "dev-" : "";
  var page = function (f) { return P + f; };
  var fire = function (view) { document.dispatchEvent(new CustomEvent("at:render", { detail: { view: view } })); };
  window.AT_SITE = { data: D, money: money, esc: esc };

  var bar = $("#sample-bar");
  if (bar) bar.hidden = !D.sample;

  // Simple line drawings stand in for photos until real ones exist.
  var ICONS = {
    Kitchen: '<path d="M10 30h44"/><path d="M14 30c0 12 8 20 18 20s18-8 18-20"/><path d="M26 22c0-4 4-4 4-8M36 22c0-4 4-4 4-8"/>',
    "Home decor": '<path d="M22 14h20l6 18H16z"/><path d="M32 32v16"/><path d="M22 52h20"/>',
    Clothing: '<path d="M24 12l-12 8 5 9 5-3v26h20V26l5 3 5-9-12-8c-1 4-4 6-8 6s-7-2-8-6z"/>',
    Accessories: '<path d="M16 26h32l-3 24H19z"/><path d="M24 26c0-8 4-12 8-12s8 4 8 12"/>',
    Books: '<path d="M14 14h16v36H14zM30 18h14v32H30zM44 22l8 2-6 26-8-2"/>',
    Electronics: '<rect x="10" y="20" width="44" height="28" rx="4"/><circle cx="32" cy="34" r="8"/><path d="M22 20l4-6h12l4 6"/>'
  };
  var TINT = { Kitchen: "t1", "Home decor": "t2", Clothing: "t3", Accessories: "t4", Books: "t5", Electronics: "t6" };
  function photo(cat, label, src) {
    if (src) return '<div class="photo"><img src="' + esc(src) + '" alt="' + esc(label) + '" loading="lazy"></div>';
    var p = ICONS[cat] || '<rect x="14" y="14" width="36" height="36" rx="4"/>';
    return '<div class="photo ' + (TINT[cat] || "") + '" role="img" aria-label="Photo placeholder: ' + esc(label) + '"><svg viewBox="0 0 64 64" aria-hidden="true">' + p +
      "</svg><span>Photo coming</span></div>";
  }
  var PIN = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.5" r="1.8"/></svg>';

  function cardHtml(i) {
    var sold = i.status === "sold";
    var priceHtml = sold ? '<span class="pill warn">Sold</span>'
      : i.ship_price != null
        ? '<div class="price"><span class="ptag">' + money(i.ship_price) + '</span> <small>+ ' + money(i.shipping) + ' shipping</small></div>'
        : '<span class="pill">In-store only</span>';
    return '<a class="card" data-id="' + esc(i.id) + '" href="' + page("item-" + esc(i.id) + ".html") + '">' + photo(i.category, i.title, (i.photos || [])[0]) +
      '<div class="body"><span class="cat">' + esc(i.category) + '</span><h3>' + esc(i.title) + '</h3>' + priceHtml +
      '<div class="meta">' + PIN + esc(i.store) + ", " + esc(i.town) + "</div></div></a>";
  }
  window.AT_SITE.cardHtml = cardHtml;

  /* ---------- shop page ---------- */
  var grid = $("#grid");
  if (grid) {
    var q = $("#q"), sort = $("#sort"), count = $("#count"), chips = $("#chips"), current = "";
    var cats = D.items.map(function (i) { return i.category; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    chips.innerHTML = ['<button type="button" class="chip-btn" aria-pressed="true" data-cat="">All</button>'].concat(cats.map(function (c) {
      return '<button type="button" class="chip-btn" aria-pressed="false" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    })).join("");
    var st = $("#stat-items"), ss = $("#stat-shops");
    if (st) st.textContent = D.items.filter(function (i) { return i.status !== "removed"; }).length;
    if (ss) ss.textContent = (D.stores || []).length;

    var render = function () {
      var term = q.value.trim().toLowerCase();
      var list = D.items.filter(function (i) {
        if (i.status === "removed") return false;
        if (current && i.category !== current) return false;
        if (!term) return true;
        return (i.title + " " + i.category + " " + i.description + " " + i.town + " " + i.store).toLowerCase().indexOf(term) > -1;
      });
      var key = sort.value;
      list.sort(function (a, b) {
        var pa = a.ship_price == null ? Infinity : a.ship_price, pb = b.ship_price == null ? Infinity : b.ship_price;
        if (key === "low") return pa - pb;
        if (key === "high") return (b.ship_price || 0) - (a.ship_price || 0);
        return a.id < b.id ? 1 : -1; // newest first
      });
      count.textContent = list.length + (list.length === 1 ? " find" : " finds");
      grid.innerHTML = list.length ? list.map(cardHtml).join("")
        : '<p class="empty">Nothing matches that yet. Try a broader word, like "bowl" or "jacket".</p>';
      fire("shop");
    };
    $$(".chip-btn", chips).forEach(function (b) {
      b.addEventListener("click", function () {
        current = b.getAttribute("data-cat");
        $$(".chip-btn", chips).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        render();
      });
    });
    [q, sort].forEach(function (el) { el.addEventListener("input", render); });
    $("#shop-form").addEventListener("submit", function (e) { e.preventDefault(); render(); });
    render();
  }

  function gallery(it) {
    var ph = it.photos || [];
    if (!ph.length) return photo(it.category, it.title) + '<div class="thumbs">' +
      photo(it.category, "detail") + photo(it.category, "flaw close-up") + photo(it.category, "label") + "</div>";
    return photo(it.category, it.title, ph[0]) + (ph.length > 1 ? '<div class="thumbs">' +
      ph.slice(1, 7).map(function (s, n) { return photo(it.category, it.title + " photo " + (n + 2), s); }).join("") + "</div>" : "");
  }

  /* ---------- map page ---------- */
  var TOWNS = [["New Rochelle", 40.9115, -73.7824], ["Larchmont", 40.9279, -73.7518], ["Mamaroneck", 40.9487, -73.7326],
    ["Harrison", 40.9690, -73.7126], ["Rye", 40.9807, -73.6837], ["Port Chester", 41.0018, -73.6657],
    ["Scarsdale", 41.0051, -73.7846], ["White Plains", 41.0340, -73.7629]];
  var COAST = [[40.875, -73.805], [40.893, -73.778], [40.905, -73.760], [40.918, -73.742], [40.932, -73.726],
    [40.941, -73.712], [40.952, -73.698], [40.962, -73.684], [40.974, -73.672], [40.988, -73.657], [41.000, -73.645], [41.012, -73.630]];
  var B = { n: 41.050, s: 40.875, w: -73.815, e: -73.630 }, W = 640;
  var K = Math.cos(40.96 * Math.PI / 180), H = Math.round(W * (B.n - B.s) / ((B.e - B.w) * K));
  function px(lat, lng) { return [((lng - B.w) / (B.e - B.w)) * W, ((B.n - lat) / (B.n - B.s)) * H]; }
  function drawMap(el, stores, onPick) {
    var waterPts = COAST.map(function (c) { return px(c[0], c[1]).join(","); }).concat([W + "," + px(41.012, -73.630)[1], W + "," + H, "0," + H]).join(" ");
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Approximate map of lower Westchester with shop locations">' +
      '<rect width="' + W + '" height="' + H + '" class="m-land"/><polygon points="' + waterPts + '" class="m-water"/>' +
      '<text x="' + (W * 0.72) + '" y="' + (H * 0.9) + '" class="m-sound">Long Island Sound</text>' +
      TOWNS.map(function (t) { var p = px(t[1], t[2]); return '<text x="' + p[0] + '" y="' + (p[1] - 18) + '" class="m-town">' + esc(t[0]) + "</text>"; }).join("") +
      stores.map(function (s, n) {
        var p = px(s.lat, s.lng);
        return '<g class="m-pin" tabindex="0" role="button" data-store="' + esc(s.id) + '" aria-label="' + esc(s.name) + ", " + esc(s.town) + '">' +
          '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="11"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '">' + (n + 1) + "</text></g>";
      }).join("") + "</svg>";
    el.innerHTML = svg + '<figcaption>Approximate positions. Not for navigation.</figcaption>';
    $$(".m-pin", el).forEach(function (g) {
      var go = function () { onPick(g.getAttribute("data-store")); };
      g.addEventListener("click", go);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  var mapEl = $("#map");
  if (mapEl && D.stores) {
    var list = $("#store-list"), out = $("#store-items");
    var pick = function (id) {
      var st = D.stores.filter(function (s) { return s.id === id; })[0];
      if (!st) return;
      $$(".m-pin, .store-list button").forEach(function (n) { n.classList.toggle("is-active", n.getAttribute("data-store") === id); });
      var its = D.items.filter(function (i) { return i.store === st.name && i.status !== "removed"; });
      out.setAttribute("data-store", st.id);
      out.innerHTML = '<div class="store-head"><h2>' + esc(st.name) + '</h2><p class="fine">' + PIN + esc(st.town) + " · " + esc(st.kind) + (D.sample ? " (sample)" : "") +
        " · Open " + esc(st.hours) + '</p></div><div class="grid">' + its.map(cardHtml).join("") + "</div>";
      fire("map");
    };
    var lmap = null, markers = {};
    var fallback = function () {
      if (lmap) { try { lmap.remove(); } catch (e) {} lmap = null; markers = {}; }
      mapEl.className = "map"; drawMap(mapEl, D.stores, pick);
    };
    if (window.L && location.protocol.indexOf("http") === 0) {
      try {
        mapEl.className = "map map-live";
        mapEl.innerHTML = '<div id="leaflet" style="height:460px"></div><figcaption>Sample shops at approximate locations. Map data © OpenStreetMap contributors.</figcaption>';
        lmap = window.L.map("leaflet", { scrollWheelZoom: false }).setView([40.965, -73.735], 12);
        var tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(lmap);
        var fails = 0; tiles.on("tileerror", function () { if (++fails === 3) fallback(); });
        D.stores.forEach(function (s, n) {
          var mk = window.L.marker([s.lat, s.lng], { title: s.name, alt: s.name }).addTo(lmap)
            .bindTooltip(String(n + 1), { permanent: true, direction: "top", offset: [-15, -12], className: "m-num" })
            .bindPopup("<strong>" + esc(s.name) + "</strong><br>" + esc(s.town));
          mk.on("click", function () { pick(s.id); });
          markers[s.id] = mk;
        });
        var basePick = pick;
        pick = function (id) { basePick(id); var mk = markers[id]; if (lmap && mk) { mk.openPopup(); lmap.panTo(mk.getLatLng()); } };
      } catch (e) { fallback(); }
    } else {
      drawMap(mapEl, D.stores, pick);
    }
    list.innerHTML = D.stores.map(function (s, n) {
      var c = D.items.filter(function (i) { return i.store === s.name; }).length;
      return '<button type="button" data-store="' + esc(s.id) + '"><b>' + (n + 1) + "</b><span>" + esc(s.name) +
        "<small>" + esc(s.town) + " · " + c + " find" + (c === 1 ? "" : "s") + "</small></span></button>";
    }).join("");
    $$("button", list).forEach(function (b) { b.addEventListener("click", function () { pick(b.getAttribute("data-store")); }); });
    pick(D.stores[0].id);
  }

  /* ---------- item page ---------- */
  var box = $("#item");
  if (box) {
    var show = function () {
      var id = box.getAttribute("data-id") || decodeURIComponent(location.hash.slice(1));
      var it = D.items.filter(function (i) { return i.id === id; })[0];
      if (!it) {
        box.innerHTML = '<div class="prose"><h1>Item not found</h1><p>This item may have sold or the link is wrong. <a href="' + page("index.html") + '">Back to the shop</a>.</p></div>';
        document.title = "Item not found · anythrift";
        return;
      }
      document.title = (P ? "dev · " : "") + it.title + " · anythrift";
      var sold = it.status === "sold";
      var canShip = it.ship_price != null && !sold;
      var buy = isLink(it.payment_link)
        ? '<a class="btn primary" href="' + esc(it.payment_link) + '" rel="noopener">Buy &amp; ship</a>'
        : '<span class="btn primary" role="button" aria-disabled="true" title="Checkout isn\'t connected yet">Checkout coming soon</span>';
      var hold = isLink(it.hold_link)
        ? '<a class="btn ghost" href="' + esc(it.hold_link) + '" rel="noopener">Hold it for me · ' + money(it.hold_fee) + '</a>'
        : '<span class="btn ghost" role="button" aria-disabled="true">Holds coming soon · ' + money(it.hold_fee) + "</span>";
      var tag = sold
        ? '<div class="tag"><span class="pill warn">Sold</span><p class="fine">This one found a home. <a href="' + page("index.html") + '">See what else is in the shop</a>.</p></div>'
        : '<div class="tag">' +
            (canShip
              ? '<div class="price">' + money(it.ship_price) + ' <small>+ ' + money(it.shipping) + ' shipping</small></div>' +
                '<p class="fine">Ships within 7–9 days from Westchester, NY. Your card is only charged once we confirm the item is still on the shelf.</p>' +
                buy +
                '<p class="fine">By buying you agree to our <a href="' + page("returns.html") + '">returns policy</a>: full refund if it isn\'t as described; change-of-mind returns within 7 days, with return shipping and a $5 restocking fee paid by you.</p>'
              : '<span class="pill">In-store only</span><p class="fine">This one isn\'t available for shipping. You can see it in person at the shop below.</p>') +
            '<div class="instore"><strong>' + PIN + "Also at " + esc(it.store) + ", " + esc(it.town) + '</strong>' +
            '<p class="fine">See it in person and pay the shop\'s price at the register. Want it held for 48 hours first?</p>' + hold +
            '<p class="fine">Hold fees are non-refundable unless the shop couldn\'t hold the item, in which case you get a full refund.</p></div>' +
          "</div>";
      box.innerHTML =
        '<p class="back"><a href="' + page("index.html") + '">← Back to the shop</a></p>' +
        '<div class="item"><div class="gallery">' + gallery(it) + "</div>" +
        '<div class="info"><span class="cat">' + esc(it.category) + "</span><h1>" + esc(it.title) + "</h1>" + tag +
          '<dl class="specs"><dt>Condition</dt><dd>' + esc(it.condition) + "</dd>" +
          "<dt>Flaws</dt><dd>" + esc(it.flaws || "None we could find") + "</dd>" +
          "<dt>Size</dt><dd>" + esc(it.measurements) + "</dd>" +
          "<dt>Item #</dt><dd>" + esc(it.id) + "</dd></dl>" +
          '<p class="desc">' + esc(it.description) + "</p></div></div>";
      box.setAttribute("data-shown", it.id);
      fire("item");
    };
    window.addEventListener("hashchange", show);
    show();
  }

  if (!grid && !mapEl && !box) fire("page");
})();
