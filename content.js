(function (global) {
  if (global.__flowtrace_content_script_loaded) {
    return;
  }
  global.__flowtrace_content_script_loaded = true;

  // Variabili globali per gestire lo stato e gli elementi UI
  // Global state variables for recording and assertion tracking
  let isRecording = false;
  let assertionTextMode = false;
  let assertionVisibleMode = false;
  let assertionEnabledMode = false;
  let assertionDisableMode = false;
  let assertionColorMode = false;
  let lastRecordedScroll = { x: -1, y: -1 };
  let highlightBox = null;
  let highlightLabel = null;
  let highlightDot = null;
  let highlightTextNode = null;
  let scrollTimeout = null;
  let isLandingAssertionInFlight = false;
  let lastKnownUrl = window.location.href;
  let activeListenersAttached = false;
  let lastHighlightedElement = null;
  let highlightRaf = null;
  let lastMouseMoveTime = 0;
  let lastHighlightWidth = 0;
  let lastHighlightHeight = 0;
  let lastHighlightTransform = '';

// In-memory cache of events (full objects) to avoid a storage round-trip
// before every single write. With the delta schema (storage-delta.js) the
// persisted side is `events` (soli timestamp) + `evt_{ts}`: this cache is
// the full-array view, loaded lazily via loadEventsInOrder and kept in sync
// via storage.onChanged.
let cachedRecordedEvents = null;

function getCachedEvents(cb) {
  if (cachedRecordedEvents !== null) {
    cb(cachedRecordedEvents);
    return;
  }
  loadEventsInOrder((events) => {
    cachedRecordedEvents = events;
    cb(events);
  });
}

let writeQueue = Promise.resolve();

function appendRecordedEvent(eventData, callback) {
  writeQueue = writeQueue.then(() => new Promise((resolve) => {
    getCachedEvents((events) => {
      events.push(eventData);
      // Scrittura delta: evt_{ts} una volta + lista ordine (soli timestamp).
      // La cache resta sincronizzata (nessuna reload nel frame che scrive).
      const writes = { events: events.map(e => e.timestamp) };
      writes['evt_' + eventData.timestamp] = eventData;
      chrome.storage.local.set(writes, () => {
        if (callback) callback();
        resolve();
      });
    });
  })).catch((err) => {
    console.error('Error appending recorded event:', err);
  });
}

// Initialize state from storage on script load
chrome.storage.local.get(['isRecording', 'assertionMode'], (result) => {
  isRecording = result.isRecording === true;
  updateAssertionModes(result.assertionMode || null);
  syncActiveListeners();
  
  if (isRecording && window.self === window.top) {
    // Check if the current URL is different from the last page assertion URL in storage
    getCachedEvents((events) => {
      const lastPageAssertion = events.slice().reverse().find(e => e.action === 'assertion' && (e.type === 'page' || e.condition === 'landing'));
      const lastUrl = lastPageAssertion ? lastPageAssertion.url : null;
      if (lastUrl !== window.location.href) {
        addLandingAssertion();
      }
    });
  }
});

// Listen to storage changes to update states in real time
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.isRecording) {
    const wasRecording = changes.isRecording.oldValue === true;
    isRecording = changes.isRecording.newValue === true;
    syncActiveListeners();
    
    if (isRecording && !wasRecording) {
      if (window.self === window.top && !document.hidden) {
        // Se la lista eventi è vuota (nuova sessione ex novo), aggiunge landing assertion.
        // Se ci sono già eventi registrati (ripresa da stop), non aggiunge nessuna assertion page.
        getCachedEvents((events) => {
          if (events.length === 0) {
            addLandingAssertion();
          }
        });
      }
    } else if (!isRecording) {
      updateAssertionModes(null);
    }
  }
  if (changes.assertionMode) {
    updateAssertionModes(changes.assertionMode.newValue || null);
  }
  if (changes.events) {
    // La lista ordine e' cambiata: se la cache locale non e' piu' in linea
    // (scrittura da un altro frame/contesto) la si invalida; il prossimo
    // consumatore ricarica da loadEventsInOrder. Il frame che ha appena
    // scritto ha la cache gia' aggiornata e non ricarica.
    const newOrder = Array.isArray(changes.events.newValue) ? changes.events.newValue : [];
    if (cachedRecordedEvents !== null) {
      const same = cachedRecordedEvents.length === newOrder.length &&
        cachedRecordedEvents.every((e, i) => e.timestamp === newOrder[i]);
      if (!same) cachedRecordedEvents = null;
    }
  }
});

// Update local boolean flags and handle overlay visibility
function updateAssertionModes(mode) {
  assertionTextMode = (mode === 'text');
  assertionVisibleMode = (mode === 'visible');
  assertionEnabledMode = (mode === 'enabled');
  assertionDisableMode = (mode === 'disabled');
  assertionColorMode = (mode === 'color');
  syncActiveListeners();
  if (mode) {
    showOverlay('interactive');
  } else {
    hideAssertionOverlay();
    hideHighlight();
  }
}

// Simple Toast Notification injected into the page DOM for recording feedback
function showToast(message) {
  let toast = document.getElementById('flowtrace-toast-notification');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.id = 'flowtrace-toast-notification';
  toast.innerText = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = '#0f172a'; toast.style.border = '1px solid rgba(255,255,255,0.15)'; toast.style.pointerEvents = 'none';
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
}

// Helper: XPath Generator (improved, attribute-aware, minimal positions)
// Helper per effettuare l'escape corretto di stringhe XPath
function escapeXPathString(str) {
  if (!str.includes("'")) {
    return `'${str}'`;
  }
  if (!str.includes('"')) {
    return `"${str}"`;
  }
  return `concat('${str.replace(/'/g, "', \"'\", '")}')`;
}

// Helper: Convert RGB color to HEX format
function rgbToHex(rgb) {
  if (!rgb) return '';
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return rgb;
  return '#' + [1,2,3].map(i => (+m[i]).toString(16).padStart(2,'0')).join('');
}

function getStableClasses(element) {
  if (!element.className || typeof element.className !== 'string') return [];
  const classes = element.className.trim().split(/\s+/);
  
  // Regole per riconoscere le utility class Tailwind/Bootstrap
  const utilityPatterns = [
    /^-?(m|p)[xytrbl]?-\w+$/,
    /^(w|h)-.+$/,
    /^(max|min)-(w|h)-.+$/,
    /^(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|static)$/,
    /^(items|justify|content|self|place)-.+$/,
    /^(flex|grid)-(row|col|flow|cols|rows|wrap|nowrap|grow|shrink|order|gap)-.+$/,
    /^gap-.+$/,
    /^(bg|text|border|ring|divide|from|to|via)-.+$/,
    /^(font|text|tracking|leading|align)-.+$/,
    /^(rounded|shadow|border|opacity|z|cursor|pointer|overflow|select|resize)-.+$/,
    /^border(-\d+)?$/
  ];

  // Regole per prefissi di CSS-in-JS o classi autogenerate note
  const autoGenPrefixes = ['css-', 'sc-', 'styled-', 'Styled', 'Mui', 'ng-', 'v-'];

  return classes.map(c => {
    // Rimuove eventuali hash generati da CSS Modules (es: pulsante__3h8f1 o nav-item--a9b2)
    const match = c.match(/^(.+?)(?:__|-{2})[a-zA-Z0-9]{4,10}$/);
    return match ? match[1] : c;
  }).filter(c => {
    if (c.length < 3) return false;
    if (c.includes(':')) return false;
    if (/\d/.test(c)) return false;
    if (autoGenPrefixes.some(pref => c.startsWith(pref))) return false;
    const lowercaseVal = c.toLowerCase();
    if (lowercaseVal.length >= 8 && !/[aeiouy]/.test(lowercaseVal)) return false;
    if (utilityPatterns.some(pattern => pattern.test(c))) return false;
    if (c.length > 25) return false;
    return true;
  });
}

function isUnique(xpath, element) {
  try {
    const idMatch = /^\/\/\*\[@id='([^']+)'\]$/.exec(xpath);
    if (idMatch) {
      const found = document.getElementById(idMatch[1]);
      if (!found) return false;
      if (element) return found === element;
      return true;
    }
    const nodes = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let first = nodes.iterateNext();
    if (!first) return false;
    if (element && first !== element) return false;
    return nodes.iterateNext() === null;
  } catch (e) {
    return false;
  }
}

function matchLabelFor(tag, element, labelPath, patternTemplate) {
  try {
    const ids = new Set();
    const nodes = document.evaluate(labelPath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let n;
    while ((n = nodes.iterateNext()) !== null) {
      if (n.htmlFor) ids.add(n.htmlFor);
    }
    if (ids.size !== 1) return null;
    const idv = ids.values().next().value;
    const found = document.getElementById(idv);
    if (found && found.tagName.toLowerCase() === tag && found === element) {
      const all = document.querySelectorAll(`${tag}[id="${idv}"]`);
      if (all.length === 1) return patternTemplate;
    }
  } catch (e) {}
  return null;
}

function getStableIdentifier(element) {
  const testAttributes = ['data-testid', 'data-qa', 'data-cy'];
  for (const attr of testAttributes) {
    if (element.hasAttribute(attr)) {
      return `//*[@${attr}='${element.getAttribute(attr)}']`;
    }
  }

  if (element.id && !/\d{4,}/.test(element.id) && !/^[a-zA-Z0-9]{8,}/.test(element.id)) {
    return `//*[@id='${element.id}']`;
  }
  return null;
}

function getElementLabelText(element) {
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
  }

  if (!labelText) {
    const parentLabel = element.closest('label');
    if (parentLabel) labelText = parentLabel.textContent;
  }

  if (!labelText) {
    const tag = element.tagName.toLowerCase();
    const isInteractiveContainer = ['button', 'a'].includes(tag) || element.getAttribute('role') === 'button' || element.getAttribute('role') === 'link';
    if (isInteractiveContainer) {
      const mediaChild = element.querySelector('img, svg, i, [role="img"]');
      if (mediaChild) {
        labelText = getElementLabelText(mediaChild);
      }
    }
  }

  if (!labelText) {
    const tag = element.tagName.toLowerCase();
    
    if (tag === 'img' || tag === 'svg' || tag === 'path' || tag === 'i' || element.getAttribute('role') === 'img') {
      if (element.hasAttribute('alt') && element.getAttribute('alt').trim()) {
        labelText = element.getAttribute('alt');
      } else if (element.hasAttribute('aria-label') && element.getAttribute('aria-label').trim()) {
        labelText = element.getAttribute('aria-label');
      } else if (element.hasAttribute('title') && element.getAttribute('title').trim()) {
        labelText = element.getAttribute('title');
      } else if (tag === 'svg') {
        const svgTitle = element.querySelector('title');
        if (svgTitle && svgTitle.textContent.trim()) {
          labelText = svgTitle.textContent;
        }
      } else {
        const parentText = element.parentElement ? element.parentElement.textContent.replace(/\s+/g, ' ').trim() : '';
        if (parentText && parentText.length < 40) {
          labelText = parentText;
        } else {
          let sibling = element.nextElementSibling || element.previousElementSibling;
          if (sibling && sibling.textContent.trim().length > 0 && sibling.textContent.trim().length < 40) {
            labelText = sibling.textContent;
          }
        }
      }
    } 
    else if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (element.type === 'checkbox' || element.type === 'radio') {
        let next = element.nextElementSibling;
        if (next && ['span', 'label', 'div'].includes(next.tagName.toLowerCase())) {
          labelText = next.textContent;
        } else if (element.parentElement) {
          labelText = element.parentElement.textContent;
        }
      } else {
        let prev = element.previousElementSibling;
        if (prev && ['span', 'label', 'div'].includes(prev.tagName.toLowerCase())) {
          labelText = prev.textContent;
        }
      }
    }
  }
  
  return labelText.replace(/\s+/g, ' ').trim();
}

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

function buildStructuralPath(element) {
  let path = '';
  let currentElement = element;

  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    const tag = currentElement.tagName.toLowerCase();
    if (tag === 'html') {
      path = '/html' + path;
      break;
    }

    const stableIdentifier = getStableIdentifier(currentElement);
    if (stableIdentifier) {
      return stableIdentifier + path;
    }

    const parent = currentElement.parentElement;
    let sameTagSiblings = [];
    if (parent) {
      const children = parent.children;
      for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === currentElement.tagName) {
          sameTagSiblings.push(children[i]);
        }
      }
    }

    let useIndex = false;
    let selector = tag;
    
    const stableClasses = getStableClasses(currentElement);
    if (stableClasses.length > 0) {
      const cls = stableClasses[0];
      selector += `[contains(@class, '${cls}')]`;
      
      if (sameTagSiblings.length > 1) {
        for (let i = 0; i < sameTagSiblings.length; i++) {
          const sibling = sameTagSiblings[i];
          if (sibling !== currentElement && getStableClasses(sibling).includes(cls)) {
            useIndex = true;
            break;
          }
        }
      }
    } else {
      useIndex = true;
    }

    if (useIndex) {
      const index = sameTagSiblings.indexOf(currentElement) + 1;
      selector = tag;
      if (index > 1 || sameTagSiblings.length > 1) selector += `[${index}]`;
    }

    path = '/' + selector + path;

    if (path.includes('contains(') || path.split('/').length > 3) {
      const testPath = '/' + path; 
      if (isUnique(testPath, element)) return testPath; 
    }

    currentElement = currentElement.parentElement;
  }

  return path.startsWith('/') ? path : '/' + path;
}

function buildRelativeXPath(element) {
  const tag = element.tagName.toLowerCase();
  
  const classes = getStableClasses(element);
  let elementSelector = tag;
  if (classes.length > 0) {
    elementSelector = `${tag}[contains(@class, '${classes[0]}')]`;
    if (isUnique(`//${elementSelector}`, element)) {
      return `//${elementSelector}`;
    }
  }

  let parent = element.parentElement;
  while (parent && parent.nodeType === Node.ELEMENT_NODE && parent.tagName.toLowerCase() !== 'html') {
    const parentTag = parent.tagName.toLowerCase();
    
    const parentId = getStableIdentifier(parent);
    if (parentId) {
      const testXPath = `${parentId}//${elementSelector}`;
      if (isUnique(testXPath, element)) return testXPath;
    }
    
    const parentClasses = getStableClasses(parent);
    if (parentClasses.length > 0) {
      const testXPath = `//${parentTag}[contains(@class, '${parentClasses[0]}')]//${elementSelector}`;
      if (isUnique(testXPath, element)) return testXPath;
    }
    
    parent = parent.parentElement;
  }

  return buildStructuralPath(element);
}

function getXPath(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

  // Priorità 0: Promozione all'elemento interattivo genitore se condividono lo stesso testo
  const interactiveParent = element.closest('button, a, [role="button"], [role="link"]');
  if (interactiveParent && interactiveParent !== element) {
    const parentText = interactiveParent.textContent.trim().replace(/\s+/g, ' ');
    const elementText = element.textContent.trim().replace(/\s+/g, ' ');
    if (parentText && parentText === elementText) {
      element = interactiveParent;
    }
  }

  const tag = element.tagName.toLowerCase();
  const NBSP = '\u00a0';

  // Priorità 1: Attributi di test dedicati (data-testid, data-qa, data-cy)
  const testAttributes = ['data-testid', 'data-qa', 'data-cy'];
  for (const attr of testAttributes) {
    const value = element.getAttribute(attr);
    if (value) {
      const xpath = `//*[@${attr}='${value}']`;
      if (isUnique(xpath, element)) {
        return xpath;
      }
    }
  }

  // Priorità 1.5: WAI-ARIA Roles e Stati Semantici
  if (element.hasAttribute('role')) {
    const role = element.getAttribute('role');
    const ariaSelectors = [];
    
    if (element.hasAttribute('aria-label')) {
      const val = element.getAttribute('aria-label').trim();
      if (val) {
        const escaped = escapeXPathString(val);
        ariaSelectors.push(`//*[@role='${role}' and @aria-label=${escaped}]`);
      }
    }
    
    const text = element.textContent.trim().replace(/\s+/g, ' ');
    if (text && text.length > 0 && text.length < 50) {
      const escaped = escapeXPathString(text);
      ariaSelectors.push(`//*[@role='${role}' and normalize-space(.)=${escaped}]`);
    }

    const stateAttrs = ['aria-selected', 'aria-checked', 'aria-expanded'];
    for (const stateAttr of stateAttrs) {
      if (element.hasAttribute(stateAttr)) {
        const stateVal = element.getAttribute(stateAttr);
        if (text && text.length > 0 && text.length < 50) {
          const escaped = escapeXPathString(text);
          ariaSelectors.push(`//*[@role='${role}' and @${stateAttr}='${stateVal}' and normalize-space(.)=${escaped}]`);
        } else {
          ariaSelectors.push(`//*[@role='${role}' and @${stateAttr}='${stateVal}']`);
        }
      }
    }

    for (const selector of ariaSelectors) {
      if (isUnique(selector, element)) {
        return selector;
      }
    }
  }

  // Priorità 2: Label semantica (DevHints style) per form e media
  const validSemanticTags = ['input', 'textarea', 'select', 'button', 'img', 'svg', 'path', 'i'];
  if (validSemanticTags.includes(tag)) {
    const labelText = getElementLabelText(element);
    if (labelText && labelText.length > 0 && labelText.length < 50) {
      const escapedText = escapeXPathString(labelText);
      const escapedLowerText = escapeXPathString(labelText.toLowerCase());
      const translateExpr = `translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ${NBSP}', 'abcdefghijklmnopqrstuvwxyz ')`;
      
      // Collegamento dinamico Label-Input tramite attributo "for" ed "id".
      // Il pattern XPath diretto (//tag[@id = //label[...]/@for]) esegue la
      // subquery //label[...] per OGNI tag candidato (O(NxM)): qui la subquery
      // viene valutata una sola volta e la verifica fatta via getElementById.
      const exactLabelXPath = `//label[normalize-space(.)=${escapedText}]`;
      const ciLabelXPath = `//label[${translateExpr}=${escapedLowerText}]`;
      const labelForPattern = matchLabelFor(tag, element, exactLabelXPath, `//${tag}[@id = ${exactLabelXPath}/@for]`)
        || matchLabelFor(tag, element, ciLabelXPath, `//${tag}[@id = ${ciLabelXPath}/@for]`);
      if (labelForPattern) {
        return labelForPattern;
      }

      const labelPatterns = [
        `//label[normalize-space(.)=${escapedText}]//${tag}`,
        `//label[normalize-space(.)=${escapedText}]/following-sibling::${tag}`,
        `//label[normalize-space(.)=${escapedText}]/following::${tag}[1]`,
        `//*[normalize-space(.)=${escapedText}]//${tag}`,
        `//*[normalize-space(.)=${escapedText}]/following::${tag}[1]`,
        `//*[normalize-space(.)=${escapedText}]/preceding::${tag}[1]`,
        
        `//label[${translateExpr}=${escapedLowerText}]//${tag}`,
        `//label[${translateExpr}=${escapedLowerText}]/following-sibling::${tag}`,
        `//label[${translateExpr}=${escapedLowerText}]/following::${tag}[1]`,
        `//*[${translateExpr}=${escapedLowerText}]//${tag}`,
        `//*[${translateExpr}=${escapedLowerText}]/following::${tag}[1]`,
        `//*[${translateExpr}=${escapedLowerText}]/preceding::${tag}[1]`
      ];
      
      const hasLabels = document.querySelector('label') !== null;
      for (const pattern of labelPatterns) {
        if (!hasLabels && pattern.startsWith('//label')) continue;
        if (isUnique(pattern, element)) {
          return pattern;
        }
      }
    }
  }

  // Priorità 3: ID stabile (con validazione di univocità nel DOM)
  const stableId = getStableIdentifier(element);
  if (stableId && isUnique(stableId, element)) {
    return stableId;
  }

  // Priorità 3.5: Attributi semantici standard (aria-label, placeholder, name, title)
  const semanticAttributes = ['aria-label', 'placeholder', 'name', 'title'];
  for (const attr of semanticAttributes) {
    const value = element.getAttribute(attr);
    if (value && value.trim().length > 0 && value.length < 100) {
      const escapedVal = escapeXPathString(value.trim());
      const escapedLowerVal = escapeXPathString(value.trim().toLowerCase());
      
      const attrSelectors = [
        `//${tag}[@${attr}=${escapedVal}]`,
        `//${tag}[translate(@${attr}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')=${escapedLowerVal}]`
      ];

      for (const selector of attrSelectors) {
        if (isUnique(selector, element)) {
          return selector;
        }
      }
    }
  }

  // Priorità 4: Elementi testuali univoci (es. bottoni, link, label, ecc.)
  const textContent = element.textContent.trim().replace(/\s+/g, ' ');
  const validTags = ['button', 'a', 'label', 'span', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td'];
  
  if (validTags.includes(tag) && textContent && textContent.length > 0 && textContent.length < 50) {
    const escapedText = escapeXPathString(textContent);
    const escapedLowerText = escapeXPathString(textContent.toLowerCase());
    
    const translateSelfExpr = `translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ${NBSP}', 'abcdefghijklmnopqrstuvwxyz ')`;

    const textSelectors = [
      `//${tag}[normalize-space(.)=${escapedText}]`,
      `//${tag}[contains(normalize-space(.), ${escapedText})]`,
      `//${tag}[${translateSelfExpr}=${escapedLowerText}]`,
      `//${tag}[contains(${translateSelfExpr}, ${escapedLowerText})]`
    ];
    
    for (const textXPath of textSelectors) {
      if (isUnique(textXPath, element)) {
        return textXPath;
      }
    }
  }

  // Priorità 5: Sali l'albero per trovare un antenato stabile
  return buildRelativeXPath(element);
}

function getDOMContext(el) {
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
    try {
      el.removeAttribute('data-target');
    } catch (err) {}
    const html = el.outerHTML || '';
    return html.length > 5000 ? html.substring(0, 5000) + '...[TRUNCATED]' : html;
  }
}

// Core Recording Function
function recordEvent(actionType, targetElement, value = null, callback = null) {
  if (!isRecording) {
    if (callback) callback();
    return;
  }
  const xpath = targetElement ? getXPath(targetElement) : 'window';
  const currentUrl = window.location.href;
  const eventData = {
    action: actionType,
    locator: xpath,    
    url: currentUrl,
    timestamp: new Date().toISOString()
  };  
  if (value !== null) {
    eventData.value = value;
  }
  if (targetElement) {
    const label = getElementLabelText(targetElement);
    if (label) eventData.labelText = label;
    const outer = targetElement.outerHTML || '';
    eventData.outerHTML = outer.length > 5000 ? outer.substring(0, 5000) + '...[TRUNCATED]' : outer;
    eventData.DOMContext = getDOMContext(targetElement);

    eventData.type = getElementTypeName(targetElement);
  }

  // Native Chrome SidePanel: zero DOM hiding overhead and zero 2-frame delay
  if (callback) callback(); // Instant native click execution

  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    if (chrome.runtime.lastError) {
      // Background message channel error or service worker timeout fallback
    }
    const dataUrl = response ? response.dataUrl : null;
    const proceedWithAppend = () => {
      appendRecordedEvent(eventData, () => {
        let tag = '';
        if (targetElement && targetElement.tagName) {
          tag = ` <${targetElement.tagName.toLowerCase()}>`;
        }
        showToast(`✓ Action recorded: ${actionType.toUpperCase()}${tag}`);
      });
    };

    if (dataUrl) {
      eventData.hasScreenshot = true;
      chrome.storage.local.set({ [`screenshot_${eventData.timestamp}`]: dataUrl }, proceedWithAppend);
    } else {
      proceedWithAppend();
    }
  });
}

// Landing page assertion
function addLandingAssertion() {
  if (window.self !== window.top) return;
  if (isLandingAssertionInFlight) return;

  const url = window.location.href;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  // Deduplicazione preventiva per evitare doppi scatti sullo stesso URL
  getCachedEvents((events) => {
    const lastPageAssertion = events.slice().reverse().find(e => e.action === 'assertion' && 
        (e.type === 'page' || e.condition === 'landing'));
    if (lastPageAssertion && lastPageAssertion.url === url) {
      return;
    }

    isLandingAssertionInFlight = true;
    const title = (document.title || 'Senza Titolo').replace(/\s+/g, ' ').trim();
    const timestamp = new Date().toISOString();
    
    // Extract metadata
    const metadata = {};
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      const val = descriptionMeta.getAttribute('content');
      if (val) metadata.description = val.replace(/\s+/g, ' ').trim();
    }
    
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    if (keywordsMeta) {
      const val = keywordsMeta.getAttribute('content');
      if (val) metadata.keywords = val.replace(/\s+/g, ' ').trim();
    }
    
    const ogTitleMeta = document.querySelector('meta[property="og:title"]');
    if (ogTitleMeta) {
      const val = ogTitleMeta.getAttribute('content');
      if (val) metadata.ogTitle = val.replace(/\s+/g, ' ').trim();
    }
    
    const ogDescMeta = document.querySelector('meta[property="og:description"]');
    if (ogDescMeta) {
      const val = ogDescMeta.getAttribute('content');
      if (val) metadata.ogDescription = val.replace(/\s+/g, ' ').trim();
    }
    
    const ogUrlMeta = document.querySelector('meta[property="og:url"]');
    if (ogUrlMeta) {
      const val = ogUrlMeta.getAttribute('content');
      if (val) metadata.ogUrl = val.replace(/\s+/g, ' ').trim();
    }
    
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const val = viewportMeta.getAttribute('content');
      if (val) metadata.viewport = val.replace(/\s+/g, ' ').trim();
    }
    
    const charsetMeta = document.characterSet || document.charset;
    if (charsetMeta) metadata.charset = charsetMeta.replace(/\s+/g, ' ').trim();

    const assertionEvent = {
      action: 'assertion',
      type: 'page',
      condition: 'landing',
      title: title,
      url: url,
      timestamp: timestamp,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };

    saveAssertionWithScreenshot(assertionEvent, `✓ Page Assertion added: ${title}`);
    setTimeout(() => { isLandingAssertionInFlight = false; }, 800);
  });
}

// SPA and Redirection URL detection
function checkUrlChange() {
  if (window.self !== window.top) return;
  if (window.location.href !== lastKnownUrl) {
    lastKnownUrl = window.location.href;
    if (isRecording) {
      getCachedEvents((events) => {
        const lastPageAssertion = events.slice().reverse().find(e => e.action === 'assertion' && (e.type === 'page' || e.condition === 'landing'));
        const lastUrl = lastPageAssertion ? lastPageAssertion.url : null;
        if (lastUrl !== window.location.href) {
          addLandingAssertion();
        }
      });
    }
  }
}

window.addEventListener('popstate', checkUrlChange);

// Wrap history methods to catch SPA routing
const originalPushState = history.pushState;
history.pushState = function(...args) {
  originalPushState.apply(this, args);
  checkUrlChange();
};

const originalReplaceState = history.replaceState;
history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  checkUrlChange();
};

// Periodic polling fallback for nested iframe / custom routers.
// Solo il top frame pollla: gli hook pushState/popstate restano ovunque.
setInterval(() => {
  if (window.self !== window.top) return;
  if (isRecording) {
    checkUrlChange();
  }
}, 1000);

// --- Event Listeners ---

// Listener di registrazione/assertion attaccati SOLO quando servono
// (isRecording o un assertion mode attivo): evitano lavoro in ogni frame
// di ogni tab anche da fermi.
function syncActiveListeners() {
  const shouldAttach = isRecording || isAssertionActive();
  if (shouldAttach === activeListenersAttached) return;
  activeListenersAttached = shouldAttach;

  if (shouldAttach) {
    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
  } else {
    document.removeEventListener('click', handleDocumentClick, true);
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    window.removeEventListener('scroll', handleWindowScroll, { passive: true });
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    lastRecordedScroll = { x: -1, y: -1 };
    hideHighlight();
    lastHighlightedElement = null;
  }
}

// Window Scroll Listener (debounced, passive)
function handleWindowScroll() {
  if (!isRecording) return;
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  scrollTimeout = setTimeout(() => {
    const scrollX = Math.round(window.scrollX || window.pageXOffset || 0);
    const scrollY = Math.round(window.scrollY || window.pageYOffset || 0);
    if (scrollX === lastRecordedScroll.x && scrollY === lastRecordedScroll.y) {
      return;
    }
    lastRecordedScroll = { x: scrollX, y: scrollY };
    recordEvent('scroll', null, { x: scrollX, y: scrollY });
  }, 500);
}

// 1. Click
function handleDocumentClick(event) {    
  const path = event.composedPath ? event.composedPath() : [];
  if (
    event.target.closest('#flowtrace-toast-notification') ||
    event.target.closest('#flowtrace-highlight-box') ||
    path.some(el => el && (el.id === 'nada-popup' || el.id === 'nada-floating-container')) ||
    event.target.hasAttribute('data-nrt-download')
  ) {
    return;
  }
  if (assertionTextMode) {
    event.preventDefault();
    event.stopPropagation();
    let target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'flowtrace-assertion-overlay') {
      const xpath = getXPath(target);
      chrome.storage.local.set({ lastSelectedElementXPath: xpath });
    }
    return;
  }
  if (assertionVisibleMode) {
    event.preventDefault();
    event.stopPropagation();
    let target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'flowtrace-assertion-overlay') {
      addVisibleAssertion(target);
    }
    return;
  }
  if (assertionEnabledMode) {
    event.preventDefault();
    event.stopPropagation();
    let target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'flowtrace-assertion-overlay') {
      addEnabledAssertion(target);
    }
    return;
  }
  if (assertionDisableMode) {
    event.preventDefault();
    event.stopPropagation();
    let target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'flowtrace-assertion-overlay') {
      addDisabledAssertion(target);
    }
    return;
  }
  if (assertionColorMode) {
    event.preventDefault();
    event.stopPropagation();
    let target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'flowtrace-assertion-overlay') {
      addColorAssertion(target);
    }
    return;
  }  
  if (!isRecording) return;  
  if (event.target.tagName === 'SELECT') return;

  const targetElement = event.target;
  recordEvent('click', targetElement);
}

// 2. Input Change
document.addEventListener('change', (event) => {
  if (
    event.target.closest('#flowtrace-toast-notification') ||
    event.target.closest('#flowtrace-highlight-box') ||
    event.target.closest('#flowtrace-assertion-overlay')
  ) return;
  if (!isRecording) return;
  const el = event.target;
  if (el.tagName.toUpperCase() === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
    return;
  }
  if (el.tagName === 'SELECT') {
    const selectedText = el.options[el.selectedIndex]?.text;
    const selectedValue = el.value;
    recordEvent('select', el, {
      value: selectedValue,
      text: selectedText
    });
    return;
  }
  recordEvent('input', el, el.value);
}, true);

function saveAssertionWithScreenshot(assertionEvent, toastMessage) {
  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    if (chrome.runtime.lastError) {
      // Background message channel error or service worker timeout fallback
    }
    const dataUrl = response ? response.dataUrl : null;
    const proceedWithAppend = () => {
      appendRecordedEvent(assertionEvent, () => {
        if (toastMessage) {
          showToast(toastMessage);
        }
      });
    };

    if (dataUrl) {
      assertionEvent.hasScreenshot = true;
      chrome.storage.local.set({ [`screenshot_${assertionEvent.timestamp}`]: dataUrl }, proceedWithAppend);
    } else {
      proceedWithAppend();
    }
  });
}

// Visible assertion
function addVisibleAssertion(target) {
  const xpath = getXPath(target);
  const url = window.location.href;
  const timestamp = new Date().toISOString();
  const assertionEvent = {
    action: 'assertion',
    type: 'visibility',
    condition: 'visible',
    locator: xpath,
    url: url,
    timestamp: timestamp
  };
  if (target) {
    const label = getElementLabelText(target);
    if (label) assertionEvent.labelText = label;
    assertionEvent.outerHTML = target.outerHTML;
    assertionEvent.DOMContext = getDOMContext(target);

    assertionEvent.elementType = getElementTypeName(target);
  }
  saveAssertionWithScreenshot(assertionEvent, '✓ Assertion added: VISIBLE');
}

// Enabled assertion
function addEnabledAssertion(target) {
  const xpath = getXPath(target);
  const url = window.location.href;
  const timestamp = new Date().toISOString();
  const assertionEvent = {
    action: 'assertion',
    type: 'attribute',
    condition: 'enabled',
    locator: xpath,
    url: url,
    timestamp: timestamp
  };
  if (target) {
    const label = getElementLabelText(target);
    if (label) assertionEvent.labelText = label;
    assertionEvent.outerHTML = target.outerHTML;
    assertionEvent.DOMContext = getDOMContext(target);

    assertionEvent.elementType = getElementTypeName(target);
  }
  saveAssertionWithScreenshot(assertionEvent, '✓ Assertion added: ENABLED');
}

// Disabled assertion
function addDisabledAssertion(target) {
  const xpath = getXPath(target);
  const url = window.location.href;
  const timestamp = new Date().toISOString();
  const assertionEvent = {
    action: 'assertion',
    type: 'attribute',
    condition: 'disabled',
    locator: xpath,
    url: url,
    timestamp: timestamp
  };
  if (target) {
    const label = getElementLabelText(target);
    if (label) assertionEvent.labelText = label;
    assertionEvent.outerHTML = target.outerHTML;
    assertionEvent.DOMContext = getDOMContext(target);

    assertionEvent.elementType = getElementTypeName(target);
  }
  saveAssertionWithScreenshot(assertionEvent, '✓ Assertion added: DISABLED');
}

// Color assertion
function addColorAssertion(target) {
  const xpath = getXPath(target);
  const url = window.location.href;
  const computed = window.getComputedStyle(target);
  const raw = computed.color || computed.backgroundColor || '';
  const colorHex = rgbToHex(raw);
  const timestamp = new Date().toISOString();
  const assertionEvent = {
    action: 'assertion',
    type: 'style',
    condition: 'color',
    locator: xpath,
    expected_value: colorHex,
    url: url,
    timestamp: timestamp
  };
  if (target) {
    const label = getElementLabelText(target);
    if (label) assertionEvent.labelText = label;
    assertionEvent.outerHTML = target.outerHTML;
    assertionEvent.DOMContext = getDOMContext(target);

    assertionEvent.elementType = getElementTypeName(target);
  }
  saveAssertionWithScreenshot(assertionEvent, '✓ Assertion added: COLOR (' + colorHex + ')');
}



// FUNZIONI DI OVERLAY PER ASSERTION
function showOverlay(mode = 'interactive') {
  let overlay = document.getElementById('flowtrace-assertion-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'flowtrace-assertion-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.05)';
    overlay.style.zIndex = '9998';
    document.body.appendChild(overlay);
  }

  if (mode === 'interactive') {
    overlay.style.cursor = 'crosshair';
    overlay.style.pointerEvents = 'none';
  } else if (mode === 'blocked') {
    overlay.style.cursor = 'not-allowed';
    overlay.style.pointerEvents = 'auto';
  }
}

function hideAssertionOverlay() {
  const overlay = document.getElementById('flowtrace-assertion-overlay');
  if (overlay) overlay.remove();
}

// Cache per-elemento: getComputedStyle/borderRadius (WeakMap, nessun leak)
const highlightStyleCache = new WeakMap();

function getHighlightBorderRadius(el) {
  let radius = highlightStyleCache.get(el);
  if (radius === undefined) {
    radius = window.getComputedStyle(el).borderRadius;
    highlightStyleCache.set(el, radius);
  }
  return radius;
}

function isAssertionActive() {
  return assertionTextMode || assertionVisibleMode || assertionEnabledMode || assertionDisableMode || assertionColorMode;
}

function ensureHighlightBox() {
  if (highlightBox) return true;

  highlightBox = document.createElement('div');
  highlightBox.id = 'flowtrace-highlight-box';
  highlightBox.style.position = 'fixed';
  highlightBox.style.top = '0';
  highlightBox.style.left = '0';
  highlightBox.style.pointerEvents = 'none';
  highlightBox.style.zIndex = '999999';
  highlightBox.style.boxSizing = 'border-box';
  highlightBox.style.transition = 'transform 0.08s ease-out';

  // Label minimale per mostrare solo il tag HTML
  highlightLabel = document.createElement('span');
  highlightLabel.id = 'flowtrace-highlight-label';
  highlightLabel.style.position = 'absolute';
  highlightLabel.style.left = '0';
  highlightLabel.style.display = 'flex';
  highlightLabel.style.alignItems = 'center';
  highlightLabel.style.gap = '5px';
  highlightLabel.style.fontSize = '9px';
  highlightLabel.style.fontWeight = '800';
  highlightLabel.style.color = '#f8fafc'; // Slate 50
  highlightLabel.style.padding = '2px 6px';
  highlightLabel.style.borderRadius = '4px';
  highlightLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  highlightLabel.style.background = 'rgba(15, 23, 42, 0.9)'; // Slate 900 con opacità
  highlightLabel.style.backdropFilter = 'blur(4px)';
  highlightLabel.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  highlightLabel.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.15)';
  highlightLabel.style.textTransform = 'uppercase';
  highlightLabel.style.letterSpacing = '0.5px';
  highlightLabel.style.whiteSpace = 'nowrap';

  // Indicatore luminoso tondo
  highlightDot = document.createElement('span');
  highlightDot.id = 'flowtrace-highlight-dot';
  highlightDot.style.display = 'inline-block';
  highlightDot.style.width = '6px';
  highlightDot.style.height = '6px';
  highlightDot.style.borderRadius = '50%';
  highlightLabel.appendChild(highlightDot);

  // Contenitore del testo del tag
  highlightTextNode = document.createElement('span');
  highlightTextNode.id = 'flowtrace-highlight-text';
  highlightLabel.appendChild(highlightTextNode);

  highlightBox.appendChild(highlightLabel);
  document.body.appendChild(highlightBox);
  return true;
}

function highlightElement(el, color = 'red') {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  if (!ensureHighlightBox()) return;

  const hexColor = color === 'green' ? '#10b981' : '#ef4444'; // Emerald green & Coral red (premium colors)
  const glowColor = color === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  const tintColor = color === 'green' ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)';

  // Applica lo stile dinamico al rettangolo
  highlightBox.style.border = `2px solid ${hexColor}`;
  highlightBox.style.boxShadow = `0 0 10px ${glowColor}`;
  highlightBox.style.backgroundColor = tintColor;

  // Eredita il border-radius dell'elemento selezionato per una resa premium (cachato per elemento)
  highlightBox.style.borderRadius = getHighlightBorderRadius(el);

  highlightTextNode.innerText = el.tagName.toLowerCase();
  highlightDot.style.backgroundColor = hexColor;
  highlightDot.style.boxShadow = `0 0 5px ${hexColor}`;

  const rect = el.getBoundingClientRect();

  // Gestione posizionamento se l'elemento è a bordo schermo superiore
  if (rect.top < 22) {
    highlightLabel.style.top = 'auto';
    highlightLabel.style.bottom = '-22px';
  } else {
    highlightLabel.style.top = '-22px';
    highlightLabel.style.bottom = 'auto';
  }

  // Movimento compositor-only via transform: zero layout per mousemove.
  // width/height scritti solo quando cambiano (elemento diverso), non a ogni move.
  if (rect.width !== lastHighlightWidth) {
    lastHighlightWidth = rect.width;
    highlightBox.style.width = rect.width + 'px';
  }
  if (rect.height !== lastHighlightHeight) {
    lastHighlightHeight = rect.height;
    highlightBox.style.height = rect.height + 'px';
  }
  const transform = `translate(${rect.left}px, ${rect.top}px)`;
  if (transform !== lastHighlightTransform) {
    lastHighlightTransform = transform;
    highlightBox.style.transform = transform;
  }
}

function handleDocumentMouseMove(event) {
  const now = Date.now();
  if (now - lastMouseMoveTime < 40) return; // ~25fps throttle
  lastMouseMoveTime = now;

  const isAssertionMode = isAssertionActive();

  let el = event.target;
  if (el && el.nodeType === Node.TEXT_NODE) {
    el = el.parentElement;
  }

  if (!el || el.nodeType !== Node.ELEMENT_NODE || el.closest('#flowtrace-toast-notification') || el.closest('#flowtrace-highlight-box') || el.id === 'flowtrace-assertion-overlay' || el.id === 'flowtrace-highlight-box') {
    return;
  }

  if (el === lastHighlightedElement) {
    return;
  }
  lastHighlightedElement = el;

  if (highlightRaf) {
    cancelAnimationFrame(highlightRaf);
  }

  highlightRaf = requestAnimationFrame(() => {
    const color = isAssertionMode ? 'green' : 'red';
    highlightElement(el, color);
  });
}

function hideHighlight() {
  if (highlightBox) {
    highlightBox.remove();
    highlightBox = null;
    highlightLabel = null;
    highlightDot = null;
    highlightTextNode = null;
    lastHighlightWidth = 0;
    lastHighlightHeight = 0;
    lastHighlightTransform = '';
  }
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
      if (mappedType === 'style') {
        mapped.value = e.expected_value || '';
      }

      return mapped;
    } else if (e.action === 'comment') {
      return {
        action: 'comment',
        comment: e.comment || '',
        timestamp: e.timestamp,
        url: e.url || ''
      };
    } else {
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
    }
  });
}

function convertToInternalStructure(events) {
  if (!events || !Array.isArray(events)) return [];
  return events.map(e => {
    const normalized = { ...e };
    if (e.assertion) {
      normalized.action = 'assertion';
      normalized.type = e.assertion;
      normalized.elementType = e.type;
    }
    if (normalized.xpath && !normalized.locator) {
      normalized.locator = normalized.xpath;
    }
    if (normalized.type && !normalized.action) {
      if (normalized.type === 'navigation') {
        normalized.action = 'comment';
        normalized.comment = normalized.description || '';
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
        if (normalized.metadata) {
          res.metadata = normalized.metadata;
        }
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
        internal.expected_value = normalized.value || normalized.expected_value || '';
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

      return internal;
    } else if (normalized.action === 'comment' || normalized.action === 'navigation') {
      return {
        action: 'comment',
        comment: normalized.comment || normalized.description || '',
        url: normalized.url || '',
        timestamp: normalized.timestamp || new Date().toISOString()
      };
    } else {
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
      return internal;
    }
  });
}

// ----------------------------------------------------
// SIDE PANEL INTEGRATION & RUNTIME MESSAGING
// ----------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showToast') {
    showToast(request.message);
    sendResponse({ success: true });
  } else if (request.action === 'ping') {
    sendResponse({ success: true, url: window.location.href, title: document.title });
  } else if (request.action === 'ensureLandingAssertion') {
    if (window.self === window.top) {
      getCachedEvents((events) => {
        if (events.length === 0) {
          addLandingAssertion();
        }
      });
      sendResponse({ success: true });
    }
    // Gli iframe non rispondono, evitando di anticipare la risposta del top frame
  }
  return true;
});

  // Export helpers for unit tests and window context
  global.getXPath = getXPath;
  global.isUnique = isUnique;
  global.showToast = showToast;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
