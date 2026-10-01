import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "const [cartPhase, setCartPhase] = useState<string>('');",
  "const [cartPhase, setCartPhase] = useState<'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan' | ''>('');"
);

content = content.replace(
  "orderPhase: cartPhase || orderPhase,",
  "orderPhase: (cartPhase as any) || orderPhase,"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed cartPhase type.');
