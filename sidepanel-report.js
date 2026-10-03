function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// Cede il controllo all'event loop: usato per generare report/downscale a
// chunk cosi' lo spinner resta vivo e il popup reattivo su VM lente.
function yieldToEventLoop() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

const REPORT_CHUNK_SIZE = 10;

// Downscale screenshot per l'embed nel report: canvas offscreen, max
// 1280px di larghezza, JPEG q50 (decisione utente). Gli originali restano
// integri nello ZIP.
function downscaleScreenshot(dataUrl, maxWidth = 1280, quality = 0.5) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / (img.width || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Screenshot non decodificabile'));
    img.src = dataUrl;
  });
}

async function generateHtmlReport(events, testName) {
  const dateStr = new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
  
  function getElementItalianName(type, withPreposition = false) {
    if (!type) return withPreposition ? "dell'elemento" : "l'elemento";
    const rawT = String(type).toLowerCase();
    const t = escapeHtml(rawT);
    if (rawT === 'checkbox') return withPreposition ? 'della checkbox' : 'la checkbox';
    if (rawT === 'radio') return withPreposition ? 'del radio button' : 'il radio button';
    if (rawT === 'textarea') return withPreposition ? 'della textarea' : 'la textarea';
    if (rawT === 'select') return withPreposition ? 'del menu a discesa' : 'il menu a discesa';
    if (rawT === 'link') return withPreposition ? 'del link' : 'il link';
    if (rawT === 'button') return withPreposition ? 'del pulsante' : 'il pulsante';
    if (rawT === 'text') return withPreposition ? 'del campo di testo' : 'il campo di testo';
    if (rawT === 'password') return withPreposition ? 'del campo password' : 'il campo password';
    if (rawT === 'email') return withPreposition ? 'del campo email' : 'il campo email';
    if (rawT === 'number') return withPreposition ? 'del campo numerico' : 'il campo numerico';
    if (rawT === 'date') return withPreposition ? 'del campo data' : 'il campo data';
    if (['color', 'file', 'hidden', 'image', 'month', 'range', 'reset', 'search', 'submit', 'tel', 'time', 'url', 'week'].includes(rawT)) {
      return withPreposition ? `del campo ${t}` : `il campo ${t}`;
    }
    return withPreposition ? `dell'elemento (${t})` : `l'elemento (${t})`;
  }

  function getClickActionDescription(type, labelStr, hasLabel) {
    const rawT = type ? String(type).toLowerCase() : '';
    const t = escapeHtml(rawT);
    let art = "sull'elemento";
    let artSel = "sull'elemento selezionato";
    
    if (rawT === 'checkbox') {
      art = "sulla checkbox";
      artSel = "sulla checkbox selezionata";
    } else if (rawT === 'radio') {
      art = "sul radio button";
      artSel = "sul radio button selezionato";
    } else if (rawT === 'textarea') {
      art = "sulla textarea";
      artSel = "sulla textarea selezionata";
    } else if (rawT === 'select') {
      art = "sul menu a discesa";
      artSel = "sul menu a discesa selezionato";
    } else if (rawT === 'link') {
      art = "sul link";
      artSel = "sul link selezionato";
    } else if (rawT === 'button') {
      art = "sul pulsante";
      artSel = "sul pulsante selezionato";
    } else if (rawT === 'text') {
      art = "sul campo di testo";
      artSel = "sul campo di testo selezionato";
    } else if (t) {
      art = `sull'elemento (${t})`;
      artSel = `sull'elemento (${t}) selezionato`;
    }
    
    return hasLabel ? `Click ${art} ${labelStr}.` : `Click ${artSel}.`;
  }

  function getInputActionDescription(type, labelStr, hasLabel) {
    const rawT = type ? String(type).toLowerCase() : '';
    const t = escapeHtml(rawT);
    let field = "nell'elemento";
    if (rawT === 'textarea') {
      field = "nella textarea";
    } else if (rawT === 'text') {
      field = "nel campo di testo";
    } else if (rawT === 'email') {
      field = "nel campo email";
    } else if (rawT === 'password') {
      field = "nel campo password";
    } else if (rawT === 'number') {
      field = "nel campo numerico";
    } else if (rawT === 'date') {
      field = "nel campo data";
    } else if (t) {
      field = `nel campo (${t})`;
    }
    return hasLabel 
      ? `Inserimento di testo ${field} ${labelStr}.`
      : `Inserimento di testo ${field}.`;
  }

  let stepCount = 0;
  let assertionCount = 0;
  let commentCount = 0;
  
  events.forEach(e => {
    if (e.action === 'assertion') assertionCount++;
    else if (e.action === 'comment') commentCount++;
    else stepCount++;
  });
  
  let stepsHtml = '';
  for (let idx = 0; idx < events.length; idx++) {
    // Report generato a chunk: cede all'event loop per non bloccare il popup
    if (idx % REPORT_CHUNK_SIZE === 0) await yieldToEventLoop();
    const e = events[idx];
    let actionLabel = e.action ? escapeHtml(e.action.toUpperCase()) : 'AZIONE';
    let badgeClass = 'badge-step';
    let detailText = '';
    let xpathHtml = '';
    let valHtml = '';
    const hasLabel = e.labelText && e.labelText.trim().length > 0;
    const labelQuote = hasLabel ? `<strong>"${escapeHtml(e.labelText)}"</strong>` : '';
    
    if (e.action === 'assertion') {
      badgeClass = 'badge-assertion';
      let typeLabel = '';
      if (e.type === 'text') {
        typeLabel = 'TESTO';
        const elementTypeName = getElementItalianName(e.elementType, true);
        detailText = hasLabel 
          ? `Verifica che il testo ${elementTypeName} ${labelQuote} corrisponda al valore atteso.` 
          : `Verifica che il testo ${elementTypeName} corrisponda al valore atteso.`;
        valHtml = `<div class="detail-row"><strong>Valore Atteso:</strong> <span class="val-highlight">${escapeHtml(e.expected_value)}</span></div>`;
      } else if (e.type === 'page') {
        typeLabel = 'PAGINA';
        detailText = e.title 
          ? `Verifica atterraggio sulla pagina con titolo: <strong>"${escapeHtml(e.title)}"</strong>` 
          : `Verifica atterraggio sulla pagina`;
      } else if (e.type === 'style' && e.condition === 'color') {
        typeLabel = 'COLORE';
        const elementTypeName = getElementItalianName(e.elementType, true);
        detailText = hasLabel 
          ? `Verifica che il colore ${elementTypeName} ${labelQuote} corrisponda al valore atteso.` 
          : `Verifica che il colore ${elementTypeName} corrisponda al valore atteso.`;
        const safeColor = (/^#([0-9a-fA-F]{3,8})$|^rgba?\([0-9,\s.]+\)$/i.test(e.expected_value || '')) ? e.expected_value : 'transparent';
        valHtml = `<div class="detail-row"><strong>Colore Atteso:</strong> <span class="color-badge" style="background-color: ${safeColor};"></span> <span class="val-highlight">${escapeHtml(e.expected_value)}</span></div>`;
      } else {
        const elementTypeName = getElementItalianName(e.elementType, false);
        const cond = e.condition ? e.condition.toLowerCase() : 'visible';
        let condIt = 'visibile';
        if (cond === 'visible') {
          typeLabel = 'VISIBILE';
          condIt = 'visibile';
        } else if (cond === 'enabled') {
          typeLabel = 'ABILITATO';
          condIt = 'abilitato';
        } else if (cond === 'disabled') {
          typeLabel = 'DISABILITATO';
          condIt = 'disabilitato';
        } else {
          typeLabel = escapeHtml(cond.toUpperCase());
          condIt = escapeHtml(cond);
        }
        detailText = hasLabel 
          ? `Verifica che ${elementTypeName} ${labelQuote} sia <strong>${condIt}</strong>.` 
          : `Verifica che ${elementTypeName} sia <strong>${condIt}</strong>.`;
      }
      actionLabel = typeLabel;
    } else if (e.action === 'comment') {
      badgeClass = 'badge-comment';
      actionLabel = 'COMMENTO';
      detailText = `<span class="comment-text">"${escapeHtml(e.comment)}"</span>`;
    } else if (e.action === 'click') {
      badgeClass = 'badge-click';
      actionLabel = 'CLICK';
      detailText = getClickActionDescription(e.type, labelQuote, hasLabel);
    } else if (e.action === 'input') {
      badgeClass = 'badge-input';
      actionLabel = 'INPUT';
      detailText = getInputActionDescription(e.type, labelQuote, hasLabel);
      valHtml = `<div class="detail-row"><strong>Testo inserito:</strong> <span class="val-highlight">${escapeHtml(e.value)}</span></div>`;
    } else if (e.action === 'select') {
      badgeClass = 'badge-select';
      actionLabel = 'SELECT';
      const selectValue = e.value && typeof e.value === 'object' ? e.value.value : e.value;
      const selectText = e.value && typeof e.value === 'object' ? e.value.text : '';
      detailText = hasLabel 
        ? `Selezione dell'opzione nel menu a discesa ${labelQuote}.` 
        : `Selezione dell'opzione nel menu a discesa.`;
      valHtml = `
        <div class="detail-row"><strong>Testo Opzione:</strong> <span class="val-highlight">${escapeHtml(selectText)}</span></div>
        <div class="detail-row"><strong>Valore Opzione:</strong> <span class="val-highlight">${escapeHtml(selectValue)}</span></div>
      `;
    } else if (e.action === 'scroll') {
      badgeClass = 'badge-scroll';
      actionLabel = 'SCROLL';
      const scrollVal = e.value && typeof e.value === 'object' ? `x: ${e.value.x}, y: ${e.value.y}` : e.value;
      detailText = `Scorrimento della pagina.`;
      valHtml = `<div class="detail-row"><strong>Coordinate:</strong> <span class="val-highlight">${escapeHtml(scrollVal)}</span></div>`;
    }
    
    if (e.locator && e.locator !== 'window' && !(e.action === 'assertion' && e.type === 'page')) {
      xpathHtml = `
        <div class="xpath-container">
          <div class="xpath-header">
            <span>Elemento XPath</span>
            <button class="btn-copy" onclick="copyToClipboard(this)">Copia</button>
          </div>
          <code class="xpath-code">${escapeHtml(e.locator)}</code>
        </div>
      `;
    }
    
    let urlHtml = '';
    const isFirstStep = (idx === 0);
    const isUrlChanged = (idx > 0 && e.url !== events[idx - 1].url);
    if (e.url && (isFirstStep || isUrlChanged)) {
      urlHtml = `
        <div class="detail-row url-row">
          <strong>URL:</strong> <a class="page-url" href="${escapeHtml(e.url)}" target="_blank">${escapeHtml(e.url)}</a>
        </div>
      `;
    }

    // The screenshot bytes themselves are NOT interpolated here: they are
    // embedded once in rawStepsData below, and this <img> is populated from
    // there by the bootstrap script at render time. Embedding the same
    // base64 string multiple times in the generated HTML (img src + two
    // onclick handlers + rawStepsData) bloated the report and blocked the
    // popup thread while building it for sessions with many screenshots.
    let stepVisualHtml = '';
    if (e.screenshot) {
      stepVisualHtml = `
        <div class="step-visual">
          <div class="screenshot-container">
            <img class="screenshot-thumb" data-step-index="${idx}" alt="Step ${idx + 1}" onclick="openLightboxByIndex(${idx})" />
            <div class="screenshot-overlay" onclick="openLightboxByIndex(${idx})">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span>Ingrandisci</span>
            </div>
          </div>
        </div>
      `;
    }
    
    const timeFormatted = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('it-IT') : '';
    
    stepsHtml += `
      <div class="timeline-step">
        <div class="timeline-marker">${idx + 1}</div>
        <div class="timeline-content">
          <div class="step-header">
            <span class="step-badge ${badgeClass}">${actionLabel}</span>
            <span class="step-time">${timeFormatted}</span>
          </div>
          <div class="step-body">
            <div class="step-details">
              <p class="step-desc">${detailText}</p>
              ${valHtml}
              ${xpathHtml}
              ${urlHtml}
            </div>
            ${stepVisualHtml}
          </div>
        </div>
      </div>
    `;
  }

  const rawStepsData = [];
  for (let idx = 0; idx < events.length; idx++) {
    if (idx % REPORT_CHUNK_SIZE === 0) await yieldToEventLoop();
    const e = events[idx];
    let type = e.action;
    if (e.action === 'comment' || e.action === 'navigation') {
      type = 'navigation';
    }
    
    let title = 'Interazione';
    if (e.action === 'assertion') {
      let condLabel = e.condition ? e.condition.toUpperCase() : (e.type === 'page' ? 'LANDING' : 'STATO');
      title = `Verifica: ${condLabel}`;
    } else if (e.action === 'comment') {
      title = 'Commento';
    } else if (e.action === 'navigation') {
      title = 'Navigazione Pagina';
    } else if (e.action) {
      title = `Azione: ${e.action.charAt(0).toUpperCase() + e.action.slice(1)}`;
    }
    
    let description = '';
    let valStr = '';
    const hasLabel = e.labelText && e.labelText.trim().length > 0;
    const labelTxt = hasLabel ? e.labelText : '';
    const plainLabelTxt = hasLabel ? `"${labelTxt}"` : '';
    
    if (e.action === 'assertion') {
      if (e.type === 'text') {
        const elementTypeName = getElementItalianName(e.elementType, true);
        description = hasLabel ? `Verifica che il testo ${elementTypeName} "${labelTxt}" corrisponda al valore atteso.` : `Verifica che il testo ${elementTypeName} corrisponda al valore atteso.`;
        valStr = e.expected_value || '';
      } else if (e.type === 'page') {
        description = `Verifica atterraggio sulla pagina con titolo: ${e.title || ''}`;
      } else if (e.type === 'style' && e.condition === 'color') {
        const elementTypeName = getElementItalianName(e.elementType, true);
        description = hasLabel ? `Verifica che il colore ${elementTypeName} "${labelTxt}" corrisponda al valore atteso.` : `Verifica che il colore ${elementTypeName} corrisponda al valore atteso.`;
        valStr = e.expected_value || '';
      } else {
        const elementTypeName = getElementItalianName(e.elementType, false);
        const cond = e.condition ? e.condition.toLowerCase() : 'visible';
        let condIt = 'visibile';
        if (cond === 'visible') condIt = 'visibile';
        else if (cond === 'enabled') condIt = 'abilitato';
        else if (cond === 'disabled') condIt = 'disabilitato';
        description = hasLabel ? `Verifica che ${elementTypeName} "${labelTxt}" sia ${condIt}.` : `Verifica che ${elementTypeName} sia ${condIt}.`;
      }
    } else if (e.action === 'comment') {
      description = e.comment || '';
    } else if (e.action === 'click') {
      description = getClickActionDescription(e.type, plainLabelTxt, hasLabel);
    } else if (e.action === 'input') {
      description = getInputActionDescription(e.type, plainLabelTxt, hasLabel);
      valStr = e.value || '';
    } else if (e.action === 'select') {
      const selectValue = e.value && typeof e.value === 'object' ? e.value.value : e.value;
      description = hasLabel ? `Selezione dell'opzione nel menu a discesa "${labelTxt}"` : `Selezione dell'opzione nel menu a discesa.`;
      valStr = selectValue || '';
    } else if (e.action === 'scroll') {
      const scrollVal = e.value && typeof e.value === 'object' ? `x: ${e.value.x}, y: ${e.value.y}` : e.value;
      description = `Scorrimento della pagina.`;
      valStr = scrollVal || '';
    }
    
    const stepObj = {
      description: description,
      labelText: labelTxt,
      screenshot: e.screenshot || '',
      timestamp: e.timestamp || new Date().toISOString(),
      title: title,
      type: type,
      url: e.url || '',
      value: valStr,
      xpath: e.locator || ''
    };
    
    if (e.action === 'assertion') {
      stepObj.assertType = e.condition || e.type || '';
    }
    
    if (e.metadata) {
      stepObj.metadata = e.metadata;
    }
    
    if (e.outerHTML) {
      stepObj.outerHTML = e.outerHTML;
    }
    if (e.DOMContext) {
      stepObj.domContext = e.DOMContext;
      stepObj.DOMContext = e.DOMContext;
    }
    
    rawStepsData.push(stepObj);
  }

  // JSON.stringify per singolo step (a chunk): evita un unico stringify
  // bloccante su un payload da decine di MB. Il join finale e' nativo.
  // Standard OWASP: rimpiazza tutti i caratteri '<' con '\\u003c' per prevenire breakout da tag script
  const serializedRawData = ('[' + rawStepsData.map(s => JSON.stringify(s)).join(',') + ']').replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report di Test - ${escapeHtml(testName || 'Registrazione')}</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-dark: #3730a3;
      --secondary: #12abdb;
      --success: #10b981;
      --danger: #f43f5e;
      --neutral-light: #f8fafc;
      --neutral-border: #e2e8f0;
      --text-main: #1e293b;
      --text-muted: #64748b;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--neutral-light);
      color: var(--text-main);
      -webkit-font-smoothing: antialiased;
    }
    
    .header {
      background: #ffffff;
      border-bottom: 2px solid var(--neutral-border);
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-text {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    
    .logo-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--primary-dark);
      letter-spacing: 0.5px;
    }
    
    .logo-subtitle {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--primary);
      letter-spacing: 0.3px;
    }
    
    .report-meta {
      text-align: right;
    }
    
    .report-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--primary-dark);
      margin: 0 0 4px 0;
    }
    
    .report-date {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }
    
    .main-container {
      max-width: 1000px;
      margin: 32px auto;
      padding: 0 24px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: #ffffff;
      border: 1px solid var(--neutral-border);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    
    .stat-val {
      font-size: 28px;
      font-weight: 800;
      color: var(--primary-dark);
      margin-bottom: 2px;
    }
    
    .stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    
    .timeline {
      position: relative;
      padding-left: 24px;
      border-left: 2px solid var(--neutral-border);
      margin-left: 12px;
    }
    
    .timeline-step {
      position: relative;
      margin-bottom: 40px;
    }
    
    .timeline-step:last-child {
      margin-bottom: 0;
    }
    
    .timeline-marker {
      position: absolute;
      left: -37px;
      top: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid var(--primary);
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      box-shadow: 0 0 0 4px #f8fafc;
    }
    
    .timeline-content {
      background: #ffffff;
      border: 1px solid var(--neutral-border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01);
    }
    
    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 12px;
    }
    
    .step-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: inline-block;
    }
    
    .badge-step { background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; }
    .badge-click { background: #eff6ff; color: var(--primary); border: 1.5px solid #bae6fd; }
    .badge-input { background: #faf5ff; color: #7c3aed; border: 1.5px solid #e9d5ff; }
    .badge-select { background: #faf5ff; color: #6d28d9; border: 1.5px solid #ddd6fe; }
    .badge-scroll { background: #f8fafc; color: #475569; border: 1.5px solid #e2e8f0; }
    .badge-assertion { background: #ecfdf5; color: #047857; border: 1.5px solid #a7f3d0; }
    .badge-comment { background: #f8fafc; color: #475569; border: 1.5px solid #cbd5e1; }
    
    .step-time {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }
    
    .step-body {
      display: flex;
      gap: 24px;
    }
    
    .step-details {
      flex: 1;
    }
    
    .step-visual {
      width: 320px;
      flex-shrink: 0;
    }
    
    .step-desc {
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 12px 0;
      font-weight: 500;
    }
    
    .comment-text {
      font-style: italic;
      color: var(--text-muted);
      font-weight: 400;
      font-size: 15px;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      display: inline-block;
      border-left: 3px solid var(--text-muted);
    }
    
    .detail-row {
      font-size: 13px;
      margin-bottom: 8px;
    }
    
    .url-row {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px dashed #f1f5f9;
      word-break: break-all;
    }
    
    .val-highlight {
      font-family: Consolas, Monaco, monospace;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #0f172a;
      display: inline-block;
    }
    
    .color-badge {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
      margin-right: 4px;
    }
    
    .page-url {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }
    
    .page-url:hover {
      color: var(--primary-dark);
      text-decoration: underline;
    }
    
    .xpath-container {
      margin-top: 12px;
      border: 1px solid var(--neutral-border);
      border-radius: 8px;
      background: var(--neutral-light);
      overflow: hidden;
    }
    
    .xpath-header {
      background: #f1f5f9;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 1px solid var(--neutral-border);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .btn-copy {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-main);
      transition: all 0.15s ease;
    }
    
    .btn-copy:hover {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
    }
    
    .xpath-code {
      display: block;
      padding: 12px;
      font-family: Consolas, Monaco, monospace;
      font-size: 11px;
      color: #0f172a;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }
    
    .screenshot-container {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--neutral-border);
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      cursor: pointer;
      background: #000;
    }
    
    .screenshot-thumb {
      width: 100%;
      height: 180px;
      object-fit: cover;
      display: block;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    
    .screenshot-container:hover .screenshot-thumb {
      opacity: 0.75;
      transform: scale(1.03);
    }
    
    .screenshot-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(10, 44, 92, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      color: #ffffff;
      transition: opacity 0.25s ease;
      gap: 6px;
    }
    
    .screenshot-container:hover .screenshot-overlay {
      opacity: 1;
    }
    
    .screenshot-overlay span {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .screenshot-placeholder {
      height: 180px;
      border: 1.5px dashed var(--neutral-border);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      gap: 8px;
      background: #ffffff;
    }
    
    .screenshot-placeholder span {
      font-size: 11px;
      font-weight: 500;
    }
    
    .lightbox {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    
    .lightbox.active {
      display: flex;
    }
    
    .lightbox-img {
      max-width: 90%;
      max-height: 85%;
      border-radius: 8px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    .lightbox-close {
      position: absolute;
      top: 24px;
      right: 24px;
      background: rgba(255,255,255,0.1);
      border: none;
      color: #ffffff;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }
    
    .lightbox-close:hover {
      background: rgba(255,255,255,0.25);
    }
    
    @media (max-width: 768px) {
      .step-body {
        flex-direction: column;
      }
      .step-visual {
        width: 100%;
      }
      .stats-grid {
        grid-template-columns: 1fr;
      }
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
      .report-meta {
        text-align: left;
      }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="logo-container">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(79, 70, 229, 0.2));">
        <rect width="36" height="36" rx="8" fill="#4f46e5"/>
        <circle cx="18" cy="18" r="7" fill="#ef4444"/>
        <path d="M18 6V11M18 25V30M6 18H11M25 18H30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div class="logo-text">
        <span class="logo-title">FlowTrace Recorder</span>
        <span class="logo-subtitle">Automated Test & Flow Report</span>
      </div>
    </div>
    <div class="report-meta">
      <h1 class="report-title">${escapeHtml(testName || 'Report Sessione di Test')}</h1>
      <span class="report-date">Data: ${dateStr}</span>
    </div>
  </div>

  <div class="main-container">

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-val">${stepCount}</span>
        <span class="stat-label">Interazioni</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">${assertionCount}</span>
        <span class="stat-label">Verifiche (Assert)</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">${commentCount}</span>
        <span class="stat-label">Commenti</span>
      </div>
    </div>

    <h2 style="font-size: 18px; color: var(--primary-dark); margin: 0 0 24px 0; border-bottom: 2px solid var(--neutral-border); padding-bottom: 8px;">Cronologia dei Passi</h2>
    <div class="timeline">
      ${stepsHtml}
    </div>
  </div>

  <div id="lightbox" class="lightbox" onclick="closeLightbox()">
    <button class="lightbox-close" onclick="closeLightbox()">✕</button>
    <img id="lightbox-img" class="lightbox-img" src="" alt="Zoom Screenshot" onclick="event.stopPropagation()" />
  </div>

  <script>
    function copyToClipboard(btn) {
      const container = btn.closest('.xpath-container');
      const text = container ? container.querySelector('.xpath-code').textContent : '';
      navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerText;
        btn.innerText = 'Copiato!';
        btn.style.background = 'var(--success)';
        btn.style.color = '#ffffff';
        btn.style.borderColor = 'var(--success)';
        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.background = '#ffffff';
          btn.style.color = 'var(--text-main)';
          btn.style.borderColor = '#cbd5e1';
        }, 1500);
      });
    }

    function openLightbox(src) {
      const lb = document.getElementById('lightbox');
      const lbImg = document.getElementById('lightbox-img');
      lbImg.src = src;
      lb.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      const lb = document.getElementById('lightbox');
      lb.classList.remove('active');
      document.body.style.overflow = '';
    }

    function openLightboxByIndex(idx) {
      const step = window.__nrtSteps && window.__nrtSteps[idx];
      if (step && step.screenshot) openLightbox(step.screenshot);
    }

    // Screenshot thumbnails are not inlined per-step in the HTML above (that
    // used to embed each base64 image multiple times and bloat the report);
    // instead they are hydrated here, once, from rawStepsData below.
    window.addEventListener('DOMContentLoaded', function() {
      try {
        const dataEl = document.getElementById('rawStepsData');
        window.__nrtSteps = dataEl ? JSON.parse(dataEl.textContent) : [];
        document.querySelectorAll('img.screenshot-thumb[data-step-index]').forEach(function(img) {
          const step = window.__nrtSteps[img.dataset.stepIndex];
          if (step && step.screenshot) img.src = step.screenshot;
        });
      } catch (e) {
        console.error('Failed to hydrate screenshots from rawStepsData', e);
      }
    });
  </script>
  
  <script id="rawStepsData" type="application/json">${serializedRawData}</script>
</body>
</html>`;
}
