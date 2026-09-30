# 🎯 FlowTrace Recorder

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4f46e5?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Chrome Side Panel](https://img.shields.io/badge/Chrome-Native%20Side%20Panel-10b981?style=flat-square)](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
[![Storage Delta O(1)](https://img.shields.io/badge/Storage-Incremental%20Delta-0ea5e9?style=flat-square)](https://developer.chrome.com/docs/extensions/reference/storage/)
[![Zero External Dependencies](https://img.shields.io/badge/Dependencies-Zero%20External%20CDN-f59e0b?style=flat-square)](#)

**FlowTrace Recorder** è un'estensione nativa per Google Chrome (Manifest V3) per la registrazione, l'analisi e la documentazione visiva di flussi di navigazione, interazioni utente e asserzioni automatizzate, ideale per **Non-Regression Testing (NRT)**, QA manuale e test End-to-End (E2E).

---

## 📑 Indice

1. [Caratteristiche Principali & Vantaggi](#-caratteristiche-principali--vantaggi)
2. [Architettura Tecnica](#-architettura-tecnica)
3. [Guida all'Uso Passo-Passo](#-guida-alluso-passo-passo)
4. [Distribuzione per Tester Manuali (Packaging Tool)](#-distribuzione-per-tester-manuali-packaging-tool)
5. [Installazione per Sviluppatori](#-installazione-per-sviluppatori)
6. [Struttura del Progetto](#-struttura-del-progetto)
7. [Schema Dati degli Eventi](#-schema-dati-degli-eventi)
8. [Test & Validazione Continua](#-test--validazione-continua)
9. [FAQ & Risoluzione Problemi](#-faq--risoluzione-problemi)

---

## ⚡ Caratteristiche Principali & Vantaggi

### 1. 100% Chrome Native Side Panel
* **Zero Inquinamento del DOM (Zero Pollution)**: L'interfaccia utente vive interamente all'interno del Side Panel nativo del browser (`chrome.sidePanel`). A differenza dei plugin tradizionali, non inietta overlay `<div>`, modali o `<iframe>` che rischiano di alterare il layout CSS, z-index o le Content Security Policy (CSP) della pagina in test.
* **Persistenza tra Navigazioni**: La barra laterale resta aperta e operativa durante navigazioni a pagine multiple, redirect OAuth o cambi di rotta in Single Page Application (SPA).
* **Modalità Finestra Staccata (Pop-Out)**: Per chi lavora su configurazioni multi-monitor, è possibile staccare la sidebar in una finestra indipendente con un click.

### 2. Performance e Cattura Screenshot Istantanea
* **Click Istantanei Senza Latenza**: Nessun ritardo (`requestAnimationFrame`) per nascondere componenti grafici prima del click: gli eventi vengono catturati ed eseguiti immediatamente.
* **Screenshot Puliti**: Poiché la sidebar è esterna al viewport web, `chrome.tabs.captureVisibleTab` non cattura mai elementi dell'interfaccia del registratore.
* **Downscaler Integrato**: Gli screenshot inclusi nel report HTML finale vengono ottimizzati e scalati automaticamente per garantire archivi leggeri e facili da condividere.

### 3. Storage Incrementale a Delta O(1)
* Registrazione atomica basata su chiavi individuali `evt_{timestamp}` abbinate a un indice di puntatori temporali ordinati (`events`).
* Elimina il collo di bottiglia della riscrittura dell'intero array di eventi ad ogni click, riducendo drasticamente il carico su `chrome.storage.local`.
* Undo e Redo istantanei e a basso costo computazionale.

---

## 🏗️ Architettura Tecnica

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             GOOGLE CHROME                                   │
│                                                                             │
│   ┌───────────────────────────┐         ┌───────────────────────────────┐   │
│   │     SCHEDA WEB ATTIVA     │         │   FLOWTRACE SIDE PANEL        │   │
│   │                           │         │   (sidepanel.html / .js)      │   │
│   │  ┌─────────────────────┐  │         │                               │   │
│   │  │   DOM Pagina Web    │  │         │  • Toolbar comandi            │   │
│   │  └─────────────────────┘  │         │  • Inspector asserzioni       │   │
│   │             │             │         │  • Console interazioni live   │   │
│   │             ▼             │         │  • Esportazione report ZIP    │   │
│   │  ┌─────────────────────┐  │         │  • Editor log manuale         │   │
│   │  │     content.js      │  │         └───────────────┬───────────────┘   │
│   │  │ • XPath Engine      │  │                         │                   │
│   │  │ • Event Interceptor │  │                         │                   │
│   │  │ • Assert Inspector  │  │                         │                   │
│   │  │ • Top-Frame Guard   │  │                         │                   │
│   │  └──────────┬──────────┘  │                         │                   │
│   └─────────────┼─────────────┘                         │                   │
│                 │               Runtime Messages        │                   │
│                 └───────────────┐     ┌─────────────────┘                   │
│                                 ▼     ▼                                     │
│                     ┌───────────────────────┐                               │
│                     │     background.js     │                               │
│                     │  • Service Worker     │                               │
│                     │  • Capture Queue      │                               │
│                     │  • Badge & Tab State  │                               │
│                     └───────────┬───────────┘                               │
│                                 │                                           │
│                                 ▼                                           │
│                     ┌───────────────────────┐                               │
│                     │  chrome.storage.local │                               │
│                     │  (storage-delta.js)   │                               │
│                     └───────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Guida all'Uso Passo-Passo

### 1. Avviare un Test
1. Apri la pagina web da testare.
2. Clicca sull'icona di **FlowTrace Recorder** nella barra degli strumenti di Chrome per aprire il Side Panel.
3. Inserisci il nome del test nel campo in alto (es. `Login_Checkout_Flow`).
4. Clicca sul pulsante rosso **Record**.
5. All'avvio, viene registrata automaticamente la **Landing Page Assertion** iniziale con URL e screenshot della pagina.

### 2. Registrazione Automatica
Durante la registrazione, FlowTrace cattura automaticamente:
* **Click**: genera XPath semantici stabili (basati su ID univoci, attributi `data-testid`, `name` o testo).
* **Input di testo**: rileva i dati inseriti nei campi modulo.
* **Select**: cattura il valore e l'etichetta selezionata nelle liste a tendina.
* **Scroll**: memorizza la posizione verticale di scorrimento.

### 3. Aggiungere Asserzioni Visive
Seleziona lo strumento di asserzione desiderato dalla toolbar:
* 🎯 **Assert Text**: Clicca su un elemento per validare il suo contenuto testuale.
* 👁️ **Assert Visible**: Verifica l'effettiva presenza e visibilità nel DOM.
* 🔒 **Assert Enabled/Disabled**: Valida lo stato interattivo di pulsanti o input.
* 🎨 **Assert Color**: Campiona il colore computato (`rgb/hex`) dell'elemento.

### 4. Aggiungere Commenti e Note
* Clicca sull'icona fumetto 💬, digita una nota esplicativa (es. *"Verifica visualizzazione carrello"*) e premi Invio.

### 5. Undo, Redo e Modifica Log
* **Undo (↩️) / Redo (↪️)**: Annulla o ripristina le azioni registrate senza perdere coerenza nei dati.
* **Edit Log (✏️)**: Apre la modalità editor per correggere manualmente selettori, XPath, valori o commenti.

### 6. Esportazione del Report
1. Clicca sul pulsante **Stop** al termine del flusso.
2. Clicca sull'icona **Download** (📦) nella sezione log.
3. Verrà generato un archivio ZIP contenente:
   * `report.html`: Report interattivo auto-contenuto (apribile offline in qualsiasi browser, con galleria screenshot, filtri per tipologia e timeline).
   * `test_events.json`: File JSON contenente l'elenco strutturato degli eventi registrati.
   * `screenshots/`: Cartella con gli screenshot ad alta risoluzione di ogni step.

---

## 📦 Distribuzione per Tester Manuali (Packaging Tool)

Il repository include uno strumento dedicato per creare in meno di un secondo un archivio ZIP pulito da distribuire via Slack, Teams o email al team di QA.

### Comandi Disponibili

```bash
# Metodo raccomandato con npm:
npm run package

# Oppure tramite script bash:
./package.sh

# Per generare il pacchetto e aprire automaticamente la cartella nel Finder / Esplora Risorse:
npm run package:open
# oppure: ./package.sh --open
```

### Cosa include il pacchetto generato (`dist/flowtrace-recorder-v2.0.0.zip`):
1. **Verifica preventiva**: convalida sintattica `node -c` su tutti gli script e controllo d'integrità degli asset.
2. **Esclusione file di sviluppo**: nessun file `.git`, script interni, test o file spazzatura (`.DS_Store`).
3. **Guida incorporata (`ISTRUZIONI-TESTER.txt`)**: istruzioni in italiano passo-passo che guidano il tester nell'installazione su `chrome://extensions` in 4 click.
4. **Doppio formato in `dist/`**:
   * `dist/flowtrace-recorder-v2.0.0.zip` (archivio compresso pronto per l'invio).
   * `dist/flowtrace-recorder-v2.0.0/` (cartella scompattata per test immediati in locale).

---

## 🛠️ Installazione per Sviluppatori

Per lavorare sul codice sorgente dell'estensione:

1. Clona o scarica il repository:
   ```bash
   git clone <repo-url> flowtrace-recorder
   cd flowtrace-recorder
   ```
2. Apri Google Chrome e naviga all'indirizzo:
   ```
   chrome://extensions
   ```
3. Attiva l'interruttore **"Modalità sviluppatore"** in alto a destra.
4. Clicca sul pulsante **"Carica estensione non pacchettizzata"** (*Load unpacked*).
5. Seleziona la cartella principale `flowtrace-recorder` (quella in cui si trova il file `manifest.json`).
6. Fissa l'icona di **FlowTrace Recorder** nella barra degli strumenti di Chrome.

---

## 📁 Struttura del Progetto

```
flowtrace-recorder/
├── manifest.json              # Configurazione Manifest V3 (side_panel, background, permissions)
├── background.js              # Service Worker Chrome: lifecycle, screenshot queue, sync
├── content.js                 # Content Script: cattura eventi, XPath generator, overlay ispezione
├── sidepanel.html             # Interfaccia grafica nativa del Side Panel (design moderno fluido)
├── sidepanel.js               # Controller UI della sidebar: stato di registrazione, toolbar, undo/redo
├── sidepanel-parser.js        # Parser e normalizzazione della struttura dati degli eventi
├── sidepanel-report.js        # Generatore del report HTML auto-contenuto (CSS/JS inline, no CDN)
├── storage-delta.js           # Storage layer incrementale O(1) con chiavi atomiche evt_{timestamp}
├── jszip.min.js               # Libreria locale per compressione ed esportazione ZIP
├── icons/                     # Icone ufficiali dell'estensione
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/                   # Script di supporto e build
│   └── package.js             # Packaging tool per distribuzione ai tester manuali
├── package.json               # Script npm di packaging e validazione
├── package.sh                 # Script shell rapido per la creazione del pacchetto
├── tests/                     # Suite di test automatizzati per XPath e Report
│   ├── xpath-tests.html       # Golden test per l'algoritmo di calcolo XPath
│   └── report-smoke.html      # Smoke test per generazione report e downscaler
├── README.md                  # Documentazione completa del progetto
└── .gitignore                 # Regole complete di esclusione file
```

---

## 📊 Schema Dati degli Eventi

Ogni azione registrata viene serializzata in un oggetto JSON standardizzato:

```json
{
  "type": "click",
  "xpath": "//button[@id='submit-button']",
  "tagName": "BUTTON",
  "target": "Invia Ordine",
  "value": "",
  "url": "https://example.com/checkout",
  "timestamp": 1727718900123,
  "screenshot": "data:image/jpeg;base64,...",
  "highlight": {
    "x": 350,
    "y": 420,
    "width": 120,
    "height": 40
  },
  "assertionType": null
}
```

---

## 🧪 Test & Validazione Continua

### 1. Controllo Sintattico Rapido
Verifica la correttezza sintattica di tutti gli script JavaScript del progetto:
```bash
npm run test:syntax
```

### 2. Golden Test Algoritmo XPath (17/17 PASS)
Esegue i test di unicità e stabilità degli XPath in Chrome headless:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run \
  --virtual-time-budget=8000 --dump-dom "file://$PWD/tests/xpath-tests.html" 2>/dev/null | grep -o 'Risultato: [0-9]* PASS / [0-9]* FAIL'
```

### 3. Smoke Test Report HTML
Valida la corretta generazione del report standalone e l'algoritmo di downscaling degli screenshot:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run \
  --virtual-time-budget=10000 --dump-dom "file://$PWD/tests/report-smoke.html" 2>/dev/null | grep -o 'Risultato: [A-Za-z ]*'
```

---

## ❓ FAQ & Risoluzione Problemi

<details>
<summary><b>1. Perché all'avvio della registrazione non vedo eventi su una tab già aperta?</b></summary>
Se una scheda del browser era aperta <i>prima</i> che l'estensione venisse installata o ricaricata in Chrome, il content script potrebbe non essere ancora presente in memoria. In questo caso è sufficiente ricaricare la pagina (F5 / Cmd+R) oppure riavviare la registrazione: il Side Panel tenterà automaticamente l'iniezione dinamica del runtime script.
</details>

<details>
<summary><b>2. L'estensione funziona su tutte le pagine?</b></summary>
Sì, su tutte le pagine HTTP e HTTPS ordinarie. Per motivi di sicurezza nativi di Chrome, le estensioni non possono operare su pagine protette di sistema come <code>chrome://</code>, <code>edge://</code> o sul Chrome Web Store.
</details>

<details>
<summary><b>3. Come posso cancellare tutti gli eventi registrati?</b></summary>
Espandi la sezione <b>Interazioni</b> nel Side Panel e clicca sull'icona del cestino <b>Clear Logs</b> per svuotare lo storage locale e azzerare il contatore degli eventi.
</details>

<details>
<summary><b>4. Come posso riprendere un test registrato in precedenza?</b></summary>
Clicca sul pulsante <b>Carica Archivio ZIP o JSON</b> (icona freccia in su nella sezione log) e seleziona il file ZIP o JSON esportato in precedenza: la sessione verrà ripristinata fedelmente.
</details>

---

## 📄 Licenza

Proprietario / FlowTrace Team. Tutti i diritti riservati.
