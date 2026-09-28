import React from 'react';
import type { OrderItem } from '../types';

export const OrderItemsList: React.FC<{ items: OrderItem[] }> = ({ items }) => {
  // Group items by name
  const grouped = items.reduce((acc, it) => {
    if (!acc[it.name]) {
      acc[it.name] = { type: it.type, total: 0, sizes: [] };
    }
    acc[it.name].total += it.quantity;
    if (it.size) {
      acc[it.name].sizes.push(`${it.size} (${it.quantity} pcs)`);
    } else {
      acc[it.name].sizes.push(`- (${it.quantity} pcs)`);
    }
    return acc;
  }, {} as Record<string, { type: string; total: number; sizes: string[] }>);

  return (
    <ul className="order-items-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {Object.entries(grouped).map(([name, data], idx) => (
        <li key={idx} style={{ marginBottom: '8px' }}>
          <div>
            <span className={`item-type ${data.type}`} style={{ marginRight: '6px' }}>{data.type}</span>
            <strong style={{ color: '#1e293b' }}>{name}</strong>
            <span style={{ marginLeft: '4px', color: '#64748b' }}>({data.total} pcs)</span>
          </div>
          {data.sizes.length > 0 && data.sizes[0] !== '- (0 pcs)' && (
            <div style={{ fontSize: '0.8rem', color: '#475569', marginLeft: '24px', marginTop: '4px' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Ukuran:</span> {data.sizes.join(', ')}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};
