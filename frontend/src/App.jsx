import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, BookOpen, CalendarDays, ShoppingCart, Menu, Settings as SettingsIcon, LogOut, User } from 'lucide-react';
import { useToast } from './hooks/useToast';
import { PrefsProvider, usePrefs } from './hooks/usePrefs';
import { getStoredUser, setToken, setStoredUser } from './utils/api';
import ToastContainer from './components/ToastContainer';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Recipes from './pages/Recipes';
import MealPlanner from './pages/MealPlanner';
import ShoppingListPage from './pages/ShoppingList';
import Settings from './pages/Settings';

function Sidebar({ open, onClose, currentUser, onLogout }) {
  const { prefs } = usePrefs();

  return (
    <>
      {open && <div className="mobile-overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>Pantry<span>Pal</span></h1>
          <p>Home inventory</p>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">General</div>
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <LayoutDashboard /> Dashboard
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <Package /> Inventory
          </NavLink>

          {(prefs.show_recipes || prefs.show_meal_planner) && (
            <div className="sidebar-section">Cooking</div>
          )}
          {prefs.show_recipes && (
            <NavLink to="/recipes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
              <BookOpen /> Recipes
            </NavLink>
          )}
          {prefs.show_meal_planner && (
            <NavLink to="/meal-planner" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
              <CalendarDays /> Meal Planner
            </NavLink>
          )}

          <div className="sidebar-section">Shopping</div>
          <NavLink to="/shopping" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <ShoppingCart /> Shopping List
          </NavLink>

          <div className="sidebar-section">Account</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <SettingsIcon /> Settings
          </NavLink>
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{currentUser?.display_name || currentUser?.username}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {currentUser?.is_admin ? 'Admin' : 'User'}
              </div>
            </div>
          </div>
          <button className="nav-link" onClick={onLogout} style={{ color: 'var(--red)', fontSize: 13 }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

function MobileHeader({ onToggle }) {
  const location = useLocation();
  const titles = {
    '/': 'Dashboard', '/inventory': 'Inventory', '/recipes': 'Recipes',
    '/meal-planner': 'Meal Planner', '/shopping': 'Shopping List', '/settings': 'Settings',
  };
  return (
    <div className="mobile-header">
      <button className="btn-icon" onClick={onToggle} style={{ border: 'none' }}>
        <Menu size={20} />
      </button>
      <span style={{ fontWeight: 600, fontSize: 15 }}>{titles[location.pathname] || 'PantryPal'}</span>
    </div>
  );
}

function AppShell({ currentUser, onLogout, addToast }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { prefs } = usePrefs();

  return (
    <div className="app-layout">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <div className="main-content">
        <MobileHeader onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory addToast={addToast} />} />
            {prefs.show_recipes && <Route path="/recipes" element={<Recipes addToast={addToast} />} />}
            {prefs.show_meal_planner && <Route path="/meal-planner" element={<MealPlanner addToast={addToast} />} />}
            <Route path="/shopping" element={<ShoppingListPage addToast={addToast} />} />
            <Route path="/settings" element={<Settings addToast={addToast} currentUser={currentUser} />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const { toasts, addToast } = useToast();

  useEffect(() => {
    const handler = () => setCurrentUser(null);
    window.addEventListener('pantrypal_logout', handler);
    return () => window.removeEventListener('pantrypal_logout', handler);
  }, []);

  const handleLogin = (user) => {
    setStoredUser(user);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setToken(null);
    setStoredUser(null);
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <PrefsProvider user={currentUser}>
        <AppShell currentUser={currentUser} onLogout={handleLogout} addToast={addToast} />
        <ToastContainer toasts={toasts} />
      </PrefsProvider>
    </BrowserRouter>
  );
}
