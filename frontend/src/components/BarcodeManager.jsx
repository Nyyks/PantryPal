import { useState } from 'react';
import { api } from '../utils/api';
import { Plus, X, ScanBarcode } from 'lucide-react';

export default function BarcodeManager({ productId, barcodesDetailed = [], addToast, onUpdate }) {
  const [newBarcode, setNewBarcode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newBarcode.trim()) return;
    setAdding(true);
    try {
      await api.addProductBarcode(productId, newBarcode.trim(), newLabel.trim() || null);
      const updated = [...barcodesDetailed, { barcode: newBarcode.trim(), label: newLabel.trim() || null }];
      onUpdate(updated);
      setNewBarcode('');
      setNewLabel('');
      addToast('Barcode added', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (bc) => {
    try {
      const result = await api.removeProductBarcode(productId, bc);
      // Rebuild detailed from plain barcodes returned
      const plain = result.barcodes || [];
      const updated = barcodesDetailed.filter(b => plain.includes(b.barcode));
      onUpdate(updated);
      addToast('Barcode removed', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div style={{
      marginBottom: 16, padding: 14, border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)',
    }}>
      <label style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ScanBarcode size={14} /> Barcodes / EAN Codes
      </label>

      {barcodesDetailed.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          No barcodes assigned. Add one below.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {barcodesDetailed.map((b) => (
            <div key={b.barcode} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{b.barcode}</div>
                {b.label && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>{b.label}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(b.barcode)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 4, display: 'flex', color: 'var(--text-muted)',
                  borderRadius: '50%', flexShrink: 0,
                }}
                onMouseOver={e => e.currentTarget.style.color = 'var(--red)'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Remove this barcode"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newBarcode}
          onChange={e => setNewBarcode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add barcode..."
          inputMode="numeric"
          style={{ flex: 1, fontSize: 12, padding: '7px 10px' }}
        />
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Label (e.g. Coop Bio 1L)"
          style={{ flex: 1, fontSize: 12, padding: '7px 10px' }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={adding || !newBarcode.trim()}
          style={{ padding: '6px 10px', fontSize: 12 }}
        >
          <Plus size={12} />
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        Add multiple barcodes to group different variants (e.g. different brands of milk) under one product. The label helps you identify which variant was scanned.
      </p>
    </div>
  );
}
