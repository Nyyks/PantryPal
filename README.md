# PantryPal — Self-Hosted Home Inventory ERP

## DISCLAIMER
This thing was thrown togheter in like 4h
The base code was "coded" by AI and then painstakingly fixxed by me

However, even if this vibecoded AI-Slop, it works as expected and i atleast find it very usefull

## Features

- **Barcode Scanner** — Scan to replenish or consume inventory using your phone camera
- **OpenFoodFacts Integration** — Automatically fetches product info (name, brand, image, calories) from the Swiss OpenFoodFacts database
- **Inventory Tracking** — Track stock levels, expiry dates, storage locations, and minimum stock thresholds
- **Auto Shopping List** — Products are automatically added to your shopping list when stock drops below the minimum threshold
- **Recipe Management** — Create recipes manually or import from any popular recipe website (powered by `recipe-scrapers`, similar to Obsidian's recipe importer)
- **Meal Planning** — Weekly calendar view for planning breakfast, lunch, dinner, and snacks
- **Shopping Mode** — Dedicated scanner mode for use while shopping: scan products to check them off your list and add them to inventory simultaneously
- **Generate Shopping List from Meal Plan** — One-click generation of a shopping list based on your planned meals, accounting for current inventory

## Quick Start

```bash
# Clone or copy the project
cd pantrypal

# Start the stack
docker compose up -d --build

# Access the app
open http://localhost:3000
```

The API runs on port `5000`, the frontend on port `3000`.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | Flask secret key (used for JWT signing) |
| `OFF_COUNTRY` | `ch` | OpenFoodFacts country code (ch, de, fr, us, etc.) |
| `JWT_EXPIRY_HOURS` | `72` | JWT token validity in hours |

Create a `.env` file in the project root:

```env
SECRET_KEY=your-secure-key-here
OFF_COUNTRY=ch
```

### Authentication

PantryPal includes a full user management system:

- **Default admin account**: `admin` / `admin` — change this password after first login!
- **JWT-based auth**: tokens are stored in localStorage, valid for 72 hours by default
- **User registration**: new users can self-register from the login page
- **Admin panel**: admins can manage users, reset passwords, and toggle admin roles via Settings
- **Password changes**: all users can change their own password in Settings

### Changing the OpenFoodFacts Country

By default, PantryPal queries the Swiss (`ch`) OpenFoodFacts database. Change the `OFF_COUNTRY` env var to your country code:

- `ch` — Switzerland
- `de` — Germany
- `fr` — France
- `us` — United States
- `world` — Global database

## Architecture

```
pantrypal/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── app.py              # Flask API with all routes
│   ├── models.py            # SQLAlchemy models
│   └── requirements.txt
└── frontend/
    ├── Dockerfile
    ├── nginx.conf           # Reverse proxy config
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx          # Main app with routing
        ├── index.css        # Global styles
        ├── components/
        │   ├── BarcodeScanner.jsx
        │   └── ToastContainer.jsx
        ├── hooks/
        │   └── useToast.js
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Inventory.jsx
        │   ├── Recipes.jsx
        │   ├── MealPlanner.jsx
        │   ├── MealPlanner.jsx
        │   ├── Settings.jsx
        │   ├── Login.jsx
        │   └── ShoppingList.jsx
        └── utils/
            └── api.js
```

### Tech Stack

- **Backend**: Python / Flask / SQLAlchemy / SQLite / JWT (PyJWT) / bcrypt
- **Frontend**: React 18 / Vite / React Router / html5-qrcode / Lucide Icons
- **Infra**: Docker Compose / Nginx reverse proxy / Gunicorn

## API Endpoints

All endpoints except auth require a JWT token: `Authorization: Bearer <token>`

### Authentication
- `POST /api/auth/login` — Sign in (returns JWT token)
- `POST /api/auth/register` — Create account (returns JWT token)
- `GET /api/auth/me` — Get current user info
- `POST /api/auth/change-password` — Change own password

### User Management (admin only)
- `GET /api/users` — List all users
- `DELETE /api/users/:id` — Delete a user
- `POST /api/users/:id/reset-password` — Reset a user's password
- `POST /api/users/:id/toggle-admin` — Toggle admin role

### Products
- `GET /api/products` — List all products (supports `?q=` and `?category=` filters)
- `POST /api/products` — Create a product
- `PUT /api/products/:id` — Update a product
- `DELETE /api/products/:id` — Delete a product

### Barcode
- `GET /api/barcode/:code` — Look up barcode (local DB → OpenFoodFacts fallback)

### Inventory
- `GET /api/inventory` — List all inventory entries
- `POST /api/inventory/add` — Add stock (by `barcode` or `product_id`)
- `POST /api/inventory/consume` — Consume stock (FIFO by expiry date)
- `GET /api/inventory/expiring?days=7` — Get items expiring soon

### Recipes
- `GET /api/recipes` — List recipes
- `POST /api/recipes` — Create a recipe with ingredients
- `POST /api/recipes/import-url` — Import recipe from URL
- `PUT /api/recipes/:id` — Update recipe
- `DELETE /api/recipes/:id` — Delete recipe

### Meal Plans
- `GET /api/meal-plans?start=&end=` — Get meal plans for date range
- `POST /api/meal-plans` — Add a meal to the plan
- `POST /api/meal-plans/generate-shopping-list` — Generate shopping list from planned meals

### Shopping List
- `GET /api/shopping-list` — Get all items
- `POST /api/shopping-list` — Add item manually
- `PUT /api/shopping-list/:id` — Update item (check/uncheck)
- `POST /api/shopping-list/scan` — Shopping mode: scan barcode to check off + add to inventory
- `POST /api/shopping-list/clear-checked` — Remove all checked items

### Dashboard
- `GET /api/dashboard` — Overview stats (stock counts, low stock, expiring, today's meals)

## Scanner Notes

The barcode scanner uses the device camera via `html5-qrcode`. For the camera to work:

- **HTTPS is required** in production (cameras are blocked on plain HTTP, except localhost)
- Works on both mobile and desktop browsers
- For best results, ensure good lighting and hold the barcode steady

## Data Persistence

All data is stored in a SQLite database inside a Docker volume (`db-data`). Your data persists across container restarts. To back up:

```bash
docker cp pantrypal-api:/app/data/pantrypal.db ./backup.db
```

## License

MIT
