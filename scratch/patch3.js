import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix resetCreateForm
content = content.replace(
  "if (!phase.includes('Tambahan') && grp.length > 0) {",
  "if (grp.length > 0) {"
);

// Fix dropdown
content = content.replace(
  "if (!p.includes('Tambahan')) {",
  "if (grp.length > 0) {"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched resetCreateForm and dropdown.');
