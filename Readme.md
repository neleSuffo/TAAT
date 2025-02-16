# Temporal Annotation Tool

A web-based tool for temporal annotation of videos. This tool allows users to create custom categories with events and add timestamped annotations to videos.

## Features

- Video upload and playback
- Custom category and event management
- Temporal annotation with custom fields
- Annotation filtering by event type
- Video timeline markers
- Keyboard shortcuts for efficient annotation

## Installation

### Prerequisites
- Python 3.x
- Flask
- Modern web browser

### Setup
1. Clone the repository:
```bash
git clone [repository-url]
cd temporal-annotation-tool
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

## Usage

### Category Setup
1. Click "New Category" to create a category
2. Add a category name and color
3. Create events within the category
4. Add custom fields to events if needed

### Video Annotation
1. Select a category from the categories panel
2. Upload a video file
3. Select an event type
4. Use keyboard shortcuts or buttons to add annotations:
   - Enter: Add annotation
   - Space: Play/Pause
   - Left/Right arrows: Seek 10 seconds

### Managing Annotations
- Filter annotations by event type
- Edit or delete existing annotations
- Click on timeline markers to jump to specific annotations

## Project Structure
```
project/
├── static/
│   ├── css/
│   └── js/
├── templates/
├── uploads/
└── app.py
```

## Development
- Frontend: HTML, CSS, JavaScript, jQuery
- Backend: Python Flask
- Video Player: Video.js


