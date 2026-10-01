import re

with open('src/pages/Kopkar/KopkarPesanan.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Truncate items in Active Orders Desktop
content = content.replace(
    '''{order.items.map((it, idx) => {''',
    '''{order.items.slice(0, 1).map((it, idx) => {'''
)
# Add "+ X item lainnya" after the list
content = content.replace(
    '''                          <ul className="order-items-list" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
                            {order.items.slice(0, 1).map((it, idx) => {
                              const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                              const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                              const unsentQty = Math.max(0, it.quantity - shippedQty);
                              return (
                              <li key={idx}>
                                <div style={{ fontWeight: 600 }}>{it.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                                </div>
                              </li>
                            )})}
                          </ul>''',
    '''                          <ul className="order-items-list" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
                            {order.items.slice(0, 1).map((it, idx) => {
                              const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                              const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                              const unsentQty = Math.max(0, it.quantity - shippedQty);
                              return (
                              <li key={idx}>
                                <div style={{ fontWeight: 600 }}>{it.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                                </div>
                              </li>
                            )})}
                            {order.items.length > 1 && (
                              <li style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                                + {order.items.length - 1} item lainnya
                              </li>
                            )}
                          </ul>'''
)


# Add Detail button to active orders desktop
content = content.replace(
    '''                          <div className="kopkar-actions-col">
                            {order.status === 'pending' && (''',
    '''                          <div className="kopkar-actions-col">
                            <div style={{ marginBottom: '8px' }}>
                              <button
                                className="btn-detail-dots"
                                title="Lihat Detail Pesanan"
                                onClick={() => setDetailOrder(order)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                              >
                                ⋮ Detail
                              </button>
                            </div>
                            {order.status === 'pending' && ('''
)

# Add Detail button to active orders mobile
content = content.replace(
    '''                    <div className="mobile-card-actions">
                      {order.status === 'pending' && (''',
    '''                    <div className="mobile-card-actions">
                      <div style={{ marginBottom: '12px' }}>
                        <button
                          className="btn-detail-dots full-width-touch"
                          onClick={() => setDetailOrder(order)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                        >
                          ⋮ Detail Pesanan
                        </button>
                      </div>
                      {order.status === 'pending' && ('''
)

# Also fix the order items list in mobile view (it might have been affected by the slice above, but we need to append the "+ X item")
content = content.replace(
    '''                      <ul className="order-items-list">
                        {order.items.slice(0, 1).map((it, idx) => {
                          const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                          const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                          const unsentQty = Math.max(0, it.quantity - shippedQty);
                          return (
                          <li key={idx}>
                            <div style={{ fontWeight: 600 }}>{it.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                              Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                            </div>
                          </li>
                        )})}
                      </ul>''',
    '''                      <ul className="order-items-list">
                        {order.items.slice(0, 1).map((it, idx) => {
                          const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                          const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                          const unsentQty = Math.max(0, it.quantity - shippedQty);
                          return (
                          <li key={idx}>
                            <div style={{ fontWeight: 600 }}>{it.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                              Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                            </div>
                          </li>
                        )})}
                        {order.items.length > 1 && (
                          <li style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                            + {order.items.length - 1} item lainnya
                          </li>
                        )}
                      </ul>'''
)

# TAB 2 (Received Orders)
content = re.sub(
    r'(<ul className="order-items-list"[^>]*>)\s*\{order\.items\.map\(\(it, idx\) => \{(.*?)\}\)\}\s*</ul>',
    r'\1\n                            {order.items.slice(0, 1).map((it, idx) => {\2})}\n                            {order.items.length > 1 && (\n                              <li style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic", marginTop: "4px" }}>\n                                + {order.items.length - 1} item lainnya\n                              </li>\n                            )}\n                          </ul>',
    content,
    flags=re.DOTALL
)

# Fix Detail button missing in other active orders if they are not pending
# In desktop:
content = content.replace(
    '''                            {order.status === 'approved' && (''',
    '''                            {order.status === 'approved' && !order.status.includes('pending') && (
                              <div style={{ marginBottom: '8px' }}>
                                <button
                                  className="btn-detail-dots"
                                  title="Lihat Detail Pesanan"
                                  onClick={() => setDetailOrder(order)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                                >
                                  ⋮ Detail
                                </button>
                              </div>
                            )}
                            {order.status === 'approved' && ('''
)
content = content.replace(
    '''                            {order.status === 'shipped' && (''',
    '''                            {order.status === 'shipped' && !order.status.includes('pending') && (
                              <div style={{ marginBottom: '8px' }}>
                                <button
                                  className="btn-detail-dots"
                                  title="Lihat Detail Pesanan"
                                  onClick={() => setDetailOrder(order)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                                >
                                  ⋮ Detail
                                </button>
                              </div>
                            )}
                            {order.status === 'shipped' && ('''
)

# In mobile:
content = content.replace(
    '''                      {order.status === 'approved' && (''',
    '''                      {order.status === 'approved' && !order.status.includes('pending') && (
                        <div style={{ marginBottom: '12px' }}>
                          <button
                            className="btn-detail-dots full-width-touch"
                            onClick={() => setDetailOrder(order)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                          >
                            ⋮ Detail Pesanan
                          </button>
                        </div>
                      )}
                      {order.status === 'approved' && ('''
)
content = content.replace(
    '''                      {order.status === 'shipped' && (''',
    '''                      {order.status === 'shipped' && !order.status.includes('pending') && (
                        <div style={{ marginBottom: '12px' }}>
                          <button
                            className="btn-detail-dots full-width-touch"
                            onClick={() => setDetailOrder(order)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                          >
                            ⋮ Detail Pesanan
                          </button>
                        </div>
                      )}
                      {order.status === 'shipped' && ('''
)

with open('src/pages/Kopkar/KopkarPesanan.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
