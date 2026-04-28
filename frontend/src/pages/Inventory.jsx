import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { Package, Plus, Minus, Search, ScanBarcode, X, Edit, Trash2, ChevronDown, ChevronRight, MapPin, Globe, Merge } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import ComboSelect from '../components/ComboSelect';
import BarcodeManager from '../components/BarcodeManager';
import { usePrefs } from '../hooks/usePrefs';

const UNITS = [
  { v: 'pcs', l: 'Pieces' },
  { v: 'pack', l: 'Pack' },
  { v: 'g', l: 'Grams' },
  { v: 'kg', l: 'Kilograms' },
  { v: 'ml', l: 'Milliliters' },
  { v: 'l', l: 'Liters' },
  { v: 'box', l: 'Box' },
  { v: 'bottle', l: 'Bottle' },
  { v: 'can', l: 'Can' },
];

const EMPTY_PRODUCT = { name: '', barcode: '', brand: '', category: '', image_url: '', quantity_unit: 'pcs', min_stock: 0, default_quantity: 1 };

export default function Inventory({ addToast }) {
  const { prefs } = usePrefs();
  const [inventory, setInventory] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locations, setLocations] = useState([]);
  const [scanMode, setScanMode] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({ ...EMPTY_PRODUCT });

  // OFF search dialog
  const [showOFFSearch, setShowOFFSearch] = useState(false);
  const [offQuery, setOffQuery] = useState('');
  const [offResults, setOffResults] = useState([]);
  const [offLoading, setOffLoading] = useState(false);

  const loadInventory = () => {
    Promise.all([
      api.getInventory(),
      api.getLocations().catch(() => []),
      api.getProducts(),
      api.getCategories().catch(() => []),
    ])
      .then(([inv, locs, prods, cats]) => {
        setInventory(inv); setLocations(locs); setAllProducts(prods); setCategories(cats);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInventory(); }, []);

  const handleScan = useCallback(async (barcode) => {
    try {
      if (scanMode === 'add') {
        const result = await api.addToInventory({ barcode, quantity: 1 });
        setScanResult({ type: 'success', message: `Added 1× ${result.product.name}`, product: result.product, barcode });
        addToast(`Added ${result.product.name}`, 'success');
        loadInventory();
      } else if (scanMode === 'consume') {
        const result = await api.consumeFromInventory({ barcode, quantity: 1 });
        setScanResult({
          type: result.consumed > 0 ? 'success' : 'warning',
          message: result.consumed > 0 ? `Used 1× ${result.product.name}` : `${result.product.name} not in stock`,
          product: result.product, barcode,
        });
        if (result.auto_added_to_shopping) addToast(`${result.product.name} added to shopping list`, 'info');
        loadInventory();
      }
    } catch (err) {
      // Special handling for unknown barcode — offer to create product
      if (err.message && err.message.toLowerCase().includes('not found')) {
        setScanResult({
          type: 'missing',
          message: `Barcode ${barcode} not recognized`,
          barcode,
        });
      } else {
        setScanResult({ type: 'error', message: err.message });
        addToast(err.message, 'error');
      }
    }
  }, [scanMode, addToast]);

  const handleCreateFromScan = () => {
    if (!scanResult?.barcode) return;
    setScanMode(null);
    setNewProduct({ ...EMPTY_PRODUCT, barcode: scanResult.barcode });
    setShowAddForm(true);
    setScanResult(null);
  };

  // Link unknown barcode to existing product
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkBarcode, setLinkBarcode] = useState('');
  const [linkSearch, setLinkSearch] = useState('');

  const handleLinkFromScan = () => {
    if (!scanResult?.barcode) return;
    setLinkBarcode(scanResult.barcode);
    setLinkSearch('');
    setShowLinkPicker(true);
  };

  const handleLinkToProduct = async (product) => {
    try {
      await api.addProductBarcode(product.id, linkBarcode);
      await api.addToInventory({ product_id: product.id, quantity: 1 });
      addToast(`Barcode linked to ${product.name} and added to inventory`, 'success');
      setShowLinkPicker(false);
      setScanResult(null);
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const linkFilteredProducts = allProducts.filter(p =>
    linkSearch.length >= 1 && p.name.toLowerCase().includes(linkSearch.toLowerCase())
  );

  // Merge product state
  const [showMerge, setShowMerge] = useState(null); // source product
  const [mergeSearch, setMergeSearch] = useState('');

  const mergeFilteredProducts = allProducts.filter(p =>
    mergeSearch.length >= 1 &&
    p.name.toLowerCase().includes(mergeSearch.toLowerCase()) &&
    p.id !== showMerge?.id
  );

  const handleMerge = async (target) => {
    if (!showMerge) return;
    if (!confirm(`Merge "${showMerge.name}" into "${target.name}"?\n\nAll barcodes, inventory entries, and references will be moved to "${target.name}". "${showMerge.name}" will be deleted.\n\nThis cannot be undone.`)) return;
    try {
      const result = await api.mergeProducts(showMerge.id, target.id);
      addToast(result.message, 'success');
      setShowMerge(null);
      setMergeSearch('');
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleManualAdd = async (productId, qty = 1) => {
    try {
      await api.addToInventory({ product_id: productId, quantity: qty });
      addToast('Stock added', 'success');
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleManualConsume = async (productId, qty = 1) => {
    try {
      const result = await api.consumeFromInventory({ product_id: productId, quantity: qty });
      if (result.auto_added_to_shopping) addToast(`${result.product.name} auto-added to shopping`, 'info');
      addToast('Consumed', 'success');
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      await api.createProduct(newProduct);
      addToast('Product created', 'success');
      setShowAddForm(false);
      setNewProduct({ ...EMPTY_PRODUCT });
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    try {
      await api.updateProduct(editProduct.id, editProduct);
      addToast('Product updated', 'success');
      setEditProduct(null);
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleUpdateEntry = async (e) => {
    e.preventDefault();
    if (!editEntry) return;
    try {
      await api.updateInventoryEntry(editEntry.id, {
        quantity: parseFloat(editEntry.quantity),
        location: editEntry.location,
        best_before: editEntry.best_before || null,
      });
      addToast('Entry updated', 'success');
      setEditEntry(null);
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!confirm('Remove this inventory entry?')) return;
    try {
      await api.deleteInventoryEntry(entryId);
      addToast('Entry removed', 'success');
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm('Delete this product and all its inventory entries?')) return;
    try {
      await api.deleteProduct(productId);
      addToast('Product deleted', 'success');
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  // OFF search
  const handleOFFSearch = async () => {
    if (offQuery.length < 2) return;
    setOffLoading(true);
    try {
      const results = await api.searchOFF(offQuery);
      setOffResults(results);
    } catch (err) { addToast(err.message, 'error'); }
    finally { setOffLoading(false); }
  };

  const handleOFFAdd = async (offProduct) => {
    try {
      // Create product from OFF data, then add 1 to inventory
      const created = await api.createProduct({
        name: offProduct.name,
        barcode: offProduct.barcode,
        brand: offProduct.brand,
        image_url: offProduct.image_url,
        category: offProduct.category,
        quantity_unit: 'pcs',
        default_quantity: 1,
      });
      await api.addToInventory({ product_id: created.id, quantity: 1 });
      addToast(`Added ${offProduct.name}`, 'success');
      setShowOFFSearch(false);
      setOffQuery('');
      setOffResults([]);
      loadInventory();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const inStockIds = new Set(inventory.map(i => i.product.id));
  const outOfStockProducts = allProducts.filter(p => !inStockIds.has(p.id));

  const displayItems = showAll
    ? [...inventory, ...outOfStockProducts.map(p => ({ product: p, entries: [] }))]
    : inventory;

  const filtered = displayItems.filter(i => {
    const matchesSearch = i.product.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.product.brand || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || i.product.category === categoryFilter;
    const matchesLocation = !locationFilter ||
      i.entries.some(e => (e.location || '').toLowerCase() === locationFilter.toLowerCase());
    return matchesSearch && matchesCategory && (showAll || matchesLocation);
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Inventory</h2>
        <div className="page-header-actions">
          <button className={`btn ${showAll ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowAll(!showAll)}>
            <Package size={16} /> {showAll ? 'All' : 'In Stock'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowOFFSearch(true); setOffResults([]); setOffQuery(''); }}>
            <Globe size={16} /> Search OFF
          </button>
          <button className={`btn ${scanMode === 'add' ? 'btn-success' : 'btn-secondary'}`} onClick={() => { setScanMode(scanMode === 'add' ? null : 'add'); setScanResult(null); }}>
            <ScanBarcode size={16} /> {scanMode === 'add' ? 'Stop' : 'Scan +'}
          </button>
          <button className={`btn ${scanMode === 'consume' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => { setScanMode(scanMode === 'consume' ? null : 'consume'); setScanResult(null); }}>
            <ScanBarcode size={16} /> {scanMode === 'consume' ? 'Stop' : 'Scan −'}
          </button>
          <button className="btn btn-primary" onClick={() => { setNewProduct({ ...EMPTY_PRODUCT }); setShowAddForm(true); }}>
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      {scanMode && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span className={`tag ${scanMode === 'add' ? 'tag-green' : 'tag-orange'}`} style={{ fontSize: 13, padding: '4px 14px' }}>
              {scanMode === 'add' ? 'REPLENISH MODE' : 'CONSUME MODE'}
            </span>
          </div>
          <BarcodeScanner onScan={handleScan} active={!!scanMode} />
          {scanResult && (
            <div className="scan-result" style={{
              borderLeft: `3px solid var(--${
                scanResult.type === 'success' ? 'green' :
                scanResult.type === 'error' ? 'red' :
                scanResult.type === 'missing' ? 'orange' : 'orange'
              })`
            }}>
              {scanResult.product?.image_url && <img src={scanResult.product.image_url} className="product-img" alt="" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{scanResult.message}</div>
                {scanResult.product && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Stock: {scanResult.product.stock} {scanResult.product.quantity_unit}
                    {(() => {
                      const matched = scanResult.product.barcodes_detailed?.find(b => b.barcode === scanResult.barcode);
                      return matched?.label ? (
                        <span style={{ marginLeft: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          ({matched.label})
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}
                {scanResult.type === 'missing' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleCreateFromScan}>
                      <Plus size={12} /> Create new product
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleLinkFromScan}>
                      <ScanBarcode size={12} /> Link to existing product
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search />
          <input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {locations.length > 0 && (
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <h3>No items found</h3>
          <p>{showAll ? 'Try clearing filters or add a new product.' : 'Try toggling "All" to view registered products.'}</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th></th>
                <th>Product</th>
                <th>Location</th>
                <th>Stock</th>
                <th>Min</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isExpanded = expandedProduct === item.product.id;
                const entryLocations = [...new Set(item.entries.map(e => e.location).filter(Boolean))];
                return (
                  <>
                    <tr key={item.product.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedProduct(isExpanded ? null : item.product.id)}>
                      <td style={{ width: 28, padding: '12px 8px' }}>
                        {item.entries.length > 0 && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      </td>
                      <td>
                        {item.product.image_url ? (
                          <img src={item.product.image_url} className="product-img-sm" alt="" />
                        ) : (
                          <div className="product-img-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={14} style={{ color: 'var(--text-muted)' }} />
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.product.name}</div>
                        {item.product.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.product.brand}</div>}
                        {item.product.category && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.product.category}</div>}
                      </td>
                      <td>
                        {(() => {
                          const labels = prefs.show_variants_in_row ? (item.product.barcodes_detailed || []).filter(b => b.label).map(b => b.label) : [];
                          const hasAny = entryLocations.length > 0 || labels.length > 0;
                          if (!hasAny) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
                          return (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {entryLocations.map(l => <span key={`loc-${l}`} className="tag tag-accent" style={{ fontSize: 10 }}>{l}</span>)}
                              {labels.map(l => <span key={`var-${l}`} className="tag tag-green" style={{ fontSize: 10 }}>{l}</span>)}
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {item.product.stock} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>{item.product.quantity_unit}</span>
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 12 }}>
                          {item.product.min_stock || '—'}
                        </span>
                      </td>
                      <td>
                        {item.product.stock === 0
                          ? <span className="tag tag-orange" style={{ fontSize: 10 }}>Out</span>
                          : item.product.below_min
                            ? <span className="tag tag-red">Low</span>
                            : <span className="tag tag-green">OK</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button className="btn-icon" title="Add 1" onClick={() => handleManualAdd(item.product.id)}><Plus size={14} /></button>
                          {item.product.stock > 0 && (
                            <button className="btn-icon" title="Use 1" onClick={() => handleManualConsume(item.product.id)}><Minus size={14} /></button>
                          )}
                          <button className="btn-icon" title="Edit product" onClick={() => setEditProduct({ ...item.product })}><Edit size={14} /></button>
                          <button className="btn-icon" title="Merge into another product" onClick={() => { setShowMerge(item.product); setMergeSearch(''); }}><Merge size={14} /></button>
                          {item.product.stock === 0 && (
                            <button className="btn-icon" title="Delete product" style={{ color: 'var(--red)' }} onClick={() => handleDeleteProduct(item.product.id)}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && item.entries.map(entry => (
                      <tr key={`entry-${entry.id}`} style={{ background: 'var(--bg-secondary)' }}>
                        <td></td>
                        <td></td>
                        <td colSpan={2} style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <MapPin size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ color: entry.location ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {entry.location || 'No location'}
                            </span>
                            {entry.variant_label && (
                              <span className="tag tag-green" style={{ fontSize: 10 }}>{entry.variant_label}</span>
                            )}
                            {entry.best_before && (
                              <span className="tag tag-orange" style={{ fontSize: 10 }}>BB: {entry.best_before}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{entry.quantity}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {entry.added_at ? new Date(entry.added_at).toLocaleDateString() : ''}
                        </td>
                        <td></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Edit entry" style={{ padding: 4 }} onClick={() => setEditEntry({ ...entry })}>
                              <Edit size={12} />
                            </button>
                            <button className="btn-icon" title="Delete entry" style={{ padding: 4, color: 'var(--red)' }} onClick={() => handleDeleteEntry(entry.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OFF Search Modal */}
      {showOFFSearch && (
        <div className="modal-overlay" onClick={() => setShowOFFSearch(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '85vh' }}>
            <h3>Search OpenFoodFacts</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Find products on OpenFoodFacts and add them to your inventory without a barcode.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                autoFocus
                placeholder="e.g. Nutella, Coca Cola, Barilla..."
                value={offQuery}
                onChange={e => setOffQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOFFSearch()}
              />
              <button className="btn btn-primary" onClick={handleOFFSearch} disabled={offLoading || offQuery.length < 2}>
                {offLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Search size={14} />}
              </button>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {offResults.length === 0 && !offLoading && offQuery.length >= 2 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                  No results. Try a different search.
                </div>
              )}
              {offResults.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {p.image_url ? (
                    <img src={p.image_url} className="product-img-sm" alt="" />
                  ) : (
                    <div className="product-img-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={12} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    {p.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand}</div>}
                    {p.barcode && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{p.barcode}</div>}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => handleOFFAdd(p)}>
                    <Plus size={12} /> Add
                  </button>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowOFFSearch(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Product Modal */}
      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New Product</h3>
            <form onSubmit={handleCreateProduct}>
              <div className="form-group">
                <label>Name *</label>
                <input required autoFocus value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Barcode</label>
                  <input value={newProduct.barcode} onChange={e => setNewProduct({ ...newProduct, barcode: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <input value={newProduct.brand} onChange={e => setNewProduct({ ...newProduct, brand: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <ComboSelect
                    value={newProduct.category}
                    onChange={v => setNewProduct({ ...newProduct, category: v })}
                    options={categories}
                    placeholder="Select or type category..."
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <select value={newProduct.quantity_unit} onChange={e => setNewProduct({ ...newProduct, quantity_unit: e.target.value })}>
                    {UNITS.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Min Stock</label>
                  <input type="number" step="0.1" value={newProduct.min_stock} onChange={e => setNewProduct({ ...newProduct, min_stock: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label>Default Qty</label>
                  <input type="number" step="0.1" value={newProduct.default_quantity} onChange={e => setNewProduct({ ...newProduct, default_quantity: parseFloat(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProduct && (
        <div className="modal-overlay" onClick={() => setEditProduct(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh' }}>
            <h3>Edit Product</h3>
            <form onSubmit={handleUpdateProduct}>
              <div className="form-group">
                <label>Name *</label>
                <input required value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Brand</label>
                <input value={editProduct.brand || ''} onChange={e => setEditProduct({ ...editProduct, brand: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <ComboSelect
                    value={editProduct.category || ''}
                    onChange={v => setEditProduct({ ...editProduct, category: v })}
                    options={categories}
                    placeholder="Select or type category..."
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <select value={editProduct.quantity_unit} onChange={e => setEditProduct({ ...editProduct, quantity_unit: e.target.value })}>
                    {UNITS.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Min Stock</label>
                  <input type="number" step="0.1" value={editProduct.min_stock || 0} onChange={e => setEditProduct({ ...editProduct, min_stock: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label>Default Qty</label>
                  <input type="number" step="0.1" value={editProduct.default_quantity || 1} onChange={e => setEditProduct({ ...editProduct, default_quantity: parseFloat(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="form-group">
                <label>Image URL</label>
                <input value={editProduct.image_url || ''} onChange={e => setEditProduct({ ...editProduct, image_url: e.target.value })} />
              </div>

              {/* Multi-barcode management */}
              <BarcodeManager productId={editProduct.id} barcodesDetailed={editProduct.barcodes_detailed || []} addToast={addToast} onUpdate={(detailed) => setEditProduct({ ...editProduct, barcodes_detailed: detailed, barcodes: detailed.map(b => b.barcode) })} />

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditProduct(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Inventory Entry Modal */}
      {editEntry && (
        <div className="modal-overlay" onClick={() => setEditEntry(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Edit Inventory Entry</h3>
            <form onSubmit={handleUpdateEntry}>
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" step="0.1" min="0" required value={editEntry.quantity}
                  onChange={e => setEditEntry({ ...editEntry, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Storage Location</label>
                <ComboSelect
                  value={editEntry.location || ''}
                  onChange={v => setEditEntry({ ...editEntry, location: v })}
                  options={[...new Set([...locations])]}
                  placeholder="Select or type location..."
                />
              </div>
              <div className="form-group">
                <label>Best Before</label>
                <input type="date" value={editEntry.best_before || ''}
                  onChange={e => setEditEntry({ ...editEntry, best_before: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditEntry(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge product into another */}
      {showMerge && (
        <div className="modal-overlay" onClick={() => setShowMerge(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Merge product</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Merge <strong>{showMerge.name}</strong> into another product.
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
              All barcodes, inventory entries, and references will be moved to the target. The source product will be deleted.
            </p>
            <div className="form-group">
              <input
                autoFocus
                placeholder="Search target product..."
                value={mergeSearch}
                onChange={e => setMergeSearch(e.target.value)}
              />
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {mergeFilteredProducts.length === 0 && mergeSearch.length >= 1 && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>No products found.</p>
              )}
              {mergeFilteredProducts.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }}
                  onClick={() => handleMerge(p)}
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
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    {p.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {p.barcodes?.length || 0} barcodes · stock: {p.stock}
                    </div>
                  </div>
                  <span className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }}>
                    <Merge size={12} /> Merge here
                  </span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowMerge(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Link barcode to existing product */}
      {showLinkPicker && (
        <div className="modal-overlay" onClick={() => setShowLinkPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Link barcode to existing product</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Barcode <span style={{ fontFamily: 'var(--font-mono)' }}>{linkBarcode}</span> will be added to the product you select.
            </p>
            <div className="form-group">
              <input
                autoFocus
                placeholder="Search products by name..."
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
              />
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {linkFilteredProducts.length === 0 && linkSearch.length >= 1 && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>No products found.</p>
              )}
              {linkFilteredProducts.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }}
                  onClick={() => handleLinkToProduct(p)}
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
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    {p.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand}</div>}
                    {p.barcodes?.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {p.barcodes.length} barcode{p.barcodes.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLinkPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
