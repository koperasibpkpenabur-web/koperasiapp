import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/{!orderPhase\.includes\('Tambahan'\) \? \(\s*<div className="matrix-tables-container"/, '<div className="matrix-tables-container"');

content = content.replace(/<\/div>\s*\) : \(\s*<div className="school-order-items-table">[\s\S]*?<\/div>\s*\)\}\s*\{orderPhase\.includes\('Tambahan'\) && \(\s*<button[\s\S]*?<\/button>\s*\)\}/, '</div>');

fs.writeFileSync(path, content, 'utf8');
console.log('Patched matrix rendering.');
