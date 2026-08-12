const DEFAULTS = {
    closeURLs: "",
    closeDelayInSeconds: 5
}

const LOG_KEY = "activityLog"
const LOG_MAX_ENTRIES = 200
const PENDING_KEY = "pendingCloses"
const ALARM_PREFIX = "close-tab:"

// The service worker gets shut down after ~30s idle, so setTimeout is only
// trustworthy for short delays. Anything longer goes through chrome.alarms.
const SET_TIMEOUT_MAX_SECONDS = 20

// The log lives in storage.local, not storage.sync: sync caps items at 8KB
// (which is what broke the old single-string history) and there's no reason to
// burn sync quota on a local activity log.
let logWrites = Promise.resolve()

const log = (level, message, detail) => {
    logWrites = logWrites.then(async () => {
        const stored = await chrome.storage.local.get(LOG_KEY)
        const entries = Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : []
        const entry = { at: Date.now(), level, message }
        if (detail) entry.detail = detail
        entries.unshift(entry)
        await chrome.storage.local.set({ [LOG_KEY]: entries.slice(0, LOG_MAX_ENTRIES) })
    }).catch(error => console.error("Could not write to activity log", error))
    return logWrites
}

const getPending = async () => {
    const stored = await chrome.storage.local.get(PENDING_KEY)
    return stored[PENDING_KEY] && typeof stored[PENDING_KEY] === "object" ? stored[PENDING_KEY] : {}
}

const setPending = pending => chrome.storage.local.set({ [PENDING_KEY]: pending })

const getConfig = async () => {
    const data = await chrome.storage.sync.get(["closeURLs", "closeDelayInSeconds"])
    const closeURLs = typeof data.closeURLs === "string" ? data.closeURLs : DEFAULTS.closeURLs
    const delay = parseInt(data.closeDelayInSeconds, 10)
    return {
        patterns: closeURLs.split("\n").map(pattern => pattern.trim()).filter(Boolean),
        closeDelayInSeconds: Number.isFinite(delay) && delay >= 0 ? delay : DEFAULTS.closeDelayInSeconds
    }
}

// Pull the pre-1.1 history string out of storage.sync, where it had grown past
// the 8KB per-item quota and was throwing on every write.
const migrateLegacyHistory = async () => {
    const { history } = await chrome.storage.sync.get("history")
    if (typeof history !== "string" || history.trim() === "") return

    await chrome.storage.sync.remove("history")

    const legacyEntries = history.split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, LOG_MAX_ENTRIES)
        .map(line => ({ at: null, level: "info", message: line, legacy: true }))

    logWrites = logWrites.then(async () => {
        const stored = await chrome.storage.local.get(LOG_KEY)
        const entries = Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : []
        await chrome.storage.local.set({
            [LOG_KEY]: entries.concat(legacyEntries).slice(0, LOG_MAX_ENTRIES)
        })
    })
    await logWrites
    await log("info", `Moved ${legacyEntries.length} older log entries out of synced storage (8KB quota was exceeded)`)
}

const seedDefaults = async () => {
    const data = await chrome.storage.sync.get(["closeURLs", "closeDelayInSeconds"])
    const seed = {}
    if (typeof data.closeURLs !== "string") seed.closeURLs = DEFAULTS.closeURLs
    if (!Number.isFinite(parseInt(data.closeDelayInSeconds, 10))) seed.closeDelayInSeconds = DEFAULTS.closeDelayInSeconds
    if (Object.keys(seed).length > 0) await chrome.storage.sync.set(seed)
}

// Tracked in memory to keep onCreated and the several onUpdated events for the
// same tab from each scheduling their own close.
const scheduled = new Set()

const closeTab = async (tabId, url) => {
    scheduled.delete(tabId)
    try {
        await chrome.tabs.remove(tabId)
        await log("closed", "Auto-closed tab", url)
    } catch (error) {
        const message = error && error.message ? error.message : String(error)
        if (message.includes("No tab with id")) {
            await log("info", "Tab was already gone by close time", url)
        } else {
            await log("error", `Could not close tab: ${message}`, url)
        }
    }
}

const scheduleClose = async (tabId, url, pattern) => {
    if (scheduled.has(tabId)) return
    scheduled.add(tabId)

    const { closeDelayInSeconds } = await getConfig()
    await log("match", `Matched "${pattern}" — closing in ${closeDelayInSeconds}s`, url)

    if (closeDelayInSeconds <= SET_TIMEOUT_MAX_SECONDS) {
        setTimeout(() => closeTab(tabId, url), closeDelayInSeconds * 1000)
        return
    }

    const alarmName = ALARM_PREFIX + tabId
    const pending = await getPending()
    pending[alarmName] = { tabId, url }
    await setPending(pending)
    chrome.alarms.create(alarmName, { delayInMinutes: closeDelayInSeconds / 60 })
}

const considerTab = async (tabId, url) => {
    if (!url || scheduled.has(tabId)) return
    const { patterns } = await getConfig()
    const pattern = patterns.find(candidate => url.includes(candidate))
    if (pattern) await scheduleClose(tabId, url, pattern)
}

const handleInstalled = async details => {
    await seedDefaults()
    await migrateLegacyHistory()
    await log("info", details.reason === "update"
        ? `Extension updated to ${chrome.runtime.getManifest().version}`
        : "Extension installed")
}

const handleStartup = async () => {
    await migrateLegacyHistory()
    await log("info", "Browser started")
}

// New tabs often arrive already pointed at their target, so onUpdated alone can
// miss them; pendingUrl covers the not-yet-committed navigation.
const handleTabCreated = tab => considerTab(tab.id, tab.pendingUrl || tab.url)

const handleTabUpdated = (tabId, changeInfo) => {
    if (changeInfo.url) considerTab(tabId, changeInfo.url)
}

const handleTabRemoved = async tabId => {
    scheduled.delete(tabId)
    const alarmName = ALARM_PREFIX + tabId
    const pending = await getPending()
    if (pending[alarmName]) {
        delete pending[alarmName]
        await setPending(pending)
        await chrome.alarms.clear(alarmName)
    }
}

const handleAlarm = async alarm => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return
    const pending = await getPending()
    const target = pending[alarm.name]
    delete pending[alarm.name]
    await setPending(pending)
    if (target) await closeTab(target.tabId, target.url)
}

const handleSettingsChanged = async (changes, area) => {
    if (area !== "sync") return
    if (changes.closeDelayInSeconds) {
        await log("config", `Delay set to ${changes.closeDelayInSeconds.newValue}s`)
    }
    if (changes.closeURLs) {
        const count = String(changes.closeURLs.newValue || "").split("\n").filter(line => line.trim()).length
        await log("config", `URL list saved (${count} ${count === 1 ? "pattern" : "patterns"})`)
    }
}

chrome.runtime.onInstalled.addListener(handleInstalled)
chrome.runtime.onStartup.addListener(handleStartup)
chrome.tabs.onCreated.addListener(handleTabCreated)
chrome.tabs.onUpdated.addListener(handleTabUpdated)
chrome.tabs.onRemoved.addListener(handleTabRemoved)
chrome.alarms.onAlarm.addListener(handleAlarm)
chrome.storage.onChanged.addListener(handleSettingsChanged)
