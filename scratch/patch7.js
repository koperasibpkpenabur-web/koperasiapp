import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

// Insert cartPhase useState below notes useState
content = content.replace(
  "const [notes, setNotes] = useState('');",
  "const [notes, setNotes] = useState('');\n  const [cartPhase, setCartPhase] = useState<string>('');"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Added cartPhase state.');
