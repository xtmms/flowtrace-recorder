// Storage a delta (schema v2): invece di riscrivere l'array pieno di eventi
// a ogni append (O(n^2) cumulativo su sessioni lunghe) si persiste:
//   - `events`        : lista di soli timestamp (ordine degli eventi)
//   - `evt_{ts}`      : evento completo, scritto una volta
//   - `undoRedoState` : history di liste-timestamp (15 stati × byte, non
//                       15 × structuredClone dell'intero payload)
// La chiave legacy `recordedEvents` viene migrata una sola volta al primo
// load (idempotente anche con piu' contesti in corsa: content frames,
// popup, iframe embedded scrivono gli stessi valori).
// NB: gli screenshot usano gia' il pattern `screenshot_{ts}`: invariato.

let deltaSchemaReady = false;

// Migrazione unica legacy -> v2. Idempotente: se due contesti migrano in
// parallelo scrivono chiavi identiche e la remove di `recordedEvents` non
// perde dati (le append successive scrivono gia' in formato delta).
function ensureDeltaSchema(cb) {
  if (deltaSchemaReady) {
    cb();
    return;
  }
  chrome.storage.local.get(['nada_schema', 'recordedEvents', 'undoRedoState'], (res) => {
    if (res.nada_schema === 2) {
      deltaSchemaReady = true;
      cb();
      return;
    }

    const writes = { nada_schema: 2, events: [] };
    const legacy = Array.isArray(res.recordedEvents) ? res.recordedEvents : [];
    if (legacy.length > 0) {
      const order = [];
      legacy.forEach((e) => {
        if (!e || typeof e.timestamp !== 'string') return;
        writes['evt_' + e.timestamp] = e;
        order.push(e.timestamp);
      });
      writes.events = order;
    }
    if (res.undoRedoState && Array.isArray(res.undoRedoState.history)) {
      writes.undoRedoState = {
        history: res.undoRedoState.history.map((entry) =>
          Array.isArray(entry)
            ? entry.map((e) => (e && e.timestamp) || null).filter((t) => t !== null)
            : []
        ),
        currentIndex: typeof res.undoRedoState.currentIndex === 'number' ? res.undoRedoState.currentIndex : 0
      };
    }

    chrome.storage.local.set(writes, () => {
      const finish = () => {
        deltaSchemaReady = true;
        cb();
      };
      if (res.recordedEvents !== undefined) {
        chrome.storage.local.remove(['recordedEvents'], finish);
      } else {
        finish();
      }
    });
  });
}

// Legge la lista ordine (soli timestamp).
function getEventsOrder(cb) {
  ensureDeltaSchema(() => {
    chrome.storage.local.get('events', (res) => {
      cb(Array.isArray(res.events) ? res.events : []);
    });
  });
}

// Legge tutti gli eventi in ordine (bulk get delle chiavi evt_*).
function loadEventsInOrder(cb) {
  ensureDeltaSchema(() => {
    chrome.storage.local.get('events', (res) => {
      const order = Array.isArray(res.events) ? res.events : [];
      if (order.length === 0) {
        cb([]);
        return;
      }
      chrome.storage.local.get(order.map((ts) => 'evt_' + ts), (data) => {
        const events = [];
        order.forEach((ts) => {
          const ev = data['evt_' + ts];
          if (ev) events.push(ev);
        });
        cb(events);
      });
    });
  });
}

// Append di un singolo evento: scrive evt_{ts} una volta e appende il
// timestamp alla lista ordine (scrittura piccola, non O(n) di payload).
function appendDeltaEvent(eventData, cb) {
  ensureDeltaSchema(() => {
    chrome.storage.local.get('events', (res) => {
      const order = Array.isArray(res.events) ? res.events : [];
      order.push(eventData.timestamp);
      const writes = { events: order };
      writes['evt_' + eventData.timestamp] = eventData;
      chrome.storage.local.set(writes, cb || (() => {}));
    });
  });
}

// Sostituzione totale (import ZIP, edit logs, clear): scrive tutte le
// chiavi evt_* e la lista ordine. Con keepStaleKeys=true (edit logs) le
// chiavi evt_* orfane NON vengono rimosse: servono all'undo per ripristinare
// gli eventi rimossi dall'edit (in v1 erano nei cloni della history).
function replaceAllEvents(events, extraWrites, cb, keepStaleKeys) {
  ensureDeltaSchema(() => {
    const order = events.map((e) => e.timestamp);
    const writes = Object.assign({ events: order }, extraWrites || {});
    events.forEach((e) => {
      writes['evt_' + e.timestamp] = e;
    });

    if (keepStaleKeys) {
      chrome.storage.local.set(writes, cb || (() => {}));
      return;
    }

    chrome.storage.local.get(null, (items) => {
      const stale = Object.keys(items).filter((k) => k.indexOf('evt_') === 0 && order.indexOf(k.slice(4)) === -1);
      const finish = () => {
        chrome.storage.local.set(writes, cb || (() => {}));
      };
      if (stale.length > 0) {
        chrome.storage.local.remove(stale, finish);
      } else {
        finish();
      }
    });
  });
}