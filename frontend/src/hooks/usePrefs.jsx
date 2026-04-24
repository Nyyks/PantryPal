import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const PrefsContext = createContext({});

const DEFAULT_PREFS = {
  auto_add_to_inventory: true,
  auto_add_to_shopping: true,
  show_meal_planner: true,
  show_recipes: true,
  show_dashboard_activity: true,
  show_expiring_warning: true,
  show_calories: false,
  show_brand: true,
  default_location: '',
};

export function PrefsProvider({ user, children }) {
  const [prefs, setPrefs] = useState(() => user?.preferences || DEFAULT_PREFS);

  useEffect(() => {
    if (user?.preferences) {
      setPrefs({ ...DEFAULT_PREFS, ...user.preferences });
    }
  }, [user]);

  const updatePref = useCallback(async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await api.updatePreferences({ [key]: value });
    } catch (err) {
      console.error('Failed to save preference:', err);
    }
  }, [prefs]);

  const updatePrefs = useCallback(async (changes) => {
    const updated = { ...prefs, ...changes };
    setPrefs(updated);
    try {
      await api.updatePreferences(changes);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    }
  }, [prefs]);

  return (
    <PrefsContext.Provider value={{ prefs, updatePref, updatePrefs }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  return useContext(PrefsContext);
}
