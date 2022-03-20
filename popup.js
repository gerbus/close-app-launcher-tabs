const delayElement = document.getElementById("delay")
const urlsElement = document.getElementById("urls")
const historyElement = document.getElementById("history")

chrome.storage.sync.get("autoCloseTabDelayInSeconds", data => delayElement.value = data.autoCloseTabDelayInSeconds)
chrome.storage.sync.get("autoCloseTabURLs", data => urlsElement.value = data.autoCloseTabURLs)
chrome.storage.sync.get("history", data => historyElement.value = data.history)

delayElement.addEventListener("input", e => {
    console.log(e.target.value)
    const autoCloseTabDelayInSeconds = parseInt(e.target.value)
    chrome.storage.sync.set({ autoCloseTabDelayInSeconds })
})
urlsElement.addEventListener("input", e => {
    console.log(e.target.value)
    const autoCloseTabURLs = e.target.value
    chrome.storage.sync.set({ autoCloseTabURLs })
})