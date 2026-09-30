const fs = require('fs');

let src = fs.readFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/aria-nada-plugin/popup.js', 'utf8');

// 1. Update comments and branding
src = src.replace('// popup.js - UI Controller for Capgemini NRT Recorder Side Panel', '// sidepanel.js - UI Controller for FlowTrace Recorder (Manifest V3 Side Panel)');

// 2. Update loading overlay selectors
src = src.replace(/nada-loading-overlay/g, 'flowtrace-loading-overlay');
src = src.replace(/nada-loading-text/g, 'flowtrace-loading-text');

// 3. Update Header ID reference
src = src.replace(/nada-popup-header/g, 'flowtrace-header');

// 4. Update SVG icon colors from Capgemini #0a2c5c / #0070ad to Modern Indigo #4f46e5 and Slate #475569
src = src.replace(/%230a2c5c/g, '%23475569');
src = src.replace(/%230070ad/g, '%234f46e5');

// 5. Update Detach URL
src = src.replace("url: chrome.runtime.getURL('popup.html?mode=detached')", "url: chrome.runtime.getURL('sidepanel.html?mode=detached')");
src = src.replace("popup.html?mode=embedded", "sidepanel.html?mode=embedded");

// 6. Simplify btnUpload - In Chrome Side Panel, file input click works directly without page injection
const oldUploadBlock = `  btnUpload.addEventListener('click', () => {
    if (isDetached || isEmbedded) {
      uploadInput.click();
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const tabId = tabs[0].id;
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['jszip.min.js']
          }).then(() => {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: showUploadModalOnPage
            }).then(() => {
              window.close();
            }).catch(err => {
              console.warn('Modal script injection error, falling back to local:', err);
              uploadInput.click();
            });
          }).catch(err => {
            console.warn('JSZip script injection not allowed, falling back to local file dialog:', err);
            uploadInput.click();
          });
        } else {
          uploadInput.click();
        }
      });
    }
  });`;

const newUploadBlock = `  // Native Chrome SidePanel: native file dialog without injecting modals into host page
  btnUpload.addEventListener('click', () => {
    uploadInput.click();
  });`;

if (src.includes(oldUploadBlock)) {
  src = src.replace(oldUploadBlock, newUploadBlock);
} else {
  console.warn('Warning: oldUploadBlock not matched exactly, checking partial replace...');
}

// 7. Robust active tab query helper
const tabHelperCode = `
// Helper to reliably query the active tab across side panel and detached windows
function queryActiveTab(callback) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      callback(tabs[0]);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (fallback) => {
        callback((fallback && fallback[0]) ? fallback[0] : null);
      });
    }
  });
}
`;

// Insert helper right before submitTextAssertion
src = src.replace('// Submit a new Text Assertion', tabHelperCode + '\n// Submit a new Text Assertion');

// Replace chrome.tabs.query({ active: true, currentWindow: true } in submitTextAssertion
src = src.replace(
  `chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n      const url = (tabs && tabs[0]) ? tabs[0].url : '';\n      const tabId = (tabs && tabs[0]) ? tabs[0].id : null;`,
  `queryActiveTab((activeTab) => {\n      const url = activeTab ? activeTab.url : '';\n      const tabId = activeTab ? activeTab.id : null;`
);

// Replace chrome.tabs.query({ active: true, currentWindow: true } in submitComment
src = src.replace(
  `chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n      const url = (tabs && tabs[0]) ? tabs[0].url : '';`,
  `queryActiveTab((activeTab) => {\n      const url = activeTab ? activeTab.url : '';`
);
src = src.replace('target: { tabId: tabs[0].id },', 'target: { tabId: (activeTab ? activeTab.id : null) },');

// Replace old toast ID references in script injection
src = src.replace(/nada-toast-notification/g, 'flowtrace-toast-notification');

fs.writeFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/flowtrace-recorder/sidepanel.js', src, 'utf8');
console.log('Successfully created sidepanel.js! Lines:', src.split('\n').length);
