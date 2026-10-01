import re

filepath = "d:/SISTEM KOPERASI/src/pages/Kopkar/KopkarPelunasan.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Add link to UI in KopkarPelunasan for Desktop
old_desktop = """                            <div>
                              <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                              <button
                                className="btn-pay-action"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                💵 Konfirmasi Pelunasan
                              </button>
                            </div>"""

new_desktop = """                            <div>
                              {order.paidNotes && order.paidNotes.includes('[BUKTI_TRANSFER]') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span className="badge-pay-paid" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>⏳ Menunggu Verifikasi</span>
                                  <a href={order.paidNotes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6', textDecoration: 'underline' }}>Lihat Bukti Transfer</a>
                                  <button
                                    className="btn-pay-action"
                                    style={{ marginTop: '4px' }}
                                    onClick={() => handleOpenPaymentModal(order)}
                                  >
                                    ✅ Verifikasi Lunas
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                                  <button
                                    className="btn-pay-action"
                                    style={{ marginTop: '6px' }}
                                    onClick={() => handleOpenPaymentModal(order)}
                                  >
                                    💵 Konfirmasi Pelunasan
                                  </button>
                                </>
                              )}
                            </div>"""

code = code.replace(old_desktop, new_desktop)

# Add link to UI in KopkarPelunasan for Mobile
old_mobile = """                        <div>
                          <div className="badge-pay-unpaid">🔴 Sekolah Belum Melunasi</div>
                          <button
                            className="btn-pay-action full-width-touch"
                            style={{ marginTop: '6px' }}
                            onClick={() => handleOpenPaymentModal(order)}
                          >
                            💵 Konfirmasi Pelunasan Sekolah
                          </button>
                        </div>"""

new_mobile = """                        <div>
                          {order.paidNotes && order.paidNotes.includes('[BUKTI_TRANSFER]') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <div className="badge-pay-paid" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', textAlign: 'center' }}>⏳ Menunggu Verifikasi</div>
                               <a href={order.paidNotes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9rem', color: '#3b82f6', textDecoration: 'underline', textAlign: 'center', display: 'block' }}>Lihat Foto Bukti Transfer</a>
                               <button
                                className="btn-pay-action full-width-touch"
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                ✅ Verifikasi Lunas
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="badge-pay-unpaid">🔴 Sekolah Belum Melunasi</div>
                              <button
                                className="btn-pay-action full-width-touch"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                💵 Konfirmasi Pelunasan Sekolah
                              </button>
                            </>
                          )}
                        </div>"""

code = code.replace(old_mobile, new_mobile)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("KopkarPelunasan UI updated")
