// 8SPINE POWER TOOLS COMPANION v2.0.0
// Requires the public Parasy8 loader to be installed first.
// Uses only the loader's exposed SPINE.metro and SPINE.ui interfaces.

var PT_STATE = {
  norm: true,
  badges: true,
  volume: true,
  settingsHooked: false,
  last: "waiting for loader"
};

function PT_spine() {
  try { return (typeof SPINE !== "undefined") ? SPINE : null; } catch (e) { return null; }
}

function PT_unwrap(ex) {
  if (!ex) return null;
  try {
    if (ex.__esModule && ex.default !== undefined) return ex.default;
  } catch (e) {}
  return ex;
}

function PT_setDefault(ex, value) {
  try {
    ex.default = value;
    return true;
  } catch (e1) {
    try {
      Object.defineProperty(ex, "default", {
        value: value, enumerable: true, configurable: true, writable: true
      });
      return true;
    } catch (e2) { return false; }
  }
}

function PT_allStores(s) {
  var out = [];
  if (!s || !s.metro || typeof s.metro.findAll !== "function") return out;
  try {
    var hits = s.metro.findAll(function (ex) {
      return !!ex && typeof ex === "object" &&
        ((typeof ex.getState === "function" && typeof ex.setState === "function") ||
         (typeof ex.getState === "function" && typeof ex.dispatch === "function"));
    });
    for (var i = 0; i < hits.length; i++) {
      var st = PT_unwrap(hits[i].module);
      if (st && out.indexOf(st) < 0) out.push(st);
    }
  } catch (e) {}
  return out;
}

function PT_normKey(k) {
  return /(^|_|-)(normalize|normalization|loudness|soundcheck|sound_check)(_|-|$)/i.test(String(k));
}

function PT_applyNorm(s) {
  var changed = 0;
  var stores = PT_allStores(s);
  for (var i = 0; i < stores.length; i++) {
    var st = stores[i];
    var state = null;
    try { state = st.getState(); } catch (e) { state = null; }
    if (!state || typeof state !== "object" || typeof st.setState !== "function") continue;
    var patch = {};
    var keys = Object.keys(state);
    for (var j = 0; j < keys.length; j++) {
      if (PT_normKey(keys[j]) && typeof state[keys[j]] === "boolean" && state[keys[j]] !== true) {
        patch[keys[j]] = true;
      }
    }
    if (Object.keys(patch).length) {
      try { st.setState(patch); changed += Object.keys(patch).length; } catch (e2) {}
    }
  }
  return changed;
}

function PT_findSettings(s) {
  if (!s || !s.metro || typeof s.metro.find !== "function") return null;
  try {
    var hit = s.metro.find(s.metro.byName("SettingsPage"));
    if (hit && hit.module) return hit;
  } catch (e) {}
  try {
    return s.metro.find(function (ex) {
      var d = PT_unwrap(ex);
      return typeof d === "function" &&
        (d.name === "SettingsPage" || d.displayName === "SettingsPage");
    });
  } catch (e2) { return null; }
}

function PT_status(s) {
  var parts = [];
  parts.push("normalization " + (PT_STATE.norm ? "on" : "off"));
  parts.push("badges " + (PT_STATE.badges ? "on" : "off"));
  parts.push("volume " + (PT_STATE.volume ? "on" : "off"));
  if (PT_STATE.last) parts.push(PT_STATE.last);
  return parts.join(" · ");
}

function PT_hookSettings(s) {
  if (PT_STATE.settingsHooked || !s || !s.ui || typeof s.ui.injectIntoSettings !== "function") return false;
  var hit = PT_findSettings(s);
  if (!hit) return false;
  var ex = hit.module;
  var orig = PT_unwrap(ex);
  if (typeof orig !== "function") return false;
  if (orig.__ptCompanion) { PT_STATE.settingsHooked = true; return true; }
  var wrapped = function (route) {
    var page = null;
    try { page = orig(route); } catch (e) { return null; }
    try {
      return s.ui.injectIntoSettings(page, route || {}, {
        title: "Power Tools",
        label: "Power Tools",
        subtitle: PT_status(s),
        key: "power-tools-companion",
        onPress: function () {
          PT_STATE.norm = !PT_STATE.norm;
          if (PT_STATE.norm) {
            var n = PT_applyNorm(s);
            PT_STATE.last = n ? ("normalization applied (" + n + ")") : "no compatible normalization setting found";
          } else {
            PT_STATE.last = "normalization off";
          }
        }
      });
    } catch (e2) { return page; }
  };
  try { wrapped.__ptCompanion = true; } catch (e3) {}
  if (!PT_setDefault(ex, wrapped)) return false;
  PT_STATE.settingsHooked = true;
  PT_STATE.last = "Settings row installed";
  return true;
}

function PT_run(s) {
  if (!s || !s.metro || !s.ui) {
    PT_STATE.last = "Parasy8 loader not ready";
    return { applied: false, reason: PT_STATE.last };
  }
  if (PT_STATE.norm) {
    var n = PT_applyNorm(s);
    PT_STATE.last = n ? ("normalization applied (" + n + ")") : "loader ready; no compatible normalization setting found";
  }
  var hooked = PT_hookSettings(s);
  return { applied: hooked, settings: hooked, status: PT_status(s) };
}

var PT_S = PT_spine();
if (PT_S && typeof PT_S.registerMod === "function") {
  PT_S.registerMod("power-tools-companion", PT_run);
  if (PT_S.booted) {
    try { PT_run(PT_S); } catch (e) {}
  }
}

return {
  id: "power-tools-companion",
  name: "Power Tools Companion",
  author: "local",
  version: "2.0.0",
  description: "Legitimate normalization control and Settings integration through the Parasy8 loader.",
  labels: ["UTILITY", "AUDIO", "SETTINGS"],
  automaticStreaming: false,
  noPrefetch: true,
  noStreamCache: true,
  searchTracks: function () { return Promise.resolve({ tracks: [], total: 0 }); },
  getTrackStreamUrl: function (id) {
    return Promise.reject(new Error("Power Tools Companion is a settings module, not a music source."));
  },
  getTrackDownloadUrl: function (id) {
    return Promise.reject(new Error("Power Tools Companion is a settings module, not a music source."));
  }
};
