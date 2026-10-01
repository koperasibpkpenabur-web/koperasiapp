import os

files = [
    "src/pages/Kopkar/KopkarPesanan.tsx",
    "src/pages/School/SchoolPemesanan.tsx",
    "src/pages/School/SchoolPayment.tsx",
    "src/pages/School/SchoolDashboard.tsx",
    "src/pages/Kopkar/KopkarPelunasan.tsx",
    "src/components/layout/Sidebar.tsx"
]

replacements = {
    "Γ£ô": "✅",
    "âš\xA0ï¸\x8F": "⚠️",
    "âš\xA0ï¸\x8f": "⚠️",
    "ΓÜá": "⚠️",
    "ΓÜáï¸\x8F": "⚠️",
    "ðŸ“¦": "📦",
    "ðŸ“„": "📄",
    "ðŸšš": "🚚",
    "âœ…": "✅",
    "â Œ": "❌",
    "ðŸ’µ": "💵",
    "ðŸ›’": "🛒",
    "ðŸ’³": "💳",
    "ðŸ“Š": "📊",
    "â†©ï¸\x8F": "↩️",
    "ðŸ \xA0": "🏠",
    "âš\xA0": "⚠️",
    "â†©ï¸\x8f": "↩️",
    "ðŸ”\x84": "🔄",
    "ðŸš\x9A": "🚚",
    "ðŸ“\x8B": "📋",
    "ðŸ\x93\x8B": "📋",
    "ðŸ\x93\xA6": "📦",
    "ðŸ\x93\x84": "📄",
    "ðŸ\x9A\x9A": "🚚",
    "â\x9C\x85": "✅",
    "â\x9D\x8C": "❌",
    "ðŸ\x92\xB5": "💵",
    "ðŸ\x9B\x92": "🛒",
    "ðŸ\x92\xB3": "💳",
    "ðŸ\x93\x8A": "📊",
    "â†\xA9ï¸\x8F": "↩️",
    "ðŸ\x8F\xA0": "🏠",
    "âš\xA0ï¸\x8F": "⚠️",
    "â†\xA9ï¸\x8f": "↩️",
    "ðŸ”\x84": "🔄",
    "ðŸ\x9A\x9A": "🚚",
    "o.": "📦",
    "dY`?": "✅",
    "?3": "⏳",
    "dYss": "🚚",
    "?O": "❌",
    "dYs": "❌",
    "dY"'": "💵",
    "dYY": "✅",
    "+c,?": "↩️",
    "dY"S": "📊",
    "dY'3": "💳",
    "dY?'": "🛒",
    "dY?": "🏠",
    "dYZ%": "🛒",
    "o ": "❌",
    ",1,?": "⚠️",
    "?"": "👉",
    "+?": "⬅️",
    "+'": "➡️",
    "o": "X",
    "dY>": "🛒",
    "dY'": "💳",
    "dY\"": "📊",
    "dY^": "📈",
}

for filepath in files:
    full_path = os.path.join("d:/SISTEM KOPERASI", filepath)
    if not os.path.exists(full_path):
        continue
    
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    for bad, good in replacements.items():
        content = content.replace(bad, good)
        
    # Also manual replace the specific one
    content = content.replace("?????? Konfirmasi Kirim Barang", "✅ Konfirmasi Kirim Barang")
    content = content.replace("???? Input Pengiriman Barang", "📦 Input Pengiriman Barang")
    content = content.replace("???? Konfirmasi Pelunasan", "💵 Konfirmasi Pelunasan")
    content = content.replace("???? Kirim Barang", "🚚 Kirim Barang")
    content = content.replace("???? Dikirim", "🚚 Dikirim")
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Fixed emojis!")
