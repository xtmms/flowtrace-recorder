const fs = require('fs');

let src = fs.readFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/aria-nada-plugin/popup.html', 'utf8');

// 1. Update Title and script tags
src = src.replace('<title>Capgemini NRT Recorder</title>', '<title>FlowTrace Recorder</title>');
src = src.replace('<script src="popup-parser.js" defer></script>', '<script src="sidepanel-parser.js" defer></script>');
src = src.replace('<script src="popup-report.js" defer></script>', '<script src="sidepanel-report.js" defer></script>');
src = src.replace('<script src="popup.js" defer></script>', '<script src="sidepanel.js" defer></script>');

// 2. Modernize body and container widths for side panel responsiveness
src = src.replace(/min-width: 320px;\s*max-width: 450px;/g, 'min-width: 280px; width: 100%;');

// 3. Update Header branding: replace Capgemini SVG and text
const oldLogoContainer = `<div style="display: flex; align-items: center; gap: 8px; text-align: left;">
        <svg width="24" height="24" viewBox="131 0 29 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0, 112, 173, 0.15));">
          <path d="M 159.4434,14.805 C 159.3644,10.8787 157.4997,7.5687 154.6184,4.9262 C 152.4309,2.93 149.8334,1.4112 147.1097,0.2687 C 146.8947,0.1767 146.6697,0.0875 146.4497,0 C 143.0959,4.0187 131.4847,7.0162 131.4847,15.44 C 131.4847,18.73 133.5647,21.8112 136.6159,23.0475 C 138.3884,23.7162 140.1559,23.75 141.9284,23.1537 C 143.5059,22.6362 144.7997,21.66 145.8784,20.4737 C 149.2872,16.6987 150.6734,10.855 154.8584,10.855 C 158.6859,10.855 159.2034,13.5787 159.4484,15.0537 C 159.4484,15.0437 159.4484,14.9462 159.4384,14.805" fill="#0070ad" />
          <path d="M 153.2175,21.2782 c 3.4962,0 6.1962,-2.8462 6.2312,-6.225 -0.245,-1.475 -0.7625,-4.2037 -4.585,-4.2037 -4.19,0 -5.5762,5.8487 -8.985,9.6237 -0.2737,2.1438 -2.305,4.0625 -4.8387,4.385 0.62,0.6488 2.0025,1.0013 3.6525,1.0013 3.0175,0 6.67,-0.9088 8.5837,-2.7988 -2.5537,0.035 -4.1937,-1.6062 -4.355,-3.8762 1.245,1.5087 2.6513,2.0937 4.2963,2.0937" fill="#12abdb" />
        </svg>
        <div style="display: flex; flex-direction: column; line-height: 1.15;">
          <span style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #0a2c5c;">Capgemini NRT Recorder</span>
          <span style="font-size: 8px; font-weight: 600; text-transform: uppercase; color: #0070ad; letter-spacing: 0.3px;">Get the future you want</span>
        </div>
      </div>`;

const newLogoContainer = `<div style="display: flex; align-items: center; gap: 8px; text-align: left;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(79, 70, 229, 0.2));">
          <rect width="24" height="24" rx="6" fill="#4f46e5"/>
          <circle cx="12" cy="12" r="5" fill="#ef4444"/>
          <path d="M12 4V7M12 17V20M4 12H7M17 12H20" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <div style="display: flex; flex-direction: column; line-height: 1.15;">
          <span style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #1e293b;">FlowTrace</span>
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #4f46e5; letter-spacing: 0.5px;">Native Recorder</span>
        </div>
      </div>`;

src = src.replace(oldLogoContainer, newLogoContainer);

// 4. Update color references in styles
src = src.replace(/#0070ad/g, '#4f46e5');
src = src.replace(/#0a2c5c/g, '#1e293b');

// 5. Update IDs
src = src.replace(/#nada-popup/g, '#flowtrace-sidepanel');
src = src.replace(/id="nada-popup"/g, 'id="flowtrace-sidepanel"');
src = src.replace(/nada-popup-content/g, 'flowtrace-content');
src = src.replace(/nada-popup-header/g, 'flowtrace-header');
src = src.replace(/nada-loading-overlay/g, 'flowtrace-loading-overlay');
src = src.replace(/nada-loading-text/g, 'flowtrace-loading-text');
src = src.replace(/nada-spinner/g, 'flowtrace-spinner');

fs.writeFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/flowtrace-recorder/sidepanel.html', src, 'utf8');
console.log('Successfully created sidepanel.html! Lines:', src.split('\n').length);
