from flask import Blueprint, render_template, request, jsonify, send_from_directory
from app.services.video_service import VideoService
from app.services.annotation_service import AnnotationService

main = Blueprint('main', __name__)
video_service = VideoService()
annotation_service = AnnotationService()

@main.route('/')
def index():
    return render_template('index.html')

@main.route('/upload', methods=['POST'])
def upload_video():
    return video_service.handle_upload(request)

@main.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename) 