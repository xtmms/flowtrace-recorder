// background.js - Service Worker for FlowTrace Recorder (Manifest V3)

// 1. Enable Side Panel to open automatically on action click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('Could not set side panel behavior:', err);
  });
}

// Fallback action click handler
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('Error opening side panel:', err);
    }
  }
});

// 2. Initialize default state on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRecording: false,
    assertionMode: null,
    commentMode: false,
    lastSelectedElementXPath: null
  });
  updateActionBadge(false);
});

// 3. Update the Chrome action badge based on recording state
function updateActionBadge(isRec) {
  if (isRec) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Vivid modern crimson
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Keep track of recording state locally in service worker
let isRecording = false;

chrome.storage.local.get(['isRecording'], (result) => {
  isRecording = !!result.isRecording;
  updateActionBadge(isRecording);
});

// Monitor storage changes to toggle action badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;

  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue === true;
    updateActionBadge(isRecording);
  }
});

// 4. Serial queue for chrome.tabs.captureVisibleTab
// Chrome limits captureVisibleTab calls natively (~2 calls/sec).
const captureQueue = [];
let isProcessingCaptureQueue = false;
let lastCaptureTimestamp = 0;
const MIN_CAPTURE_INTERVAL_MS = 520;
const MAX_CAPTURE_RETRIES = 5;

function enqueueCapture(windowId, sendResponse) {
  captureQueue.push({ windowId, sendResponse, retries: 0 });
  processCaptureQueue();
}

function processCaptureQueue() {
  if (isProcessingCaptureQueue || captureQueue.length === 0) return;
  isProcessingCaptureQueue = true;

  const wait = Math.max(0, MIN_CAPTURE_INTERVAL_MS - (Date.now() - lastCaptureTimestamp));
  setTimeout(() => {
    const task = captureQueue.shift();
    lastCaptureTimestamp = Date.now();

    chrome.tabs.captureVisibleTab(task.windowId, { format: 'jpeg', quality: 70 }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err && /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(err.message) && task.retries < MAX_CAPTURE_RETRIES) {
        task.retries++;
        captureQueue.unshift(task);
        setTimeout(() => {
          isProcessingCaptureQueue = false;
          processCaptureQueue();
        }, MIN_CAPTURE_INTERVAL_MS * task.retries);
        return;
      }
      
      try {
        if (err) {
          console.warn('Screenshot capture failed:', err.message);
          task.sendResponse({ success: false, error: err.message });
        } else {
          task.sendResponse({ success: true, dataUrl: dataUrl });
        }
      } catch (sendErr) {
        console.warn('Screenshot response could not be delivered to port:', sendErr);
      }

      isProcessingCaptureQueue = false;
      processCaptureQueue();
    });
  }, wait);
}

// 5. Listener for screenshot capture requests from content script or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    const windowId = (sender.tab && sender.tab.windowId) 
      ? sender.tab.windowId 
      : (message.windowId || chrome.windows.WINDOW_ID_CURRENT);
    enqueueCapture(windowId, sendResponse);
    return true; // Keep message channel open for async response
  }
});
