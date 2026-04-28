import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { BookOpen, Plus, Clock, Users, ExternalLink, Trash2, X, Link, ChevronLeft, Edit, ShoppingCart } from 'lucide-react';
import ComboSelect from '../components/ComboSelect';

export default function Recipes({ addToast }) {
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', instructions: '', servings: 4,
    prep_time: '', cook_time: '', image_url: '', source_url: '', category: '',
    ingredients: [{ name: '', quantity: '', unit: '', notes: '' }],
  });

  const loadRecipes = () => {
    api.getRecipes(search, categoryFilter).then(setRecipes).finally(() => setLoading(false));
  };

  const loadCategories = () => {
    api.getRecipeCategories().then(setCategories).catch(() => {});
  };

  useEffect(() => { loadRecipes(); }, [search, categoryFilter]);
  useEffect(() => { loadCategories(); }, []);

  const selectRecipe = (recipe) => {
    setSelected(recipe);
  };

  const handleAddAllToShopping = async () => {
    if (!selected || !selected.ingredients?.length) return;
    let count = 0;
    try {
      for (const ing of selected.ingredients) {
        if (!ing.name?.trim()) continue;
        try {
          await api.addToShoppingList({
            name: ing.name,
            quantity: ing.quantity || 1,
            unit: ing.unit || '',
          });
          count++;
        } catch {}
      }
      if (count > 0) {
        addToast(`Added ${count} ingredients to shopping list`, 'success');
      } else {
        addToast('No ingredients to add', 'info');
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const data = await api.importRecipe(importUrl);
      setForm({
        name: data.name || '', description: data.description || '',
        instructions: data.instructions || '', servings: data.servings || 4,
        prep_time: data.prep_time || '', cook_time: data.cook_time || '',
        image_url: data.image_url || '', source_url: data.source_url || importUrl,
        category: data.category || '',
        ingredients: data.ingredients.length > 0
          ? data.ingredients.map(i => ({ name: i.name, quantity: i.quantity || '', unit: i.unit || '', notes: i.notes || '' }))
          : [{ name: '', quantity: '', unit: '', notes: '' }],
      });
      setShowImport(false);
      setShowForm(true);
      addToast('Recipe imported — review and save', 'success');
    } catch (err) { addToast(err.message, 'error'); }
    finally { setImporting(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      prep_time: form.prep_time ? parseInt(form.prep_time) : null,
      cook_time: form.cook_time ? parseInt(form.cook_time) : null,
      servings: parseInt(form.servings) || 4,
      ingredients: form.ingredients.filter(i => i.name.trim()),
    };
    try {
      if (form.id) {
        await api.updateRecipe(form.id, payload);
        addToast('Recipe updated', 'success');
      } else {
        await api.createRecipe(payload);
        addToast('Recipe created', 'success');
      }
      setShowForm(false);
      resetForm();
      loadRecipes();
      loadCategories();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this recipe?')) return;
    try {
      await api.deleteRecipe(id);
      addToast('Recipe deleted', 'success');
      setSelected(null);
      loadRecipes();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const openEdit = (recipe) => {
    setForm({
      id: recipe.id, name: recipe.name, description: recipe.description || '',
      instructions: recipe.instructions || '', servings: recipe.servings || 4,
      prep_time: recipe.prep_time || '', cook_time: recipe.cook_time || '',
      image_url: recipe.image_url || '', source_url: recipe.source_url || '',
      category: recipe.category || '',
      ingredients: recipe.ingredients.length > 0
        ? recipe.ingredients.map(i => ({ name: i.name, quantity: i.quantity || '', unit: i.unit || '', notes: i.notes || '' }))
        : [{ name: '', quantity: '', unit: '', notes: '' }],
    });
    setSelected(null);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', description: '', instructions: '', servings: 4, prep_time: '', cook_time: '', image_url: '', source_url: '', category: '', ingredients: [{ name: '', quantity: '', unit: '', notes: '' }] });
  };

  const addIngredientRow = () => {
    setForm({ ...form, ingredients: [...form.ingredients, { name: '', quantity: '', unit: '', notes: '' }] });
  };

  const updateIngredient = (idx, field, value) => {
    const updated = [...form.ingredients];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, ingredients: updated });
  };

  const removeIngredient = (idx) => {
    setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== idx) });
  };

  // ── Detail view ──
  if (selected) {
    return (
      <div className="page">
        <button className="btn btn-secondary" style={{ marginBottom: 20 }} onClick={() => setSelected(null)}>
          <ChevronLeft size={16} /> Back to Recipes
        </button>

        <div className="recipe-detail-header">
          {selected.image_url && (
            <img src={selected.image_url} alt={selected.name} className="recipe-detail-img" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600 }}>{selected.name}</h2>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary" onClick={() => openEdit(selected)}><Edit size={14} /> Edit</button>
                <button className="btn btn-danger" onClick={() => handleDelete(selected.id)}><Trash2 size={14} /></button>
              </div>
            </div>
            {selected.description && <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>{selected.description}</p>}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
              {selected.servings && <span><Users size={14} style={{ verticalAlign: -2 }} /> {selected.servings} servings</span>}
              {selected.prep_time && <span><Clock size={14} style={{ verticalAlign: -2 }} /> Prep {selected.prep_time}m</span>}
              {selected.cook_time && <span><Clock size={14} style={{ verticalAlign: -2 }} /> Cook {selected.cook_time}m</span>}
            </div>
            {selected.source_url && (
              <a href={selected.source_url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={12} /> Source
              </a>
            )}
          </div>
        </div>

        {/* Add all ingredients to shopping list */}
        <div style={{ marginTop: 20, marginBottom: 8 }}>
          <button className="btn btn-success" onClick={handleAddAllToShopping}>
            <ShoppingCart size={16} /> Add ingredients to shopping list
          </button>
        </div>

        <div className="recipe-detail-body">
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 14, fontWeight: 600 }}>Ingredients</h3>
            {selected.ingredients.map((ing, i) => (
              <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.name}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0 }}>
                  {ing.quantity && `${ing.quantity} ${ing.unit || ''}`}
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 14, fontWeight: 600 }}>Instructions</h3>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {selected.instructions}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Recipe form modal ──
  const formModal = showForm && (
    <div className="modal-overlay" onClick={() => { setShowForm(false); resetForm(); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh' }}>
        <h3>{form.id ? 'Edit Recipe' : 'New Recipe'}</h3>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Servings</label>
              <input type="number" value={form.servings} onChange={e => setForm({ ...form, servings: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Prep Time (min)</label>
              <input type="number" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Cook Time (min)</label>
              <input type="number" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Category</label>
              <ComboSelect
                value={form.category}
                onChange={v => setForm({ ...form, category: v })}
                options={[...new Set(['breakfast', 'main', 'dessert', 'salad', 'soup', 'snack', 'side', 'drink', ...categories])]}
                placeholder="Select or type category..."
              />
            </div>
          </div>
          <div className="form-group">
            <label>Image URL</label>
            <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ margin: 0 }}>Ingredients</label>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={addIngredientRow}>
                <Plus size={12} /> Add
              </button>
            </div>
            {form.ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                <input placeholder="Ingredient" value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} />
                <input placeholder="Qty" type="number" step="any" value={ing.quantity} onChange={e => updateIngredient(i, 'quantity', e.target.value)} />
                <input placeholder="Unit" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} />
                <button type="button" className="btn-icon" onClick={() => removeIngredient(i)} style={{ padding: 6 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>Instructions</label>
            <textarea rows={8} value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
            <button type="submit" className="btn btn-primary">{form.id ? 'Update' : 'Save Recipe'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── Import modal ──
  const importModal = showImport && (
    <div className="modal-overlay" onClick={() => setShowImport(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3>Import Recipe from URL</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          Paste a URL from any popular recipe website. PantryPal will extract the recipe details automatically.
        </p>
        <div className="form-group">
          <label>Recipe URL</label>
          <input placeholder="https://www.example.com/recipe/..." value={importUrl} onChange={e => setImportUrl(e.target.value)} autoFocus />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing || !importUrl}>
            {importing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importing...</> : <><Link size={14} /> Import</>}
          </button>
        </div>
      </div>
    </div>
  );

  // ── List view ──
  return (
    <div className="page">
      <div className="page-header">
        <h2>Recipes</h2>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => { setShowImport(true); setImportUrl(''); }}>
            <Link size={16} /> Import URL
          </button>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus size={16} /> New Recipe
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <BookOpen size={16} />
          <input placeholder="Search recipes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : recipes.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>No recipes yet</h3>
          <p>Import one from a URL or create your own.</p>
        </div>
      ) : (
        <div className="card-grid">
          {recipes.map(r => (
            <div key={r.id} className="card recipe-card" onClick={() => selectRecipe(r)}>
              {r.image_url && <img src={r.image_url} className="recipe-card-img" alt={r.name} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{r.name}</div>
                {r.category && <span className="tag tag-accent" style={{ fontSize: 10 }}>{r.category}</span>}
              </div>
              {r.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.description}</p>}
              <div className="recipe-card-meta">
                {r.servings && <span><Users size={12} /> {r.servings}</span>}
                {r.prep_time && <span><Clock size={12} /> {r.prep_time}m prep</span>}
                {r.cook_time && <span><Clock size={12} /> {r.cook_time}m cook</span>}
                <span>{r.ingredients.length} ing.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {formModal}
      {importModal}
    </div>
  );
}
