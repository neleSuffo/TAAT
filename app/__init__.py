from flask import Flask
from config.config import Config
import os

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Ensure required directories exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['ANNOTATIONS_FOLDER'], exist_ok=True)
    os.makedirs(app.config['CATEGORIES_FOLDER'], exist_ok=True)
    os.makedirs('config', exist_ok=True)

    # Register blueprints
    from app.routes.main_routes import main
    from app.routes.annotation_routes import annotation
    from app.routes.category_routes import category

    app.register_blueprint(main)
    app.register_blueprint(annotation)
    app.register_blueprint(category)

    return app 