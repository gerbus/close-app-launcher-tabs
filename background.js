const defaults = {
    closeURLs: "",
    closeDelayInSeconds: 5,
    history: (new Date()).toLocaleTimeString() + "  Extension installed"
}

const handleExtensionInstalled = () => {
    chrome.storage.sync.get("closeURLs", data => {
        const closeURLs = data.closeURLs ? data.closeURLs : defaults.closeURLs
        chrome.storage.sync.set({ closeURLs })
    })
    chrome.storage.sync.get("closeDelayInSeconds", data => {
        const closeDelayInSeconds = data.closeDelayInSeconds ? data.closeDelayInSeconds : defaults.closeDelayInSeconds
        chrome.storage.sync.set({ closeDelayInSeconds })
    })
    chrome.storage.sync.get("history", data => {
        const history = data.history ? data.history : defaults.history
        chrome.storage.sync.set({ history })
    })
    console.log("Extension: \"Close App-lancher Tabs\" initialized")
}

const handleTabUpdated = (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        // console.log("tab url updated")
        chrome.storage.sync.get("closeURLs", data => {
            // console.log(data.closeURLs)
            const closeURLsArray = data.closeURLs.split("\n")
            // console.log(closeURLsArray)
            closeURLsArray.forEach(item => {
                if (item !== "" && changeInfo.url.includes(item)) {
                    console.log("match!", `config url: ${item}`, `tab url: ${changeInfo.url}`)
                    chrome.storage.sync.get("closeDelayInSeconds", data => {
                        // console.log(data.closeDelayInSeconds)
                        setTimeout(() => {
                            chrome.storage.sync.get("history", data => {
                                const now = new Date()
                                const history = now.toLocaleTimeString() + "  auto-closed " + changeInfo.url + "\n" + data.history
                                chrome.storage.sync.set({ history })
                            })
                            chrome.tabs.remove(tabId)
                        }, data.closeDelayInSeconds * 1000)
                    })
                }
            })
        })
    }
}

chrome.runtime.onInstalled.addListener(handleExtensionInstalled)
chrome.tabs.onUpdated.addListener(handleTabUpdated)
