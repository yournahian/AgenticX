// 1) Extension icon e click korle side panel khule
// 2) Content script ke tar nijer tab id bole dey. Kono network call / server nai.
function enablePanelOnIconClick() {
  try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) {}
}
enablePanelOnIconClick();
chrome.runtime.onInstalled.addListener(enablePanelOnIconClick);
chrome.runtime.onStartup.addListener(enablePanelOnIconClick);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg && msg.type === 'whoami') {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
  }
});
