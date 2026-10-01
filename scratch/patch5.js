import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const groupedCatalog = useMemo[\s\S]*?\n  \}, \[orderLevelFilter\]\);\n/, '');

fs.writeFileSync(path, content, 'utf8');
console.log('Removed groupedCatalog.');
