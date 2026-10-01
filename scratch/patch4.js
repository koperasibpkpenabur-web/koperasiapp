import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

const toRemove = [
  'handleAddItem',
  'handleRemoveItem',
  'handleProductSelect',
  'handleQuantityChange',
  'handleItemNameChange',
  'handleItemTypeChange'
];

for (const name of toRemove) {
  const regex = new RegExp(`const ${name} = \\(.*?\\) => \\{[\\s\\S]*?\\n  \\};`, 'g');
  content = content.replace(regex, '');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Removed unused functions using regex!');
