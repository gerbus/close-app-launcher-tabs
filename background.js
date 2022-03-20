const autoCloseTabURLs = ""
const autoCloseTabDelayInSeconds = 5
const history = (new Date()).toLocaleTimeString() + "  Extension installed"

const handleExtensionInstalled = () => {
    chrome.storage.sync.set({ autoCloseTabURLs })
    chrome.storage.sync.set({ autoCloseTabDelayInSeconds })
    chrome.storage.sync.set({ history })
    console.log("Extension: \"Close App-lancher Tabs\" initialized")
}

const handleTabUpdated = (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        // console.log("tab url updated")
        chrome.storage.sync.get("autoCloseTabURLs", data => {
            // console.log(data.autoCloseTabURLs)
            const autoCloseTabURLsArray = data.autoCloseTabURLs.split("\n")
            // console.log(autoCloseTabURLsArray)
            autoCloseTabURLsArray.forEach(item => {
                if (item !== "" && changeInfo.url.includes(item)) {
                    console.log("match!", `config url: ${item}`, `tab url: ${changeInfo.url}`)
                    chrome.storage.sync.get("autoCloseTabDelayInSeconds", data => {
                        // console.log(data.autoCloseTabDelayInSeconds)
                        setTimeout(() => {
                            chrome.storage.sync.get("history", data => {
                                const now = new Date()
                                const history = now.toLocaleTimeString() + "  auto-closed " + changeInfo.url + "\n" + data.history
                                chrome.storage.sync.set({ history })
                            })
                            chrome.tabs.remove(tabId)
                        }, data.autoCloseTabDelayInSeconds * 1000)
                    })
                }
            })
        })
    }
}

chrome.runtime.onInstalled.addListener(handleExtensionInstalled)
chrome.tabs.onUpdated.addListener(handleTabUpdated)