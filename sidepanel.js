// sidepanel.js - UI Controller for FlowTrace Recorder (Manifest V3 Side Panel)

// UI Elements
let statusDiv, btnStart, btnStop, btnAssertionText, btnAssertionVisible, btnAssertionEnabled, btnAssertionDisabled, btnAssertionPage, btnAddComment, logsCounter, logDisplay;
let btnDownload, btnClear, btnUpload, uploadInput, btnEdit, btnUndo, btnRedo, testNameInput;
let assertionContainer, assertionTextInput, btnAssertionSend, commentContainer, commentInput, btnCommentSend, assertionTargetBanner;
let imgRec, imgStop, imgAssertionText, imgAssertionVisible, imgAssertionEnabled, imgAssertionDisabled, imgAssertionPage, imgAddComment, imgEdit, imgUndo, imgRedo;
let btnDetach, btnAttach, imgDetach, imgAttach;
let btnReset, imgReset;
let btnAssertionColor, imgAssertionColor;
let loadingOverlay, loadingOverlayText;

function showLoadingOverlay(text) {
  if (!loadingOverlay) return;
  if (loadingOverlayText && text) loadingOverlayText.textContent = text;
  loadingOverlay.classList.add('active');
}

function hideLoadingOverlay() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.remove('active');
}

let isRecording = false;
let recordedEvents = [];
let assertionMode = null; // 'text' | 'visible' | 'enabled' | 'disabled' | null
let commentMode = false;
let isEditMode = false;
let lastTextAssertionTarget = null;
let originalLogsBackup = null;

// Undo/Redo history stack state
let history = [];
let currentIndex = -1;
const maxStates = 15;
let isPerformingUndoRedo = false;
let editTextHistory = [];
let editTextIndex = -1;

// SVG Data-URIs for Icons
const recImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'><circle cx='12' cy='12' r='9' stroke='%23ef4444' stroke-width='2' stroke-opacity='0.25'/><circle cx='12' cy='12' r='5' fill='%23ef4444'/></svg>";
const stopImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'><rect x='6' y='6' width='12' height='12' rx='2.5' fill='%23334155'/></svg>";
const downloadImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg>";
const editImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'/></svg>";
const saveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'/><polyline points='17 21 17 13 7 13 7 21'/><polyline points='7 3 7 8 15 8'/></svg>";
const clearImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/><line x1='10' y1='11' x2='10' y2='17'/><line x1='14' y1='11' x2='14' y2='17'/></svg>";
const uploadImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>";
const assertionTextImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='4 7 4 4 20 4 20 7'/><line x1='9' y1='20' x2='15' y2='20'/><line x1='12' y1='4' x2='12' y2='20'/></svg>";
const textActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='4 7 4 4 20 4 20 7'/><line x1='9' y1='20' x2='15' y2='20'/><line x1='12' y1='4' x2='12' y2='20'/></svg>";
const assertionVisibleImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>";
const visibleActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>";
const assertionEnabledImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/></svg>";
const enabledActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/></svg>";
const assertionDisabledImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='4.93' y1='4.93' x2='19.07' y2='19.07'/></svg>";
const disabledActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='4.93' y1='4.93' x2='19.07' y2='19.07'/></svg>";
const assertionPageImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><polyline points='9 15 11 17 15 13'/></svg>";
const addCommentImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/><line x1='12' y1='8' x2='12' y2='14'/><line x1='9' y1='11' x2='15' y2='11'/></svg>";
const addCommentActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/><line x1='12' y1='8' x2='12' y2='14'/><line x1='9' y1='11' x2='15' y2='11'/></svg>";
const sendImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>";
const undoImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 7v6h6'/><path d='M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'/></svg>";
const redoImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 7v6h-6'/><path d='M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'/></svg>";
const detachImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/><polyline points='15 3 21 3 21 9'/><line x1='10' y1='14' x2='21' y2='3'/></svg>";
const attachImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'/></svg>";
const resetImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='1 4 1 10 7 10'/><path d='M3.51 15a9 9 0 1 0 2.13-9.36L1 10'/></svg>";
const assertionColorImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'/></svg>";
const assertionColorActiveImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'/></svg>";

// Initialize UI Elements & Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Elements references
  statusDiv = document.getElementById('status');
  btnStart = document.getElementById('btnStart');
  btnStop = document.getElementById('btnStop');
  btnAssertionText = document.getElementById('btnAssertionText');
  btnAssertionVisible = document.getElementById('btnAssertionVisible');
  btnAssertionEnabled = document.getElementById('btnAssertionEnabled');
  btnAssertionDisabled = document.getElementById('btnAssertionDisabled');
  //btnAssertionPage = document.getElementById('btnAssertionPage');
  btnAddComment = document.getElementById('btnAddComment');  
  btnDownload = document.getElementById('btnDownload');
  btnAssertionColor = document.getElementById('btnAssertionColor');
  btnEdit = document.getElementById('btnEdit');
  btnClear = document.getElementById('btnClear'); 
  btnUpload = document.getElementById('btnUpload');
  btnUndo = document.getElementById('btnUndo');
  btnRedo = document.getElementById('btnRedo');                     
  uploadInput = document.getElementById('uploadInput');
  logsCounter = document.getElementById('logsCounter');
  logDisplay = document.getElementById('logDisplay');
  testNameInput = document.getElementById('testNameInput');
  assertionContainer = document.getElementById('assertionTextContainer');
  assertionTextInput = document.getElementById('assertionTextInput');
  btnAssertionSend = document.getElementById('btnAssertionSend');
  commentContainer = document.getElementById('commentContainer');
  commentInput = document.getElementById('commentInput');
  btnCommentSend = document.getElementById('btnCommentSend');
  assertionTargetBanner = document.getElementById('assertionTargetBanner');
  loadingOverlay = document.getElementById('flowtrace-loading-overlay');
  loadingOverlayText = document.getElementById('flowtrace-loading-text');

  imgRec = document.getElementById('imgRec');
  imgStop = document.getElementById('imgStop');
  imgAssertionText = document.getElementById('imgAssertionText');
  imgAssertionVisible = document.getElementById('imgAssertionVisible');
  imgAssertionEnabled = document.getElementById('imgAssertionEnabled');
  imgAssertionDisabled = document.getElementById('imgAssertionDisabled');
  //imgAssertionPage = document.getElementById('imgAssertionPage');
  imgAddComment = document.getElementById('imgAddComment');
  imgEdit = document.getElementById('imgEdit');
  imgUndo = document.getElementById('imgUndo');
  imgRedo = document.getElementById('imgRedo');
  btnDetach = document.getElementById('btnDetach');
  btnAttach = document.getElementById('btnAttach');
  imgDetach = document.getElementById('imgDetach');
  imgAttach = document.getElementById('imgAttach');
  btnReset = document.getElementById('btnReset');
  imgReset = document.getElementById('imgReset');  
  imgAssertionColor = document.getElementById('imgAssertionColor');

  // Set SVGs to elements
  imgRec.src = recImg;
  imgStop.src = stopImg;
  imgAssertionText.src = assertionTextImg;
  imgAssertionVisible.src = assertionVisibleImg;
  imgAssertionEnabled.src = assertionEnabledImg;
  imgAssertionDisabled.src = assertionDisabledImg;
  //imgAssertionPage.src = assertionPageImg;
  imgAddComment.src = addCommentImg;
  imgEdit.src = editImg;
  imgUndo.src = undoImg;
  imgRedo.src = redoImg;
  imgDetach.src = detachImg;
  imgAttach.src = attachImg;
  imgReset.src = resetImg;
  imgAssertionColor.src = assertionColorImg;

  document.getElementById('imgCommentSend').src = sendImg;
  document.getElementById('imgAssertionSend').src = sendImg;
  document.getElementById('imgDownload').src = downloadImg;
  document.getElementById('imgClear').src = clearImg;
  document.getElementById('imgUpload').src = uploadImg;

  // Handle detached/attached state
  const urlParams = new URLSearchParams(window.location.search);
  const isDetached = urlParams.get('mode') === 'detached';
  const isEmbedded = urlParams.get('mode') === 'embedded';
  
  if (isEmbedded) {
    btnAttach.style.display = 'none';
    btnDetach.style.display = 'none';
    const headerEl = document.getElementById('flowtrace-header');
    if (headerEl) {
      headerEl.style.display = 'none';
    }
    document.body.style.width = '100%';

    // Dynamic height resize detection for embedded mode
    const sendHeightToParent = () => {
      setTimeout(() => {
        const height = document.body.offsetHeight || document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'nada-resize', height: height }, '*');
      }, 50); // slight timeout for browser layout pass
    };

    // Trigger initial resize
    sendHeightToParent();

    // Observe layout changes via MutationObserver
    if (window.MutationObserver) {
      const resizeObserver = new MutationObserver(sendHeightToParent);
      resizeObserver.observe(document.body, { attributes: true, childList: true, subtree: true });
    }
  } else if (isDetached) {
    btnAttach.style.display = 'inline-flex';
    btnDetach.style.display = 'none';
    document.body.style.width = '100%';
  } else {
    btnDetach.style.display = 'inline-flex';
    btnAttach.style.display = 'none';
  }



  btnDetach.addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html?mode=detached'),
      type: 'popup',
      width: 380,
      height: 620
    }, () => {
      window.close();
    });
  });

  btnAttach.addEventListener('click', () => {
    window.close();
  });

  btnReset.addEventListener('click', () => {
    if (confirm('Sicuro di voler eseguire un reset completo dell\'estensione? Verranno eliminati tutti i log, il nome del test e le impostazioni.')) {
      isPerformingUndoRedo = true;
      chrome.storage.local.set({
        isRecording: false,
        testName: '',
        assertionMode: null,
        commentMode: false,
        lastSelectedElementXPath: null
      }, () => {
        replaceAllEvents([], {
          undoRedoState: {
            history: [[]],
            currentIndex: 0
          }
        }, () => {
          isPerformingUndoRedo = false;
          
          // Reset local variables
          isRecording = false;
          recordedEvents = [];
          assertionMode = null;
          commentMode = false;
          lastTextAssertionTarget = null;
          history = [[]];
          currentIndex = 0;
          
          // Reset inputs
          if (testNameInput) testNameInput.value = '';
          if (assertionTextInput) assertionTextInput.value = '';
          if (commentInput) commentInput.value = '';
          
          // Update UI
          updateStatusUI(false);
          updateLogDisplay([]);
          updateAssertionAndCommentContainers();
          updateUndoRedoButtons();
          updateButtonsState();
          
          alert('Estensione ripristinata allo stato iniziale!');
        });
      });
    }
  });


  // Read current storage states
  chrome.storage.local.get(['isRecording', 'testName', 'assertionMode', 'commentMode'], (result) => {
    isRecording = !!result.isRecording;
    assertionMode = result.assertionMode || null;
    commentMode = !!result.commentMode;
    testNameInput.value = result.testName || '';

    // loadEventsInOrder esegue anche l'eventuale migrazione legacy -> delta:
    // undoRedoState va letto DOPO, cosi' la history e' gia' in formato
    // liste-timestamp (niente conversioni locali).
    loadEventsInOrder((events) => {
      recordedEvents = events;

      chrome.storage.local.get('undoRedoState', (res) => {
        if (res.undoRedoState) {
          history = res.undoRedoState.history || [];
          currentIndex = res.undoRedoState.currentIndex !== undefined ? res.undoRedoState.currentIndex : -1;
        } else {
          history = [recordedEvents.map(e => e.timestamp)];
          currentIndex = 0;
        }

        updateStatusUI(isRecording);
        updateLogDisplay(recordedEvents);
        updateAssertionAndCommentContainers();
        updateUndoRedoButtons();
        updateButtonsState();
      });
    });
  });

  // Toggle Logs Section
  const toggleLogs = document.getElementById('toggleLogs');
  const logsSection = document.getElementById('logsSection');
  const arrowLogs = document.getElementById('arrowLogs');
  toggleLogs.addEventListener('click', () => {
    if (logsSection.style.display === 'none') {
      logsSection.style.display = 'block';
      arrowLogs.innerHTML = '&#9650;'; // Up arrow
    } else {
      logsSection.style.display = 'none';
      arrowLogs.innerHTML = '&#9660;'; // Down arrow
    }
  });

  // UI Event Listeners
  btnStart.addEventListener('click', () => {
    chrome.storage.local.set({ isRecording: true }, () => {
      // Assicura l'aggiunta dell'assertion page sulla tab attiva quando si avvia una registrazione ex novo
      queryActiveTab((activeTab) => {
        if (!activeTab || !activeTab.id || !activeTab.url) return;
        if (!activeTab.url.startsWith('http://') && !activeTab.url.startsWith('https://') && !activeTab.url.startsWith('file://')) {
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { action: 'ensureLandingAssertion' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            // Se il content script non era ancora iniettato nella tab attiva, lo iniettiamo e riproviamo
            if (chrome.scripting && chrome.scripting.executeScript) {
              chrome.scripting.executeScript({
                target: { tabId: activeTab.id, allFrames: false },
                files: ['storage-delta.js', 'content.js']
              }).then(() => {
                setTimeout(() => {
                  chrome.tabs.sendMessage(activeTab.id, { action: 'ensureLandingAssertion' }).catch(() => {});
                }, 100);
              }).catch((err) => console.log('Script injection error:', err));
            }
          }
        });
      });
    });
  });

  btnStop.addEventListener('click', () => {
    chrome.storage.local.set({ isRecording: false, assertionMode: null, commentMode: false });
  });

  testNameInput.addEventListener('input', (e) => {
    chrome.storage.local.set({ testName: e.target.value });
  });

  const btnClearTestName = document.getElementById('btnClearTestName');
  if (btnClearTestName) {
    btnClearTestName.addEventListener('click', () => {
      testNameInput.value = '';
      chrome.storage.local.set({ testName: '' });
    });
  }

  // ASSERTION: TEXT
  btnAssertionText.addEventListener('click', () => {
    const newMode = assertionMode === 'text' ? null : 'text';
    chrome.storage.local.set({ assertionMode: newMode, commentMode: false });
  });

  btnAssertionSend.addEventListener('click', () => {
    submitTextAssertion();
  });

  assertionTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitTextAssertion();
    }
  });

  // ASSERTION: VISIBLE
  btnAssertionVisible.addEventListener('click', () => {
    const newMode = assertionMode === 'visible' ? null : 'visible';
    chrome.storage.local.set({ assertionMode: newMode, commentMode: false });
  });

  // ASSERTION: ENABLED
  btnAssertionEnabled.addEventListener('click', () => {
    const newMode = assertionMode === 'enabled' ? null : 'enabled';
    chrome.storage.local.set({ assertionMode: newMode, commentMode: false });
  });

  // ASSERTION: DISABLED
  btnAssertionDisabled.addEventListener('click', () => {
    const newMode = assertionMode === 'disabled' ? null : 'disabled';
    chrome.storage.local.set({ assertionMode: newMode, commentMode: false });
  });

  // ASSERTION: PAGE
  /*btnAssertionPage.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tab = tabs[0];
        const pageAssertionEvent = {
          action: 'assertion',
          type: 'page',
          condition: 'landing',
          title: (tab.title || 'Senza Titolo').replace(/\s+/g, ' ').trim(),
          url: tab.url || '',
          timestamp: new Date().toISOString()
        };

        isPerformingUndoRedo = true;
        const events = recordedEvents.slice();
        events.push(pageAssertionEvent);
        chrome.storage.local.set({ recordedEvents: events }, () => {
          isPerformingUndoRedo = false;
          history = history.slice(0, currentIndex + 1);
          history.push(generateDisplayString(events));
          currentIndex++;
          saveUndoRedoStateToStorage();
          updateUndoRedoButtons();
          
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (title) => {
              let toast = document.getElementById('flowtrace-toast-notification');
              if (toast) toast.remove();

              toast = document.createElement('div');
              toast.id = 'flowtrace-toast-notification';
              toast.innerText = `✓ Page Assertion added: ${title}`;
              toast.style.position = 'fixed';
              toast.style.bottom = '24px';
              toast.style.left = '50%';
              toast.style.transform = 'translateX(-50%)';
              toast.style.background = '#0a2c5c';
              toast.style.color = '#ffffff';
              toast.style.padding = '8px 16px';
              toast.style.borderRadius = '6px';
              toast.style.zIndex = '9999999';
              toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
              toast.style.fontSize = '12px';
              toast.style.fontWeight = '600';
              toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              toast.style.opacity = '0';
              toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
              
              document.body.appendChild(toast);
              
              setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(-4px)';
              }, 10);
              
              setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%)';
                setTimeout(() => toast.remove(), 200);
              }, 2200);
            },
            args: [tab.title || 'Senza Titolo']
          }).catch(err => console.log('Scripting toast error:', err));
        });
      }
    });
  });*/

  // ASSERTION: COLOR (toggle interactive mode)
  btnAssertionColor.addEventListener('click', () => {
    const newMode = assertionMode === 'color' ? null : 'color';
    chrome.storage.local.set({ assertionMode: newMode, commentMode: false });
  });

  // ADD COMMENT
  btnAddComment.addEventListener('click', () => {
    const newCommentMode = !commentMode;
    chrome.storage.local.set({ commentMode: newCommentMode, assertionMode: null });
  });

  btnCommentSend.addEventListener('click', () => {
    submitComment();
  });

  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitComment();
    }
  });

  // UNDO / REDO
  btnUndo.addEventListener('click', () => {
    performUndo();
  });

  btnRedo.addEventListener('click', () => {
    performRedo();
  });

  // CLEAR LOGS
  btnClear.addEventListener('click', () => {
    if (confirm('Sicuro di voler cancellare tutti i log?')) {
      isPerformingUndoRedo = true;
      chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(k => k.startsWith('screenshot_'));
        chrome.storage.local.remove(keysToRemove, () => {
          // replaceAllEvents azzera la lista ordine e rimuove le chiavi evt_* orfane
          replaceAllEvents([], {
            undoRedoState: { history: [[]], currentIndex: 0 }
          }, () => {
            isPerformingUndoRedo = false;
            // Reset stack
            history = [[]];
            currentIndex = 0;
            recordedEvents = [];
            updateLogDisplay([]);
            updateUndoRedoButtons();
          });
        });
      });
    }
  });

  // DOWNLOAD LOGS (ZIP containing JSON + HTML Report)
  btnDownload.addEventListener('click', () => {
    showLoadingOverlay('Preparazione screenshot in corso...');
    // 1. Fetch detached screenshots first
    const keysToFetch = recordedEvents.filter(e => e.hasScreenshot).map(e => `screenshot_${e.timestamp}`);
    chrome.storage.local.get(keysToFetch, async (screenshotsData) => {
      try {
        // 2. Reattach screenshots to a local copy for export
        const eventsWithScreenshots = recordedEvents.map(e => {
          if (e.hasScreenshot && screenshotsData[`screenshot_${e.timestamp}`]) {
            return { ...e, screenshot: screenshotsData[`screenshot_${e.timestamp}`] };
          }
          return e;
        });

        const cleanEvents = convertToCleanJsonStructure(eventsWithScreenshots);
        const testName = testNameInput.value.trim();
        const baseName = testName 
          ? testName.replace(/[^a-zA-Z0-9_-]/g, '_') 
          : `recording_session_${new Date().getTime()}`;

        // 3. Downscale screenshot per l'embed nel report (max 1280px, JPEG
        // q50, decisione utente), a chunk per non bloccare il popup.
        // Gli originali vengono raccolti e salvati integri nello ZIP.
        const reportEvents = [];
        const originalScreenshots = {};
        for (let i = 0; i < eventsWithScreenshots.length; i++) {
          if (i % REPORT_CHUNK_SIZE === 0) await yieldToEventLoop();
          const e = eventsWithScreenshots[i];
          if (e.screenshot) {
            originalScreenshots[e.timestamp] = e.screenshot;
            try {
              reportEvents.push({ ...e, screenshot: await downscaleScreenshot(e.screenshot) });
            } catch (err) {
              reportEvents.push(e);
            }
          } else {
            reportEvents.push(e);
          }
        }

        // 4. Report + JSON
        showLoadingOverlay('Generazione report in corso...');
        const jsonText = JSON.stringify(cleanEvents, null, 2);
        const htmlReportContent = await generateHtmlReport(reportEvents, testName);

        const zip = new JSZip();
        zip.file(`${baseName}.json`, jsonText);
        zip.file(`${baseName}_report.html`, htmlReportContent);
        Object.keys(originalScreenshots).forEach(ts => {
          const dataUrl = originalScreenshots[ts];
          const mime = (dataUrl.match(/^data:image\/([a-z+]+);/) || [])[1] || 'png';
          const ext = mime === 'jpeg' || mime === 'jpg' ? 'jpg' : 'png';
          zip.file(`screenshots/screenshot_${ts}.${ext}`, dataUrl.split(',')[1], { base64: true });
        });

        // 5. STORE: il base64 (JPEG/PNG) non comprime; DEFLATE brucia CPU VM
        showLoadingOverlay('Compressione ZIP in corso...');
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}.zip`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
      } catch (err) {
        console.error("Errore durante il download:", err);
        alert("Si è verificato un errore durante il download: " + err.message);
      } finally {
        hideLoadingOverlay();
      }
    });
  });

  // Native Chrome SidePanel: native file dialog without injecting modals into host page
  btnUpload.addEventListener('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay('Caricamento in corso...');

    if (file.name.endsWith('.zip')) {
      const reader = new FileReader();
      reader.onload = function(e) {
        JSZip.loadAsync(e.target.result)
          .then((zip) => {
            const htmlFileName = Object.keys(zip.files).find(name => name.endsWith('_report.html'));
            if (htmlFileName) {
              return zip.files[htmlFileName].async('text').then((htmlText) => {
                const match = htmlText.match(/<script id="rawStepsData" type="application\/json">([\s\S]*?)<\/script>/);
                if (match) {
                  return match[1];
                }
                const jsonFileName = Object.keys(zip.files).find(name => name.endsWith('.json'));
                if (jsonFileName) {
                  return zip.files[jsonFileName].async('text');
                }
                throw new Error('Nessun dato valido trovato nel report HTML e nessun file JSON trovato.');
              });
            } else {
              const jsonFileName = Object.keys(zip.files).find(name => name.endsWith('.json'));
              if (!jsonFileName) {
                throw new Error('Nessun file JSON o report HTML trovato nell\'archivio ZIP!');
              }
              return zip.files[jsonFileName].async('text');
            }
          })
          .then((jsonText) => {
            if (!jsonText) return;
            const newEvents = JSON.parse(jsonText);
            loadAndMergeEvents(newEvents, file.name);
          })
          .catch((err) => {
            alert('Errore durante la lettura dello ZIP: ' + err.message);
            hideLoadingOverlay();
          });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const newEvents = JSON.parse(e.target.result);
          loadAndMergeEvents(newEvents, file.name);
        } catch (err) {
          alert('File JSON non valido! ' + err.message);
          hideLoadingOverlay();
        }
      };
      reader.readAsText(file);
    }
    uploadInput.value = '';
  });

  function loadAndMergeEvents(newEvents, fileName) {
    if (!Array.isArray(newEvents)) {
      alert('Il file di registrazione caricato deve contenere un array di eventi!');
      hideLoadingOverlay();
      return;
    }
    const internalEvents = convertToInternalStructure(newEvents);
    
    let cleanName = '';
    if (fileName) {
      cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/_report$/, "");
      cleanName = cleanName.replace(/recording_session_\d+/, "");
      if (!cleanName) {
        cleanName = fileName.replace(/\.[^/.]+$/, "");
      }
      cleanName = cleanName.replace(/_/g, " ").trim();
    }

    isPerformingUndoRedo = true;
    
    const screenshotUpdates = {};
    internalEvents.forEach(e => {
      if (e.screenshot) {
        screenshotUpdates[`screenshot_${e.timestamp}`] = e.screenshot;
        e.hasScreenshot = true;
        delete e.screenshot;
      }
    });
    
    const order = internalEvents.map(e => e.timestamp);
    const updates = {
      ...screenshotUpdates,
      isRecording: false,
      assertionMode: null,
      commentMode: false,
      lastSelectedElementXPath: null,
      undoRedoState: {
        history: [order.slice()],
        currentIndex: 0
      }
    };

    if (cleanName) {
      updates.testName = cleanName;
      if (testNameInput) {
        testNameInput.value = cleanName;
      }
    }

    // Scrittura delta: evt_* + lista ordine, con rimozione delle chiavi evt_* orfane
    replaceAllEvents(internalEvents, updates, () => {
      isPerformingUndoRedo = false;
      
      // Reset local variables
      isRecording = false;
      recordedEvents = structuredClone(internalEvents);
      assertionMode = null;
      commentMode = false;
      lastTextAssertionTarget = null;
      history = [order.slice()];
      currentIndex = 0;
      
      // Reset inputs
      if (assertionTextInput) assertionTextInput.value = '';
      if (commentInput) commentInput.value = '';
      
      // Update UI
      updateStatusUI(false);
      updateLogDisplay(recordedEvents);
      updateAssertionAndCommentContainers();
      updateUndoRedoButtons();
      hideLoadingOverlay();
    });
  }



  // EDIT LOGS (Textarea manual edit)
  btnEdit.addEventListener('click', () => {
    isEditMode = !isEditMode;
    if (isEditMode) {
      // Enter Edit Mode
      statusDiv.innerText = "EDIT MODE";
      statusDiv.classList.remove('status-recording', 'status-stopped');
      statusDiv.classList.add('status-edit');
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnAssertionText.disabled = true;
      btnAssertionEnabled.disabled = true;
      btnAssertionVisible.disabled = true;
      btnAssertionDisabled.disabled = true;
      btnAddComment.disabled = true;
      btnDownload.disabled = true;
      btnUpload.disabled = true;
      btnClear.disabled = true;
      
      originalLogsBackup = JSON.stringify(recordedEvents);
      
      // Initialize edit text history
      editTextHistory = [logDisplay.value];
      editTextIndex = 0;
      
      logDisplay.removeAttribute('readonly');
      logDisplay.focus();
      logDisplay.classList.add('edit-mode');
      
      // Monitor keystrokes for undo/redo in editor
      logDisplay.addEventListener('input', onEditModeInput);
      
      imgEdit.src = saveImg;
      btnEdit.title = 'Save Logs';
      
      updateUndoRedoButtons();
    } else {
      // Exit and Save Edit Mode
      saveLogsFromTextarea();
      logDisplay.setAttribute('readonly', true);
      logDisplay.classList.remove('edit-mode');
      logDisplay.removeEventListener('input', onEditModeInput);
      imgEdit.src = editImg;
      btnEdit.title = 'Edit Logs';
      
      updateStatusUI(isRecording);
      updateButtonsState();
    }
  });
});

// Storage Changes Listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue === true;
    updateStatusUI(isRecording);
    updateButtonsState();
  }
  if (changes.events) {
    const order = Array.isArray(changes.events.newValue) ? changes.events.newValue : [];
    const prev = recordedEvents;

    // Caso comune: append di un evento da un altro contesto (content.js).
    // Se la lista ordine differisce solo per l'ultimo timestamp, fetch
    // incrementale delle chiavi evt_* invece di un bulk load completo.
    const isAppend = prev.length > 0 && order.length === prev.length + 1 &&
      order.slice(0, prev.length).every((ts, i) => ts === prev[i].timestamp);

    const finalize = (events) => {
      recordedEvents = events;
      updateLogDisplay(events);
      updateButtonsState();

      if (!isPerformingUndoRedo && !isEditMode && !changes.undoRedoState) {
        // User performed a page interaction, push state to stack
        // (history ora contiene liste-timestamp, non payload completi)
        let shouldUpdateLastState = false;
        if (currentIndex >= 0 && currentIndex < history.length) {
          const lastState = history[currentIndex];
          if (Array.isArray(lastState) && lastState.length === order.length &&
              lastState.every((ts, i) => ts === order[i])) {
            shouldUpdateLastState = true;
          }
        }

        if (shouldUpdateLastState) {
          history[currentIndex] = order.slice();
        } else {
          history = history.slice(0, currentIndex + 1);
          history.push(order.slice());
          currentIndex++;
          if (history.length > maxStates) {
            history.shift();
            currentIndex--;
          }
        }
        saveUndoRedoStateToStorage();
        updateUndoRedoButtons();
      }
    };

    if (isAppend) {
      const newTs = order.slice(prev.length);
      chrome.storage.local.get(newTs.map(ts => 'evt_' + ts), (data) => {
        const added = newTs.map(ts => data['evt_' + ts]).filter(Boolean);
        finalize(prev.concat(added));
      });
    } else {
      loadEventsInOrder((events) => finalize(events));
    }
  }
  if (changes.undoRedoState) {
    const val = changes.undoRedoState.newValue;
    if (val) {
      history = val.history || [[]];
      currentIndex = val.currentIndex !== undefined ? val.currentIndex : 0;
      updateUndoRedoButtons();
    }
  }
  if (changes.testName && testNameInput) {
    testNameInput.value = changes.testName.newValue || '';
  }
  if (changes.assertionMode) {
    assertionMode = changes.assertionMode.newValue || null;
    updateAssertionAndCommentContainers();
  }
  if (changes.commentMode) {
    commentMode = changes.commentMode.newValue === true;
    updateAssertionAndCommentContainers();
  }
  if (changes.lastSelectedElementXPath) {
    lastTextAssertionTarget = changes.lastSelectedElementXPath.newValue || null;
    updateAssertionBanner(lastTextAssertionTarget);
  }
});

// Update Status label
function updateStatusUI(recording) {
  if (!statusDiv || !btnStart || !btnStop) return;
  statusDiv.classList.remove('status-recording', 'status-stopped', 'status-edit');
  if (recording) {
    statusDiv.innerText = "RECORDING ACTIVE";
    statusDiv.classList.add('status-recording');
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnAssertionText.disabled = false;
    btnAssertionEnabled.disabled = false;
    btnAssertionVisible.disabled = false;
    btnAssertionDisabled.disabled = false;
    //btnAssertionPage.disabled = false;
    btnAssertionColor.disabled = false;
    btnAddComment.disabled = false;
  } else {
    statusDiv.innerText = "STOPPED";
    statusDiv.classList.add('status-stopped');
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnAssertionText.disabled = true;
    btnAssertionEnabled.disabled = true;
    btnAssertionVisible.disabled = true;
    btnAssertionDisabled.disabled = true;
    //btnAssertionPage.disabled = true;
    btnAssertionColor.disabled = true;
    btnAddComment.disabled = true;
  }
}

// Update log display inside monospace terminal
function updateLogDisplay(events) {
  if (!logDisplay) return;
  logDisplay.value = generateDisplayString(events);
  
  const count = Array.isArray(events) ? events.length : 0;
  if (logsCounter) {
    logsCounter.textContent = count;
  }
}

// Render a single event to its readable text block
function renderSingleEvent(e) {
  if (e.action === 'assertion') {
    if (e.type === 'text') {
      return `[ASSERTION TEXT] ${e.locator}\nExpected: ${e.expected_value}\nURL: ${e.url}\n----------------`;
    } else if (e.type === 'page') {
      return `[ASSERTION PAGE] Landing on: ${e.title}\nURL: ${e.url}\n----------------`;
    } else if (e.type === 'style' && e.condition === 'color') {
      return `[ASSERTION COLOR] ${e.locator}\nExpected: ${e.expected_value}\nURL: ${e.url}\n----------------`;
    } else {
      return `[ASSERTION - ${e.condition.toUpperCase()}] ${e.locator}\nURL: ${e.url}\n----------------`;
    }
  }
  if (e.action === 'click') {
    return `[CLICK] ${e.locator}\nURL: ${e.url}\n----------------`;
  }
  if (e.action === 'comment') {
    return `[COMMENT] ${e.comment}\nURL: ${e.url}\n----------------`;
  }
  if (e.action === 'select') {
    const selectValue = typeof e.value === 'object' ? e.value.value : e.value;
    const selectText = typeof e.value === 'object' ? e.value.text : '';
    return `[SELECT] ${e.locator}\nValue: ${selectValue}\nText: ${selectText}\nURL: ${e.url}\n----------------`;
  }
  return `[${e.action.toUpperCase()}] ${e.locator}\nValue: ${e.value || 'N/A'}\nURL: ${e.url}\n----------------`;
}

// Cache of per-event rendered strings, in chronological order, so a plain
// append of a new event doesn't require re-rendering the whole log every
// time (rebuild-everything is O(n) per event, O(n^2) over a long session).
let displayCache = { events: null, rendered: [] };

// Generate the readable text display string for events
function generateDisplayString(events) {
  if (!events || events.length === 0) {
    displayCache = { events: [], rendered: [] };
    return "No events recorded yet.";
  }

  // chrome.storage.onChanged always hands back freshly deserialized objects
  // (no stable references across contexts), so compare by timestamp rather
  // than identity to detect the common case of "one event appended".
  const prev = displayCache.events;
  const isSimpleAppend = prev && events.length === prev.length + 1 &&
    prev.every((e, i) => e.timestamp === events[i].timestamp);

  if (isSimpleAppend) {
    displayCache.rendered.push(renderSingleEvent(events[events.length - 1]));
  } else {
    displayCache.rendered = events.map(renderSingleEvent);
  }
  displayCache.events = events;
  return displayCache.rendered.slice().reverse().join('\n');
}

// Enable/Disable buttons based on state
function updateButtonsState() {
  if (!btnDownload || !btnUpload || !btnEdit || !btnClear) return;
  const count = Array.isArray(recordedEvents) ? recordedEvents.length : 0;
  
  if (isEditMode) {
    btnDownload.disabled = true;
    btnUpload.disabled = true;
    btnClear.disabled = true;
    btnEdit.disabled = false;
    return;
  }
  
  if (isRecording) {
    btnDownload.disabled = true;
    btnUpload.disabled = true;
    btnClear.disabled = false;
    btnEdit.disabled = true;
  } else {
    btnUpload.disabled = false;
    btnDownload.disabled = count === 0;
    btnClear.disabled = false;
    btnEdit.disabled = count === 0;
  }
}

// Toggle Visibility and Active Images of Assertion and Comment sub-containers
function updateAssertionAndCommentContainers() {
  if (!assertionContainer || !commentContainer || !assertionTargetBanner) return;

  // Active status visual feedback on images
  imgAssertionText.src = assertionMode === 'text' ? textActiveImg : assertionTextImg;
  imgAssertionVisible.src = assertionMode === 'visible' ? visibleActiveImg : assertionVisibleImg;
  imgAssertionEnabled.src = assertionMode === 'enabled' ? enabledActiveImg : assertionEnabledImg;
  imgAssertionDisabled.src = assertionMode === 'disabled' ? disabledActiveImg : assertionDisabledImg;
  imgAssertionColor.src = assertionMode === 'color' ? assertionColorActiveImg : assertionColorImg;
  imgAddComment.src = commentMode ? addCommentActiveImg : addCommentImg;

  btnAssertionText.classList.toggle('active', assertionMode === 'text');
  btnAssertionVisible.classList.toggle('active', assertionMode === 'visible');
  btnAssertionEnabled.classList.toggle('active', assertionMode === 'enabled');
  btnAssertionDisabled.classList.toggle('active', assertionMode === 'disabled');
  btnAssertionColor.classList.toggle('active', assertionMode === 'color');
  btnAddComment.classList.toggle('active', commentMode);

  // Toggle assertion banner and inputs
  if (assertionMode === 'text') {
    assertionTargetBanner.style.display = 'block';
    assertionContainer.style.display = lastTextAssertionTarget ? 'flex' : 'none';
    updateAssertionBanner(lastTextAssertionTarget);
  } else {
    assertionTargetBanner.style.display = 'none';
    assertionContainer.style.display = 'none';
  }

  // Toggle comment input
  commentContainer.style.display = commentMode ? 'flex' : 'none';
  if (commentMode) {
    commentInput.focus();
  }
}

// Update assertion element banner
function updateAssertionBanner(xpath) {
  if (!assertionTargetBanner) return;
  if (!xpath) {
    assertionTargetBanner.innerText = 'Selezionare un oggetto nella pagina...';
    assertionTargetBanner.style.color = '#64748b';
    if (assertionContainer) assertionContainer.style.display = 'none';
  } else {
    assertionTargetBanner.innerText = `Target: ${xpath}`;
    assertionTargetBanner.style.color = '#4f46e5';
    if (assertionContainer) {
      assertionContainer.style.display = 'flex';
      assertionTextInput.focus();
    }
  }
}


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

// Submit a new Text Assertion
function submitTextAssertion() {
  const val = assertionTextInput.value.trim();
  if (val && lastTextAssertionTarget) {
    // Determine active tab URL
    queryActiveTab((activeTab) => {
      const url = activeTab ? activeTab.url : '';
      const tabId = activeTab ? activeTab.id : null;
      
      if (!tabId) return;

      // Execute script to retrieve element metadata (outerHTML, DOMContext, labelText)
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        args: [lastTextAssertionTarget],
        func: (xpath) => {
          const getElementByXPath = (xp) => {
            try {
              const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              return res.singleNodeValue;
            } catch (e) { return null; }
          };
          const getDOMContext = (el) => {
            if (!el) return '';
            try {
              el.setAttribute('data-target', 'true');
              let node = el;
              if (el.parentElement) {
                node = el.parentElement;
                if (node.parentElement) {
                  node = node.parentElement;
                }
              }
              const html = node.outerHTML;
              el.removeAttribute('data-target');
              return html ? (html.length > 5000 ? html.substring(0, 5000) + '...[TRUNCATED]' : html) : '';
            } catch (e) {
              try { el.removeAttribute('data-target'); } catch (err) {}
              const html = el.outerHTML || '';
              return html.length > 5000 ? html.substring(0, 5000) + '...[TRUNCATED]' : html;
            }
          };
          const getElementLabelText = (element) => {
            let labelText = '';
            if (element.hasAttribute('aria-label')) {
              labelText = element.getAttribute('aria-label');
            } else if (element.hasAttribute('aria-labelledby')) {
              const id = element.getAttribute('aria-labelledby');
              const labelElem = document.getElementById(id);
              if (labelElem) labelText = labelElem.textContent;
            } else if (element.id) {
              const label = document.querySelector(`label[for="${element.id}"]`);
              if (label) labelText = label.textContent;
            } else {
              const parentLabel = element.closest('label');
              if (parentLabel) labelText = parentLabel.textContent;
            }
            if (!labelText) {
              labelText = element.placeholder || element.title || element.value || element.innerText || '';
            }
            return labelText.trim();
          };

          const el = getElementByXPath(xpath);
          if (el) {
            function getCheckboxOrRadioType(element) {
              if (!element) return null;
              const tag = element.tagName.toUpperCase();
              if (tag === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
                return element.type;
              }
              if (tag === 'LABEL') {
                if (element.htmlFor) {
                  const associated = document.getElementById(element.htmlFor);
                  if (associated && associated.tagName.toUpperCase() === 'INPUT' && (associated.type === 'checkbox' || associated.type === 'radio')) {
                    return associated.type;
                  }
                }
                const innerInput = element.querySelector('input[type="checkbox"], input[type="radio"]');
                if (innerInput) {
                  return innerInput.type;
                }
              }
              return null;
            }
            function getElementTypeName(element) {
              if (!element) return 'element';
              const checkboxOrRadioType = getCheckboxOrRadioType(element);
              if (checkboxOrRadioType) {
                return checkboxOrRadioType;
              }
              if (element.tagName.toUpperCase() === 'LABEL') {
                return 'label';
              }
              const interactiveParent = element.closest('button, a, [role="button"], [role="link"]');
              const target = interactiveParent || element;
              const tag = target.tagName.toUpperCase();
              if (tag === 'INPUT') {
                return target.type ? target.type.toLowerCase() : 'text';
              }
              if (tag === 'TEXTAREA') {
                return 'textarea';
              }
              if (tag === 'SELECT') {
                return 'select';
              }
              if (tag === 'A' || target.getAttribute('role') === 'link') {
                return 'link';
              }
              if (tag === 'BUTTON' || target.getAttribute('role') === 'button') {
                return 'button';
              }
              return tag.toLowerCase();
            }

            const outer = el.outerHTML || '';
            return {
              outerHTML: outer.length > 5000 ? outer.substring(0, 5000) + '...[TRUNCATED]' : outer,
              DOMContext: getDOMContext(el),
              labelText: getElementLabelText(el),
              elementType: getElementTypeName(el)
            };
          }
          return null;
        }
      }, (results) => {
        let meta = null;
        if (results && results[0] && results[0].result) {
          meta = results[0].result;
        }

        const assertionEvent = {
          action: 'assertion',
          type: 'text',
          condition: 'equals-ci',
          locator: lastTextAssertionTarget,
          expected_value: val,
          url: url,
          timestamp: new Date().toISOString()
        };

        if (meta) {
          if (meta.labelText) assertionEvent.labelText = meta.labelText;
          assertionEvent.outerHTML = meta.outerHTML;
          assertionEvent.DOMContext = meta.DOMContext;
          if (meta.elementType) assertionEvent.elementType = meta.elementType;
        }

        isPerformingUndoRedo = true;
        const events = recordedEvents.slice();
        events.push(assertionEvent);
        const order = events.map(e => e.timestamp);

        // Push state and undoRedoState in the SAME storage.local.set() call
        // as events: chrome.storage.onChanged always batches keys
        // from one set() call into a single `changes` object, so the
        // general listener's `!changes.undoRedoState` guard reliably sees
        // this was an undo/redo-managed write, regardless of any timing
        // race between isPerformingUndoRedo and the onChanged dispatch.
        // Two separate set() calls (events, then undoRedoState in
        // the callback) do NOT give that guarantee and could let the
        // generic listener double-push / desync the history stack.
        const newHistory = history.slice(0, currentIndex + 1);
        newHistory.push(order.slice());
        const newCurrentIndex = currentIndex + 1;

        const writes = {
          events: order,
          assertionMode: null,
          lastSelectedElementXPath: null,
          undoRedoState: { history: newHistory, currentIndex: newCurrentIndex }
        };
        writes['evt_' + assertionEvent.timestamp] = assertionEvent;

        chrome.storage.local.set(writes, () => {
          isPerformingUndoRedo = false;
          history = newHistory;
          currentIndex = newCurrentIndex;

          assertionTextInput.value = '';
          lastTextAssertionTarget = null;
          updateAssertionAndCommentContainers();
          updateUndoRedoButtons();

          // Inject script to show toast notification
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              if (typeof showToast === 'function') {
                showToast('✓ Assertion added: TEXT');
              }
            }
          }).catch(err => console.log('Scripting toast error:', err));
        });
      });
    });
  }
}

// Submit a comment
function submitComment() {
  const val = commentInput.value.trim();
  if (val) {
    queryActiveTab((activeTab) => {
      const url = activeTab ? activeTab.url : '';
      const commentEvent = {
        action: 'comment',
        comment: val,
        url: url,
        timestamp: new Date().toISOString()
      };

      isPerformingUndoRedo = true;
      const events = recordedEvents.slice();
      events.push(commentEvent);
      const order = events.map(e => e.timestamp);

      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(order.slice());
      const newCurrentIndex = currentIndex + 1;

      const writes = {
        events: order,
        commentMode: false,
        undoRedoState: { history: newHistory, currentIndex: newCurrentIndex }
      };
      writes['evt_' + commentEvent.timestamp] = commentEvent;

      chrome.storage.local.set(writes, () => {
        isPerformingUndoRedo = false;
        history = newHistory;
        currentIndex = newCurrentIndex;

        commentInput.value = '';
        updateAssertionAndCommentContainers();
        updateUndoRedoButtons();

        // Inject script to show toast notification
        chrome.scripting.executeScript({
          target: { tabId: (activeTab ? activeTab.id : null) },
          func: () => {
            if (typeof showToast === 'function') {
              showToast('✓ Comment added');
            }
          }
        }).catch(err => console.log('Scripting toast error:', err));
      });
    });
  }
}


// Undo/Redo stack handlers
//
// NOTE: this write must stay synchronous/immediate, not debounced. The
// recording UI ("floating panel") is an <iframe> injected into the page
// (see content.js, chrome.runtime.getURL('sidepanel.html?mode=embedded')), so
// this whole JS context is torn down on every page navigation - which is
// the normal case for a multi-page test recording. A debounced write here
// can be silently lost if navigation happens before the timer fires,
// leaving the persisted undo/redo stack missing its most recent entry
// (recordedEvents itself is unaffected since it's written immediately) -
// undo then appears to work once, but redo can never restore that entry.
function saveUndoRedoStateToStorage() {
  chrome.storage.local.set({
    undoRedoState: {
      history: history,
      currentIndex: currentIndex
    }
  });
}

function updateUndoRedoButtons() {
  if (isEditMode) {
    if (btnUndo) btnUndo.disabled = (editTextIndex <= 0);
    if (btnRedo) btnRedo.disabled = (editTextIndex >= editTextHistory.length - 1);
    return;
  }
  if (btnUndo) btnUndo.disabled = (currentIndex <= 0);
  if (btnRedo) btnRedo.disabled = (currentIndex >= history.length - 1);
}

function performUndo() {
  if (isEditMode) {
    if (editTextIndex > 0) {
      editTextIndex--;
      logDisplay.value = editTextHistory[editTextIndex];
      updateUndoRedoButtons();
    }
  } else {
    if (currentIndex > 0) {
      currentIndex--;
      const state = history[currentIndex];
      const order = Array.isArray(state) ? state : [];

      // events + undoRedoState in ONE set() call so they always
      // land in the same chrome.storage.onChanged batch (see the note on
      // saveUndoRedoStateToStorage above for why that matters).
      // Il display si aggiorna via onChanged -> loadEventsInOrder.
      isPerformingUndoRedo = true;
      chrome.storage.local.set({
        events: order,
        undoRedoState: { history: history, currentIndex: currentIndex }
      }, () => {
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
      });
    }
  }
}

function performRedo() {
  if (isEditMode) {
    if (editTextIndex < editTextHistory.length - 1) {
      editTextIndex++;
      logDisplay.value = editTextHistory[editTextIndex];
      updateUndoRedoButtons();
    }
  } else {
    if (currentIndex < history.length - 1) {
      currentIndex++;
      const state = history[currentIndex];
      const order = Array.isArray(state) ? state : [];

      isPerformingUndoRedo = true;
      chrome.storage.local.set({
        events: order,
        undoRedoState: { history: history, currentIndex: currentIndex }
      }, () => {
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
      });
    }
  }
}

let lastEditTimestamp = 0;
const EDIT_THROTTLE_MS = 500;
const MAX_EDIT_HISTORY = 100;

function onEditModeInput(event) {
  if (isEditMode) {
    const now = Date.now();
    if (now - lastEditTimestamp >= EDIT_THROTTLE_MS) {
      const currentText = logDisplay.value;
      if (editTextHistory[editTextIndex] !== currentText) {
        editTextHistory = editTextHistory.slice(0, editTextIndex + 1);
        editTextHistory.push(currentText);
        editTextIndex++;
        if (editTextHistory.length > MAX_EDIT_HISTORY) {
          editTextHistory.shift();
          editTextIndex--;
        }
        updateUndoRedoButtons();
      }
      lastEditTimestamp = now;
    }
  }
}

