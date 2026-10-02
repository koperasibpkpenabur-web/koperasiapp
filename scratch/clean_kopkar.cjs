const fs = require('fs');

let content = fs.readFileSync('src/pages/Kopkar/KopkarPesanan.tsx', 'utf8');

// Desktop duplicate approved
content = content.replace(/                            \{order\.status === 'approved' && !order\.status\.includes\('pending'\) && \([\s\S]*?                            \}\)\n/g, '');

// Desktop duplicate shipped
content = content.replace(/                            \{order\.status === 'shipped' && !order\.status\.includes\('pending'\) && \([\s\S]*?                            \}\)\n/g, '');

// Mobile duplicate approved
content = content.replace(/                      \{order\.status === 'approved' && !order\.status\.includes\('pending'\) && \([\s\S]*?                      \}\)\n/g, '');

// Mobile duplicate shipped
content = content.replace(/                      \{order\.status === 'shipped' && !order\.status\.includes\('pending'\) && \([\s\S]*?                      \}\)\n/g, '');

fs.writeFileSync('src/pages/Kopkar/KopkarPesanan.tsx', content);
