#!/usr/bin/env node

/**
 * package.js - Script di packaging e distribuzione per FlowTrace Recorder
 * 
 * Genera un archivio ZIP pulito e ottimizzato (e la cartella uncompressed)
 * pronto per essere distribuito ai tester manuali o caricato sul Chrome Web Store.
 * 
 * Uso:
 *   node scripts/package.js
 *   node scripts/package.js --open
 *   npm run package
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');
const JSZIP_PATH = path.join(ROOT_DIR, 'jszip.min.js');

// Parse argomenti CLI
const args = process.argv.slice(2);
const shouldOpen = args.includes('--open');
const skipValidate = args.includes('--no-validate');
const customOutDirIdx = args.indexOf('--output');
const OUT_DIR_NAME = customOutDirIdx !== -1 && args[customOutDirIdx + 1] ? args[customOutDirIdx + 1] : 'dist';
const DIST_DIR = path.join(ROOT_DIR, OUT_DIR_NAME);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Uso: node scripts/package.js [opzioni]

Opzioni:
  --open          Apre la cartella di output nel Finder / File Explorer al termine.
  --no-validate   Salta il controllo di sintassi 'node -c' sui file JavaScript.
  --output <dir>  Specifica una cartella di output personalizzata (default: 'dist').
  -h, --help      Mostra questo messaggio di aiuto.
  `);
  process.exit(0);
}

// Colori ANSI per output terminale
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const startTime = Date.now();

console.log(`${colors.bold}${colors.blue}┌────────────────────────────────────────────────────────────┐${colors.reset}`);
console.log(`${colors.bold}${colors.blue}│${colors.reset}   ${colors.bold}${colors.cyan}FlowTrace Recorder - Packaging Tool per Tester Manuali${colors.reset}  ${colors.bold}${colors.blue}│${colors.reset}`);
console.log(`${colors.bold}${colors.blue}└────────────────────────────────────────────────────────────┘${colors.reset}\n`);

// 1. Lettura e validazione di manifest.json
if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`${colors.red}✗ Errore: File manifest.json non trovato in ${MANIFEST_PATH}${colors.reset}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  console.error(`${colors.red}✗ Errore nel parsing di manifest.json: ${e.message}${colors.reset}`);
  process.exit(1);
}

const version = manifest.version || '1.0.0';
const nameSlug = 'flowtrace-recorder';
const zipFileName = `${nameSlug}-v${version}.zip`;
const stagingFolderName = `${nameSlug}-v${version}`;
const stagingPath = path.join(DIST_DIR, stagingFolderName);
const zipOutputPath = path.join(DIST_DIR, zipFileName);

console.log(`${colors.green}✓${colors.reset} Manifest rilevato: ${colors.bold}${manifest.name}${colors.reset} (v${version})`);

// 2. Definizione dei file di produzione necessari per l'estensione
const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'storage-delta.js',
  'sidepanel.html',
  'sidepanel.js',
  'sidepanel-parser.js',
  'sidepanel-report.js',
  'jszip.min.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

// File JavaScript da validare sintatticamente
const JS_FILES_TO_VALIDATE = [
  'background.js',
  'content.js',
  'storage-delta.js',
  'sidepanel.js',
  'sidepanel-parser.js',
  'sidepanel-report.js'
];

// 3. Validazione esistenza file
console.log(`\n${colors.bold}[1/5] Verifica integrità asset di produzione...${colors.reset}`);
const missingFiles = [];
for (const relPath of REQUIRED_FILES) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    missingFiles.push(relPath);
  }
}

if (missingFiles.length > 0) {
  console.error(`${colors.red}✗ File obbligatori mancanti:${colors.reset}`);
  missingFiles.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`  ${colors.green}✓${colors.reset} Tutti i ${REQUIRED_FILES.length} file di produzione sono presenti.`);

// 4. Validazione sintassi JS
if (!skipValidate) {
  console.log(`\n${colors.bold}[2/5] Validazione sintattica JavaScript ('node -c')...${colors.reset}`);
  let syntaxErrors = 0;
  for (const jsFile of JS_FILES_TO_VALIDATE) {
    try {
      execSync(`node -c "${path.join(ROOT_DIR, jsFile)}"`, { stdio: 'pipe' });
      console.log(`  ${colors.green}✓${colors.reset} ${jsFile}`);
    } catch (err) {
      syntaxErrors++;
      console.error(`  ${colors.red}✗ Errore sintattico in ${jsFile}:${colors.reset}\n${err.stderr.toString()}`);
    }
  }
  if (syntaxErrors > 0) {
    console.error(`\n${colors.red}✗ Rilevati ${syntaxErrors} errori di sintassi. Packaging interrotto.${colors.reset}`);
    process.exit(1);
  }
} else {
  console.log(`\n${colors.dim}[2/5] Validazione sintattica JS saltata (--no-validate).${colors.reset}`);
}

// 5. Generazione guida per tester
const TESTER_GUIDE = `================================================================================
   FLOWTRACE RECORDER (v${version}) - GUIDA PER I TESTER MANUALI
================================================================================

Grazie per testare FlowTrace Recorder!
Segui questi passaggi per installare l'estensione in Google Chrome in 1 minuto:

1. ESTRAZIONE DELL'ARCHIVIO
   - Estrai questo archivio ZIP sul tuo computer (es. sul Desktop o nei Documenti).
   - Verifica che la cartella estratta contenga direttamente i file:
     manifest.json, sidepanel.html, background.js, content.js, ecc.

2. APRI LA PAGINA DELLE ESTENSIONI IN CHROME
   - Apri Google Chrome.
   - Nella barra degli indirizzi digita:
     chrome://extensions
     e premi Invio.

3. ABILITA LA "MODALITÀ SVILUPPATORE"
   - In alto a destra della pagina 'Estensioni', attiva la levetta:
     [✓] "Modalità sviluppatore" (Developer mode).

4. CARICA L'ESTENSIONE
   - Clicca sul pulsante in alto a sinistra:
     "Carica estensione non pacchettizzata" (Load unpacked).
   - Seleziona la cartella estratta (quella contenente il file manifest.json).
   - L'estensione FlowTrace Recorder comparirà immediatamente nell'elenco!

5. COME UTILIZZARE IL PLUGIN
   - Clicca sull'icona delle Estensioni (a forma di tassello di puzzle) nella barra
     superiore di Chrome e fissa (pin) l'icona di "FlowTrace Recorder".
   - Clicca sull'icona di FlowTrace Recorder: si aprirà la barra laterale nativa
     (Side Panel) a destra.
   - Naviga sulla web app da testare, inserisci il nome del test e premi "Record"
     (Pulsante rosso) per iniziare la registrazione.
   - Al termine, premi "Stop" e poi l'icona "Scarica Archivio ZIP" per salvare
     il report HTML interattivo con tutti gli screenshot.

================================================================================
Per chiarimenti, anomalie o suggerimenti, segnala il riscontro al Tech Lead.
================================================================================
`;

// 6. Preparazione cartella di staging
console.log(`\n${colors.bold}[3/5] Creazione directory di distribuzione e staging...${colors.reset}`);
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Rimuove eventuale staging precedente
if (fs.existsSync(stagingPath)) {
  fs.rmSync(stagingPath, { recursive: true, force: true });
}
fs.mkdirSync(stagingPath, { recursive: true });
fs.mkdirSync(path.join(stagingPath, 'icons'), { recursive: true });

// Copia i file nella cartella di staging
const stagedFiles = [];
for (const relPath of REQUIRED_FILES) {
  const src = path.join(ROOT_DIR, relPath);
  const dest = path.join(stagingPath, relPath);
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  stagedFiles.push({ path: relPath, size: stat.size });
}

// Aggiungi la guida per i tester
fs.writeFileSync(path.join(stagingPath, 'ISTRUZIONI-TESTER.txt'), TESTER_GUIDE, 'utf8');
const guideStat = fs.statSync(path.join(stagingPath, 'ISTRUZIONI-TESTER.txt'));
stagedFiles.push({ path: 'ISTRUZIONI-TESTER.txt', size: guideStat.size });

console.log(`  ${colors.green}✓${colors.reset} Cartella non compressa creata: ${colors.dim}${path.relative(ROOT_DIR, stagingPath)}/${colors.reset}`);

// 7. Compressione ZIP tramite JSZip
console.log(`\n${colors.bold}[4/5] Creazione archivio ZIP ad alta compressione...${colors.reset}`);
async function buildZip() {
  const JSZip = require(JSZIP_PATH);
  const zip = new JSZip();

  // Inserisci i file nello ZIP (alla radice del pacchetto)
  for (const item of stagedFiles) {
    const fileData = fs.readFileSync(path.join(stagingPath, item.path));
    zip.file(item.path, fileData);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });

  fs.writeFileSync(zipOutputPath, zipBuffer);

  // 8. Statistiche e Checksum
  console.log(`\n${colors.bold}[5/5] Calcolo statistiche e checksum...${colors.reset}`);
  const zipStat = fs.statSync(zipOutputPath);
  const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const totalRawSize = stagedFiles.reduce((acc, f) => acc + f.size, 0);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${colors.bold}${colors.green}============================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}   PACCHETTO ZIP PER TESTER GENERATO CON SUCCESSO! (${duration}s)${colors.reset}`);
  console.log(`${colors.bold}${colors.green}============================================================${colors.reset}\n`);

  console.log(`${colors.bold}Dettagli Archivio:${colors.reset}`);
  console.log(`  ${colors.cyan}File ZIP:${colors.reset}        ${colors.bold}${path.relative(ROOT_DIR, zipOutputPath)}${colors.reset}`);
  console.log(`  ${colors.cyan}Cartella Unpack:${colors.reset} ${colors.dim}${path.relative(ROOT_DIR, stagingPath)}/${colors.reset}`);
  console.log(`  ${colors.cyan}Dimensione ZIP:${colors.reset}  ${colors.bold}${formatSize(zipStat.size)}${colors.reset} (originale: ${formatSize(totalRawSize)}, compressione: ${(100 - (zipStat.size / totalRawSize * 100)).toFixed(1)}%)`);
  console.log(`  ${colors.cyan}SHA-256:${colors.reset}         ${colors.dim}${hash}${colors.reset}`);
  console.log(`  ${colors.cyan}File Inclusi:${colors.reset}    ${stagedFiles.length} file\n`);

  console.log(`${colors.bold}Contenuto Archivio:${colors.reset}`);
  stagedFiles.forEach(f => {
    const isIcon = f.path.startsWith('icons/');
    const isGuide = f.path.endsWith('.txt');
    const color = isGuide ? colors.magenta : isIcon ? colors.blue : colors.reset;
    console.log(`  • ${color}${f.path.padEnd(26)}${colors.reset} ${colors.dim}(${formatSize(f.size)})${colors.reset}`);
  });

  console.log(`\n${colors.bold}${colors.yellow}👉 Istruzioni per distribuire ai tester:${colors.reset}`);
  console.log(`   1. Invia il file ${colors.bold}${path.basename(zipOutputPath)}${colors.reset} ai tester (via Slack, Teams, Email).`);
  console.log(`   2. I tester estraggono lo zip e caricano la cartella in ${colors.cyan}chrome://extensions${colors.reset} tramite "Carica estensione non pacchettizzata".`);
  console.log(`   3. La guida dettagliata ${colors.bold}ISTRUZIONI-TESTER.txt${colors.reset} è già inclusa all'interno dello ZIP.\n`);

  // Apertura opzionale nel file manager
  if (shouldOpen) {
    try {
      if (process.platform === 'darwin') {
        execSync(`open -R "${zipOutputPath}"`);
      } else if (process.platform === 'win32') {
        execSync(`explorer.exe /select,"${zipOutputPath}"`);
      } else {
        execSync(`xdg-open "${DIST_DIR}"`);
      }
      console.log(`${colors.green}✓${colors.reset} Aperta cartella nel file manager di sistema.`);
    } catch (e) {
      // Ignora silenziosamente errori di apertura non interattiva
    }
  }
}

buildZip().catch(err => {
  console.error(`\n${colors.red}✗ Errore imprevisto durante la creazione dello ZIP: ${err.message}${colors.reset}`);
  console.error(err);
  process.exit(1);
});
