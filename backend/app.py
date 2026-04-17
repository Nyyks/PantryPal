import os
import jwt
import requests
from functools import wraps
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from models import db, User, Product, ProductBarcode, InventoryEntry, Recipe, RecipeIngredient, MealPlan, ShoppingList, ActivityLog

app = Flask(__name__)
CORS(app, supports_credentials=True)

DB_PATH = os.environ.get('DB_PATH', '/app/data/pantrypal.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-me')
app.config['JWT_EXPIRY_HOURS'] = int(os.environ.get('JWT_EXPIRY_HOURS', '72'))

OFF_COUNTRY = os.environ.get('OFF_COUNTRY', 'ch')

db.init_app(app)


def run_migrations():
    """Add missing columns to existing tables. Safe to run on every startup."""
    from sqlalchemy import text, inspect
    inspector = inspect(db.engine)

    # Pattern: {table_name: [(column_name, column_sql_type), ...]}
    migrations = {
        'recipes': [
            ('category', 'VARCHAR(64)'),
        ],
        'products': [
            ('image_url', 'VARCHAR(512)'),
        ],
        'inventory': [
            ('location', 'VARCHAR(128)'),
        ],
    }

    for table, columns in migrations.items():
        if not inspector.has_table(table):
            continue
        existing = {c['name'] for c in inspector.get_columns(table)}
        for col_name, col_type in columns:
            if col_name not in existing:
                try:
                    with db.engine.begin() as conn:
                        conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col_name} {col_type}'))
                    print(f"Migration: added {table}.{col_name}")
                except Exception as e:
                    print(f"Migration warning ({table}.{col_name}): {e}")


with app.app_context():
    db.create_all()
    run_migrations()

    # Migrate legacy barcodes into product_barcodes table
    products_with_barcodes = Product.query.filter(
        Product.barcode.isnot(None), Product.barcode != ''
    ).all()
    migrated = 0
    for p in products_with_barcodes:
        existing = ProductBarcode.query.filter_by(product_id=p.id, barcode=p.barcode).first()
        if not existing:
            db.session.add(ProductBarcode(product_id=p.id, barcode=p.barcode))
            migrated += 1
    if migrated:
        db.session.commit()
        print(f"Migration: copied {migrated} legacy barcodes to product_barcodes table")

    if User.query.count() == 0:
        admin = User(username='admin', display_name='Admin', is_admin=True)
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()
        print("Created default admin user (admin/admin)")


# ─── Global error handlers — always return JSON ───

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({'error': str(e)}), 500


# ─── Health check (no auth required) ───

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})


# ─── JWT Authentication ───

def create_token(user):
    payload = {
        'user_id': user.id,
        'username': user.username,
        'is_admin': user.is_admin,
        'exp': datetime.utcnow() + timedelta(hours=app.config['JWT_EXPIRY_HOURS']),
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')


def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            g.current_user = User.query.get(payload['user_id'])
            if not g.current_user:
                return jsonify({'error': 'User not found'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    @auth_required
    def decorated(*args, **kwargs):
        if not g.current_user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ─── Auth Routes ───

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid username or password'}), 401
    token = create_token(user)
    return jsonify({'token': token, 'user': user.to_dict()})


@app.route('/api/auth/register', methods=['POST'])
@admin_required
def register():
    """Create a new user (admin only)."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    display_name = data.get('display_name', '').strip() or username
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409
    user = User(username=username, display_name=display_name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({'user': user.to_dict()}), 201


@app.route('/api/auth/me', methods=['GET'])
@auth_required
def get_me():
    return jsonify({'user': g.current_user.to_dict()})


@app.route('/api/auth/change-password', methods=['POST'])
@auth_required
def change_password():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    current = data.get('current_password', '')
    new_pw = data.get('new_password', '')
    if not g.current_user.check_password(current):
        return jsonify({'error': 'Current password is incorrect'}), 400
    if len(new_pw) < 4:
        return jsonify({'error': 'New password must be at least 4 characters'}), 400
    g.current_user.set_password(new_pw)
    db.session.commit()
    return jsonify({'message': 'Password changed successfully'})


# ─── User Management (admin only) ───

@app.route('/api/users', methods=['GET'])
@admin_required
def list_users():
    users = User.query.order_by(User.username).all()
    return jsonify([u.to_dict() for u in users])


@app.route('/api/users/<int:uid>', methods=['DELETE'])
@admin_required
def delete_user(uid):
    if uid == g.current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400
    user = User.query.get_or_404(uid)
    db.session.delete(user)
    db.session.commit()
    return '', 204


@app.route('/api/users/<int:uid>/reset-password', methods=['POST'])
@admin_required
def reset_user_password(uid):
    data = request.get_json(silent=True)
    if not data or not data.get('new_password'):
        return jsonify({'error': 'new_password required'}), 400
    user = User.query.get_or_404(uid)
    user.set_password(data['new_password'])
    db.session.commit()
    return jsonify({'message': f'Password reset for {user.username}'})


@app.route('/api/users/<int:uid>/toggle-admin', methods=['POST'])
@admin_required
def toggle_admin(uid):
    if uid == g.current_user.id:
        return jsonify({'error': 'Cannot change your own admin status'}), 400
    user = User.query.get_or_404(uid)
    user.is_admin = not user.is_admin
    db.session.commit()
    return jsonify(user.to_dict())


# ─── OpenFoodFacts ───

def normalize_barcode(barcode):
    bc = barcode.strip()
    if bc.isdigit() and len(bc) < 13:
        bc = bc.zfill(13)
    return bc


def find_product_by_barcode(barcode):
    """Search for a product by barcode in both legacy field and barcodes table."""
    bc = normalize_barcode(barcode)
    raw = barcode.strip()
    stripped = barcode.lstrip('0')
    variants = list({v for v in [bc, raw, stripped, stripped.zfill(13) if stripped else None] if v})

    # Search legacy Product.barcode field
    for v in variants:
        p = Product.query.filter_by(barcode=v).first()
        if p:
            return p

    # Search product_barcodes table
    for v in variants:
        pb = ProductBarcode.query.filter_by(barcode=v).first()
        if pb:
            return pb.product

    return None


def _parse_off_product(p, barcode=None):
    name = p.get('product_name') or p.get('product_name_en') or p.get('product_name_fr') or p.get('product_name_de') or ''
    if not name: return None
    return {
        'barcode': barcode or p.get('code', ''),
        'name': name,
        'brand': p.get('brands', ''),
        'image_url': p.get('image_front_small_url', '') or p.get('image_url', ''),
        'category': (p.get('categories_tags', [''])[0].replace('en:', '').replace('fr:', '').replace('de:', '') if p.get('categories_tags') else ''),
        'quantity_unit': 'pcs',
        'calories_per_100g': p.get('nutriments', {}).get('energy-kcal_100g'),
    }


def lookup_barcode(barcode):
    bc = normalize_barcode(barcode)
    urls = [
        f"https://{OFF_COUNTRY}.openfoodfacts.org/api/v2/product/{bc}.json",
        f"https://world.openfoodfacts.org/api/v2/product/{bc}.json",
    ]
    for url in urls:
        try:
            resp = requests.get(url, timeout=10, headers={'User-Agent': 'PantryPal/1.0'})
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 1:
                    result = _parse_off_product(data['product'], bc)
                    if result: return result
        except Exception as e:
            print(f"OFF lookup failed ({url}): {e}")
    return None


def search_openfoodfacts(query, page=1):
    urls = [
        f"https://{OFF_COUNTRY}.openfoodfacts.org/cgi/search.pl",
        f"https://world.openfoodfacts.org/cgi/search.pl",
    ]
    for url in urls:
        try:
            resp = requests.get(url, timeout=10, params={
                'search_terms': query, 'search_simple': 1,
                'action': 'process', 'json': 1, 'page_size': 20, 'page': page,
            }, headers={'User-Agent': 'PantryPal/1.0'})
            if resp.status_code == 200:
                data = resp.json()
                results = [r for r in [_parse_off_product(p) for p in data.get('products', [])] if r]
                if results: return results
        except Exception as e:
            print(f"OFF search failed ({url}): {e}")
    return []


def check_and_auto_add_to_shopping(product):
    if product.min_stock and product.min_stock > 0:
        stock = sum(e.quantity for e in product.inventory if e.quantity > 0)
        if stock < product.min_stock:
            existing = ShoppingList.query.filter_by(product_id=product.id, checked=False).first()
            if not existing:
                needed = product.min_stock - stock
                item = ShoppingList(
                    product_id=product.id, name=product.name,
                    quantity=max(needed, product.default_quantity),
                    unit=product.quantity_unit, auto_added=True,
                )
                db.session.add(item)
                db.session.commit()
                return True
    return False


# ─── Products ───

@app.route('/api/products', methods=['GET'])
@auth_required
def get_products():
    q = request.args.get('q', '')
    category = request.args.get('category', '')
    query = Product.query
    if q:
        query = query.filter(Product.name.ilike(f'%{q}%'))
    if category:
        query = query.filter(Product.category == category)
    return jsonify([p.to_dict() for p in query.order_by(Product.name).all()])


@app.route('/api/products/<int:pid>', methods=['GET'])
@auth_required
def get_product(pid):
    return jsonify(Product.query.get_or_404(pid).to_dict())


@app.route('/api/products', methods=['POST'])
@auth_required
def create_product():
    data = request.get_json(silent=True)
    if not data or not data.get('name'):
        return jsonify({'error': 'Product name is required'}), 400
    p = Product(
        barcode=data.get('barcode'), name=data['name'], brand=data.get('brand'),
        image_url=data.get('image_url'), category=data.get('category'),
        quantity_unit=data.get('quantity_unit', 'pcs'),
        default_quantity=data.get('default_quantity', 1.0),
        min_stock=data.get('min_stock', 0),
        calories_per_100g=data.get('calories_per_100g'),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201


@app.route('/api/products/<int:pid>', methods=['PUT'])
@auth_required
def update_product(pid):
    p = Product.query.get_or_404(pid)
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    for key in ['name','brand','barcode','image_url','category','quantity_unit','default_quantity','min_stock','calories_per_100g']:
        if key in data:
            setattr(p, key, data[key])
    db.session.commit()
    return jsonify(p.to_dict())


@app.route('/api/products/<int:pid>', methods=['DELETE'])
@auth_required
def delete_product(pid):
    p = Product.query.get_or_404(pid)
    db.session.delete(p)
    db.session.commit()
    return '', 204


@app.route('/api/products/categories', methods=['GET'])
@auth_required
def get_categories():
    cats = db.session.query(Product.category).distinct().filter(Product.category.isnot(None), Product.category != '').all()
    return jsonify([c[0] for c in cats])


# ─── Barcode ───

@app.route('/api/barcode/<barcode>', methods=['GET'])
@auth_required
def barcode_lookup(barcode):
    product = find_product_by_barcode(barcode)
    if product:
        return jsonify({'found': True, 'source': 'local', 'product': product.to_dict()})
    off_data = lookup_barcode(barcode)
    if off_data:
        return jsonify({'found': True, 'source': 'openfoodfacts', 'product': off_data})
    return jsonify({'found': False, 'barcode': barcode})


@app.route('/api/openfoodfacts/search', methods=['GET'])
@auth_required
def off_search():
    q = request.args.get('q', '').strip()
    if not q or len(q) < 2:
        return jsonify([])
    results = search_openfoodfacts(q)
    return jsonify(results)


# ─── Product Barcodes ───

@app.route('/api/products/<int:pid>/barcodes', methods=['GET'])
@auth_required
def get_product_barcodes(pid):
    product = Product.query.get_or_404(pid)
    return jsonify(product.all_barcodes())


@app.route('/api/products/<int:pid>/barcodes', methods=['POST'])
@auth_required
def add_product_barcode(pid):
    product = Product.query.get_or_404(pid)
    data = request.get_json(silent=True)
    if not data or not data.get('barcode'):
        return jsonify({'error': 'Barcode is required'}), 400
    bc = normalize_barcode(data['barcode'])
    label = data.get('label', '').strip() or None

    # Check if barcode is already used by another product
    existing = find_product_by_barcode(bc)
    if existing and existing.id != pid:
        return jsonify({'error': f'Barcode {bc} is already assigned to "{existing.name}"'}), 409

    # Check if already on this product
    if bc in product.all_barcodes():
        return jsonify({'error': 'Barcode already assigned to this product'}), 409

    pb = ProductBarcode(product_id=pid, barcode=bc, label=label)
    db.session.add(pb)

    # If product has no primary barcode, set it
    if not product.barcode:
        product.barcode = bc

    db.session.commit()
    return jsonify(pb.to_dict()), 201


@app.route('/api/products/<int:pid>/barcodes/<barcode>', methods=['DELETE'])
@auth_required
def remove_product_barcode(pid, barcode):
    product = Product.query.get_or_404(pid)
    bc = normalize_barcode(barcode)

    # Remove from barcodes table
    pb = ProductBarcode.query.filter_by(product_id=pid, barcode=bc).first()
    if pb:
        db.session.delete(pb)

    # If it was the legacy barcode, clear it (or set to another barcode)
    if product.barcode == bc:
        remaining = ProductBarcode.query.filter_by(product_id=pid).filter(ProductBarcode.barcode != bc).first()
        product.barcode = remaining.barcode if remaining else None

    db.session.commit()
    return jsonify({'barcodes': product.all_barcodes()})


# ─── Inventory ───

@app.route('/api/inventory', methods=['GET'])
@auth_required
def get_inventory():
    entries = InventoryEntry.query.filter(InventoryEntry.quantity > 0).all()
    result = {}
    for e in entries:
        pid = e.product_id
        if pid not in result:
            result[pid] = {'product': e.product.to_dict(), 'entries': []}
        result[pid]['entries'].append(e.to_dict())
    return jsonify(list(result.values()))


@app.route('/api/inventory/add', methods=['POST'])
@auth_required
def add_to_inventory():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    barcode = data.get('barcode')
    product_id = data.get('product_id')
    quantity = data.get('quantity', 1.0)
    best_before = data.get('best_before')
    location = data.get('location')
    product = None
    if product_id:
        product = Product.query.get(product_id)
    elif barcode:
        product = find_product_by_barcode(barcode)
        if not product:
            off_data = lookup_barcode(barcode)
            if off_data:
                product = Product(
                    barcode=normalize_barcode(barcode), name=off_data['name'], brand=off_data.get('brand'),
                    image_url=off_data.get('image_url'), category=off_data.get('category'),
                    calories_per_100g=off_data.get('calories_per_100g'),
                )
                db.session.add(product)
                db.session.commit()
            else:
                return jsonify({
                    'error': f'Barcode {barcode} not found locally or on OpenFoodFacts.',
                    'barcode': barcode,
                    'not_found': True,
                }), 404
    if not product:
        return jsonify({'error': 'Product not found. Create it first or scan a known barcode.'}), 404

    # Auto-inherit location from most recent entry for this product
    if not location:
        last_entry = InventoryEntry.query.filter_by(product_id=product.id).filter(
            InventoryEntry.location.isnot(None), InventoryEntry.location != ''
        ).order_by(InventoryEntry.added_at.desc()).first()
        if last_entry:
            location = last_entry.location

    entry = InventoryEntry(
        product_id=product.id, quantity=quantity,
        best_before=date.fromisoformat(best_before) if best_before else None,
        location=location,
    )
    db.session.add(entry)
    log = ActivityLog(action='add', product_id=product.id, quantity=quantity,
                      details=f'Added via {"barcode scan" if barcode else "manual"}')
    db.session.add(log)
    db.session.commit()
    return jsonify({'product': product.to_dict(), 'entry': entry.to_dict()}), 201


@app.route('/api/inventory/consume', methods=['POST'])
@auth_required
def consume_from_inventory():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    barcode = data.get('barcode')
    product_id = data.get('product_id')
    quantity = data.get('quantity', 1.0)
    product = None
    if product_id:
        product = Product.query.get(product_id)
    elif barcode:
        product = find_product_by_barcode(barcode)
    if not product:
        return jsonify({'error': f'Product not found for barcode {barcode}. Scan it in replenish mode first to register it.'}), 404
    remaining = quantity
    entries = InventoryEntry.query.filter_by(product_id=product.id).filter(
        InventoryEntry.quantity > 0).order_by(InventoryEntry.best_before.asc().nullslast()).all()
    for entry in entries:
        if remaining <= 0:
            break
        take = min(entry.quantity, remaining)
        entry.quantity -= take
        remaining -= take
    log = ActivityLog(action='consume', product_id=product.id, quantity=quantity,
                      details=f'Consumed via {"barcode scan" if barcode else "manual"}')
    db.session.add(log)
    db.session.commit()
    auto_added = check_and_auto_add_to_shopping(product)
    return jsonify({'product': product.to_dict(), 'consumed': quantity - remaining,
                    'auto_added_to_shopping': auto_added})


@app.route('/api/inventory/expiring', methods=['GET'])
@auth_required
def get_expiring():
    days = int(request.args.get('days', 7))
    threshold = date.today() + timedelta(days=days)
    entries = InventoryEntry.query.filter(
        InventoryEntry.quantity > 0, InventoryEntry.best_before.isnot(None),
        InventoryEntry.best_before <= threshold,
    ).order_by(InventoryEntry.best_before.asc()).all()
    return jsonify([{**e.to_dict(), 'product': e.product.to_dict()} for e in entries])


@app.route('/api/inventory/<int:eid>', methods=['PUT'])
@auth_required
def update_inventory_entry(eid):
    """Update an inventory entry (quantity, location, best_before)."""
    entry = InventoryEntry.query.get_or_404(eid)
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    if 'quantity' in data:
        entry.quantity = float(data['quantity'])
    if 'location' in data:
        entry.location = data['location'] or None
    if 'best_before' in data:
        entry.best_before = date.fromisoformat(data['best_before']) if data['best_before'] else None
    db.session.commit()
    return jsonify(entry.to_dict())


@app.route('/api/inventory/<int:eid>', methods=['DELETE'])
@auth_required
def delete_inventory_entry(eid):
    entry = InventoryEntry.query.get_or_404(eid)
    db.session.delete(entry)
    db.session.commit()
    return '', 204


@app.route('/api/inventory/locations', methods=['GET'])
@auth_required
def get_locations():
    """Get distinct storage locations."""
    locs = db.session.query(InventoryEntry.location).distinct().filter(
        InventoryEntry.location.isnot(None), InventoryEntry.location != '',
        InventoryEntry.quantity > 0).all()
    return jsonify([l[0] for l in locs])


# ─── Recipes ───

@app.route('/api/recipes', methods=['GET'])
@auth_required
def get_recipes():
    q = request.args.get('q', '')
    category = request.args.get('category', '')
    query = Recipe.query
    if q:
        query = query.filter(Recipe.name.ilike(f'%{q}%'))
    if category:
        query = query.filter(Recipe.category == category)
    return jsonify([r.to_dict() for r in query.order_by(Recipe.name).all()])


@app.route('/api/recipes/categories', methods=['GET'])
@auth_required
def get_recipe_categories():
    cats = db.session.query(Recipe.category).distinct().filter(
        Recipe.category.isnot(None), Recipe.category != '').all()
    return jsonify([c[0] for c in cats])


@app.route('/api/recipes/<int:rid>', methods=['GET'])
@auth_required
def get_recipe(rid):
    return jsonify(Recipe.query.get_or_404(rid).to_dict())


@app.route('/api/recipes', methods=['POST'])
@auth_required
def create_recipe():
    data = request.get_json(silent=True)
    if not data or not data.get('name'):
        return jsonify({'error': 'Recipe name is required'}), 400
    r = Recipe(
        name=data['name'], description=data.get('description'),
        instructions=data.get('instructions'), servings=data.get('servings', 4),
        prep_time=data.get('prep_time'), cook_time=data.get('cook_time'),
        image_url=data.get('image_url'), source_url=data.get('source_url'),
        category=data.get('category'),
    )
    db.session.add(r)
    db.session.flush()
    for ing in data.get('ingredients', []):
        ri = RecipeIngredient(
            recipe_id=r.id, product_id=ing.get('product_id'), name=ing['name'],
            quantity=ing.get('quantity'), unit=ing.get('unit'), notes=ing.get('notes'),
        )
        db.session.add(ri)
    db.session.commit()
    return jsonify(r.to_dict()), 201


@app.route('/api/recipes/<int:rid>', methods=['PUT'])
@auth_required
def update_recipe(rid):
    r = Recipe.query.get_or_404(rid)
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    for key in ['name','description','instructions','servings','prep_time','cook_time','image_url','source_url','category']:
        if key in data:
            setattr(r, key, data[key])
    if 'ingredients' in data:
        RecipeIngredient.query.filter_by(recipe_id=r.id).delete()
        for ing in data['ingredients']:
            ri = RecipeIngredient(
                recipe_id=r.id, product_id=ing.get('product_id'), name=ing['name'],
                quantity=ing.get('quantity'), unit=ing.get('unit'), notes=ing.get('notes'),
            )
            db.session.add(ri)
    db.session.commit()
    return jsonify(r.to_dict())


@app.route('/api/recipes/<int:rid>', methods=['DELETE'])
@auth_required
def delete_recipe(rid):
    r = Recipe.query.get_or_404(rid)
    db.session.delete(r)
    db.session.commit()
    return '', 204




@app.route('/api/recipes/import-url', methods=['POST'])
@auth_required
def import_recipe_from_url():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    if not url.startswith('http://') and not url.startswith('https://'):
        return jsonify({'error': 'URL must start with http:// or https://'}), 400

    # Try recipe-scrapers first
    try:
        from recipe_scrapers import scrape_me
        scraper = scrape_me(url, wild_mode=True)
        ingredients_raw = []
        try:
            ingredients_raw = scraper.ingredients()
        except Exception:
            pass
        if ingredients_raw:  # Only succeed if we actually got ingredients
            ingredients = [{'name': t, 'quantity': None, 'unit': None, 'notes': None} for t in ingredients_raw]
            title = 'Imported Recipe'
            try: title = scraper.title()
            except Exception: pass
            description = ''
            try: description = scraper.description() if hasattr(scraper, 'description') else ''
            except Exception: pass
            instructions = ''
            try: instructions = scraper.instructions()
            except Exception: pass
            servings = 4
            try:
                y = scraper.yields()
                if y: servings = _parse_int(y) or 4
            except Exception: pass
            prep_time = None
            try: prep_time = scraper.prep_time()
            except Exception: pass
            cook_time = None
            try: cook_time = scraper.cook_time()
            except Exception: pass
            image_url = None
            try: image_url = scraper.image()
            except Exception: pass
            return jsonify({
                'name': title, 'description': description, 'instructions': instructions,
                'servings': servings, 'prep_time': prep_time, 'cook_time': cook_time,
                'image_url': image_url, 'source_url': url, 'ingredients': ingredients,
            })
    except Exception as e:
        print(f"recipe-scrapers failed: {e}")

    # Fallback: parse JSON-LD + Open Graph manually
    try:
        result = _fallback_recipe_parse(url)
        if result:
            return jsonify(result)
    except Exception as e:
        print(f"Fallback parser failed: {e}")

    return jsonify({'error': 'Could not extract recipe from this URL. The site may not have structured recipe data.'}), 400


def _fallback_recipe_parse(url):
    """Fallback recipe parser: extract JSON-LD Recipe schema and Open Graph tags."""
    import json
    import re
    from bs4 import BeautifulSoup

    resp = requests.get(url, timeout=15, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; PantryPal/1.0; +https://pantrypal.local)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8,fr;q=0.7',
    })
    if resp.status_code != 200:
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Try JSON-LD recipe schema
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            raw = script.string or script.get_text()
            if not raw:
                continue
            # Clean up common issues
            raw = raw.strip()
            data = json.loads(raw)

            recipes = _find_recipe_in_jsonld(data)
            for recipe in recipes:
                parsed = _parse_jsonld_recipe(recipe, url)
                if parsed and parsed.get('ingredients'):
                    return parsed
        except Exception as e:
            print(f"JSON-LD parse failed: {e}")
            continue

    # Last resort: Open Graph tags for title and image only
    og_title = soup.find('meta', property='og:title')
    og_image = soup.find('meta', property='og:image')
    og_desc = soup.find('meta', property='og:description')
    if og_title:
        return {
            'name': og_title.get('content', 'Imported Recipe'),
            'description': og_desc.get('content', '') if og_desc else '',
            'instructions': '',
            'servings': 4,
            'prep_time': None,
            'cook_time': None,
            'image_url': og_image.get('content', '') if og_image else '',
            'source_url': url,
            'ingredients': [],
        }
    return None


def _find_recipe_in_jsonld(data):
    """Recursively find Recipe objects in JSON-LD data."""
    if isinstance(data, list):
        results = []
        for item in data:
            results.extend(_find_recipe_in_jsonld(item))
        return results
    if isinstance(data, dict):
        t = data.get('@type', '')
        if isinstance(t, list):
            if 'Recipe' in t:
                return [data]
        elif t == 'Recipe':
            return [data]
        # Check @graph
        if '@graph' in data:
            return _find_recipe_in_jsonld(data['@graph'])
        # Check mainEntity / nested objects
        results = []
        for v in data.values():
            if isinstance(v, (dict, list)):
                results.extend(_find_recipe_in_jsonld(v))
        return results
    return []


def _parse_jsonld_recipe(recipe, url):
    """Parse a JSON-LD Recipe object into our format."""
    name = recipe.get('name', '')
    if isinstance(name, dict):
        name = name.get('@value', '') or ''

    description = recipe.get('description', '') or ''
    if isinstance(description, dict):
        description = description.get('@value', '') or ''

    # Image may be string, object, or list
    image = recipe.get('image', '')
    if isinstance(image, list) and image:
        image = image[0]
    if isinstance(image, dict):
        image = image.get('url', '') or image.get('@id', '') or ''

    # Ingredients
    ingredients_raw = recipe.get('recipeIngredient') or recipe.get('ingredients') or []
    if isinstance(ingredients_raw, str):
        ingredients_raw = [ingredients_raw]
    ingredients = [{'name': str(i).strip(), 'quantity': None, 'unit': None, 'notes': None}
                   for i in ingredients_raw if i]

    # Instructions — can be string, list of strings, or list of HowToStep objects
    instructions = ''
    inst_raw = recipe.get('recipeInstructions') or recipe.get('instructions') or ''
    if isinstance(inst_raw, str):
        instructions = inst_raw
    elif isinstance(inst_raw, list):
        steps = []
        for step in inst_raw:
            if isinstance(step, str):
                steps.append(step)
            elif isinstance(step, dict):
                text = step.get('text') or step.get('name') or ''
                if text:
                    steps.append(text.strip())
                # Handle HowToSection
                if step.get('@type') == 'HowToSection':
                    for sub in step.get('itemListElement', []):
                        if isinstance(sub, dict):
                            t = sub.get('text') or sub.get('name') or ''
                            if t:
                                steps.append(t.strip())
        instructions = '\n\n'.join(steps)

    # Servings
    servings = 4
    yield_raw = recipe.get('recipeYield') or recipe.get('yield')
    if yield_raw:
        if isinstance(yield_raw, list) and yield_raw:
            yield_raw = yield_raw[0]
        servings = _parse_int(yield_raw) or 4

    # Times (ISO 8601 durations like PT30M)
    prep_time = _parse_iso_duration(recipe.get('prepTime'))
    cook_time = _parse_iso_duration(recipe.get('cookTime'))

    # Category
    category = ''
    cat_raw = recipe.get('recipeCategory', '')
    if isinstance(cat_raw, list) and cat_raw:
        cat_raw = cat_raw[0]
    if isinstance(cat_raw, str):
        category = cat_raw.lower().strip()

    return {
        'name': name or 'Imported Recipe',
        'description': description,
        'instructions': instructions,
        'servings': servings,
        'prep_time': prep_time,
        'cook_time': cook_time,
        'image_url': image if isinstance(image, str) else '',
        'source_url': url,
        'category': category,
        'ingredients': ingredients,
    }


def _parse_iso_duration(val):
    """Parse ISO 8601 duration like PT30M to minutes."""
    if not val or not isinstance(val, str):
        return None
    import re
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', val)
    if not m:
        return _parse_int(val)
    hours = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    total = hours * 60 + mins
    return total if total > 0 else None


def _parse_int(val):
    if val is None:
        return None
    import re
    nums = re.findall(r'\d+', str(val))
    return int(nums[0]) if nums else None


# ─── Meal Planning ───

@app.route('/api/meal-plans', methods=['GET'])
@auth_required
def get_meal_plans():
    start = request.args.get('start', date.today().isoformat())
    end = request.args.get('end', (date.today() + timedelta(days=7)).isoformat())
    plans = MealPlan.query.filter(MealPlan.date >= date.fromisoformat(start),
        MealPlan.date <= date.fromisoformat(end)).order_by(MealPlan.date, MealPlan.meal_type).all()
    return jsonify([p.to_dict() for p in plans])


@app.route('/api/meal-plans', methods=['POST'])
@auth_required
def create_meal_plan():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    mp = MealPlan(
        date=date.fromisoformat(data['date']), meal_type=data['meal_type'],
        recipe_id=data.get('recipe_id'), custom_meal=data.get('custom_meal'),
        servings=data.get('servings', 2), notes=data.get('notes'),
    )
    db.session.add(mp)
    db.session.commit()
    return jsonify(mp.to_dict()), 201


@app.route('/api/meal-plans/<int:mpid>', methods=['DELETE'])
@auth_required
def delete_meal_plan(mpid):
    mp = MealPlan.query.get_or_404(mpid)
    db.session.delete(mp)
    db.session.commit()
    return '', 204


@app.route('/api/meal-plans/generate-shopping-list', methods=['POST'])
@auth_required
def generate_shopping_list_from_meals():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    start = date.fromisoformat(data.get('start', date.today().isoformat()))
    end = date.fromisoformat(data.get('end', (date.today() + timedelta(days=7)).isoformat()))
    plans = MealPlan.query.filter(MealPlan.date >= start, MealPlan.date <= end,
        MealPlan.recipe_id.isnot(None)).all()
    added = []
    for plan in plans:
        recipe = plan.recipe
        if not recipe: continue
        scale = plan.servings / recipe.servings if recipe.servings else 1
        for ing in recipe.ingredients:
            existing = ShoppingList.query.filter_by(name=ing.name, checked=False).first()
            if existing: continue
            needed_qty = (ing.quantity or 1) * scale
            in_stock = 0
            if ing.product_id:
                product = Product.query.get(ing.product_id)
                if product:
                    in_stock = sum(e.quantity for e in product.inventory if e.quantity > 0)
            if in_stock < needed_qty:
                item = ShoppingList(product_id=ing.product_id, name=ing.name,
                    quantity=needed_qty - in_stock, unit=ing.unit, auto_added=True)
                db.session.add(item)
                added.append(ing.name)
    db.session.commit()
    return jsonify({'added': added, 'count': len(added)})


# ─── Shopping List ───

@app.route('/api/shopping-list', methods=['GET'])
@auth_required
def get_shopping_list():
    items = ShoppingList.query.order_by(ShoppingList.checked, ShoppingList.name).all()
    return jsonify([i.to_dict() for i in items])


@app.route('/api/shopping-list', methods=['POST'])
@auth_required
def add_to_shopping_list():
    data = request.get_json(silent=True)
    if not data or not data.get('name'):
        return jsonify({'error': 'Item name is required'}), 400
    item = ShoppingList(product_id=data.get('product_id'), name=data['name'],
        quantity=data.get('quantity', 1.0), unit=data.get('unit'))
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@app.route('/api/shopping-list/<int:sid>', methods=['PUT'])
@auth_required
def update_shopping_item(sid):
    item = ShoppingList.query.get_or_404(sid)
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    for key in ['name','quantity','unit','checked']:
        if key in data:
            setattr(item, key, data[key])
    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/api/shopping-list/<int:sid>', methods=['DELETE'])
@auth_required
def delete_shopping_item(sid):
    item = ShoppingList.query.get_or_404(sid)
    db.session.delete(item)
    db.session.commit()
    return '', 204


@app.route('/api/shopping-list/clear-checked', methods=['POST'])
@auth_required
def clear_checked():
    ShoppingList.query.filter_by(checked=True).delete()
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/shopping-list/scan', methods=['POST'])
@auth_required
def shopping_scan():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    barcode = data.get('barcode')
    add_to_inv = data.get('add_to_inventory', True)
    if not barcode:
        return jsonify({'error': 'Barcode is required'}), 400
    product = find_product_by_barcode(barcode)
    if not product:
        off_data = lookup_barcode(barcode)
        if off_data:
            product = Product(barcode=normalize_barcode(barcode), name=off_data['name'], brand=off_data.get('brand'),
                image_url=off_data.get('image_url'), category=off_data.get('category'),
                calories_per_100g=off_data.get('calories_per_100g'))
            db.session.add(product)
            db.session.commit()
    if not product:
        return jsonify({'error': f'Unknown barcode: {barcode}'}), 404
    checked_items = []
    items = ShoppingList.query.filter_by(product_id=product.id, checked=False).all()
    if not items:
        items = ShoppingList.query.filter(ShoppingList.name.ilike(f'%{product.name}%'),
            ShoppingList.checked == False).all()
    for item in items:
        item.checked = True
        checked_items.append(item.to_dict())
    if add_to_inv:
        entry = InventoryEntry(product_id=product.id, quantity=product.default_quantity or 1.0)
        db.session.add(entry)
    log = ActivityLog(action='shopping_scan', product_id=product.id, quantity=1,
                      details='Scanned while shopping')
    db.session.add(log)
    db.session.commit()
    return jsonify({'product': product.to_dict(), 'checked_items': checked_items,
                    'added_to_inventory': add_to_inv})


# ─── Activity Log ───

@app.route('/api/activity', methods=['GET'])
@auth_required
def get_activity():
    limit = int(request.args.get('limit', 50))
    logs = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(limit).all()
    return jsonify([l.to_dict() for l in logs])


# ─── Dashboard ───

@app.route('/api/dashboard', methods=['GET'])
@auth_required
def dashboard():
    total_products = Product.query.count()
    total_stock = db.session.query(db.func.sum(InventoryEntry.quantity)).filter(
        InventoryEntry.quantity > 0).scalar() or 0
    low_stock = []
    for p in Product.query.filter(Product.min_stock > 0).all():
        stock = sum(e.quantity for e in p.inventory if e.quantity > 0)
        if stock < p.min_stock:
            low_stock.append(p.to_dict())
    expiring_soon = InventoryEntry.query.filter(
        InventoryEntry.quantity > 0, InventoryEntry.best_before.isnot(None),
        InventoryEntry.best_before <= date.today() + timedelta(days=3)).count()
    shopping_count = ShoppingList.query.filter_by(checked=False).count()
    recipe_count = Recipe.query.count()
    today_meals = MealPlan.query.filter_by(date=date.today()).all()
    return jsonify({
        'total_products': total_products, 'total_stock': total_stock,
        'low_stock': low_stock, 'expiring_soon': expiring_soon,
        'shopping_count': shopping_count, 'recipe_count': recipe_count,
        'today_meals': [m.to_dict() for m in today_meals],
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
