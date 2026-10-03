// One-time legacy migration script. Disabled to prevent accidental overwrites.
if (require.main === module) {
  console.log('scripts/build-report.js is archived and disabled.');
  process.exit(0);
}
const fs = require('fs');

// 1. Update primary colors
src = src.replace('--primary: #0070ad;', '--primary: #4f46e5;');
src = src.replace('--primary-dark: #0a2c5c;', '--primary-dark: #3730a3;');

// 2. Replace Capgemini SVG logo and branding in HTML report template
const oldLogoSvg = `<svg width="36" height="36" viewBox="131 0 29 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0, 112, 173, 0.15));">
        <path d="M 159.4434,14.805 C 159.3644,10.8787 157.4997,7.5687 154.6184,4.9262 C 152.4309,2.93 149.8334,1.4112 147.1097,0.2687 C 146.8947,0.1767 146.6697,0.0875 146.4497,0 C 143.0959,4.0187 131.4847,7.0162 131.4847,15.44 C 131.4847,18.73 133.5647,21.8112 136.6159,23.0475 C 138.3884,23.7162 140.1559,23.75 141.9284,23.1537 C 143.5059,22.6362 144.7997,21.66 145.8784,20.4737 C 149.2872,16.6987 150.6734,10.855 154.8584,10.855 C 158.6859,10.855 159.2034,13.5787 159.4484,15.0537 C 159.4484,15.0437 159.4484,14.9462 159.4384,14.805" fill="#0070ad" />
        <path d="M 153.2175,21.2782 c 3.4962,0 6.1962,-2.8462 6.2312,-6.225 -0.245,-1.475 -0.7625,-4.2037 -4.585,-4.2037 -4.19,0 -5.5762,5.8487 -8.985,9.6237 -0.2737,2.1438 -2.305,4.0625 -4.8387,4.385 0.62,0.6488 2.0025,1.0013 3.6525,1.0013 3.0175,0 6.67,-0.9088 8.5837,-2.7988 -2.5537,0.035 -4.1937,-1.6062 -4.355,-3.8762 1.245,1.5087 2.6513,2.0937 4.2963,2.0937" fill="#12abdb" />
      </svg>`;

const newLogoSvg = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(79, 70, 229, 0.2));">
        <rect width="36" height="36" rx="8" fill="#4f46e5"/>
        <circle cx="18" cy="18" r="7" fill="#ef4444"/>
        <path d="M18 6V11M18 25V30M6 18H11M25 18H30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

src = src.replace(oldLogoSvg, newLogoSvg);
src = src.replace('<span class="logo-title">Capgemini NRT Recorder</span>', '<span class="logo-title">FlowTrace Recorder</span>');
src = src.replace('<span class="logo-subtitle">Get the future you want</span>', '<span class="logo-subtitle">Automated Test & Flow Report</span>');

fs.writeFileSync('/Users/tommasoianniciello/Desktop/VSW/Agent/flowtrace-recorder/sidepanel-report.js', src, 'utf8');
console.log('Successfully created sidepanel-report.js! Lines:', src.split('\n').length);
