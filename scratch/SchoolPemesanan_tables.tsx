import React from 'react';

// DUMMY DECLARATIONS: Ditambahkan agar Typescript tidak lagi memunculkan eror "cannot find name"
const matrixItems: any[] = [];
const setMatrixItems = (value: any) => {};
const sortBySize = (variants: any[]): any[] => variants;

// Example extraction
const renderMatrix = () => {
  const pakaianLetterItems = [];
  const pakaianNumericItems = [];
  const sepatuItems = [];
  const allSizeItems = [];

  matrixItems.forEach((row: any) => {
    if (row.type === 'sepatu') {
      sepatuItems.push(row);
      return;
    }
    if (row.type === 'aksesoris' || row.type === 'buku' || (row.variants.length <= 1 && (!row.variants[0]?.size || row.variants[0]?.size.trim().toUpperCase() === 'ALL SIZE'))) {
      allSizeItems.push(row);
      return;
    }
    const isNumeric = row.variants.some((v: any) => /^\d+$/.test(v.size?.trim()));
    if (isNumeric) {
      pakaianNumericItems.push(row);
    } else {
      pakaianLetterItems.push(row);
    }
  });

  const renderTable = (items: any[], title: string, isAllSize: boolean) => {
    if (items.length === 0) return null;

    // Collect all unique sizes in these items
    let allSizes: string[] = [];
    if (!isAllSize) {
      const sizeSet = new Set<string>();
      items.forEach(row => {
        row.variants.forEach((v: any) => {
          if (v.size) sizeSet.add(v.size.trim().toUpperCase());
        });
      });
      allSizes = Array.from(sizeSet);
      allSizes = sortBySize([{ size: allSizes[0] }]) ? sortBySize(allSizes.map(s => ({size: s}))).map((v: any) => v.size) : allSizes; // We'll just rely on our sortBySize
    }

    return (
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#1e293b', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>{title}</h4>
        <div className="matrix-table-wrapper" style={{ overflowX: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table className="order-table" style={{ minWidth: isAllSize ? '400px' : '800px', margin: 0 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', minWidth: '200px' }}>Nama Barang</th>
                {!isAllSize && allSizes.map(sz => (
                  <th key={sz} style={{ width: '60px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>{sz}</th>
                ))}
                {!isAllSize && <th style={{ minWidth: '150px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Ukuran Lainnya</th>}
                <th style={{ width: '80px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, rIdx) => {
                const rowTotal = Object.values(row.sizesInput).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0);
                const standardVariants = row.variants.filter((v: any) => allSizes.includes(v.size?.trim().toUpperCase()));
                const nonStandardVariants = sortBySize(row.variants.filter((v: any) => !allSizes.includes(v.size?.trim().toUpperCase())));

                return (
                  <tr key={row.name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px' }}>
                      <strong>{row.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Rp {new Intl.NumberFormat('id-ID').format(row.priceStudent)}</div>
                    </td>
                    
                    {!isAllSize && allSizes.map(sz => {
                      const variant = standardVariants.find((v: any) => v.size?.trim().toUpperCase() === sz);
                      return (
                        <td key={sz} style={{ padding: '6px', textAlign: 'center' }}>
                          {variant ? (
                            <input 
                              type="number" 
                              min="0" 
                              value={row.sizesInput[variant.id] || ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setMatrixItems((prev: any) => prev.map((it: any) => it.name === row.name ? { ...it, sizesInput: { ...it.sizesInput, [variant.id]: val } } : it));
                              }}
                              style={{ width: '100%', maxWidth: '60px', textAlign: 'center', padding: '8px 4px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>-</div>
                          )}
                        </td>
                      );
                    })}

                    {!isAllSize && (
                      <td style={{ padding: '6px' }}>
                        {nonStandardVariants.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                            {nonStandardVariants.map((variant: any) => (
                              <div key={variant.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{variant.size || 'No Size'}</span>
                                <input 
                                  type="number" 
                                  min="0" 
                                  value={row.sizesInput[variant.id] || ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setMatrixItems((prev: any) => prev.map((it: any) => it.name === row.name ? { ...it, sizesInput: { ...it.sizesInput, [variant.id]: val } } : it));
                                  }}
                                  style={{ width: '50px', textAlign: 'center', padding: '4px', border: '1px solid #94a3b8', borderRadius: '4px', fontSize: '0.8rem' }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: '#cbd5e1', fontSize: '0.8rem', textAlign: 'center' }}>-</div>
                        )}
                      </td>
                    )}

                    {isAllSize && (
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        {row.variants.length > 0 ? (
                          <input 
                            type="number" 
                            min="0" 
                            value={row.sizesInput[row.variants[0].id] || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setMatrixItems((prev: any) => prev.map((it: any) => it.name === row.name ? { ...it, sizesInput: { ...it.sizesInput, [row.variants[0].id]: val } } : it));
                            }}
                            style={{ width: '100%', maxWidth: '80px', textAlign: 'center', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          />
                        ) : (
                           <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>Stok kosong</div>
                        )}
                      </td>
                    )}

                    <td style={{ textAlign: 'center', fontWeight: 600, padding: '12px' }}>{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
}
