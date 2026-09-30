const fs = require('fs');

let src = fs.readFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/aria-nada-plugin/content.js', 'utf8');

// 1. Cut off floating panel code after convertToInternalStructure
const cutoffMarker = '// FLOATING RECORDER PANEL (IFRAME ENVELOPE)';
const idx = src.indexOf(cutoffMarker);
if (idx !== -1) {
  const commentLine = src.lastIndexOf('// ----------------------------------------------------', idx);
  src = src.substring(0, commentLine !== -1 ? commentLine : idx).trim();
}

// 2. Replace recordEvent screenshot capture block
const oldRecBlock = `  const states = localHidePanel();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
        const dataUrl = response ? response.dataUrl : null;
        localShowPanel(states);

        if (callback) callback(); // <--- Sblocco immediato del click nativo!

        if (dataUrl) {
          eventData.hasScreenshot = true;
          // Salva lo screenshot in una chiave separata
          chrome.storage.local.set({ [\`screenshot_\${eventData.timestamp}\`]: dataUrl });
        }

        appendRecordedEvent(eventData, () => {
          let tag = '';
          if (targetElement && targetElement.tagName) {
            tag = \` <\${targetElement.tagName.toLowerCase()}>\`;
          }
          showToast(\`✓ Action recorded: \${actionType.toUpperCase()}\${tag}\`);
        });
      });
    });
  });`;

const newRecBlock = `  // Native Chrome SidePanel: zero DOM hiding overhead and zero 2-frame delay
  if (callback) callback(); // Instant native click execution

  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    const dataUrl = response ? response.dataUrl : null;
    if (dataUrl) {
      eventData.hasScreenshot = true;
      chrome.storage.local.set({ [\`screenshot_\${eventData.timestamp}\`]: dataUrl });
    }

    appendRecordedEvent(eventData, () => {
      let tag = '';
      if (targetElement && targetElement.tagName) {
        tag = \` <\${targetElement.tagName.toLowerCase()}>\`;
      }
      showToast(\`✓ Action recorded: \${actionType.toUpperCase()}\${tag}\`);
    });
  });`;

if (!src.includes(oldRecBlock)) {
  console.error('Could not find oldRecBlock in content.js!');
  process.exit(1);
}
src = src.replace(oldRecBlock, newRecBlock);

// 3. Replace saveAssertionWithScreenshot block
const oldAssertBlock = `function saveAssertionWithScreenshot(assertionEvent, toastMessage) {
  const states = localHidePanel();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
        const dataUrl = response ? response.dataUrl : null;
        localShowPanel(states);

        if (dataUrl) {
          assertionEvent.hasScreenshot = true;
          chrome.storage.local.set({ [\`screenshot_\${assertionEvent.timestamp}\`]: dataUrl });
        }

        appendRecordedEvent(assertionEvent, () => {
          if (toastMessage) {
            showToast(toastMessage);
          }
        });
      });
    });
  });
}`;

const newAssertBlock = `function saveAssertionWithScreenshot(assertionEvent, toastMessage) {
  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    const dataUrl = response ? response.dataUrl : null;
    if (dataUrl) {
      assertionEvent.hasScreenshot = true;
      chrome.storage.local.set({ [\`screenshot_\${assertionEvent.timestamp}\`]: dataUrl });
    }

    appendRecordedEvent(assertionEvent, () => {
      if (toastMessage) {
        showToast(toastMessage);
      }
    });
  });
}`;

if (!src.includes(oldAssertBlock)) {
  console.error('Could not find oldAssertBlock in content.js!');
  process.exit(1);
}
src = src.replace(oldAssertBlock, newAssertBlock);

// 4. Update Toast styling and ID
src = src.replace(/nada-toast-notification/g, 'flowtrace-toast-notification');
src = src.replace(
  "toast.style.background = '#0a2c5c';",
  "toast.style.background = '#0f172a'; toast.style.border = '1px solid rgba(255,255,255,0.15)'; toast.style.pointerEvents = 'none';"
);

// 5. Update IDs
src = src.replace(/nada-assertion-overlay/g, 'flowtrace-assertion-overlay');
src = src.replace(/nada-highlight-box/g, 'flowtrace-highlight-box');
src = src.replace(/nada-highlight-label/g, 'flowtrace-highlight-label');
src = src.replace(/nada-highlight-dot/g, 'flowtrace-highlight-dot');
src = src.replace(/nada-highlight-text/g, 'flowtrace-highlight-text');

// 6. Clean up references to old floating container and popup in click / change handlers
src = src.replace(/#nada-popup/g, '#flowtrace-toast-notification');
src = src.replace(/#nada-floating-container/g, '#flowtrace-highlight-box');
src = src.replace(/#nada-text-assertion-input/g, '#flowtrace-assertion-overlay');

// 7. Append modern message listener
src += '\n\n' + [
  '// ----------------------------------------------------',
  '// SIDE PANEL INTEGRATION & RUNTIME MESSAGING',
  '// ----------------------------------------------------',
  'chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {',
  "  if (request.action === 'showToast') {",
  '    showToast(request.message);',
  '    sendResponse({ success: true });',
  "  } else if (request.action === 'ping') {",
  '    sendResponse({ success: true, url: window.location.href, title: document.title });',
  '  }',
  '  return true;',
  '});',
  ''
].join('\n');

fs.writeFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/flowtrace-recorder/content.js', src, 'utf8');
console.log('Successfully created content.js for FlowTrace Recorder! Total lines:', src.split('\n').length);
