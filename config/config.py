import os
from pathlib import Path

class Config:
    UPLOAD_FOLDER = 'uploads'
    ANNOTATIONS_FOLDER = 'annotations'
    EVENT_TYPES_FILE = 'config/annotation_types.json'
    CATEGORIES_FOLDER = 'categories'
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB max file size
    
    # Add any other configuration variables here
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-please-change' 