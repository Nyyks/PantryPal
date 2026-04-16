const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('pantrypal_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('pantrypal_token', token);
  } else {
    localStorage.removeItem('pantrypal_token');
  }
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem('pantrypal_user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('pantrypal_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('pantrypal_user');
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Network error — is the server running?');
  }

  if (res.status === 204) return null;

  // Handle auth errors globally
  if (res.status === 401) {
    const text = await res.text();
    let msg = 'Authentication required';
    try {
      const j = JSON.parse(text);
      msg = j.error || msg;
    } catch {}
    // If token expired or invalid, clear auth
    if (path !== '/auth/login' && path !== '/auth/register') {
      setToken(null);
      setStoredUser(null);
      window.dispatchEvent(new Event('pantrypal_logout'));
    }
    throw new Error(msg);
  }

  // Try to parse JSON safely
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Response wasn't JSON — create a meaningful error
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}`);
    }
    throw new Error('Unexpected response from server (not JSON)');
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  // Auth
  login: (username, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe: () => apiFetch('/auth/me'),
  changePassword: (current_password, new_password) => apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),

  // Users (admin)
  getUsers: () => apiFetch('/users'),
  createUser: (username, password, display_name) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, display_name }) }),
  deleteUser: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, new_password) => apiFetch(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password }) }),
  toggleAdmin: (id) => apiFetch(`/users/${id}/toggle-admin`, { method: 'POST' }),

  // Dashboard
  getDashboard: () => apiFetch('/dashboard'),

  // Products
  getProducts: (q = '', category = '') => apiFetch(`/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  getProduct: (id) => apiFetch(`/products/${id}`),
  createProduct: (data) => apiFetch('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => apiFetch(`/products/${id}`, { method: 'DELETE' }),
  getCategories: () => apiFetch('/products/categories'),

  // Barcode
  lookupBarcode: (barcode) => apiFetch(`/barcode/${barcode}`),

  // Inventory
  getInventory: () => apiFetch('/inventory'),
  addToInventory: (data) => apiFetch('/inventory/add', { method: 'POST', body: JSON.stringify(data) }),
  consumeFromInventory: (data) => apiFetch('/inventory/consume', { method: 'POST', body: JSON.stringify(data) }),
  getExpiring: (days = 7) => apiFetch(`/inventory/expiring?days=${days}`),
  updateInventoryEntry: (id, data) => apiFetch(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInventoryEntry: (id) => apiFetch(`/inventory/${id}`, { method: 'DELETE' }),
  getLocations: () => apiFetch('/inventory/locations'),

  // Recipes
  getRecipes: (q = '', category = '') => apiFetch(`/recipes?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  getRecipe: (id) => apiFetch(`/recipes/${id}`),
  createRecipe: (data) => apiFetch('/recipes', { method: 'POST', body: JSON.stringify(data) }),
  updateRecipe: (id, data) => apiFetch(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecipe: (id) => apiFetch(`/recipes/${id}`, { method: 'DELETE' }),
  importRecipe: (url) => apiFetch('/recipes/import-url', { method: 'POST', body: JSON.stringify({ url }) }),
  getRecipeCategories: () => apiFetch('/recipes/categories'),

  // OpenFoodFacts
  searchOFF: (q) => apiFetch(`/openfoodfacts/search?q=${encodeURIComponent(q)}`),

  // Meal Plans
  getMealPlans: (start, end) => apiFetch(`/meal-plans?start=${start}&end=${end}`),
  createMealPlan: (data) => apiFetch('/meal-plans', { method: 'POST', body: JSON.stringify(data) }),
  deleteMealPlan: (id) => apiFetch(`/meal-plans/${id}`, { method: 'DELETE' }),
  generateShoppingFromMeals: (start, end) => apiFetch('/meal-plans/generate-shopping-list', { method: 'POST', body: JSON.stringify({ start, end }) }),

  // Shopping List
  getShoppingList: () => apiFetch('/shopping-list'),
  addToShoppingList: (data) => apiFetch('/shopping-list', { method: 'POST', body: JSON.stringify(data) }),
  updateShoppingItem: (id, data) => apiFetch(`/shopping-list/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteShoppingItem: (id) => apiFetch(`/shopping-list/${id}`, { method: 'DELETE' }),
  clearChecked: () => apiFetch('/shopping-list/clear-checked', { method: 'POST' }),
  shoppingScan: (barcode, addToInventory = true) => apiFetch('/shopping-list/scan', { method: 'POST', body: JSON.stringify({ barcode, add_to_inventory: addToInventory }) }),

  // Activity
  getActivity: (limit = 50) => apiFetch(`/activity?limit=${limit}`),
};
