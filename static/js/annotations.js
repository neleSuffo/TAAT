class AnnotationState {
    constructor() {
        this.activeAnnotations = new Map();
        this.videoPlayer = null;
        this.currentCategory = null;
        this.currentVideoFilename = null;
    }

    initialize(player, category, videoFilename) {
        this.videoPlayer = player;
        this.currentCategory = category;
        this.currentVideoFilename = videoFilename;
    }

    isEventActive(eventId) {
        return this.activeAnnotations.has(eventId);
    }

    toggleAnnotation(event, fields) {
        const currentTime = this.videoPlayer.currentTime();
        const isActive = this.isEventActive(event.id);
        let annotationType;
        let startTime = null; // Keep track of the start time

        if (isActive) {
            annotationType = 'end';
            startTime = this.activeAnnotations.get(event.id).startTime; // Retrieve start time
        } else {
            annotationType = 'start';
        }

        const annotationData = {
            time: currentTime,
            categoryId: this.currentCategory,
            eventId: event.id,
            type: annotationType,
            fields: fields // Include the fields
        };

        // If ending, calculate the duration; if starting, store the start time
        if (isActive) {
            const startAnnotation = this.activeAnnotations.get(event.id);
            annotationData.startTime = startAnnotation.time;
            annotationData.endTime = currentTime;
            annotationData.duration = currentTime - startAnnotation.time;
            annotationData.type = 'complete'; // Mark as a complete annotation
            this.activeAnnotations.delete(event.id); // Remove from active annotations
        } else {
            this.activeAnnotations.set(event.id, annotationData); // Store as active
        }

        return annotationData;
    }

    updateAnnotationState(eventId, isActive, startTime = null) {
        if (isActive) {
            this.activeAnnotations.set(eventId, { startTime: startTime });
        } else {
            this.activeAnnotations.delete(eventId);
        }
    }

    getAnnotations() {
        //return a list of the annotations
        let annotations = []
        for (let eventId of this.activeAnnotations.keys()) {
            annotations.push(this.activeAnnotations.get(eventId))
        }
        return annotations
    }
}

const annotationState = new AnnotationState();
