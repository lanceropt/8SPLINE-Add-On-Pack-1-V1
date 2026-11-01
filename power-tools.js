// =====================================================================
// 8SPINE POWER TOOLS v1.0.4  (tweak module - not a music source)
// ---------------------------------------------------------------------
// What it does (applied automatically when you OPEN this module):
//   1. NORMALIZATION - finds the app's audio-normalization flags and
//      forces them ON (toggleable).
//   2. AD-FREE MODE  - for users who ALREADY have Premium: flips the
//      app-side premium flags and disables ad calls / ad components.
//      (No DRM or stream logic is touched.)
//   3. VOLUME SYNC   - bridges the player volume slider with the real
//      iOS system volume (works when a native volume manager is found).
//   4. BADGES        - hides quality badges below Lossless; shows
//      "Lossless" for lossless and "Dolby Atmos" for Dolby.
//   5. SETTINGS UI   - adds a "Power Tools" section at the top of the
//      app's Settings page (toggle: ui on/off).
//
// HOW TO USE
//   Install from the source, then tap OPEN. Tweaks apply on open.
//   Use the SEARCH BOX of this module as a command console. Type:
//       help        - list all commands
//       status      - quick state
//       diag        - full diagnostics (send this back if something
//                     does not work yet - it tells us exactly what
//                     the engine found inside the app)
// =====================================================================
// Tested patterns adapted from working 8SPINE modules:
//   - Map.prototype.get spy to mirror the RN module registry
//   - registry capture through the app's permitted pre-hook interface
//   - SettingsPage default-export proxy hook
// Code is evaluated by the app's module sandbox.

var g = this;

var VERSION = "1.0.4";
var PT_KEY = "pt_toggles_v1";

var STATE = null;
try { STATE = g.__POWER_TOOLS__; } catch (e1) {}
if (!STATE || STATE.v !== 1) {
  STATE = {
    v: 1,
    opens: 0,
    ready: false,
    scanning: false,
    scannedOnce: false,
    scanned: 0,
    spyInstalled: false,
    spyMode: "-",
    mods: {},            // mirror of RN module registry: id -> {id, exports, factory}
    stores: [],          // {id, obj, kind, keys}
    modules: [],         // {id, obj}  module instances (searchTracks...)
    adFns: [],           // {id, obj, key, comp}
    badgeFns: [],        // {id, obj, key}
    findings: [],        // {tag, id, note}
    rn: null, react: null, settingsPage: null, storage: null,
    volmgr: null, manager: null,
    settingsHooked: false,
    uiRenders: 0,
    volTimer: null, volLastOS: null, volLastApp: null,
    toggles: { norm: true, ads: true, prem: true, badges: true, vol: true, ui: true },
    revert: [],
    log: [],
    rowId: 0,
    reapTimer: null
  };
  try { g.__POWER_TOOLS__ = STATE; } catch (e2) {}
}

function PT_log(msg) {
  try {
    STATE.log.push("[" + (STATE.log.length + 1) + "] " + String(msg));
    if (STATE.log.length > 300) STATE.log.shift();
  } catch (e) {}
}

function PT_applied(tag, msg) {
  PT_log("apply/" + tag + ": " + msg);
}

// ---------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------

function PT_interop(ex) {
  if (!ex) return null;
  if (typeof ex === "function") return ex;
  if (typeof ex === "object") {
    if (typeof ex.default === "function") return ex.default;
    if (ex.default && typeof ex.default.default === "function") return ex.default.default;
  }
  return null;
}

function PT_trySetDefault(ex, val) {
  try { ex.default = val; return { ok: true }; } catch (e1) {
    try {
      Object.defineProperty(ex, "default", { value: val, writable: true, configurable: true });
      return { ok: true };
    } catch (e2) { return { ok: false }; }
  }
}

function PT_forLevels(ex, fn) {
  fn(ex, "");
  if (ex && typeof ex === "object" && ex.default && typeof ex.default === "object") {
    fn(ex.default, "default.");
  }
}

function PT_keyNames(ex) {
  var out = [];
  try { for (var k in ex) out.push(k); } catch (e) {}
  try {
    if (ex && typeof ex === "object" && ex.default && typeof ex.default === "object") {
      for (var k2 in ex.default) out.push("default." + k2);
    }
  } catch (e2) {}
  return out.length > 120 ? out.slice(0, 120) : out;
}

function PT_rec(tag, id, note) {
  STATE.findings.push({ tag: tag, id: id, note: note || "" });
  PT_log("found/" + tag + ": " + id + (note ? " (" + note + ")" : ""));
}

// ---------------------------------------------------------------------
// Module registry spy (mirrors every internal module the app touches)
// ---------------------------------------------------------------------

function PT_installSpy() {
  if (STATE.spyInstalled) return true;
  var pre = null;
  try { pre = (g.__SPINE_PRE__ = g.__SPINE_PRE__ || {}); } catch (e) { return false; }

  // If another module (e.g. paras8 loader) already runs a spy, reuse it.
  if (g.__SPINE_MODS_SPY__ && pre.mods) {
    STATE.mods = pre.mods;
    try {
      (pre.modsCbs = pre.modsCbs || []).push(function (id, rec) {
        if (rec && rec.exports !== undefined) { STATE.mods[String(id)] = rec; }
      });
    } catch (e2) {}
    STATE.spyInstalled = true;
    STATE.spyMode = "shared";
    PT_log("spy: shared with existing __SPINE_PRE__ spy");
    return true;
  }

  if (typeof Map === "undefined" || typeof Map.prototype.get !== "function") return false;
  var origGet = Map.prototype.get;
  var mirror = (pre.mods = pre.mods || {});
  STATE.mods = mirror;
  Map.prototype.get = function (k) {
    var r = origGet.call(this, k);
    try {
      if (r && typeof r === "object" && r.publicModule &&
          (r.isInitialized !== undefined || r.factory !== undefined)) {
        var id = String(k);
        var rec = mirror[id];
        if (!rec) { rec = mirror[id] = {}; }
        rec.id = id;
        if (r.isInitialized) { rec.initialized = true; }
        if (r.factory && typeof r.factory === "function") { rec.factory = r.factory; }
        if (r.publicModule.exports !== undefined) { rec.exports = r.publicModule.exports; }
        if (STATE.onCapture) { try { STATE.onCapture(id, rec); } catch (e5) {} }
      }
    } catch (e3) {}
    return r;
  };
  try { g.__SPINE_MODS_SPY__ = 1; } catch (e4) {}
  STATE.spyInstalled = true;
  STATE.spyMode = "own";
  PT_log("spy: installed on Map.prototype.get");
  return true;
}

// ---------------------------------------------------------------------
// Registry classification pass
// ---------------------------------------------------------------------

function PT_startScan(done) {
  if (STATE.scannedOnce || STATE.scanning) { if (done) done(false); return; }
  STATE.scannedOnce = true;
  STATE.scanning = false;
  STATE.scanned = Object.keys(STATE.mods).length;
  PT_log("scan: registry capture pass (" + STATE.scanned + " modules mirrored)");
  PT_classifyAll();
  if (done) done(true);
}

// ---------------------------------------------------------------------
// Classification of mirrored exports
// ---------------------------------------------------------------------

function PT_storeKind(o) {
  try {
    if (!o || typeof o !== "object") return null;
    if (typeof o.getState === "function" && typeof o.setState === "function") return "zustand";
    if (typeof o.getState === "function" && typeof o.dispatch === "function" &&
        typeof o.subscribe === "function") return "redux";
  } catch (e) {}
  return null;
}

function PT_stateKeys(o) {
  var keys = [];
  try {
    var st = o.getState();
    if (st && typeof st === "object") { for (var k in st) keys.push(k); }
  } catch (e) {}
  return keys;
}

var RX_AD_FN   = /^(show|display|present|load|preload|init|fetch|request)(ad|ads|interstitial|interstitialad|rewardedad|rewarded|bannerad|appopenad)$/i;
var RX_AD_FN2  = /^(show|load|preload|display|present|init|fetch|request|create|register)\w*(interstitial|rewarded|sponsor)/i;
var RX_AD_NOUN = /^ads?(banner|view|card|component|unit|strip|label)?$/i;
var RX_AD_COMP = /^(Ad(Banner|View|Card|Component|Box|Container|Strip|Row|Label)|BannerAd|InterstitialAd|AdView|AdCard)$/i;
var RX_BADGE_FN = /(badge|qualitylabel|qualitytext|qualityfor|getquality|qualitystring)/i;

function PT_killAdsIn(id, ex) {
  PT_forLevels(ex, function (o, pfx) {
    if (!o || typeof o !== "object") return;
    var keys = null;
    try { keys = Object.keys(o); } catch (e) { return; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = null;
      try { v = o[k]; } catch (e2) { continue; }
      if (typeof v !== "function") continue;
      var isComp = /^[A-Z]/.test(k);
      var hit = RX_AD_FN.test(k) || RX_AD_FN2.test(k) || RX_AD_NOUN.test(k) ||
                (isComp && RX_AD_COMP.test(k));
      if (hit) {
        STATE.adFns.push({ id: id, obj: o, key: k, comp: isComp });
        PT_rec("adfn", id, pfx + k + (isComp ? " [component]" : " [fn]"));
      }
    }
  });
}

function PT_wrapBadgesIn(id, ex) {
  PT_forLevels(ex, function (o, pfx) {
    if (!o || typeof o !== "object") return;
    var keys = null;
    try { keys = Object.keys(o); } catch (e) { return; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = null;
      try { v = o[k]; } catch (e2) { continue; }
      if (typeof v !== "function") continue;
      if (RX_BADGE_FN.test(k)) {
        STATE.badgeFns.push({ id: id, obj: o, key: k });
        PT_rec("badgefn", id, pfx + k);
      }
    }
  });
}

function PT_classifyRecord(id, ex) {
  if (!ex || typeof ex !== "object") return;
  if (ex.__ptClassified) return;
  try {
    Object.defineProperty(ex, "__ptClassified", { value: 1, enumerable: false, configurable: true });
  } catch (e0) { return; }

  // react-native core components
  if (!STATE.rn && typeof ex.View === "function" && typeof ex.Text === "function" &&
      typeof ex.Pressable === "function") {
    STATE.rn = ex;
    PT_rec("rn", id, "react-native components");
  }
  // React
  if (!STATE.react && typeof ex.createElement === "function" && typeof ex.version === "string") {
    STATE.react = ex;
    PT_rec("react", id, "React " + ex.version);
  }
  // SettingsPage
  if (!STATE.settingsPage) {
    var d = PT_interop(ex);
    if (d && typeof d === "function" &&
        (d.name === "SettingsPage" || d.displayName === "SettingsPage")) {
      STATE.settingsPage = { ex: ex, fn: d };
      PT_rec("settings", id, "SettingsPage");
    }
  }
  // AsyncStorage
  if (!STATE.storage && typeof ex.getItem === "function" && typeof ex.setItem === "function" &&
      typeof ex.removeItem === "function") {
    STATE.storage = ex;
    PT_rec("storage", id, "AsyncStorage");
  }

  PT_forLevels(ex, function (o, pfx) {
    if (!o || typeof o !== "object") return;
    // state stores
    var kind = PT_storeKind(o);
    if (kind) {
      STATE.stores.push({ id: id, obj: o, kind: kind, keys: PT_stateKeys(o) });
      PT_rec("store", id, pfx + kind + " [" + PT_stateKeys(o).slice(0, 6).join(", ") + "]");
    }
    // module instances (any source module: searchTracks + getTrackStreamUrl)
    if (typeof o.searchTracks === "function") {
      STATE.modules.push({ id: id, obj: o, isOwnModule: o.id === "power-tools" });
      PT_rec("module", id, pfx + "instance id=" + (o.id || "?"));
    }
    // Module Manager
    if (!STATE.manager && o.modules instanceof Map &&
        (typeof o.loadModule === "function" || typeof o.setActiveModule === "function" ||
         typeof o.getActiveModule === "function")) {
      STATE.manager = o;
      PT_rec("manager", id, pfx + "Module Manager");
    }
    // native volume manager
    if (!STATE.volmgr && typeof o.setVolume === "function" &&
        (typeof o.getVolume === "function" || typeof o.addVolumeListener === "function")) {
      STATE.volmgr = o;
      PT_rec("volmgr", id, pfx + "volume manager");
    }
  });

  PT_killAdsIn(id, ex);
  PT_wrapBadgesIn(id, ex);
}

function PT_classifyAll() {
  var ids = Object.keys(STATE.mods);
  for (var i = 0; i < ids.length; i++) {
    try { PT_classifyRecord(ids[i], STATE.mods[ids[i]].exports); } catch (e) {}
  }
  PT_log("classify: " + STATE.stores.length + " stores, " + STATE.modules.length +
         " module instances, volmgr=" + (STATE.volmgr ? "yes" : "no") +
         ", storage=" + (STATE.storage ? "yes" : "no") +
         ", settings=" + (STATE.settingsPage ? "yes" : "no"));
}

function PT_scheduleReapply() {
  if (STATE.reapTimer) return;
  STATE.reapTimer = setTimeout(function () {
    STATE.reapTimer = null;
    if (STATE.ready) PT_applyAll(true);
  }, 400);
}

// ---------------------------------------------------------------------
// Patch helpers with revert bookkeeping
// ---------------------------------------------------------------------

function PT_revertTag(tag) {
  for (var i = STATE.revert.length - 1; i >= 0; i--) {
    var r = STATE.revert[i];
    if (r.tag !== tag) continue;
    if (r.type === "store") {
      try { var o = {}; o[r.key] = r.prev; r.obj.setState(o); } catch (e) {}
    } else {
      try { r.obj[r.key] = r.prev; } catch (e2) {}
      try {
        Object.defineProperty(r.obj, r.key, { value: r.prev, writable: true, configurable: true });
      } catch (e3) {}
    }
    STATE.revert.splice(i, 1);
  }
}

function PT_setStoreKey(store, key, val, tag) {
  try {
    var prev = store.getState()[key];
    var part = {}; part[key] = val;
    store.setState(part);
    STATE.revert.push({ type: "store", obj: store, key: key, prev: prev, tag: tag });
    return true;
  } catch (e) { return false; }
}

function PT_forEachStoreKey(fn) {
  for (var i = 0; i < STATE.stores.length; i++) {
    var st = null;
    try { st = STATE.stores[i].obj.getState(); } catch (e) { continue; }
    if (!st || typeof st !== "object") continue;
    for (var k in st) {
      try { fn(STATE.stores[i].obj, k, st[k]); } catch (e2) {}
    }
  }
}

// ---------------------------------------------------------------------
// Patch 1+3: normalization and premium flags (store layer)
// ---------------------------------------------------------------------

var RX_NORM = /normali[sz]|loudness|soundcheck|replaygain/i;
var RX_PREM = /^(is|has|user)?(premium|pro|plus)(enabled|unlocked|active|user|member|subscribed)?$/i;

function PT_applyNorm() {
  PT_revertTag("norm");
  if (!STATE.toggles.norm) { PT_applied("norm", "off (original values restored)"); return; }
  var n = 0;
  PT_forEachStoreKey(function (store, k, v) {
    if (RX_NORM.test(k) && typeof v === "boolean") {
      if (PT_setStoreKey(store, k, true, "norm")) n++;
    }
  });
  PT_applied("norm", n + " normalization flag(s) forced ON");
}

function PT_applyPrem() {
  PT_revertTag("prem");
  if (!STATE.toggles.prem) { PT_applied("prem", "off (original values restored)"); return; }
  var n = 0;
  PT_forEachStoreKey(function (store, k, v) {
    if (RX_PREM.test(k) && typeof v === "boolean" && v !== true) {
      if (PT_setStoreKey(store, k, true, "prem")) n++;
    }
  });
  PT_applied("prem", n + " premium flag(s) set true (you already pay for premium)");
}

// ---------------------------------------------------------------------
// Patch 2: ad-free mode
// ---------------------------------------------------------------------

function PT_adNoop(comp) {
  if (comp) {
    return function () { return null; };
  }
  return function () {
    try { return Promise.resolve(null); } catch (e) { return null; }
  };
}

function PT_applyAds() {
  PT_revertTag("ads");
  if (!STATE.toggles.ads) { PT_applied("ads", "off (original values restored)"); return; }
  var n = 0;
  PT_forEachStoreKey(function (store, k, v) {
    if (/^(showads|adsenabled|adsvisible|adson|displayads|showadbanner)$/i.test(k) &&
        typeof v === "boolean" && v !== false) {
      if (PT_setStoreKey(store, k, false, "ads")) n++;
    }
  });
  for (var i = 0; i < STATE.adFns.length; i++) {
    var f = STATE.adFns[i];
    try {
      if (typeof f.obj[f.key] !== "function") continue;
      STATE.revert.push({ type: "fn", obj: f.obj, key: f.key, prev: f.obj[f.key], tag: "ads" });
      f.obj[f.key] = PT_adNoop(f.comp);
      n++;
    } catch (e) {}
  }
  PT_applied("ads", n + " ad flag(s)/call(s) disabled");
}

// ---------------------------------------------------------------------
// Patch 4: quality badges (data layer + label functions)
// ---------------------------------------------------------------------

function PT_mapTrackQuality(t) {
  if (!t || typeof t !== "object") return t;
  var q = String(t.audioQuality || t.quality || "");
  var codec = String(t.codec || "").toLowerCase();
  var isDolby = /atmos|dolby|spatial/i.test(q) || /ec-3|eac3|joc|ac-4/.test(codec);
  var isLossless = /lossless|hi[-_ ]?res|flac|alac|wav|aiff/i.test(q) ||
                   /flac|alac|wav|aiff|pcm/.test(codec);
  if (isDolby) { t.audioQuality = "DOLBY_ATMOS"; return t; }
  if (isLossless) { t.audioQuality = "LOSSLESS"; return t; }
  // below lossless: strip quality info so no badge renders
  if (q || t.bitrate || t.bitDepth || codec) {
    try { delete t.audioQuality; } catch (e1) { t.audioQuality = undefined; }
    try { delete t.quality; } catch (e2) { t.quality = undefined; }
    try { delete t.bitrate; } catch (e3) { t.bitrate = undefined; }
    try { delete t.bitDepth; } catch (e4) { t.bitDepth = undefined; }
    try { delete t.codec; } catch (e5) { t.codec = undefined; }
  }
  return t;
}

function PT_mapTracksRes(res) {
  try {
    if (res && typeof res === "object") {
      if (Array.isArray(res.tracks)) {
        for (var i = 0; i < res.tracks.length; i++) PT_mapTrackQuality(res.tracks[i]);
      } else if (Array.isArray(res)) {
        for (var j = 0; j < res.length; j++) PT_mapTrackQuality(res[j]);
      }
      if (res.track) PT_mapTrackQuality(res.track);
    }
  } catch (e) {}
  return res;
}

function PT_mapBadge(v) {
  if (v == null) return v;
  var on = STATE.toggles.badges;
  var pick = function (o) { return o.label || o.text || o.name || o.title || ""; };
  var setL = function (o, s) {
    if ("label" in o) o.label = s;
    if ("text" in o) o.text = s;
    if ("name" in o) o.name = s;
    if ("title" in o) o.title = s;
  };
  if (typeof v === "string") {
    if (/atmos|dolby/i.test(v)) return on ? "Dolby Atmos" : v;
    if (/hi[-_ ]?res|hi res|lossless|alac|flac|24bit|24-bit/i.test(v)) return on ? "Lossless" : v;
    if (/aac|mp3|standard|\bhigh\b(?!er)|\blow\b|\b[0-9]{3}\s?kbps/i.test(v)) return on ? null : v;
    return v;
  }
  if (typeof v === "object") {
    var s = pick(v);
    if (!s) return v;
    if (/atmos|dolby/i.test(s)) { setL(v, "Dolby Atmos"); return v; }
    if (/hi[-_ ]?res|hi res|lossless|alac|flac|24bit/i.test(s)) { setL(v, "Lossless"); return v; }
    if (/aac|mp3|standard|\bhigh\b(?!er)|\blow\b/i.test(s)) return null;
    return v;
  }
  return v;
}

function PT_setFn(obj, key, fn) {
  try { obj[key] = fn; return true; } catch (e) {
    try {
      Object.defineProperty(obj, key, { value: fn, writable: true, configurable: true });
      return true;
    } catch (e2) { return false; }
  }
}

function PT_wrapInstance(inst) {
  if (!inst || typeof inst !== "object" || inst.__ptWrapped) return;
  if (inst.id === "power-tools") return;
  try {
    Object.defineProperty(inst, "__ptWrapped", { value: 1, enumerable: false, configurable: true });
  } catch (e) { return; }
  var wrap = function (name, mapper) {
    var orig = inst[name];
    if (typeof orig !== "function" || orig.__pt) return;
    var wrapped = function () {
      try {
        var r = orig.apply(this, arguments);
        if (r && typeof r.then === "function") {
          return r.then(function (res) { return mapper(res); },
                        function (err) { throw err; });
        }
        return mapper(r);
      } catch (e) { return orig.apply(this, arguments); }
    };
    try { wrapped.__pt = 1; } catch (e2) {}
    PT_setFn(inst, name, wrapped);
  };
  wrap("searchTracks", PT_mapTracksRes);
  wrap("getTrackStreamUrl", PT_mapTracksRes);
  wrap("getTrackDownloadUrl", PT_mapTracksRes);
}

function PT_applyBadges() {
  PT_revertTag("badges");
  if (!STATE.toggles.badges) { PT_applied("badges", "off (original values restored)"); return; }
  var n = 0;
  for (var i = 0; i < STATE.modules.length; i++) {
    var m = STATE.modules[i];
    if (m.isOwnModule) continue;
    try { PT_wrapInstance(m.obj); n++; } catch (e) {}
  }
  for (var j = 0; j < STATE.badgeFns.length; j++) {
    var f = STATE.badgeFns[j];
    try {
      if (typeof f.obj[f.key] !== "function" || f.obj[f.key].__pt) continue;
      var orig = f.obj[f.key];
      var wrapped = function () {
        try {
          var r = orig.apply(this, arguments);
          if (r && typeof r.then === "function") {
            return r.then(function (res) { return PT_mapBadge(res); },
                          function (err) { throw err; });
          }
          return PT_mapBadge(r);
        } catch (e) { return orig.apply(this, arguments); }
      };
      try { wrapped.__pt = 1; } catch (e2) {}
      STATE.revert.push({ type: "fn", obj: f.obj, key: f.key, prev: orig, tag: "badges" });
      PT_setFn(f.obj, f.key, wrapped);
      n++;
    } catch (e3) {}
  }
  PT_applied("badges", "wrapped " + n + " producer(s)/label fn(s) - below-lossless hidden, Lossless / Dolby Atmos kept");
}

// ---------------------------------------------------------------------
// Patch 3: OS volume <-> player volume sync
// ---------------------------------------------------------------------

function PT_volNum(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    if (typeof v.volume === "number") return v.volume;
    if (typeof v.value === "number") return v.value;
    if (typeof v.level === "number") return v.level;
  }
  return null;
}

function PT_volRead(cb) {
  var m = STATE.volmgr;
  if (!m || typeof m.getVolume !== "function") return cb(null);
  try {
    var r = m.getVolume();
    if (r && typeof r.then === "function") {
      r.then(function (v) { cb(PT_volNum(v)); }, function () { cb(null); });
    } else if (typeof r === "number") { cb(PT_volNum(r)); }
    else { cb(null); }
  } catch (e) { cb(null); }
}

function PT_volWrite(v) {
  var m = STATE.volmgr;
  if (!m || typeof m.setVolume !== "function") return;
  try { m.setVolume(v, { overrideSystem: true }); }
  catch (e) { try { m.setVolume(v); } catch (e2) {} }
}

function PT_playerStore() {
  var fallback = null;
  for (var i = 0; i < STATE.stores.length; i++) {
    var s = STATE.stores[i];
    var joined = s.keys.join(" ");
    for (var j = 0; j < s.keys.length; j++) {
      if (/volume/i.test(s.keys[j])) {
        if (/playing|isplaying|track|queue|duration|player|playback/i.test(joined)) return s;
        if (!fallback) fallback = s;
      }
    }
  }
  return fallback;
}

function PT_volKeyOf(store) {
  var loose = null;
  for (var i = 0; i < store.keys.length; i++) {
    if (/^((player)?volume|volume(level|value|slider)?)$/i.test(store.keys[i])) return store.keys[i];
    if (/volume/i.test(store.keys[i]) && !loose) loose = store.keys[i];
  }
  return loose;
}

function PT_setAppVol(store, key, v) {
  try { var o = {}; o[key] = v; store.obj.setState(o); } catch (e) {}
}

function PT_volTick() {
  if (!STATE.toggles.vol) return;
  PT_volRead(function (os) {
    if (os == null) return;
    var ps = PT_playerStore();
    if (!ps) return;
    var key = PT_volKeyOf(ps);
    if (!key) return;
    var app = null;
    try { app = PT_volNum(ps.obj.getState()[key]); } catch (e) {}
    if (STATE.volLastOS != null && os !== STATE.volLastOS && STATE.volLastApp === app) {
      // OS volume changed -> mirror into the app
      var scaled = (app != null && app > 1) ? Math.round(os * 100) : os;
      PT_setAppVol(ps, key, scaled);
      PT_log("vol: OS " + os.toFixed(2) + " -> app " + scaled);
    } else if (app != null && STATE.volLastApp != null && app !== STATE.volLastApp) {
      // app slider moved -> push to OS
      var osv = app > 1 ? app / 100 : app;
      PT_volWrite(osv);
      PT_log("vol: app " + app + " -> OS " + osv.toFixed(2));
    }
    STATE.volLastOS = os;
    STATE.volLastApp = app;
  });
}

function PT_startVol() {
  PT_stopVol();
  if (!STATE.volmgr) return false;
  STATE.volTimer = setInterval(PT_volTick, 500);
  PT_volTick();
  return true;
}

function PT_stopVol() {
  if (STATE.volTimer) { clearInterval(STATE.volTimer); STATE.volTimer = null; }
}

function PT_applyVol() {
  PT_stopVol();
  if (!STATE.toggles.vol) { PT_applied("vol", "off"); return; }
  var ok = STATE.volmgr ? PT_startVol() : false;
  PT_applied("vol", ok ? "sync running (500ms poll)" :
    "no native volume manager found - run diag and send output back");
}

// ---------------------------------------------------------------------
// Patch 5: Settings page section (safe proxy + error boundary)
// ---------------------------------------------------------------------

function PT_makeErrorBoundary(React) {
  // Dynamic code constructors are forbidden by the 8SPINE module sandbox.
  // Returning null selects the defensive View wrapper in the caller.
  return null;
}

function PT_buildSettingsSection(React, RN) {
  var rows = [
    ["norm", "Audio normalization", "Force the app's normalization flags ON"],
    ["ads", "Ad-free mode", "Disable ad calls and ad components"],
    ["prem", "Premium flags", "You already have Premium - reflect it in the app"],
    ["vol", "Volume sync", "Mirror the player slider with iOS system volume"],
    ["badges", "Lossless badges", "Hide below Lossless; Lossless / Dolby Atmos only"],
    ["ui", "Show this section", "Render the Power Tools block in Settings"]
  ];
  var children = [];
  try {
    children.push(React.createElement(RN.Text, {
      key: "title", style: { fontSize: 17, fontWeight: "700", marginBottom: 6 }
    }, "Power Tools"));
  } catch (e1) {}
  for (var i = 0; i < rows.length; i++) {
    (function (row) {
      var key = row[0], label = row[1], sub = row[2];
      var onValueChange = function () {
        try {
          STATE.toggles[key] = !STATE.toggles[key];
          PT_persist();
          if (key !== "ui") PT_applyAll(true);
          PT_log("ui toggle " + key + " -> " + STATE.toggles[key]);
        } catch (e) {}
      };
      var right = null;
      try {
        if (RN.Switch) {
          right = React.createElement(RN.Switch, {
            key: "sw", value: !!STATE.toggles[key], onValueChange: onValueChange
          });
        } else {
          right = React.createElement(RN.Pressable, { key: "sw", onPress: onValueChange },
            React.createElement(RN.Text, { style: { fontWeight: "700" } },
              STATE.toggles[key] ? "ON" : "OFF"));
        }
      } catch (e2) { right = null; }
      try {
        children.push(React.createElement(RN.View, {
          key: key, style: {
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingVertical: 9, minHeight: 34
          }
        },
          React.createElement(RN.View, { style: { flex: 1, paddingRight: 12 } },
            React.createElement(RN.Text, { style: { fontSize: 15 } }, label),
            React.createElement(RN.Text, { style: { fontSize: 11, color: "#8a8a8e" } }, sub)
          ),
          right
        ));
      } catch (e3) {}
    })(rows[i]);
  }
  try {
    children.push(React.createElement(RN.Text, {
      key: "foot", style: { fontSize: 11, color: "#8a8a8e", marginTop: 6 }
    }, "Power Tools v" + VERSION + " - open the module and search 'help' for diagnostics."));
  } catch (e4) {}
  try {
    return React.createElement(RN.View, {
      style: {
        marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 14,
        borderRadius: 12, backgroundColor: "rgba(128,128,128,0.12)"
      }
    }, children);
  } catch (e5) { return null; }
}

function PT_hookSettingsPage() {
  if (STATE.settingsHooked || !STATE.settingsPage || !STATE.rn || !STATE.react) return;
  var sp = STATE.settingsPage, RN = STATE.rn, React = STATE.react;
  var Orig = sp.fn, ex = sp.ex;
  var EB = PT_makeErrorBoundary(React);
  var proxy = function (route) {
    if (STATE.toggles.ui) {
      try {
        var section = PT_buildSettingsSection(React, RN);
        if (section) {
          STATE.uiRenders++;
          var inner = [section, React.createElement(Orig, route)];
          if (EB) {
            try { return React.createElement(EB, null, inner); } catch (e1) {}
          }
          try { return React.createElement(RN.View, { style: { flex: 1 } }, inner); }
          catch (e2) {}
        }
      } catch (e3) {
        try { PT_log("ui err: " + (e3 && e3.message)); } catch (e4) {}
      }
    }
    try { return Orig(route); } catch (e5) { return null; }
  };
  try { proxy.displayName = "SettingsPage"; } catch (e6) {}
  var r = PT_trySetDefault(ex, proxy);
  if (r.ok) {
    STATE.settingsHooked = true;
    PT_log("settings: SettingsPage hooked (section " + (STATE.toggles.ui ? "on" : "off, passthrough") + ")");
  } else {
    PT_log("settings: could not replace default export (read-only)");
  }
}

// ---------------------------------------------------------------------
// Persistence of toggles
// ---------------------------------------------------------------------

function PT_persist() {
  var st = STATE.storage;
  if (!st) return;
  var val = null;
  try { val = JSON.stringify(STATE.toggles); } catch (e) { return; }
  try {
    var p = st.setItem(PT_KEY, val);
    if (p && typeof p.then === "function") p.then(function () {}, function () {});
  } catch (e2) {}
}

function PT_loadPersisted() {
  var st = STATE.storage;
  if (!st) return;
  var handle = function (val) {
    try {
      if (!val) return;
      var o = JSON.parse(val);
      var changed = false;
      for (var k in o) {
        if (k in STATE.toggles && !!o[k] !== STATE.toggles[k]) {
          STATE.toggles[k] = !!o[k];
          changed = true;
        }
      }
      if (changed) { PT_log("persist: toggles restored"); if (STATE.ready) PT_applyAll(true); }
    } catch (e) {}
  };
  try {
    var p = st.getItem(PT_KEY);
    if (p && typeof p.then === "function") {
      p.then(handle, function () {});
    } else {
      st.getItem(PT_KEY, function (err, val) { if (!err) handle(val); });
    }
  } catch (e3) {}
}

// ---------------------------------------------------------------------
// Master apply + boot
// ---------------------------------------------------------------------

function PT_applyAll(silent) {
  if (!STATE.ready) return;
  PT_applyNorm();
  PT_applyPrem();
  PT_applyAds();
  PT_applyBadges();
  PT_applyVol();
  PT_hookSettingsPage();
  if (!silent) PT_log("applyAll: done");
}

function PT_boot() {
  STATE.opens = (STATE.opens || 0) + 1;
  PT_log("boot #" + STATE.opens + " (v" + VERSION + ")");
  PT_installSpy();
  if (!STATE.scannedOnce) {
    PT_startScan(function () {
      STATE.ready = true;
      PT_loadPersisted();
      PT_applyAll(false);
    });
  } else {
    STATE.ready = true;
    PT_loadPersisted();
    // reclassify anything new the spy caught since last open
    PT_classifyAll();
    PT_applyAll(false);
  }
}

// live-capture: classify modules the spy catches after boot is done
STATE.onCapture = function (id, rec) {
  try {
    if (!STATE.ready || !rec) return;
    PT_classifyRecord(String(id), rec.exports);
    PT_scheduleReapply();
  } catch (e) {}
};
PT_boot();

// ---------------------------------------------------------------------
// Command console (exposed through searchTracks)
// ---------------------------------------------------------------------

function PT_on(v) { return v ? "on" : "off"; }

function PT_row(line, section) {
  STATE.rowId = (STATE.rowId || 0) + 1;
  return {
    id: "pt-" + STATE.rowId,
    name: String(line).slice(0, 200),
    album: section || "Power Tools",
    artist: "PowerTools",
    uri: "",
    source: "power-tools",
    isStreaming: true
  };
}

function PT_out(lines, section) {
  var t = [];
  for (var i = 0; i < lines.length; i++) t.push(PT_row(lines[i], section));
  return t;
}

function PT_statusLines() {
  var t = STATE.toggles;
  return [
    "norm=" + PT_on(t.norm) + "  ads=" + PT_on(t.ads) + "  prem=" + PT_on(t.prem),
    "badges=" + PT_on(t.badges) + "  vol=" + PT_on(t.vol) + "  ui=" + PT_on(t.ui),
    "spy=" + STATE.spyMode + "  mirrored=" + Object.keys(STATE.mods).length + " modules",
    "stores=" + STATE.stores.length + "  instances=" + STATE.modules.length +
      "  adFns=" + STATE.adFns.length + "  badgeFns=" + STATE.badgeFns.length,
    "volmgr=" + (STATE.volmgr ? "found" : "not found") +
      (STATE.volTimer ? " [syncing]" : "") +
      "  storage=" + (STATE.storage ? "found" : "no") +
      "  settingsUI=" + (STATE.settingsHooked ? (STATE.toggles.ui ? "rendering" : "hooked/off") : "no")
  ];
}

function PT_diagLines() {
  var lines = [];
  lines.push("scanned=" + STATE.scanned + "  mirror=" + Object.keys(STATE.mods).length +
    "  spy=" + STATE.spyMode + "  opens=" + STATE.opens);
  lines.push("rn=" + (STATE.rn ? "yes" : "no") + "  react=" + (STATE.react ? "yes" : "no") +
    "  settingsPage=" + (STATE.settingsPage ? "yes" : "no") +
    "  storage=" + (STATE.storage ? "yes" : "no") +
    "  manager=" + (STATE.manager ? "yes" : "no") +
    "  volmgr=" + (STATE.volmgr ? "yes" : "no"));
  for (var i = 0; i < STATE.stores.length && i < 6; i++) {
    var s = STATE.stores[i];
    lines.push("store[" + i + "] " + s.id + " " + s.kind + ": " +
      s.keys.slice(0, 10).join(", "));
  }
  for (var j = 0; j < STATE.findings.length && j < 14; j++) {
    var f = STATE.findings[STATE.findings.length - 1 - j];
    lines.push("hit " + f.tag + " @ " + f.id + " " + f.note);
  }
  lines.push("--- applied/log (last 10) ---");
  for (var k = STATE.log.length - 1; k >= 0 && lines.length < 40; k--) {
    lines.push(STATE.log[k]);
  }
  lines.push("Send this output back to the assistant to fine-tune the patches.");
  return lines;
}

var PT_HELP = [
  "POWER TOOLS v" + VERSION + " - commands:",
  "status            quick state overview",
  "diag              full diagnostics (send back if issues)",
  "scan <keyword>    search internal modules by export name",
  "stores            list state stores and their keys",
  "norm on|off       audio normalization",
  "ads on|off        ad-free mode",
  "prem on|off       premium flags",
  "badges on|off     quality badge cleanup",
  "vol on|off        OS volume sync",
  "ui on|off         Power Tools section in Settings",
  "reset             restore everything to original",
  "log               recent engine log"
];

function PT_search(q, limit, ctx) {
  limit = limit || 20;
  var query = (q == null) ? "" : String(q).trim();
  var low = query.toLowerCase();
  var tokens = low.split(/\s+/);
  var cmd = tokens[0] || "";
  var arg = tokens.slice(1).join(" ");
  var rows = [];
  try {
    if (!query) {
      rows = PT_out(["Power Tools v" + VERSION + " - tweaks are " +
        (STATE.ready ? "applied" : "still scanning..."),
        "Type help for commands. Settings section: " + PT_on(STATE.toggles.ui)], "welcome");
    } else if (cmd === "help" || cmd === "?") {
      rows = PT_out(PT_HELP, "help");
    } else if (cmd === "status") {
      rows = PT_out(PT_statusLines(), "status");
    } else if (cmd === "diag") {
      rows = PT_out(PT_diagLines(), "diag");
    } else if (cmd === "scan") {
      if (!arg) {
        rows = PT_out(["usage: scan <keyword>  e.g. scan volume, scan badge, scan ad, scan normal"], "scan");
      } else {
        var rx = new RegExp(arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        var found = [];
        var ids = Object.keys(STATE.mods);
        for (var i = 0; i < ids.length && found.length < 14; i++) {
          var names = null;
          try { names = PT_keyNames(STATE.mods[ids[i]].exports).join(" "); } catch (e) { continue; }
          if (names && rx.test(names)) found.push(ids[i] + ": " + names.slice(0, 150));
        }
        rows = found.length ? PT_out(found, "scan " + arg) :
          PT_out(["no exports matched '" + arg + "'"], "scan " + arg);
      }
    } else if (cmd === "stores") {
      var lines = [];
      for (var s = 0; s < STATE.stores.length && lines.length < 16; s++) {
        var st = STATE.stores[s];
        lines.push(st.id + " " + st.kind + ": " + st.keys.slice(0, 14).join(", "));
      }
      rows = lines.length ? PT_out(lines, "stores") : PT_out(["no state stores found"], "stores");
    } else if (cmd === "norm" || cmd === "ads" || cmd === "prem" || cmd === "badges" ||
               cmd === "vol" || cmd === "ui") {
      if (arg === "on" || arg === "off") {
        STATE.toggles[cmd] = (arg === "on");
        PT_persist();
        if (cmd === "ui") {
          rows = PT_out(["Settings section: " + PT_on(STATE.toggles.ui) +
            " (leave Settings and come back to refresh)"], "ui");
        } else {
          PT_applyAll(true);
          rows = PT_out([cmd + " -> " + arg + " (re-applied)"], cmd);
        }
      } else {
        rows = PT_out(["usage: " + cmd + " on|off  (currently " + PT_on(STATE.toggles[cmd]) + ")"], cmd);
      }
    } else if (cmd === "reset") {
      PT_stopVol();
      var tags = ["norm", "ads", "prem", "badges"];
      for (var r = 0; r < tags.length; r++) PT_revertTag(tags[r]);
      STATE.toggles = { norm: true, ads: true, prem: true, badges: true, vol: true, ui: true };
      PT_persist();
      PT_applyAll(true);
      rows = PT_out(["all patches reverted, defaults re-applied"], "reset");
    } else if (cmd === "log") {
      var l = [];
      for (var li = STATE.log.length - 1; li >= 0 && l.length < 16; li--) l.push(STATE.log[li]);
      rows = PT_out(l, "log");
    } else if (cmd === "about") {
      rows = PT_out([
        "Power Tools v" + VERSION,
        "Normalization / ad-free (bring your own premium) / OS volume sync /",
        "Lossless + Dolby Atmos badge cleanup / Settings section.",
        "No DRM or stream logic is touched."
      ], "about");
    } else {
      rows = PT_out(["unknown command: " + cmd, "type help for the command list"], "?");
    }
  } catch (e) {
    rows = PT_out(["error: " + (e && e.message ? e.message : String(e))], "error");
  }
  return Promise.resolve({ tracks: rows.slice(0, limit), total: rows.length });
}

// ---------------------------------------------------------------------
// Module manifest
// ---------------------------------------------------------------------

return {
  id: "power-tools",
  name: "Power Tools",
  author: "local",
  version: "1.0.0",
  description: "Normalization, ad-free (bring your own premium), OS volume sync, Lossless / Dolby Atmos badge cleanup, Settings section. Open me, then type: help",
  labels: ["TWEAK", "UTILITY", "AUDIO", "AD-FREE", "LOSSLESS"],
  automaticStreaming: false,
  noPrefetch: true,
  noStreamCache: true,
  searchTracks: PT_search,
  getTrackStreamUrl: function () {
    return Promise.reject(new Error("Power Tools is a tweak module - it is not a music source."));
  },
  getTrackDownloadUrl: function () {
    return Promise.reject(new Error("Power Tools is a tweak module - it is not a music source."));
  }
};
