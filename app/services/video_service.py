from flask import current_app, jsonify
from werkzeug.utils import secure_filename
import cv2
from pathlib import Path
import shutil
import json

class VideoService:
    def handle_upload(self, request):
        if 'video' not in request.files:
            return jsonify({'error': 'No video file uploaded'}), 400

        video_file = request.files['video']
        category_id = request.form.get('categoryId')
        
        if not category_id:
            return jsonify({'error': 'No category selected'}), 400
        
        if video_file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        try:
            filename = secure_filename(video_file.filename)
            category_folder = Path(current_app.config['CATEGORIES_FOLDER']) / category_id
            category_folder.mkdir(exist_ok=True)
            
            # Process video upload
            video_info = self._process_video_upload(video_file, filename, category_folder)
            return jsonify(video_info)

        except Exception as e:
            return jsonify({'error': f'Error processing video: {str(e)}'}), 500

    def _process_video_upload(self, video_file, filename, category_folder):
        # Implementation of video processing logic
        # ... (rest of the video processing code from original app.py)
        pass 