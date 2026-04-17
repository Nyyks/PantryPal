import { useState } from 'react';
import { api } from '../utils/api';
import { Plus, X, ScanBarcode } from 'lucide-react';

export default function BarcodeManager({ productId, barcodes = [], addToast, onUpdate }) {
  const [newBarcode, setNewBarcode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newBarcode.trim()) return;
    setAdding(true);
    try {
      await api.addProductBarcode(productId, newBarcode.trim(), newLabel.trim() || null);
      const updated = [...barcodes, newBarcode.trim()];
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
      onUpdate(result.barcodes);
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

      {barcodes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          No barcodes assigned. Add one below.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {barcodes.map((bc) => (
            <div key={bc} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px 4px 10px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 99, fontSize: 12, fontFamily: 'var(--font-mono)',
            }}>
              {bc}
              <button
                type="button"
                onClick={() => handleRemove(bc)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 2, display: 'flex', color: 'var(--text-muted)',
                  borderRadius: '50%',
                }}
                onMouseOver={e => e.currentTarget.style.color = 'var(--red)'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Remove this barcode"
              >
                <X size={12} />
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
          placeholder="Label (optional)"
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
        Add multiple barcodes to group different variants (e.g. different brands of milk) under one product.
      </p>
    </div>
  );
}
