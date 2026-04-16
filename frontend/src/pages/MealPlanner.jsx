import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { CalendarDays, Plus, Trash2, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function getWeekDates(offset = 0) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmt(d) {
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MealPlanner({ addToast }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [meals, setMeals] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(null); // { date, meal_type }
  const [addForm, setAddForm] = useState({ recipe_id: '', custom_meal: '', servings: 2 });

  const weekDates = getWeekDates(weekOffset);
  const startStr = fmt(weekDates[0]);
  const endStr = fmt(weekDates[6]);
  const todayStr = fmt(new Date());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getMealPlans(startStr, endStr),
      api.getRecipes(),
    ]).then(([m, r]) => {
      setMeals(m);
      setRecipes(r);
    }).finally(() => setLoading(false));
  }, [weekOffset]);

  const handleAddMeal = async () => {
    if (!showAdd) return;
    const payload = {
      date: showAdd.date,
      meal_type: showAdd.meal_type,
      recipe_id: addForm.recipe_id ? parseInt(addForm.recipe_id) : null,
      custom_meal: addForm.custom_meal || null,
      servings: parseInt(addForm.servings) || 2,
    };
    if (!payload.recipe_id && !payload.custom_meal) {
      addToast('Pick a recipe or enter a meal name', 'error');
      return;
    }
    try {
      await api.createMealPlan(payload);
      addToast('Meal added', 'success');
      setShowAdd(null);
      setAddForm({ recipe_id: '', custom_meal: '', servings: 2 });
      const m = await api.getMealPlans(startStr, endStr);
      setMeals(m);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteMealPlan(id);
      setMeals(meals.filter(m => m.id !== id));
      addToast('Meal removed', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleGenerateShopping = async () => {
    try {
      const result = await api.generateShoppingFromMeals(startStr, endStr);
      addToast(`Added ${result.count} items to shopping list`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const monthLabel = weekDates[0].toLocaleDateString('en', { month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Meal Planner</h2>
        <div className="page-header-actions">
          <button className="btn btn-success" onClick={handleGenerateShopping}>
            <ShoppingCart size={16} /> Generate Shopping List
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-icon" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{monthLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {weekDates[0].toLocaleDateString('en', { day: 'numeric', month: 'short' })} — {weekDates[6].toLocaleDateString('en', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setWeekOffset(0)}>Today</button>
          <button className="btn-icon" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="meal-calendar">
          {weekDates.map((d, i) => {
            const dateStr = fmt(d);
            const dayMeals = meals.filter(m => m.date === dateStr);
            const isToday = dateStr === todayStr;

            return (
              <div key={dateStr} className={`meal-day ${isToday ? 'today' : ''}`}>
                <div className="meal-day-header">{DAY_NAMES[i]}</div>
                <div className="meal-day-date">{d.getDate()}</div>

                {MEAL_TYPES.map(type => {
                  const typeMeals = dayMeals.filter(m => m.meal_type === type);
                  return typeMeals.map(m => (
                    <div key={m.id} className="meal-entry">
                      <div>
                        <span className={`meal-type-tag ${type}`}>{type}</span>
                        <div style={{ fontSize: 12, marginTop: 2 }}>{m.recipe?.name || m.custom_meal}</div>
                      </div>
                      <button
                        className="btn-icon"
                        style={{ padding: 2, border: 'none' }}
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ));
                })}

                <button
                  style={{ width: '100%', marginTop: 6, padding: '5px', border: '1px dashed var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => { setShowAdd({ date: dateStr, meal_type: 'lunch' }); setAddForm({ recipe_id: '', custom_meal: '', servings: 2 }); }}
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Add Meal — {new Date(showAdd.date + 'T12:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            <div className="form-group">
              <label>Meal Type</label>
              <select value={showAdd.meal_type} onChange={e => setShowAdd({ ...showAdd, meal_type: e.target.value })}>
                {MEAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Recipe</label>
              <select value={addForm.recipe_id} onChange={e => setAddForm({ ...addForm, recipe_id: e.target.value, custom_meal: '' })}>
                <option value="">— Select a recipe —</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Or Custom Meal</label>
              <input placeholder="e.g. Leftover soup" value={addForm.custom_meal} onChange={e => setAddForm({ ...addForm, custom_meal: e.target.value, recipe_id: '' })} />
            </div>
            <div className="form-group">
              <label>Servings</label>
              <input type="number" min="1" value={addForm.servings} onChange={e => setAddForm({ ...addForm, servings: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdd(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddMeal}>Add Meal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
