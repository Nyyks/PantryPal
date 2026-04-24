import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { usePrefs } from '../hooks/usePrefs';
import { Users, Shield, ShieldOff, Trash2, Key, UserPlus, Settings as SettingsIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import ComboSelect from '../components/ComboSelect';

function Toggle({ label, description, checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      {checked ? (
        <ToggleRight size={28} style={{ color: 'var(--green)', flexShrink: 0 }} />
      ) : (
        <ToggleLeft size={28} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      )}
    </div>
  );
}

export default function Settings({ addToast, currentUser }) {
  const { prefs, updatePref } = usePrefs();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showResetModal, setShowResetModal] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', display_name: '' });
  const [locations, setLocations] = useState([]);

  const isAdmin = currentUser?.is_admin;

  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      api.getUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false));
    }
    api.getLocations().then(setLocations).catch(() => {});
  }, [isAdmin]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) {
      addToast('Passwords do not match', 'error');
      return;
    }
    try {
      await api.changePassword(pwForm.current_password, pwForm.new_password);
      addToast('Password changed successfully', 'success');
      setPwForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteUser = async (uid, username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(uid);
      setUsers(users.filter(u => u.id !== uid));
      addToast(`User ${username} deleted`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleToggleAdmin = async (uid) => {
    try {
      const updated = await api.toggleAdmin(uid);
      setUsers(users.map(u => u.id === uid ? updated : u));
      addToast(`Admin status toggled`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleResetPassword = async () => {
    try {
      await api.resetUserPassword(showResetModal.id, resetPw);
      addToast(`Password reset for ${showResetModal.username}`, 'success');
      setShowResetModal(null);
      setResetPw('');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUser.username, newUser.password, newUser.display_name);
      addToast(`User ${newUser.username} created`, 'success');
      setShowCreateUser(false);
      setNewUser({ username: '', password: '', display_name: '' });
      api.getUsers().then(setUsers).catch(() => {});
    } catch (err) { addToast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      {/* Preferences */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingsIcon size={16} /> Preferences
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Customize which features are visible and how PantryPal behaves.
        </p>

        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '12px 0 4px', borderBottom: '1px solid var(--border)' }}>
          Behavior
        </div>
        <Toggle
          label="Auto-add to inventory on checkout"
          description="When you check off a shopping list item, it's automatically added to your inventory."
          checked={prefs.auto_add_to_inventory}
          onChange={v => updatePref('auto_add_to_inventory', v)}
        />
        <Toggle
          label="Auto-add to shopping list when low"
          description="Products are added to the shopping list when stock drops below the minimum level."
          checked={prefs.auto_add_to_shopping}
          onChange={v => updatePref('auto_add_to_shopping', v)}
        />

        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 4px', borderBottom: '1px solid var(--border)' }}>
          Visible Sections
        </div>
        <Toggle
          label="Show Recipes"
          description="Show the Recipes page in the sidebar."
          checked={prefs.show_recipes}
          onChange={v => updatePref('show_recipes', v)}
        />
        <Toggle
          label="Show Meal Planner"
          description="Show the Meal Planner page in the sidebar."
          checked={prefs.show_meal_planner}
          onChange={v => updatePref('show_meal_planner', v)}
        />
        <Toggle
          label="Show Dashboard Activity"
          description="Show the recent activity feed on the dashboard."
          checked={prefs.show_dashboard_activity}
          onChange={v => updatePref('show_dashboard_activity', v)}
        />
        <Toggle
          label="Show Expiring Warnings"
          description="Show expiring items count and low-stock warnings on the dashboard."
          checked={prefs.show_expiring_warning}
          onChange={v => updatePref('show_expiring_warning', v)}
        />

        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 4px', borderBottom: '1px solid var(--border)' }}>
          Display
        </div>
        <Toggle
          label="Show Brand"
          description="Show the brand name on product rows."
          checked={prefs.show_brand}
          onChange={v => updatePref('show_brand', v)}
        />
        <Toggle
          label="Show Calories"
          description="Show calorie information on products when available."
          checked={prefs.show_calories}
          onChange={v => updatePref('show_calories', v)}
        />

        <div style={{ padding: '14px 0 0' }}>
          <label>Default Storage Location</label>
          <div style={{ maxWidth: 260, marginTop: 4 }}>
            <ComboSelect
              value={prefs.default_location}
              onChange={v => updatePref('default_location', v)}
              options={[...new Set(['Fridge', 'Freezer', 'Pantry', 'Cupboard', 'Counter', 'Cellar', ...locations])]}
              placeholder="None (inherit from last entry)"
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            New inventory entries will use this location by default (overridden by per-product location inheritance).
          </p>
        </div>
      </div>

      {/* Change Password */}
      <div className="card" style={{ maxWidth: 480, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={16} /> Change Password
        </h3>
        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" required value={pwForm.current_password}
              onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" required minLength={4} value={pwForm.new_password}
              onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" required value={pwForm.confirm}
              onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>

      {/* User Management (admin only) */}
      {isAdmin && (
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} /> User Management</span>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowCreateUser(true)}>
              <UserPlus size={14} /> Create User
            </button>
          </h3>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Display Name</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.username}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{u.display_name || '—'}</td>
                      <td>
                        <span className={`tag ${u.is_admin ? 'tag-accent' : 'tag-green'}`}>
                          {u.is_admin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        {u.id !== currentUser.id ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title={u.is_admin ? 'Remove admin' : 'Make admin'}
                              onClick={() => handleToggleAdmin(u.id)}>
                              {u.is_admin ? <ShieldOff size={14} /> : <Shield size={14} />}
                            </button>
                            <button className="btn-icon" title="Reset password"
                              onClick={() => { setShowResetModal(u); setResetPw(''); }}>
                              <Key size={14} />
                            </button>
                            <button className="btn-icon" title="Delete user" style={{ color: 'var(--red)' }}
                              onClick={() => handleDeleteUser(u.id, u.username)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>You</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3>Reset Password for {showResetModal.username}</h3>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" autoFocus required minLength={4} value={resetPw}
                onChange={e => setResetPw(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowResetModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetPassword} disabled={!resetPw}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="modal-overlay" onClick={() => setShowCreateUser(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Username *</label>
                <input required minLength={3} autoFocus value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Minimum 3 characters" />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input value={newUser.display_name}
                  onChange={e => setNewUser({ ...newUser, display_name: e.target.value })}
                  placeholder="Optional" />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input type="password" required minLength={4} value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Minimum 4 characters" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><UserPlus size={14} /> Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
