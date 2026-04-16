import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { ShoppingCart, Plus, Trash2, Check, ScanBarcode, CheckCheck, Search, Package } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';

export default function ShoppingListPage({ addToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shoppingMode, setShoppingMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', quantity: 1, unit: '', product_id: null });
  const [scanResult, setScanResult] = useState(null);

  // Product search for quick-add
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadItems = () => {
    api.getShoppingList().then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(); }, []);

  // Debounced product search
  useEffect(() => {
    if (!productSearch || productSearch.length < 2) {
      setProductResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      api.getProducts(productSearch)
        .then(setProductResults)
        .catch(() => setProductResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const handleToggle = async (item) => {
    const newChecked = !item.checked;
    try {
      await api.updateShoppingItem(item.id, { checked: newChecked });
      setItems(items.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));

      if (newChecked) {
        try {
          if (item.product_id) {
            // Linked to an existing product — just add to inventory
            await api.addToInventory({ product_id: item.product_id, quantity: item.quantity || 1 });
            addToast(`${item.name} added to inventory`, 'success');
          } else {
            // Unlinked — create a new product so it lands in inventory
            const newProduct = await api.createProduct({
              name: item.name,
              quantity_unit: item.unit || 'pcs',
              default_quantity: item.quantity || 1,
            });
            await api.addToInventory({ product_id: newProduct.id, quantity: item.quantity || 1 });
            // Link the shopping item back to the new product for future scans
            await api.updateShoppingItem(item.id, { product_id: newProduct.id });
            addToast(`${item.name} registered and added to inventory`, 'success');
          }
        } catch (err) {
          // Non-critical — keep item checked off
          addToast(`Checked off, but couldn't add to inventory: ${err.message}`, 'error');
        }
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteShoppingItem(id);
      setItems(items.filter(i => i.id !== id));
      addToast('Item removed', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    try {
      const item = await api.addToShoppingList(addForm);
      setItems([...items, item]);
      setShowAdd(false);
      setAddForm({ name: '', quantity: 1, unit: '', product_id: null });
      setProductSearch('');
      setProductResults([]);
      addToast('Item added', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleQuickAddProduct = async (product) => {
    // Check if already on list
    const existing = items.find(i => i.product_id === product.id && !i.checked);
    if (existing) {
      addToast(`${product.name} is already on the list`, 'info');
      return;
    }
    try {
      const item = await api.addToShoppingList({
        name: product.name,
        product_id: product.id,
        quantity: product.default_quantity || 1,
        unit: product.quantity_unit,
      });
      setItems([...items, item]);
      setProductSearch('');
      setProductResults([]);
      addToast(`${product.name} added`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const selectProductForForm = (product) => {
    setAddForm({
      name: product.name,
      quantity: product.default_quantity || 1,
      unit: product.quantity_unit || '',
      product_id: product.id,
    });
    setProductSearch('');
    setProductResults([]);
  };

  const handleClearChecked = async () => {
    try {
      await api.clearChecked();
      setItems(items.filter(i => !i.checked));
      addToast('Cleared checked items', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleShoppingScan = useCallback(async (barcode) => {
    try {
      const result = await api.shoppingScan(barcode, true);
      setScanResult(result);
      loadItems();
      if (result.checked_items.length > 0) {
        addToast(`Checked off: ${result.product.name}`, 'success');
      } else {
        addToast(`${result.product.name} scanned (not on list — added to inventory)`, 'info');
      }
    } catch (err) {
      setScanResult({ error: true, message: err.message });
      addToast(err.message, 'error');
    }
  }, [addToast]);

  const uncheckedItems = items.filter(i => !i.checked);
  const checkedItems = items.filter(i => i.checked);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Shopping List</h2>
        <div className="page-header-actions">
          <button
            className={`btn ${shoppingMode ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => { setShoppingMode(!shoppingMode); setScanResult(null); }}
          >
            <ScanBarcode size={16} /> {shoppingMode ? 'Exit Shopping' : 'Shopping Mode'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Quick-add search bar (always visible) */}
      <div style={{ marginBottom: 20, position: 'relative' }}>
        <div className="search-bar">
          <Search />
          <input
            placeholder="Quick add — search registered products..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
          />
        </div>
        {productResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', marginTop: 4, maxHeight: 240,
            overflowY: 'auto', boxShadow: 'var(--shadow)',
          }}>
            {productResults.map(p => (
              <button
                key={p.id}
                onClick={() => handleQuickAddProduct(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', border: 'none', background: 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                  fontSize: 13, borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                {p.image_url ? (
                  <img src={p.image_url} className="product-img-sm" alt="" />
                ) : (
                  <div className="product-img-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={12} style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  {p.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand}</div>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  stock: {p.stock}
                </span>
              </button>
            ))}
          </div>
        )}
        {searchLoading && productSearch.length >= 2 && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <div className="spinner" style={{ width: 16, height: 16 }} />
          </div>
        )}
      </div>

      {shoppingMode && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="tag tag-green" style={{ fontSize: 14, padding: '6px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ScanBarcode size={16} /> SHOPPING MODE
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Scan products as you shop — items get checked off and added to inventory.
            </p>
          </div>
          <BarcodeScanner onScan={handleShoppingScan} active={shoppingMode} />
          {scanResult && !scanResult.error && (
            <div className="scan-result" style={{ borderLeft: '3px solid var(--green)' }}>
              {scanResult.product?.image_url && <img src={scanResult.product.image_url} className="product-img" alt="" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{scanResult.product.name}</div>
                {scanResult.product.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{scanResult.product.brand}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {scanResult.checked_items.length > 0 && <span className="tag tag-green">Checked off list</span>}
                  {scanResult.added_to_inventory && <span className="tag tag-accent">Added to inventory</span>}
                </div>
              </div>
            </div>
          )}
          {scanResult?.error && (
            <div className="scan-result" style={{ borderLeft: '3px solid var(--red)' }}>
              <span style={{ color: 'var(--red)', fontSize: 13 }}>{scanResult.message}</span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={48} />
          <h3>Shopping list is empty</h3>
          <p>Search for products above, or items will be auto-added when products run low.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            {uncheckedItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                All items checked off!
              </div>
            ) : (
              uncheckedItems.map(item => (
                <div key={item.id} className="shopping-item">
                  <button className="checkbox" onClick={() => handleToggle(item)}>
                    {item.checked && <Check size={14} color="#fff" />}
                  </button>
                  <span className="shopping-item-name">
                    {item.name}
                    {item.auto_added && <span className="shopping-item-tag" style={{ marginLeft: 8 }}>auto</span>}
                    {item.product_id && <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px' }}>linked</span>}
                  </span>
                  <span className="shopping-item-qty">
                    {item.quantity} {item.unit || ''}
                  </span>
                  <button className="btn-icon" style={{ padding: 4, border: 'none' }} onClick={() => handleDelete(item.id)} title="Remove from list">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {checkedItems.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Checked ({checkedItems.length})
                </span>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleClearChecked}>
                  <CheckCheck size={12} /> Clear checked
                </button>
              </div>
              <div className="card" style={{ padding: 0, opacity: 0.6 }}>
                {checkedItems.map(item => (
                  <div key={item.id} className="shopping-item checked">
                    <button className="checkbox checked" onClick={() => handleToggle(item)}>
                      <Check size={14} color="#fff" />
                    </button>
                    <span className="shopping-item-name">{item.name}</span>
                    <span className="shopping-item-qty">{item.quantity} {item.unit || ''}</span>
                    <button className="btn-icon" style={{ padding: 4, border: 'none' }} onClick={() => handleDelete(item.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Manual add modal with product search */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setProductSearch(''); setProductResults([]); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3>Add to Shopping List</h3>

            {/* Search to link a product */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label>Search Product (optional)</label>
              <input
                placeholder="Type to search registered products..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              {productResults.length > 0 && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', marginTop: 2, maxHeight: 180,
                  overflowY: 'auto', boxShadow: 'var(--shadow)',
                }}>
                  {productResults.map(p => (
                    <button key={p.id} onClick={() => selectProductForForm(p)}
                      style={{
                        display: 'block', width: '100%', padding: '8px 12px', border: 'none',
                        background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
                        textAlign: 'left', fontSize: 13, borderBottom: '1px solid var(--border)',
                        fontFamily: 'var(--font-sans)',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      {p.brand && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{p.brand}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label>Item Name *</label>
                <input required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" step="any" min="0.1" value={addForm.quantity} onChange={e => setAddForm({ ...addForm, quantity: parseFloat(e.target.value) || 1 })} />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input placeholder="pcs, kg, L..." value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })} />
                </div>
              </div>
              {addForm.product_id && (
                <p style={{ fontSize: 11, color: 'var(--green)', marginBottom: 12 }}>
                  Linked to product — will be added to inventory when checked off.
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setProductSearch(''); setProductResults([]); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
