import fs from 'fs';

const path = 'src/pages/School/SchoolPemesanan.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add cartPhase state
content = content.replace(
  "const [cartItems, setCartItems] = useState<OrderItem[]>([]);",
  "const [cartItems, setCartItems] = useState<OrderItem[]>([]);\n  const [cartPhase, setCartPhase] = useState<string>('');"
);

// 2. Lock cartPhase on handleCreateSubmit
content = content.replace(
  "setCartItems(prev => [...prev, ...itemsToSubmit]);",
  "if (cartItems.length === 0) { setCartPhase(orderPhase); }\n    setCartItems(prev => [...prev, ...itemsToSubmit]);"
);

// 3. Use cartPhase or orderPhase in createOrder inside handleCartSubmit
content = content.replace(
  "orderPhase: orderPhase,",
  "orderPhase: cartPhase || orderPhase,"
);

// 4. Clear cartPhase when cart is cleared (e.g. after successful order)
content = content.replace(
  "setCartItems([]);\n      setNotes('');",
  "setCartItems([]);\n      setCartPhase('');\n      setNotes('');"
);

content = content.replace(
  "setCartItems([]); // clear cart if cancel all",
  "setCartItems([]);\n    setCartPhase(''); // clear cart if cancel all"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched cartPhase logic.');
