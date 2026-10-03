function alignAndPreserveMetadata(originalEvents, newEvents) {
  if (!originalEvents || originalEvents.length === 0 || !newEvents || newEvents.length === 0) {
    return;
  }
  const N = originalEvents.length;
  const M = newEvents.length;
  
  // DP table to find LCS matching
  const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1));
  const parent = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
  
  function getMatchScore(orig, newEv) {
    if (orig.action !== newEv.action) return 0;
    
    if (orig.action === 'comment' || orig.action === 'navigation') {
      if (orig.comment === newEv.comment) return 10;
      return 5;
    }
    
    if (orig.action === 'assertion') {
      if (orig.type === newEv.type && orig.condition === newEv.condition) {
        if (orig.locator === newEv.locator) return 10;
        return 5;
      }
      return 0;
    }
    
    if (orig.locator === newEv.locator) {
      if (orig.value === newEv.value) return 10;
      return 8;
    }
    return 5;
  }
  
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const matchScore = getMatchScore(originalEvents[i-1], newEvents[j-1]);
      
      let best = dp[i-1][j-1] + matchScore;
      let path = 1; // match/align
      
      if (dp[i-1][j] > best) {
        best = dp[i-1][j];
        path = 2; // skip original
      }
      if (dp[i][j-1] > best) {
        best = dp[i][j-1];
        path = 3; // skip new
      }
      
      dp[i][j] = best;
      parent[i][j] = path;
    }
  }
  
  let i = N;
  let j = M;
  while (i > 0 && j > 0) {
    const path = parent[i][j];
    if (path === 1) {
      const orig = originalEvents[i-1];
      const newEv = newEvents[j-1];
      
      if (orig.screenshot) {
        newEv.screenshot = orig.screenshot;
      }
      if (orig.timestamp) {
        newEv.timestamp = orig.timestamp;
      }
      if (orig.metadata) {
        newEv.metadata = orig.metadata;
      }
      i--;
      j--;
    } else if (path === 2) {
      i--;
    } else {
      j--;
    }
  }
}

function saveLogsFromTextarea() {
  try {
    const events = parseLogsFromText(logDisplay.value);
    isPerformingUndoRedo = true;
    
    let originalEvents = [];
    if (originalLogsBackup) {
      try {
        originalEvents = JSON.parse(originalLogsBackup);
      } catch (e) {
        console.error(e);
      }
    }
    
    // Preserve screenshots and original timestamps
    alignAndPreserveMetadata(originalEvents, events);

    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(events.map(e => e.timestamp));
    let newCurrentIndex = currentIndex + 1;
    if (newHistory.length > maxStates) {
      newHistory.shift();
      newCurrentIndex--;
    }

    // Scrittura delta: evt_* + lista ordine (timestamp preservati da
    // alignAndPreserveMetadata). keepStaleKeys=true: le chiavi evt_* degli
    // eventi rimossi dall'edit restano in storage per l'undo.
    replaceAllEvents(events, {
      undoRedoState: { history: newHistory, currentIndex: newCurrentIndex }
    }, () => {
      isPerformingUndoRedo = false;
      history = newHistory;
      currentIndex = newCurrentIndex;

      updateLogDisplay(events);
      updateUndoRedoButtons();
    }, true);
  } catch (err) {
    console.error('Error saving logs from textarea:', err);
    alert('Errore nel formato dei log! Controlla la sintassi ed i separatori "----------------".\nDettaglio: ' + err.message);
  }
}

let lastParsedTimestamp = 0;
function generateUniqueTimestamp() {
  let now = Date.now();
  if (now <= lastParsedTimestamp) {
    now = lastParsedTimestamp + 1;
  }
  lastParsedTimestamp = now;
  return new Date(now).toISOString();
}

function parseLogsFromText(text) {
  if (!text || text.trim() === "No events recorded yet.") return [];
  const blocks = text
    .split('----------------')
    .map(b => b.trim())
    .filter(b => b.length > 0);
  const events = blocks.map(block => {
    try {
      const lines = block.split('\n').map(l => l.trim());
      const firstLine = lines[0] || '';
      if (firstLine.includes('ASSERTION - VISIBLE')) {
        return {
          action: 'assertion',
          type: 'visibility',
          condition: 'visible',
          locator: firstLine.replace(/\[ASSERTION - VISIBLE\]\s*/, '').trim(),
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('ASSERTION TEXT')) {
        return {
          action: 'assertion',
          type: 'text',
          condition: 'equals-ci',
          locator: firstLine.replace(/\[ASSERTION TEXT\]\s*/, '').trim(),
          expected_value: lines.find(l => l.startsWith('Expected:'))?.replace('Expected:', '').trim() || '',
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('ASSERTION PAGE')) {
        return {
          action: 'assertion',
          type: 'page',
          condition: 'landing',
          title: firstLine.replace(/\[ASSERTION PAGE\]\s*Landing on:\s*/, '').trim(),
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('[COMMENT]')) {
        return {
          action: 'comment',
          comment: firstLine.replace('[COMMENT]', '').trim(),
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('ASSERTION - ENABLED')) {
        return {
          action: 'assertion',
          type: 'attribute',
          condition: 'enabled',
          locator: firstLine.replace(/\[ASSERTION - ENABLED\]\s*/, '').trim(),
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('ASSERTION - DISABLED')) {
        return {
          action: 'assertion',
          type: 'attribute',
          condition: 'disabled',
          locator: firstLine.replace(/\[ASSERTION - DISABLED\]\s*/, '').trim(),
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('ASSERTION COLOR')) {
        return {
          action: 'assertion',
          type: 'style',
          condition: 'color',
          locator: firstLine.replace(/\[ASSERTION COLOR\]\s*/, '').trim(),
          expected_value: lines.find(l => l.startsWith('Expected:'))?.replace('Expected:', '').trim() || '',
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      if (firstLine.includes('[SELECT]')) {
        const locator = firstLine.replace(/\[SELECT\]\s*/, '').trim();
        const valueLine = lines.find(l => l.startsWith('Value:'))?.replace('Value:', '').trim() || '';
        const textLine = lines.find(l => l.startsWith('Text:'))?.replace('Text:', '').trim() || '';
        return {
          action: 'select',
          locator: locator,
          value: { value: valueLine, text: textLine },
          url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
          timestamp: generateUniqueTimestamp()
        };
      }
      
      // Default fallback: click or other actions
      const actionMatch = firstLine.match(/^\[(.*?)\]\s*(.*)/);
      const action = actionMatch ? actionMatch[1].toLowerCase() : 'click';
      const locator = actionMatch ? actionMatch[2].trim() : firstLine;
      const valueLine = lines.find(l => l.startsWith('Value:'))?.replace('Value:', '').trim();
      const event = {
        action: action,
        locator: locator,
        url: lines.find(l => l.startsWith('URL:'))?.replace('URL:', '').trim() || '',
        timestamp: generateUniqueTimestamp()
      };
      if (valueLine !== undefined) {
        if (action === 'scroll') {
          let x = 0, y = 0;
          const match = valueLine.match(/x:(\d+),\s*y:(\d+)/);
          if (match) {
            x = parseInt(match[1]);
            y = parseInt(match[2]);
          }
          event.value = { x, y };
        } else {
          event.value = valueLine;
        }
      }
      return event;
    } catch (e) {
      console.error('Error parsing block:', block, e);
      throw new Error(`Errore durante il parsing del blocco "${block.substring(0, 30)}...": ${e.message}`);
    }
  }).reverse();
  return events;
}

function convertToCleanJsonStructure(events) {
  if (!events || !Array.isArray(events)) return [];

  function getElementType(e) {
    if (!e) return 'element';
    if (e.elementType) {
      if (e.elementType.toLowerCase() === 'a') return 'link';
      return e.elementType;
    }
    if (e.type && e.action !== 'assertion' && e.type !== 'page') {
      if (e.type.toLowerCase() === 'a') return 'link';
      return e.type;
    }
    if (e.outerHTML) {
      const html = e.outerHTML.trim();
      const matchTag = html.match(/^<([a-zA-Z0-9-]+)/);
      if (matchTag) {
        const tag = matchTag[1].toLowerCase();
        if (tag === 'input') {
          const matchType = html.match(/type=["']([^"']+)["']/i);
          if (matchType) {
            return matchType[1].toLowerCase();
          }
          return 'text';
        }
        if (tag === 'a') return 'link';
        return tag;
      }
    }
    if (e.locator) {
      const matchLocator = e.locator.match(/\/([a-zA-Z0-9-]+)(?:\[|$)/);
      if (matchLocator) {
        const tag = matchLocator[1].toLowerCase();
        if (tag === 'a') return 'link';
        return tag;
      }
    }
    return 'element';
  }

  return events.map(e => {
    // 1. Navigation / Comments
    if (e.action === 'comment' || e.action === 'navigation') {
      const res = {
        action: 'navigation',
        timestamp: e.timestamp,
        comment: e.comment || '',
        url: e.url || ''
      };
      return res;
    }
    
    // 2. Assertions
    if (e.action === 'assertion') {
      if (e.type === 'page') {
        const res = {
          assertion: 'page',
          title: e.title || '',
          url: e.url || '',
          timestamp: e.timestamp
        };
        return res;
      }
      
      let mappedType = 'state';
      if (e.type === 'visibility' || e.condition === 'visible') {
        mappedType = 'visibility';
      } else if (e.type === 'text' || e.condition === 'text') {
        mappedType = 'text';
      } else if (e.type === 'style' && e.condition === 'color') {
        mappedType = 'style';
      }
      
      const mapped = {
        assertion: mappedType,
        type: getElementType(e),
        locator: e.locator || '',
        timestamp: e.timestamp,
        condition: e.condition === 'equals-ci' ? 'text' : e.condition,
        url: e.url || ''
      };
      
      if (mappedType === 'text') {
        mapped.value = e.expected_value || '';
      }
      
      return mapped;
    }
    
    // 3. Standard Interactions
    const mapped = {
      action: e.action || 'click',
      type: getElementType(e),
      locator: e.locator || '',
      timestamp: e.timestamp,
      url: e.url || ''
    };
    
    if (e.action === 'input') {
      mapped.value = e.value || '';
    } else if (e.action === 'select') {
      mapped.value = e.value && typeof e.value === 'object' ? e.value.value : (e.value || '');
    } else if (e.action === 'scroll') {
      mapped.value = e.value && typeof e.value === 'object' ? `x:${e.value.x}, y:${e.value.y}` : (e.value || '');
    }
    
    return mapped;
  });
}

function convertToInternalStructure(events) {
  if (!events || !Array.isArray(events)) return [];
  return events.map(e => {
    // If the event comes from the raw data of the HTML report, it might have slightly different keys
    const normalized = { ...e };
    if (e.assertion) {
      normalized.action = 'assertion';
      normalized.type = e.assertion;
      normalized.elementType = e.type;
    }
    if (e.xpath && !e.locator) {
      normalized.locator = e.xpath;
    }
    if (normalized.type && !normalized.action) {
      if (normalized.type === 'navigation') {
        normalized.action = 'comment'; // internal comment is used for navigation
        normalized.comment = e.description || '';
      } else {
        normalized.action = normalized.type;
      }
    }
    if (normalized.type === 'assertion' && normalized.assertType) {
      normalized.condition = normalized.assertType;
    }
    if (normalized.value && normalized.type === 'assertion' && !normalized.expected_value) {
      normalized.expected_value = normalized.value;
    }

    // 1. Navigation / Comments
    if (normalized.action === 'comment' || normalized.action === 'navigation') {
      const res = {
        action: 'comment',
        comment: normalized.comment || normalized.description || '',
        url: normalized.url || '',
        timestamp: normalized.timestamp || new Date().toISOString()
      };
      if (normalized.screenshot) res.screenshot = normalized.screenshot;
      if (normalized.labelText) res.labelText = normalized.labelText;
      return res;
    }
    
    // 2. Assertions
    if (normalized.action === 'assertion') {
      if (normalized.type === 'page' || normalized.condition === 'landing') {
        const res = {
          action: 'assertion',
          type: 'page',
          condition: 'landing',
          title: normalized.title || '',
          url: normalized.url || '',
          timestamp: normalized.timestamp || new Date().toISOString()
        };
        if (normalized.screenshot) res.screenshot = normalized.screenshot;
        if (normalized.labelText) res.labelText = normalized.labelText;
        if (normalized.metadata) res.metadata = normalized.metadata;
        return res;
      }
      
      const internal = {
        action: 'assertion',
        locator: normalized.locator || '',
        url: normalized.url || '',
        timestamp: normalized.timestamp || new Date().toISOString()
      };
      
      if (normalized.elementType) {
        internal.elementType = normalized.elementType;
      }
      
      if (normalized.type === 'text' || normalized.condition === 'text' || normalized.condition === 'equals-ci') {
        internal.type = 'text';
        internal.condition = 'equals-ci';
        internal.expected_value = normalized.expected_value || normalized.value || '';
      } else if (normalized.type === 'visibility' || normalized.condition === 'visible') {
        internal.type = 'visibility';
        internal.condition = 'visible';
      } else if (normalized.type === 'style' && normalized.condition === 'color') {
        internal.type = 'style';
        internal.condition = 'color';
        internal.expected_value = normalized.expected_value || normalized.value || '';
      } else {
        internal.type = 'attribute';
        internal.condition = normalized.condition || 'enabled';
      }
      
      if (normalized.screenshot) internal.screenshot = normalized.screenshot;
      if (normalized.outerHTML) internal.outerHTML = normalized.outerHTML;
      if (normalized.DOMContext) internal.DOMContext = normalized.DOMContext;
      if (normalized.domContext) internal.domContext = normalized.domContext;
      if (normalized.labelText) internal.labelText = normalized.labelText;
      return internal;
    }
    
    // 3. Standard Interactions
    const internal = {
      action: normalized.action || 'click',
      locator: normalized.locator || '',
      url: normalized.url || '',
      timestamp: normalized.timestamp || new Date().toISOString()
    };
    
    if (normalized.type) {
      internal.type = normalized.type;
    }
    
    if (normalized.action === 'input') {
      internal.value = normalized.value || '';
    } else if (normalized.action === 'select') {
      internal.value = typeof normalized.value === 'object' ? normalized.value : { value: normalized.value || '', text: normalized.value || '' };
    } else if (normalized.action === 'scroll') {
      let x = 0, y = 0;
      if (normalized.value && typeof normalized.value === 'string') {
        const match = normalized.value.match(/x:(\d+),\s*y:(\d+)/);
        if (match) {
          x = parseInt(match[1]);
          y = parseInt(match[2]);
        }
      } else if (normalized.value && typeof normalized.value === 'object') {
        x = normalized.value.x || 0;
        y = normalized.value.y || 0;
      }
      internal.value = { x, y };
    }
    
    if (normalized.screenshot) internal.screenshot = normalized.screenshot;
    if (normalized.outerHTML) internal.outerHTML = normalized.outerHTML;
    if (normalized.DOMContext) internal.DOMContext = normalized.DOMContext;
    if (normalized.domContext) internal.domContext = normalized.domContext;
    if (normalized.labelText) internal.labelText = normalized.labelText;
    return internal;
  });
}

// Injected webpage file upload modal helper
function showUploadModalOnPage() {
  function convertToInternalStructure(events) {
    if (!events || !Array.isArray(events)) return [];
    return events.map(e => {
      const normalized = { ...e };
      if (e.assertion) {
        normalized.action = 'assertion';
        normalized.type = e.assertion;
        normalized.elementType = e.type;
      }
      if (e.xpath && !e.locator) {
        normalized.locator = e.xpath;
      }
      if (normalized.type && !normalized.action) {
        if (normalized.type === 'navigation') {
          normalized.action = 'comment';
          normalized.comment = e.description || '';
        } else {
          normalized.action = normalized.type;
        }
      }
      if (normalized.type === 'assertion' && normalized.assertType) {
        normalized.condition = normalized.assertType;
      }
      if (normalized.value && normalized.type === 'assertion' && !normalized.expected_value) {
        normalized.expected_value = normalized.value;
      }

      if (normalized.action === 'navigation' || normalized.action === 'comment') {
        const res = {
          action: 'comment',
          comment: normalized.comment || normalized.description || '',
          url: normalized.url || '',
          timestamp: normalized.timestamp || new Date().toISOString()
        };
        if (normalized.screenshot) res.screenshot = normalized.screenshot;
        return res;
      }
      if (normalized.action === 'assertion') {
        if (normalized.type === 'page' || normalized.condition === 'landing') {
          const res = {
            action: 'assertion',
            type: 'page',
            condition: 'landing',
            title: normalized.title || '',
            url: normalized.url || '',
            timestamp: normalized.timestamp || new Date().toISOString()
          };
          if (normalized.screenshot) res.screenshot = normalized.screenshot;
          if (normalized.metadata) res.metadata = normalized.metadata;
          return res;
        }
        const internal = {
          action: 'assertion',
          locator: normalized.locator || '',
          url: normalized.url || '',
          timestamp: normalized.timestamp || new Date().toISOString()
        };
        if (normalized.elementType) {
          internal.elementType = normalized.elementType;
        }
        if (normalized.type === 'text' || normalized.condition === 'text') {
          internal.type = 'text';
          internal.condition = 'equals-ci';
          internal.expected_value = normalized.value || '';
        } else if (normalized.type === 'visibility' || normalized.condition === 'visible') {
          internal.type = 'visibility';
          internal.condition = 'visible';
        } else if (normalized.type === 'style' && normalized.condition === 'color') {
          internal.type = 'style';
          internal.condition = 'color';
          internal.expected_value = normalized.expected_value || normalized.value || '';
        } else {
          internal.type = 'attribute';
          internal.condition = normalized.condition || 'enabled';
        }
        if (normalized.screenshot) internal.screenshot = normalized.screenshot;
        return internal;
      }
      const internal = {
        action: normalized.action || 'click',
        locator: normalized.locator || '',
        url: normalized.url || '',
        timestamp: normalized.timestamp || new Date().toISOString()
      };
      if (normalized.type) {
        internal.type = normalized.type;
      }
      if (normalized.action === 'input') {
        internal.value = normalized.value || '';
      } else if (normalized.action === 'select') {
        internal.value = { value: normalized.value || '', text: normalized.value || '' };
      } else if (normalized.action === 'scroll') {
        let x = 0, y = 0;
        if (normalized.value && typeof normalized.value === 'string') {
          const match = normalized.value.match(/x:(\d+),\s*y:(\d+)/);
          if (match) {
            x = parseInt(match[1]);
            y = parseInt(match[2]);
          }
        }
        internal.value = { x, y };
      }
      if (normalized.screenshot) internal.screenshot = normalized.screenshot;
      return internal;
    });
  }

  function generateDisplayString(events) {
    if (!events || events.length === 0) return "No events recorded yet.";
    return events.slice().reverse().map(e => {
      if (e.action === 'assertion') {
        if (e.type === 'text') {
          return `[ASSERTION TEXT] ${e.locator}\nExpected: ${e.expected_value}\nURL: ${e.url}\n----------------`;
        } else if (e.type === 'page') {
          return `[ASSERTION PAGE] Landing on: ${e.title}\nURL: ${e.url}\n----------------`;
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
    }).join('\n');
  }

  const existing = document.getElementById('nada-page-upload-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'nada-page-upload-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
  modal.style.backdropFilter = 'blur(4px)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '999999999';
  modal.style.fontFamily = "'Inter', -apple-system, sans-serif";

  const card = document.createElement('div');
  card.style.background = '#ffffff';
  card.style.borderRadius = '12px';
  card.style.padding = '24px';
  card.style.width = '360px';
  card.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  card.style.textAlign = 'center';
  card.style.position = 'relative';
  card.style.border = '1px solid #e2e8f0';

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '12px';
  closeBtn.style.right = '12px';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = '#94a3b8';
  closeBtn.style.transition = 'color 0.2s';
  
  closeBtn.addEventListener('click', () => modal.remove());

  const iconDiv = document.createElement('div');
  iconDiv.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0070ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px auto; animation: bounce 1.5s infinite;"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></svg>
  `;
  const styleId = 'nada-modal-bounce-style';
  if (!document.getElementById(styleId)) {
    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.innerHTML = `
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
    `;
    document.head.appendChild(styleTag);
  }

  const title = document.createElement('h3');
  title.innerText = 'Carica Sessione NRT';
  title.style.margin = '0 0 8px 0';
  title.style.color = '#0a2c5c';
  title.style.fontSize = '18px';
  title.style.fontWeight = '700';

  const desc = document.createElement('p');
  desc.innerText = 'Seleziona il file ZIP o JSON delle interazioni registrate.';
  desc.style.margin = '0 0 24px 0';
  desc.style.color = '#64748b';
  desc.style.fontSize = '13px';
  desc.style.lineHeight = '1.4';

  const uploadBtn = document.createElement('button');
  uploadBtn.innerText = 'Scegli File ZIP o JSON';
  uploadBtn.style.width = '100%';
  uploadBtn.style.padding = '10px 16px';
  uploadBtn.style.background = '#0070ad';
  uploadBtn.style.color = '#ffffff';
  uploadBtn.style.border = 'none';
  uploadBtn.style.borderRadius = '8px';
  uploadBtn.style.fontSize = '14px';
  uploadBtn.style.fontWeight = '600';
  uploadBtn.style.cursor = 'pointer';
  uploadBtn.style.boxShadow = '0 4px 6px -1px rgba(0, 112, 173, 0.2)';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip,application/json';
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.zip')) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        if (typeof JSZip === 'undefined') {
          alert('Errore: Libreria JSZip non caricata nella pagina.');
          return;
        }
        JSZip.loadAsync(evt.target.result)
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
            saveEventsToStorage(newEvents, file.name);
          })
          .catch((err) => {
            alert('Errore lettura ZIP nella pagina: ' + err.message);
          });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const newEvents = JSON.parse(evt.target.result);
          saveEventsToStorage(newEvents, file.name);
        } catch (err) {
          alert('File JSON non valido! ' + err.message);
        }
      };
      reader.readAsText(file);
    }

    function saveEventsToStorage(newEvents, fileName) {
      if (!Array.isArray(newEvents)) {
        alert('Il file deve contenere un array di eventi!');
        return;
      }

      const internalEvents = convertToInternalStructure(newEvents);
      const order = internalEvents.map(e => e.timestamp);

      let cleanName = '';
      if (fileName) {
        cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/_report$/, "");
        cleanName = cleanName.replace(/recording_session_\d+/, "");
        if (!cleanName) {
          cleanName = fileName.replace(/\.[^/.]+$/, "");
        }
        cleanName = cleanName.replace(/_/g, " ").trim();
      }

      const updates = {
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
      }

      replaceAllEvents(internalEvents, updates, () => {
        title.innerText = 'Caricato con Successo!';
        title.style.color = '#10b981';
        desc.innerText = `${internalEvents.length} eventi importati.`;
        uploadBtn.style.display = 'none';
        iconDiv.innerHTML = `
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px auto;"><polyline points="20 6 9 17 4 12"/></svg>
        `;
        setTimeout(() => {
          modal.remove();
        }, 1800);
      });
    }
  });

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  card.appendChild(closeBtn);
  card.appendChild(iconDiv);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(uploadBtn);
  card.appendChild(fileInput);
  modal.appendChild(card);
  document.body.appendChild(modal);
}

