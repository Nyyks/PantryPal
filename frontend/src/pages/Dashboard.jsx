import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { usePrefs } from '../hooks/usePrefs';
import { Package, ShoppingCart, BookOpen, AlertTriangle, Clock, Utensils } from 'lucide-react';

export default function Dashboard() {
  const { prefs } = usePrefs();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load independently so one failure doesn't blank the page
    api.getDashboard()
      .then(setData)
      .catch(err => setError(err.message));
    api.getActivity(10)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  if (error || !data) {
    return (
      <div className="page">
        <div className="page-header"><h2>Dashboard</h2></div>
        <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: 'var(--red)' }}>Couldn't load dashboard</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {error || 'Dashboard data is unavailable.'}
          </p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  // Defensive: make sure arrays/fields are never undefined
  const safe = {
    total_products: data.total_products || 0,
    total_stock: data.total_stock || 0,
    low_stock: Array.isArray(data.low_stock) ? data.low_stock : [],
    expiring_soon: data.expiring_soon || 0,
    shopping_count: data.shopping_count || 0,
    recipe_count: data.recipe_count || 0,
    today_meals: Array.isArray(data.today_meals) ? data.today_meals : [],
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Products</div>
          <div className="stat-value">{safe.total_products}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Stock</div>
          <div className="stat-value">{Math.round(safe.total_stock)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Shopping List</div>
          <div className="stat-value" style={{ color: safe.shopping_count > 0 ? 'var(--orange)' : undefined }}>
            {safe.shopping_count}
          </div>
        </div>
        {prefs.show_recipes && (
          <div className="stat-card">
            <div className="stat-label">Recipes</div>
            <div className="stat-value">{safe.recipe_count}</div>
          </div>
        )}
        {prefs.show_expiring_warning && (
          <div className="stat-card">
            <div className="stat-label">Expiring Soon</div>
            <div className="stat-value" style={{ color: safe.expiring_soon > 0 ? 'var(--red)' : undefined }}>
              {safe.expiring_soon}
            </div>
          </div>
        )}
        {prefs.show_expiring_warning && (
          <div className="stat-card">
            <div className="stat-label">Low Stock</div>
            <div className="stat-value" style={{ color: safe.low_stock.length > 0 ? 'var(--red)' : undefined }}>
              {safe.low_stock.length}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: prefs.show_meal_planner && prefs.show_dashboard_activity ? '1fr 1fr' : '1fr', gap: 16 }}>
        {prefs.show_meal_planner && (
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Utensils size={16} /> Today's Meals
            </h3>
            {safe.today_meals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No meals planned for today.</p>
            ) : (
              safe.today_meals.map(m => (
                <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`meal-type-tag ${m.meal_type}`}>{m.meal_type}</span>
                  <span style={{ fontSize: 13 }}>{m.recipe?.name || m.custom_meal}</span>
                </div>
              ))
            )}
          </div>
        )}

        {prefs.show_dashboard_activity && (
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Clock size={16} /> Recent Activity
            </h3>
            {activity.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent activity.</p>
            ) : (
              activity.map(a => (
                <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span>
                    <span className={`tag ${a.action === 'add' ? 'tag-green' : a.action === 'consume' ? 'tag-orange' : 'tag-accent'}`}>{a.action}</span>
                    {' '}{a.product_name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {prefs.show_expiring_warning && safe.low_stock.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
            <AlertTriangle size={16} /> Low Stock Items
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {safe.low_stock.map(p => (
              <div key={p.id} className="tag tag-red">
                {p.name} ({p.stock}/{p.min_stock})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
