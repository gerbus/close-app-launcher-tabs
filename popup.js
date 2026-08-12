const LOG_KEY = "activityLog"
const SAVE_DEBOUNCE_MS = 400

const delayElement = document.getElementById("delay")
const urlsElement = document.getElementById("urls")
const logElement = document.getElementById("log")
const clearLogElement = document.getElementById("clear-log")

chrome.storage.sync.get(["closeDelayInSeconds", "closeURLs"], data => {
    delayElement.value = data.closeDelayInSeconds ?? ""
    urlsElement.value = data.closeURLs ?? ""
})

// storage.sync allows ~120 writes/minute, so saving on every keystroke can blow
// the quota and silently drop the config.
const debounce = (fn, wait) => {
    let timer
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), wait)
    }
}

const saveDelay = debounce(value => {
    const closeDelayInSeconds = parseInt(value, 10)
    if (Number.isFinite(closeDelayInSeconds) && closeDelayInSeconds >= 0) {
        chrome.storage.sync.set({ closeDelayInSeconds })
    }
}, SAVE_DEBOUNCE_MS)

const saveURLs = debounce(closeURLs => chrome.storage.sync.set({ closeURLs }), SAVE_DEBOUNCE_MS)

delayElement.addEventListener("input", e => saveDelay(e.target.value))
urlsElement.addEventListener("input", e => saveURLs(e.target.value))

const renderEntry = entry => {
    const row = document.createElement("div")
    row.className = entry.legacy ? "entry legacy" : "entry"

    const time = document.createElement("time")
    time.textContent = entry.at ? new Date(entry.at).toLocaleTimeString() : "—"
    if (entry.at) time.title = new Date(entry.at).toLocaleString()

    const level = document.createElement("span")
    level.className = `level level-${entry.level || "info"}`
    level.textContent = entry.legacy ? "" : entry.level

    const body = document.createElement("span")
    body.textContent = entry.message
    if (entry.detail) {
        const detail = document.createElement("div")
        detail.className = "detail"
        detail.textContent = entry.detail
        body.appendChild(detail)
    }

    row.append(time, level, body)
    return row
}

const renderLog = entries => {
    logElement.replaceChildren()
    if (!entries || entries.length === 0) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = "No activity recorded yet."
        logElement.appendChild(empty)
        return
    }
    entries.forEach(entry => logElement.appendChild(renderEntry(entry)))
}

chrome.storage.local.get(LOG_KEY, data => renderLog(data[LOG_KEY]))

// Keep the popup live while it's open — closes can happen while you're looking.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[LOG_KEY]) renderLog(changes[LOG_KEY].newValue)
})

clearLogElement.addEventListener("click", () => {
    chrome.storage.local.set({ [LOG_KEY]: [] })
})
