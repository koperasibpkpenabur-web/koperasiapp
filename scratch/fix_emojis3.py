import os
import glob

replacements = {
    # known from previous script (safe ones only)
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
    "â Œ": "❌",
    
    # New ones found:
    "ΓÅ│": "⏳",
    "Γ£à": "✅",
    
    # Specific text strings
    "?????? Konfirmasi Kirim Barang": "✅ Konfirmasi Kirim Barang",
    "???? Input Pengiriman Barang": "📦 Input Pengiriman Barang",
    "???? Konfirmasi Pelunasan": "💵 Konfirmasi Pelunasan",
    "???? Kirim Barang": "🚚 Kirim Barang",
    "???? Dikirim": "🚚 Dikirim",
}

def fix_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        new_content = content
        for bad, good in replacements.items():
            new_content = new_content.replace(bad, good)
            
        if new_content != content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

files = glob.glob('src/**/*.tsx', recursive=True) + glob.glob('src/**/*.ts', recursive=True)
for filepath in files:
    fix_file(filepath)
