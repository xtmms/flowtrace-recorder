# FlowTrace Recorder

**FlowTrace Recorder** è un'estensione nativa per Google Chrome (Manifest V3) progettata per registrare flussi di navigazione, interazioni utente e asserzioni automatizzate per Non-Regression Testing (NRT) ed End-to-End testing.

Sfrutta l'architettura **Chrome Side Panel nativa**, garantendo zero interferenze con il DOM delle pagine web testate, massima reattività sui click nativi e totale indipendenza da dipendenze esterne o corporate branding.

---

## ⚡ Innovazioni Architetturali & Vantaggi

### 1. 100% Chrome Native Side Panel
* **Zero DOM Pollution**: L'interfaccia utente risiede nella sidebar nativa del browser (`chrome.sidePanel`). Nessun container flottante (`<div>`), nessun `<iframe>` iniettato e zero conflitti di stile CSS, z-index o policy CSP (`frame-src`).
* **Persistenza tra Navigazioni**: La sidebar rimane aperta e sincronizzata durante cambi di pagina, reindirizzamenti e ricaricamenti (SPA o multi-page).
* **Supporto Finestra Staccata (Pop-Out)**: Per configurazioni multi-monitor, un pulsante dedicato permette di staccare la sidebar in una finestra Chrome indipendente.

### 2. Performance & Reattività Immediata
* **Click Istantanei Senza Lag**: Eliminata la latenza dovuta al doppio `requestAnimationFrame` precedentemente necessario per nascondere i pannelli flottanti. I click nativi vengono eseguiti e registrati all'istante.
* **Cattura Screenshot Pulita**: Poiché la sidebar è esterna al viewport della pagina web, `chrome.tabs.captureVisibleTab` non include mai l'interfaccia del plugin. Non è più necessario nascondere e mostrare elementi dell'interfaccia durante gli scatti.
* **Storage Incrementale a Delta**: Registrazione O(1) con chiavi individuali `evt_{timestamp}` e array di soli puntatori temporali: scritture ridotte, sincronizzazione multi-contesto istantanea e undo/redo leggero.
* **Importazione Diretta**: Il caricamento di sessioni ZIP o JSON avviene all'interno del contesto isolato della sidebar senza dover iniettare script o modali nella pagina web attiva.

---

## 🎯 Funzionalità Principali

* 🔴 **Registrazione Automatica**: Cattura click, input di testo, selezioni (`<select>`) e scroll in tempo reale.
* 🎯 **Inspector Visivo per Asserzioni**:
  * **Assert Text**: Verifica il contenuto testuale di un elemento target.
  * **Assert Visible**: Controlla la visibilità effettiva di un componente nel DOM.
  * **Assert Enabled / Disabled**: Valida gli stati di interattività di form e controlli.
  * **Assert Color**: Campiona il colore computato (`rgb/hex`) dell'elemento.
* 💬 **Commenti Manuali**: Inserimento di note esplicative nel log del flusso.
* ↩️ **Undo & Redo Illimitati**: Navigazione bidirezionale nella cronologia delle azioni registrate.
* ✏️ **Editor Log Integrato**: Modifica manuale al volo di XPath, selettori e valori attesi.
* 📦 **Esportazione ZIP Auto-Contenuta**:
  * Report HTML interattivo con visualizzatore a step e screenshot incorporati (downscalati per la massima leggerezza).
  * File JSON standard con lo schema completo degli eventi registrati.
  * Cartella `screenshots/` con gli scatti originali ad alta risoluzione.

---

## 📦 Installazione

1. Apri Google Chrome e naviga a `chrome://extensions/`.
2. Attiva la levetta **"Modalità sviluppatore"** in alto a destra.
3. Clicca su **"Carica estensione non pacchettizzata"** (*Load unpacked*).
4. Seleziona la cartella `flowtrace-recorder` (contenente il file `manifest.json`).
5. Clicca sull'icona di **FlowTrace Recorder** nella barra delle estensioni di Chrome per aprire istantaneamente la sidebar nativa!

---

## 🧪 Suite di Test & Validazione

Il progetto include due test automatizzati eseguibili direttamente in Chrome headless:

```bash
# 1. Golden Test XPath (17/17 PASS): Verifica univocità e round-trip di generazione XPath
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run \
  --virtual-time-budget=8000 --dump-dom "file://$PWD/tests/xpath-tests.html" 2>/dev/null | grep -o 'Risultato: [0-9]* PASS / [0-9]* FAIL'

# 2. Smoke Test Report HTML & Downscaler (TUTTI PASSANO)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run \
  --virtual-time-budget=10000 --dump-dom "file://$PWD/tests/report-smoke.html" 2>/dev/null | grep -o 'Risultato: [A-Za-z ]*'
```

---

## 📁 Struttura del Progetto

```
flowtrace-recorder/
├── manifest.json         # Manifest V3 (side_panel, background service worker, permissions)
├── background.js         # Service worker: gestione side panel, action click, badge, screenshot queue
├── content.js            # Script iniettato nelle tab: event recording, XPath engine, highlight overlay
├── sidepanel.html        # UI fluida e responsiva per la sidebar nativa di Chrome
├── sidepanel.js          # Controller UI della sidebar: stato, eventi, storage sync, undo/redo
├── sidepanel-parser.js   # Parser e normalizzazione della struttura dati degli eventi
├── sidepanel-report.js   # Generatore del report HTML autonomo (senza CDN/font esterni)
├── storage-delta.js      # Storage layer incrementale (delta persistence su chrome.storage.local)
├── jszip.min.js          # Libreria per impacchettamento ZIP locale
├── icons/                # Icone native a risoluzione multipla (16px, 48px, 128px)
└── tests/                # Test suite per XPath e generazione report
    ├── xpath-tests.html
    └── report-smoke.html
```
