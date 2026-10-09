.pragma library

// Pure logic for workspace-peek: turns `hyprctl -j monitors/workspaces/clients`
// into what the overlay draws. No QML, no I/O, so it runs under `node --test`.

var KNOWN_APPS = {
  "brave-browser": "Brave",
  "code": "VS Code",
  "code-oss": "VS Code",
  "google-chrome": "Chrome",
  "chatgpt": "ChatGPT",
  "github": "GitHub",
  "whatsapp": "WhatsApp",
  "youtube": "YouTube",
  "1password": "1Password",
  "localsend": "LocalSend"
}

var SUMMARY_LIMIT = 3
var PEEK_DURATION = 10000   // safety net: hide even if the key release is missed
var FLASH_DURATION = 900

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function known(word) {
  var key = String(word || "").toLowerCase()
  return KNOWN_APPS.hasOwnProperty(key) ? KNOWN_APPS[key] : ""
}

function webAppName(host) {
  var parts = host.split(".").filter(function(p) { return p !== "" })
  while (parts.length > 2 && ["www", "web", "app", "m"].indexOf(parts[0]) !== -1) parts.shift()
  var word = parts[0] || host
  return known(word) || capitalize(word)
}

function appName(client) {
  var c = client || {}
  var cls = String(c.class || c.initialClass || "")
  var title = String(c.title || "")

  if (cls === "") return title || "Window"
  if (/^steam_app_/.test(cls)) return title || "Steam game"

  var web = /^chrome-(.+?)__/.exec(cls)
  if (web) return webAppName(web[1])

  if (known(cls)) return known(cls)

  // Reverse-DNS app ids: org.gnome.Nautilus -> Nautilus
  if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9_-]+){2,}$/.test(cls)) {
    var last = cls.split(".").pop()
    return known(last) || capitalize(last)
  }

  return capitalize(cls)
}

function groupApps(clients) {
  var order = []
  var counts = {}
  for (var i = 0; i < clients.length; i++) {
    var name = appName(clients[i])
    if (!counts.hasOwnProperty(name)) {
      counts[name] = 0
      order.push(name)
    }
    counts[name] += 1
  }
  var apps = order.map(function(name, index) { return { name: name, count: counts[name], index: index } })
  apps.sort(function(a, b) { return b.count - a.count || a.index - b.index })
  return apps.map(function(a) { return { name: a.name, count: a.count } })
}

function summarize(apps) {
  var shown = apps.slice(0, SUMMARY_LIMIT).map(function(a) {
    return a.count > 1 ? a.name + " ×" + a.count : a.name
  })
  var rest = apps.length - SUMMARY_LIMIT
  return shown.join(", ") + (rest > 0 ? " +" + rest : "")
}

function isVisibleClient(c) {
  return c && c.mapped !== false && c.hidden !== true && c.workspace && c.workspace.id > 0
}

function buildModel(data) {
  var d = data || {}
  var monitors = Array.isArray(d.monitors) ? d.monitors : []
  var workspaces = Array.isArray(d.workspaces) ? d.workspaces : []
  var clients = Array.isArray(d.clients) ? d.clients.filter(isVisibleClient) : []

  var byWorkspace = {}
  clients.forEach(function(c) {
    (byWorkspace[c.workspace.id] = byWorkspace[c.workspace.id] || []).push(c)
  })

  var focusedMonitor = ""
  var out = monitors.slice().sort(function(a, b) { return (a.x - b.x) || (a.y - b.y) }).map(function(m) {
    var active = m.activeWorkspace ? m.activeWorkspace.id : 0
    if (m.focused) focusedMonitor = m.name

    var list = workspaces.filter(function(w) { return w.monitor === m.name && w.id > 0 })
      .map(function(w) { return { id: w.id, name: String(w.name || w.id) } })
    if (active > 0 && !list.some(function(w) { return w.id === active }))
      list.push({ id: active, name: String(m.activeWorkspace.name || active) })
    list.sort(function(a, b) { return a.id - b.id })

    return {
      name: m.name,
      label: ((m.make || "") + " " + (m.model || "")).trim(),
      x: m.x,
      focused: m.focused === true,
      activeWorkspace: active,
      workspaces: list.map(function(w) {
        var wins = byWorkspace[w.id] || []
        var apps = groupApps(wins)
        return {
          id: w.id,
          label: w.name !== String(w.id) && w.name !== "" ? w.name : String(w.id),
          active: w.id === active,
          windows: wins.length,
          apps: apps,
          summary: summarize(apps)
        }
      })
    }
  })

  return { focusedMonitor: focusedMonitor, monitors: out }
}

function parsePayload(json) {
  var p = {}
  try { p = JSON.parse(json || "{}") || {} } catch (e) { p = {} }
  var mode = p.mode === "flash" ? "flash" : "peek"
  var duration = Number(p.duration)
  if (!isFinite(duration) || duration <= 0) duration = mode === "flash" ? FLASH_DURATION : PEEK_DURATION
  return { mode: mode, duration: duration }
}

function focusCommand(id) {
  if (!/^-?\d+$/.test(String(id))) return ""
  return "hyprctl dispatch 'hl.dsp.focus({ workspace = \"" + id + "\" })'"
}

// ~/.config/workspace-peek/settings.json
function parseSettings(json) {
  var s = {}
  try { s = JSON.parse(json || "{}") || {} } catch (e) { s = {} }
  var duration = Number(s.flashDuration)
  return {
    flashOnSwitch: typeof s.flashOnSwitch === "boolean" ? s.flashOnSwitch : true,
    flashDuration: isFinite(duration) && duration > 0 ? duration : FLASH_DURATION
  }
}

// Qt key codes. While the card is open it holds keyboard focus, so it sees the
// key releases itself: whichever of SUPER or Z is let go first closes it.
var KEY_ESCAPE = 0x01000000
var RELEASE_CLOSES = [0x01000022 /* Meta */, 0x01000053 /* Super_L */, 0x01000054 /* Super_R */, 0x5a /* Z */]

function closesPeek(key, type) {
  if (type === "press") return key === KEY_ESCAPE
  if (type === "release") return RELEASE_CLOSES.indexOf(key) !== -1
  return false
}
