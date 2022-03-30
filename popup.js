const delayElement = document.getElementById("delay")
const urlsElement = document.getElementById("urls")
const historyElement = document.getElementById("history")

chrome.storage.sync.get("closeDelayInSeconds", data => delayElement.value = data.closeDelayInSeconds)
chrome.storage.sync.get("closeURLs", data => urlsElement.value = data.closeURLs)
chrome.storage.sync.get("history", data => historyElement.value = data.history)

delayElement.addEventListener("input", e => {
    console.log(e.target.value)
    const closeDelayInSeconds = parseInt(e.target.value)
    chrome.storage.sync.set({ closeDelayInSeconds })
})
urlsElement.addEventListener("input", e => {
    console.log(e.target.value)
    const closeURLs = e.target.value
    chrome.storage.sync.set({ closeURLs })
})
