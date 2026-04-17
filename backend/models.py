from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import json
import bcrypt

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    display_name = db.Column(db.String(128))
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name,
            'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    barcode = db.Column(db.String(64), nullable=True, index=True)  # Legacy primary barcode
    name = db.Column(db.String(256), nullable=False)
    brand = db.Column(db.String(256))
    image_url = db.Column(db.String(512))
    category = db.Column(db.String(128))
    quantity_unit = db.Column(db.String(32), default='pcs')
    default_quantity = db.Column(db.Float, default=1.0)
    min_stock = db.Column(db.Float, default=0.0)
    calories_per_100g = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.now)

    inventory = db.relationship('InventoryEntry', backref='product', lazy=True, cascade='all, delete-orphan')
    barcodes = db.relationship('ProductBarcode', backref='product', lazy=True, cascade='all, delete-orphan')

    def all_barcodes(self):
        """Return all barcodes: legacy field + barcodes table."""
        codes = [b.barcode for b in self.barcodes]
        if self.barcode and self.barcode not in codes:
            codes.insert(0, self.barcode)
        return codes

    def to_dict(self):
        stock = sum(e.quantity for e in self.inventory if e.quantity > 0)
        return {
            'id': self.id,
            'barcode': self.barcode,
            'barcodes': self.all_barcodes(),
            'name': self.name,
            'brand': self.brand,
            'image_url': self.image_url,
            'category': self.category,
            'quantity_unit': self.quantity_unit,
            'default_quantity': self.default_quantity,
            'min_stock': self.min_stock,
            'calories_per_100g': self.calories_per_100g,
            'stock': stock,
            'below_min': stock < self.min_stock if self.min_stock else False,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ProductBarcode(db.Model):
    __tablename__ = 'product_barcodes'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    barcode = db.Column(db.String(64), nullable=False, index=True)
    label = db.Column(db.String(128))  # optional label like "Migros Bio Milk 1L"
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'barcode': self.barcode,
            'label': self.label,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class InventoryEntry(db.Model):
    __tablename__ = 'inventory'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    best_before = db.Column(db.Date, nullable=True)
    location = db.Column(db.String(128))
    added_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'quantity': self.quantity,
            'best_before': self.best_before.isoformat() if self.best_before else None,
            'location': self.location,
            'added_at': self.added_at.isoformat() if self.added_at else None,
        }


class Recipe(db.Model):
    __tablename__ = 'recipes'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    description = db.Column(db.Text)
    instructions = db.Column(db.Text)
    servings = db.Column(db.Integer, default=4)
    prep_time = db.Column(db.Integer)  # minutes
    cook_time = db.Column(db.Integer)  # minutes
    image_url = db.Column(db.String(512))
    source_url = db.Column(db.String(512))
    category = db.Column(db.String(64))  # dessert, main, salad, soup, etc.
    created_at = db.Column(db.DateTime, default=datetime.now)

    ingredients = db.relationship('RecipeIngredient', backref='recipe', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'instructions': self.instructions,
            'servings': self.servings,
            'prep_time': self.prep_time,
            'cook_time': self.cook_time,
            'image_url': self.image_url,
            'source_url': self.source_url,
            'category': self.category,
            'ingredients': [i.to_dict() for i in self.ingredients],
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class RecipeIngredient(db.Model):
    __tablename__ = 'recipe_ingredients'
    id = db.Column(db.Integer, primary_key=True)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipes.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    name = db.Column(db.String(256), nullable=False)
    quantity = db.Column(db.Float)
    unit = db.Column(db.String(32))
    notes = db.Column(db.String(256))

    product = db.relationship('Product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'recipe_id': self.recipe_id,
            'product_id': self.product_id,
            'name': self.name,
            'quantity': self.quantity,
            'unit': self.unit,
            'notes': self.notes,
            'product': self.product.to_dict() if self.product else None,
        }


class MealPlan(db.Model):
    __tablename__ = 'meal_plans'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    meal_type = db.Column(db.String(32), nullable=False)  # breakfast, lunch, dinner, snack
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipes.id'), nullable=True)
    custom_meal = db.Column(db.String(256))
    servings = db.Column(db.Integer, default=2)
    notes = db.Column(db.Text)

    recipe = db.relationship('Recipe', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'meal_type': self.meal_type,
            'recipe_id': self.recipe_id,
            'custom_meal': self.custom_meal,
            'servings': self.servings,
            'notes': self.notes,
            'recipe': self.recipe.to_dict() if self.recipe else None,
        }


class ShoppingList(db.Model):
    __tablename__ = 'shopping_list'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    name = db.Column(db.String(256), nullable=False)
    quantity = db.Column(db.Float, default=1.0)
    unit = db.Column(db.String(32))
    checked = db.Column(db.Boolean, default=False)
    auto_added = db.Column(db.Boolean, default=False)
    added_at = db.Column(db.DateTime, default=datetime.now)

    product = db.relationship('Product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'name': self.name,
            'quantity': self.quantity,
            'unit': self.unit,
            'checked': self.checked,
            'auto_added': self.auto_added,
            'product': self.product.to_dict() if self.product else None,
            'added_at': self.added_at.isoformat() if self.added_at else None,
        }


class ActivityLog(db.Model):
    __tablename__ = 'activity_log'
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(32), nullable=False)  # add, consume, expire, shopping_scan
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    quantity = db.Column(db.Float)
    details = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.now)

    product = db.relationship('Product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'action': self.action,
            'product_id': self.product_id,
            'quantity': self.quantity,
            'details': self.details,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'product_name': self.product.name if self.product else None,
        }
