"""
Video Annotation Tool - Flask Backend

This application provides the backend functionality for a video annotation tool.
Key features:
- Video upload and management
- Annotation creation and storage
- Category and event management
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import cv2
import re
import json
from datetime import datetime
from pathlib import Path
import shutil
from werkzeug.utils import secure_filename
from copy import deepcopy

app = Flask(__name__)
# Configure upload limits and directories
app.config['UPLOAD_FOLDER'] = 'uploads'  # Where videos are stored
app.config['ANNOTATIONS_FOLDER'] = 'annotations'  # Where annotation data is stored
app.config['EVENT_TYPES_FILE'] = 'config/annotation_types.json'  # Event configuration
app.config['CATEGORIES_FOLDER'] = 'categories'  # Category-specific data
app.config['MAX_CONTENT_LENGTH'] = 2 * 1000 * 1024 * 1024  # 500MB max file size

# Create necessary directories
for directory in ['uploads', 'annotations', 'categories', 'config']:
    os.makedirs(directory, exist_ok=True)

def reprocess_raw_annotations(raw_annotations_list):
    """
    Converts a list of raw 'start' and 'end' annotations into a list of
    'complete' (paired) annotations and unpaired 'start' annotations.
    Relies on 'start' annotations having a unique 'id' and 'end' annotations
    having a 'startAnnotationId' linking to that unique 'id'.
    """
    processed_annotations = []
    # Stores start annotations keyed by their unique 'id'
    active_start_points_by_unique_id = {}

    for ann_data in raw_annotations_list:
        ann_type = ann_data.get('type')
        
        if ann_type == 'start':
            unique_start_id = ann_data.get('id')
            if unique_start_id:
                # Store a deepcopy to avoid modifying the original list if it's used elsewhere
                active_start_points_by_unique_id[unique_start_id] = deepcopy(ann_data)
            else:
                # This should ideally not happen if frontend ensures 'id' for start annotations
                print(f"Warning: Encountered 'start' annotation missing a unique 'id': {ann_data}")
                processed_annotations.append(deepcopy(ann_data)) # Add as is, or decide to skip
        elif ann_type == 'end':
            linked_start_id = ann_data.get('startAnnotationId')
            if linked_start_id and linked_start_id in active_start_points_by_unique_id:
                start_ann_instance = active_start_points_by_unique_id.pop(linked_start_id) # Paired, so remove
                
                # Create the 'complete' annotation based on the start annotation's data
                complete_ann = deepcopy(start_ann_instance)
                
                start_time = start_ann_instance.get('time')
                end_time = ann_data.get('time') # Time from the current 'end' annotation
                
                complete_ann.update({
                    'startTime': start_time,
                    'endTime': end_time,
                    'duration': (end_time - start_time) if start_time is not None and end_time is not None else 0,
                    'type': 'complete',
                    # 'time' field for 'complete' is typically the startTime
                })
                # Remove fields specific to start/end individual points if not needed for 'complete'
                complete_ann.pop('id', None) # Original unique id of the start point
                complete_ann.pop('startAnnotationId', None) # Not relevant for complete

                processed_annotations.append(complete_ann)
            else:
                # Orphaned end annotation (no matching start found or start already paired)
                print(f"Warning: Orphaned 'end' annotation or missing start pair for startAnnotationId '{linked_start_id}': {ann_data}")
                processed_annotations.append(deepcopy(ann_data)) # Add as is, or decide to skip
        else:
            # Annotations that are neither 'start' nor 'end' (e.g., already 'complete' if input can have them)
            # Or a 'start' annotation that was missing its 'id' and added above.
            processed_annotations.append(deepcopy(ann_data))

    # Add any remaining (unpaired) start annotations from active_start_points_by_unique_id
    for unpaired_start_ann in active_start_points_by_unique_id.values():
        processed_annotations.append(deepcopy(unpaired_start_ann)) # These are still 'start' type
        
    return processed_annotations


ind=None
@app.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_video():
    """
    Handle video upload and initial processing
    
    Expects:
    - video file in request.files
    - category_id in request.form
    
    Returns:
    - JSON with video info and existing annotations
    """
    if 'video' not in request.files:
        return jsonify({'error': 'No video file uploaded'}), 400

    video_file = request.files['video']
    category_id = request.form.get('categoryId')
    
    if not category_id:
        return jsonify({'error': 'No category selected'}), 400
    
    if video_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # Secure the filename
        print("here is the video file",video_file.filename)
        filename = secure_filename(video_file.filename)
        
        # Create category folder if it doesn't exist
        category_folder = Path(app.config['CATEGORIES_FOLDER']) / category_id
        category_folder.mkdir(exist_ok=True)
        
        # Create temporary path for the video
        temp_path = Path(app.config['UPLOAD_FOLDER']) / 'temp' / filename
        temp_path.parent.mkdir(exist_ok=True)
        
        # Save to temporary location first
        video_file.save(str(temp_path))
        
        # Get video info using OpenCV
        cap = cv2.VideoCapture(str(temp_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        cap.release()
        
        # Move file to final destination
        final_path = category_folder / filename
        shutil.move(str(temp_path), str(final_path))
        
        # Check for existing annotation file
        annotation_file = category_folder / f"{filename.rsplit('.', 1)[0]}.json"
        
        if annotation_file.exists():
            try:
                with annotation_file.open('r') as f:
                    annotations = json.load(f)
            except json.JSONDecodeError:
                annotations = {
                    "video_name": filename,
                    "category_id": category_id,
                    "annotations": []
                }
        else:
            annotations = {
                "video_name": filename,
                "category_id": category_id,
                "annotations": []
            }
            with annotation_file.open('w') as f:
                json.dump(annotations, f, indent=4)

        return jsonify({
            'filename': filename,
            'duration': duration,
            'annotations': annotations,
            'category_id': category_id
        })

    except Exception as e:
        # Clean up temporary files if they exist
        if 'temp_path' in locals():
            try:
                os.remove(temp_path)
            except:
                pass
        return jsonify({'error': f'Error processing video: {str(e)}'}), 500

def determine_format(data):
    """Determine if the data follows the old or new format."""
    if "version" in data and "videos" in data:
        return "new"
    elif isinstance(data, dict) and "annotations" in data:
        return "old"
    else:
        return "unknown"

def add_seconds_to_events(file_path,filename):
    def convert_game_time_to_seconds(game_time):
        """Convert a game time string to total seconds."""
       
        match2=re.match(r"(\d+) - (\d{2}):(\d{2}):(\d{2})", game_time)
        if match2:
                print("match2",match2)
                half,hour, minutes, seconds = map(int, match2.groups())
                total_seconds = hour*60*60 + minutes * 60 + seconds   # Assuming 45 minutes per half  (half - 1) * 45 * 60
        else :
                match = re.match(r"(\d+) - (\d+):(\d+)", game_time)
                if not match and not match2:
                    return None  # Return None if the format is invalid
                if match:
                    half, minutes, seconds = map(int, match.groups())
                    total_seconds = 0 + minutes * 60 + seconds   # Assuming 45 minutes per half  (half - 1) * 45 * 60



        return total_seconds

    # Read the JSON file
    with open(file_path, 'r') as file:
        data = json.load(file)

    # Handle the new format
    index=None
    if "version" in data and "videos" in data:
        videos_list=[]
        for idx,video in enumerate(data["videos"]):
            vid_name=video['path'].split("/")[-1].split(".")[0]
            
            if filename==vid_name:
                    index=idx
                    print(vid_name)
                    for annotation in video.get("annotations", []):
                        if "seconds" not in annotation and "gameTime" in annotation:
                            print(annotation["gameTime"])
                            annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
                    break        
    # Handle the old format
    elif isinstance(data, dict) and "annotations" in data:
        for annotation in data["annotations"]:
            if "seconds" not in annotation and "gameTime" in annotation:
                annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
    else:
        raise ValueError("Unsupported JSON structure: expected a specific format.")

    # Overwrite the JSON file with updated data
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    print(f"File '{file_path}' has been updated successfully!")
    return index

@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    """Save annotations for a video"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        filename = data.get('filename')
        category_id = data.get('categoryId')
        raw_annotations_from_client = data.get('annotations', [])
        active_annotations_map_from_client = data.get('activeAnnotations', {})

        if not all([filename, category_id]):
            return jsonify({'error': 'Missing required data (filename, categoryId)'}), 400

        # Create paths for both storage and processed files
        category_folder = Path(app.config['CATEGORIES_FOLDER']) / category_id
        category_folder.mkdir(parents=True, exist_ok=True) # Ensure category folder exists

        storage_file_path = category_folder / f"{filename.rsplit('.', 1)[0]}.json"
        processed_file_path = category_folder / f"{filename.rsplit('.', 1)[0]}_processed.json"

        raw_storage_data = {
            "video_name": filename,
            "category_id": category_id,
            "annotations": raw_annotations_from_client, # The list of start/end points
            "activeAnnotations": active_annotations_map_from_client # Client's map of active event types
        }
        with storage_file_path.open('w') as f:
            json.dump(raw_storage_data, f, indent=4)

        # --- Process raw annotations to create 'complete' and unpaired 'start' annotations ---
        processed_annotations_list = reprocess_raw_annotations(raw_annotations_from_client)

        processed_data_to_save = {
            "video_name": filename,
            "category_id": category_id,
            "annotations": processed_annotations_list,
             # activeAnnotations in processed file might be different or not needed if UI reconstructs from raw
            "activeAnnotations": active_annotations_map_from_client # Or derive from processed_annotations_list if needed
        }
        with processed_file_path.open('w') as f:
            json.dump(processed_data_to_save, f, indent=4)

        return jsonify({
            'message': 'Annotations saved successfully',
            # Return the raw annotations and active map, as the client sent them
            'annotations': raw_annotations_from_client,
            'activeAnnotations': active_annotations_map_from_client
        })

    except Exception as e:
        print(f"Error saving annotations: {str(e)}") # Log the full error
        # Be cautious about sending back raw 'data' in production
        return jsonify({'error': f'Error saving annotations: {str(e)}'}), 500

@app.route('/edit_annotations', methods=['POST'])
def edit_annotations():
    """Edit a specific point (start or end) of an annotation instance."""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        filename = data.get('filename')
        category_id = data.get('categoryId')
        
        # --- Parameters to identify the annotation and the change ---
        # The unique 'id' of the 'start' annotation of the pair being edited.
        instance_id_to_update = data.get('instanceId') 
        # Specifies which point of the pair is being modified: 'start' or 'end'.
        point_to_edit = data.get('pointToEdit') 
        new_time = data.get('newTime')
        new_fields = data.get('newFields', None) # Optional: if fields are also updated

        if not all([filename, category_id, instance_id_to_update, point_to_edit, new_time is not None]):
            return jsonify({'error': 'Missing required data for edit (filename, categoryId, instanceId, pointToEdit, newTime)'}), 400

        if point_to_edit not in ['start', 'end']:
            return jsonify({'error': f'Invalid pointToEdit value: {pointToEdit}. Must be "start" or "end".'}), 400

        category_folder = Path(app.config['CATEGORIES_FOLDER']) / category_id
        # Path to the raw storage file (contains start/end points)
        raw_storage_filename = f"{filename.rsplit('.', 1)[0]}.json"
        storage_file_path = category_folder / raw_storage_filename
        
        processed_filename = f"{filename.rsplit('.', 1)[0]}_processed.json"
        processed_file_path = category_folder / processed_filename


        if not storage_file_path.exists():
            return jsonify({'error': 'Annotations (raw storage) file not found'}), 404

        with storage_file_path.open('r') as f:
            storage_data = json.load(f) # This contains the 'annotations' list of raw start/end points

        raw_annotations_list = storage_data.get('annotations', [])
        updated_in_raw = False

        for ann in raw_annotations_list:
            if point_to_edit == 'start' and ann.get('type') == 'start' and ann.get('id') == instance_id_to_update:
                ann['time'] = new_time
                if new_fields is not None:
                    ann['fields'] = new_fields
                updated_in_raw = True
                # If start's fields change, the corresponding end's fields should also reflect this
                # (assuming fields are shared for the pair and defined by the start point)
                if new_fields is not None:
                    for end_ann_candidate in raw_annotations_list:
                        if end_ann_candidate.get('type') == 'end' and end_ann_candidate.get('startAnnotationId') == instance_id_to_update:
                            end_ann_candidate['fields'] = new_fields # Keep fields consistent
                            break 
                break 
            elif point_to_edit == 'end' and ann.get('type') == 'end' and ann.get('startAnnotationId') == instance_id_to_update:
                ann['time'] = new_time
                # If new_fields are provided when editing an 'end' point, it implies updating the pair's fields.
                # So, update the corresponding 'start' point's fields as well.
                if new_fields is not None:
                    ann['fields'] = new_fields # Update end's fields
                    for start_ann_candidate in raw_annotations_list:
                        if start_ann_candidate.get('type') == 'start' and start_ann_candidate.get('id') == instance_id_to_update:
                            start_ann_candidate['fields'] = new_fields # Keep fields consistent
                            break
                updated_in_raw = True
                break
        
        if not updated_in_raw:
            return jsonify({'error': f'Annotation instance with ID {instance_id_to_update} (for point {point_to_edit}) not found in raw data'}), 404

        # Save the updated raw annotations back to the storage file
        storage_data['annotations'] = raw_annotations_list
        with storage_file_path.open('w') as f:
            json.dump(storage_data, f, indent=4)

        # --- Reprocess the updated raw annotations to update the processed file ---
        processed_annotations_list_updated = reprocess_raw_annotations(raw_annotations_list)

        processed_data_to_save = {
            "video_name": filename,
            "category_id": category_id,
            "annotations": processed_annotations_list_updated,
            "activeAnnotations": storage_data.get('activeAnnotations', {}) # Keep client's active map
        }
        with processed_file_path.open('w') as f:
            json.dump(processed_data_to_save, f, indent=4)

        return jsonify({
            'message': 'Annotation updated successfully',
            # Return the updated raw annotations list
            'annotations': raw_annotations_list, 
            'activeAnnotations': storage_data.get('activeAnnotations', {})
        })

    except Exception as e:
        print(f"Error editing annotation: {str(e)}")
        return jsonify({'error': f'Error editing annotation: {str(e)}'}), 500
        
@app.route('/get_annotation_state/<category_id>/<filename>/<event_id>', methods=['GET'])
def get_annotation_state(category_id, filename, event_id):
    """Check if an event has an active (started but not ended) annotation"""
    try:
        annotation_file = Path(app.config['CATEGORIES_FOLDER']) / category_id / f"{filename.rsplit('.', 1)[0]}.json"
        
        if not annotation_file.exists():
            return jsonify({'active': False})
            
        with annotation_file.open('r') as f:
            data = json.load(f)
            
        # Check for unmatched start annotations
        temp_annotations = {}
        for annotation in data.get('annotations', []):
            if annotation.get('type') == 'start' and annotation['event'] == event_id:
                temp_annotations[event_id] = True
            elif annotation.get('type') == 'end' and annotation['event'] == event_id:
                temp_annotations[event_id] = False
                
        return jsonify({
            'active': temp_annotations.get(event_id, False),
            'startTime': next((a['time'] for a in data.get('annotations', []) 
                             if a.get('type') == 'start' and a['event'] == event_id), None)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/get_active_annotations/<category_id>/<filename>', methods=['GET'])
def get_active_annotations(category_id, filename):
    """Get all currently active annotations for a video"""
    try:
        annotation_file = Path(app.config['CATEGORIES_FOLDER']) / category_id / f"{filename.rsplit('.', 1)[0]}.json"
        
        if not annotation_file.exists():
            return jsonify({'active_annotations': {}})
            
        with annotation_file.open('r') as f:
            data = json.load(f)
            
        return jsonify({
            'active_annotations': data.get('active_annotations', {}),
            'annotations': data.get('annotations', [])
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    # First, check if the file exists in 'uploads'
    upload_path = Path(app.config['UPLOAD_FOLDER']) / filename
    if upload_path.exists():
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    # If not found, search in category folders
    for category_folder in Path(app.config['CATEGORIES_FOLDER']).iterdir():
        category_path = category_folder / filename
        if category_path.exists():
            return send_from_directory(str(category_folder), filename)  # ✅ FIXED: Now correctly returns file
    
    # If file is not found, return a 404 error
    return jsonify({'error': 'File not found'}), 404

@app.route('/get_annotations/<filename>')
def get_annotations(filename):
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')
    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)
            format_type = determine_format(annotations)  # Determine the format
            print("Annotations loaded:", annotations)
        return jsonify({
            'annotations': annotations,
            'format': format_type  # Send the format to the client
        })
    return jsonify({'annotations': [], 'format': 'old'})  # Default to old format if no file exists

def load_event_types():
    """Load event types from config file or create default if not exists"""
    if not os.path.exists(app.config['EVENT_TYPES_FILE']):
        default_types = {
            "event_types": [
                {
                    "name": "Default Event",
                    "color": "#808080",
                    "description": "Default event type"
                }
            ]
        }
        os.makedirs(os.path.dirname(app.config['EVENT_TYPES_FILE']), exist_ok=True)
        with open(app.config['EVENT_TYPES_FILE'], 'w') as f:
            json.dump(default_types, f, indent=4)
        return default_types["event_types"]
    
    with open(app.config['EVENT_TYPES_FILE'], 'r') as f:
        return json.load(f)["event_types"]

@app.route('/event_types', methods=['GET'])
def get_event_types():
    """Get all event types"""
    return jsonify(load_event_types())

@app.route('/event_types', methods=['POST'])
def add_event_type():
    """Add a new event type"""
    data = request.json
    if not data or 'name' not in data or 'color' not in data:
        return jsonify({'error': 'Invalid event type data'}), 400

    event_types = load_event_types()
    
    # Check if event type already exists
    if any(et['name'] == data['name'] for et in event_types):
        return jsonify({'error': 'Event type already exists'}), 400

    new_type = {
        'name': data['name'],
        'color': data['color'],
        'description': data.get('description', '')
    }
    
    event_types.append(new_type)
    
    with open(app.config['EVENT_TYPES_FILE'], 'w') as f:
        json.dump({"event_types": event_types}, f, indent=4)
    
    return jsonify(new_type), 201

@app.route('/annotation_categories', methods=['GET'])
def get_annotation_categories():
    """Get all annotation categories with their events"""
    return jsonify(load_annotation_categories())

@app.route('/annotation_categories', methods=['POST'])
def add_annotation_category():
    """Add a new annotation category"""
    data = request.json
    if not data or 'name' not in data or 'color' not in data:
        return jsonify({'error': 'Invalid category data'}), 400

    categories = load_annotation_categories()
    
    # Generate a unique ID from the name
    category_id = data['name'].lower().replace(' ', '_')
    
    # Check if category already exists
    if any(cat['id'] == category_id for cat in categories['annotation_categories']):
        return jsonify({'error': 'Category already exists'}), 400

    new_category = {
        'id': category_id,
        'name': data['name'],
        'color': data['color'],
        'description': data.get('description', ''),
        'events': []
    }
    
    categories['annotation_categories'].append(new_category)
    save_annotation_categories(categories)
    
    return jsonify(new_category), 201

@app.route('/annotation_categories/<category_id>/events', methods=['POST'])
def add_event_to_category(category_id):
    """Add a new event to a category"""
    data = request.json
    if not data or 'name' not in data or 'color' not in data:
        return jsonify({'error': 'Invalid event data'}), 400

    categories = load_annotation_categories()
    
    # Find the category
    category = next((cat for cat in categories['annotation_categories'] 
                    if cat['id'] == category_id), None)
    if not category:
        return jsonify({'error': 'Category not found'}), 404

    # Generate event ID
    event_id = data['name'].lower().replace(' ', '_')
    
    # Check if event already exists in category
    if any(evt['id'] == event_id for evt in category['events']):
        return jsonify({'error': 'Event already exists in category'}), 400

    new_event = {
        'id': event_id,
        'name': data['name'],
        'color': data['color'],
        'description': data.get('description', '')
    }
    
    category['events'].append(new_event)
    save_annotation_categories(categories)
    
    return jsonify(new_event), 201

def load_annotation_categories():
    """Load annotation categories from config file or create default"""
    if not os.path.exists(app.config['EVENT_TYPES_FILE']):
        default_categories = {
            "annotation_categories": [
                {
                    "id": "general",
                    "name": "General",
                    "color": "#808080",
                    "description": "General events",
                    "events": [
                        {
                            "id": "default_event",
                            "name": "Default Event",
                            "color": "#808080",
                            "description": "Default event type"
                        }
                    ]
                }
            ]
        }
        os.makedirs(os.path.dirname(app.config['EVENT_TYPES_FILE']), exist_ok=True)
        save_annotation_categories(default_categories)
        return default_categories
    
    with open(app.config['EVENT_TYPES_FILE'], 'r') as f:
        return json.load(f)

def save_annotation_categories(categories):
    """Save annotation categories to file"""
    with open(app.config['EVENT_TYPES_FILE'], 'w') as f:
        json.dump(categories, f, indent=4)

# Update the existing annotation structure
def create_default_annotation():
    """Create default annotation structure"""
    return {
        "annotations": [],        # Complete annotations with start/end times
        "active_annotations": {}, # Currently active annotations
        "categories": load_annotation_categories()['annotation_categories']
    }

@app.route('/save_categories', methods=['POST'])
def save_categories():
    """Save updated categories"""
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    category_id = data.get('category_id')
    categories_data = data.get('categories')
    
    if not categories_data:
        return jsonify({'error': 'No categories data provided'}), 400

    try:
        # Update the categories in the config file
        categories = {
            "annotation_categories": categories_data
        }
        
        with open(app.config['EVENT_TYPES_FILE'], 'w') as f:
            json.dump(categories, f, indent=4)
            
        # If this is an update to a specific category, update its folder
        if category_id:
            category_folder = Path(app.config['CATEGORIES_FOLDER']) / category_id
            category_folder.mkdir(exist_ok=True)
            
            # Save category-specific configuration
            category = next((c for c in categories_data if c['id'] == category_id), None)
            if category:
                category_config = {
                    "id": category['id'],
                    "name": category['name'],
                    "color": category['color'],
                    "events": category['events']
                }
                with open(category_folder / 'config.json', 'w') as f:
                    json.dump(category_config, f, indent=4)
        
        return jsonify({'message': 'Categories saved successfully'})
    except Exception as e:
        return jsonify({'error': f'Error saving categories: {str(e)}'}), 500

# Add this to your event structure
def create_default_event_fields():
    return {
        "football": {
            "foul": [
                {
                    "id": "team",
                    "name": "Team",
                    "type": "select",
                    "required": True,
                    "options": ["Home", "Away"]
                },
                {
                    "id": "player",
                    "name": "Player",
                    "type": "text",
                    "required": True
                },
                {
                    "id": "card",
                    "name": "Card",
                    "type": "select",
                    "required": False,
                    "options": ["None", "Yellow", "Red"]
                },
                {
                    "id": "severity",
                    "name": "Severity",
                    "type": "select",
                    "required": False,
                    "options": ["Light", "Medium", "Severe"]
                }
            ],
            "goal": [
                {
                    "id": "team",
                    "name": "Team",
                    "type": "select",
                    "required": True,
                    "options": ["Home", "Away"]
                },
                {
                    "id": "scorer",
                    "name": "Scorer",
                    "type": "text",
                    "required": True
                },
                {
                    "id": "assist",
                    "name": "Assist By",
                    "type": "text",
                    "required": False
                },
                {
                    "id": "type",
                    "name": "Goal Type",
                    "type": "select",
                    "required": False,
                    "options": ["Open Play", "Penalty", "Free Kick", "Header", "Own Goal"]
                }
            ]
        }
    }

@app.route('/event_fields/<category_id>/<event_id>', methods=['GET'])
def get_event_fields(category_id, event_id):
    """Get the fields for a specific event type"""
    fields = create_default_event_fields()
    return jsonify(fields.get(category_id, {}).get(event_id, []))

@app.route('/category_setup')
def category_setup():
    """Render the category setup page"""
    category_id = request.args.get('category_id')
    if category_id:
        # Load existing category data
        categories = load_annotation_categories()
        category = next((c for c in categories['annotation_categories'] 
                        if c['id'] == category_id), None)
        if category:
            print("Loading category data:", category)  # Debug log
            return render_template('category_setup.html', category=category)
    
    return render_template('category_setup.html')

@app.route('/save_category_setup', methods=['POST'])
def save_category_setup():
    """Save the category setup data"""
    try:
        data = request.json
        category_id = data.get('id') or data['name'].lower().replace(' ', '_')
        
        # Create category structure
        category = {
            'id': category_id,
            'name': data['name'],
            'color': data['color'],
            'events': []
        }
        
        # Process events and their custom fields
        for event_data in data['events']:
            event_id = event_data['name'].lower().replace(' ', '_')
            event = {
                'id': event_id,
                'name': event_data['name'],
                'color': event_data['color'],
                'customFields': event_data['customFields']
            }
            category['events'].append(event)
        
        # Load existing categories
        categories = load_annotation_categories()
        
        # Add or update category
        existing_idx = next((i for i, c in enumerate(categories['annotation_categories']) 
                           if c['id'] == category_id), None)
        if existing_idx is not None:
            categories['annotation_categories'][existing_idx] = category
        else:
            categories['annotation_categories'].append(category)
        
        # Save updated categories
        save_annotation_categories(categories)
        
        return jsonify({'message': 'Category saved successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/delete_category/<category_id>', methods=['DELETE'])
def delete_category(category_id):
    """Delete a category and its associated data"""
    try:
        # Load existing categories
        categories = load_annotation_categories()
        
        # Remove the category
        categories['annotation_categories'] = [
            c for c in categories['annotation_categories'] 
            if c['id'] != category_id
        ]
        
        # Save updated categories
        save_annotation_categories(categories)
        
        # Delete category folder and its contents
        category_folder = Path(app.config['CATEGORIES_FOLDER']) / category_id
        if category_folder.exists():
            shutil.rmtree(category_folder)
        
        return jsonify({'message': 'Category deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/delete_annotation/<category_id>/<filename>/<annotation_id>', methods=['DELETE'])
def delete_annotation(category_id, filename, annotation_id):
    """Delete a specific annotation from a video"""
    try:
        # Path to the annotation file
        annotation_file = Path(app.config['CATEGORIES_FOLDER']) / category_id / f"{filename.rsplit('.', 1)[0]}.json"
        print(f"Resolved annotation file path: {annotation_file}")

        if not annotation_file.exists():
            print("Annotation file not found.")
            return jsonify({'error': 'Annotation file not found'}), 404

        # Load the existing annotations
        with annotation_file.open('r') as f:
            data = json.load(f)

        annotations = data.get('annotations', [])
        updated_annotations = []

        # Iterate through annotations to handle deletion logic
        for ann in annotations:
            if ann.get('id') == annotation_id:
                print(f"Deleting annotation: {ann}")
                # If the annotation to delete is an endpoint, also delete the corresponding start point
                if ann.get('type') == 'end':
                    event_id = ann.get('event')
                    # Remove both the endpoint and its corresponding start point
                    updated_annotations = [
                        a for a in annotations if not (
                            (a.get('event') == event_id and a.get('type') == 'start') or
                            (a.get('id') == annotation_id)
                        )
                    ]
                    break  # Exit the loop since we've handled the deletion
                # If the annotation to delete is a start point, skip it
                continue
            # Add the annotation to the updated list if it is not being deleted
            updated_annotations.append(ann)

        # Update the JSON file
        data['annotations'] = updated_annotations
        with annotation_file.open('w') as f:
            json.dump(data, f, indent=4)

        print("Annotation deleted successfully.")
        return jsonify({'message': 'Annotation deleted successfully'})

    except Exception as e:
        print(f"Error deleting annotation: {str(e)}")
        return jsonify({'error': f'Error deleting annotation: {str(e)}'}), 500
    
if __name__ == '__main__':
    app.run(debug=True)
