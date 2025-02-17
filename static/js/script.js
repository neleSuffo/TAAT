$(document).ready(function () {
    // Main application modules
    const VideoManager = {
        player: null,
        videoFile: null,
        
        init() {
            this.setupVideoPlayer();
            this.setupEventListeners();
        },
        
        setupVideoPlayer() {
            // Initialize video player if needed
            if (document.getElementById('videoPlayer')) {
                this.player = videojs('videoPlayer');
            }
        },
        
        setupEventListeners() {
            // Video-related event listeners
            const uploadContainer = document.getElementById('uploadContainer');
            if (uploadContainer) {
    uploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadContainer.classList.add('drag-over');
    });

    uploadContainer.addEventListener('dragleave', () => {
        uploadContainer.classList.remove('drag-over');
    });

    uploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadContainer.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('video/')) {
                        this.handleVideoUpload(files[0]);
                    }
                });
            }
        }
    };
    
    const AnnotationManager = {
        annotations: [],
        selectedCategory: null,
        selectedEvent: null,
        
        init() {
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Annotation-related event listeners
            $('#addAnnotationBtn').on('click', () => this.showAddAnnotationModal());
            $('#saveAnnotationBtn').on('click', () => this.handleSaveAnnotation());
            $('#updateAnnotationBtn').click(function() {
                const index = parseInt($('#editAnnotationIndex').val());
                const minutes = parseInt($('#editAnnotationMinutes').val()) || 0;
                const seconds = parseInt($('#editAnnotationSeconds').val()) || 0;
                const eventValue = $('#editAnnotationEvent').val();

                if (!eventValue) {
                    showToast('Please select an event', 'error');
                    return;
                }

                const [categoryId, eventId] = eventValue.split(':');
                const time = minutes * 60 + seconds;

                if (index >= 0 && index < AnnotationManager.annotations.length) {
                    AnnotationManager.annotations[index] = {
                        ...AnnotationManager.annotations[index],
                        time: time,
                        categoryId: categoryId,
                        eventId: eventId
                    };

                    AnnotationManager.saveAnnotations();
                    // Update markers after editing annotation
                        updateVideoMarkers();
                    
                    const modal = bootstrap.Modal.getInstance(document.getElementById('editAnnotationModal'));
                    modal.hide();
                    showToast('Annotation updated successfully', 'success');
                }
            });

            // Add filter change handler
            $(document).on('change', '#annotationFilter', (e) => {
                console.log('Filter changed:', e.target.value);
                this.updateAnnotationsList();
            });
        },
        
        updateAnnotationsList() {
            console.log('Starting updateAnnotationsList');
            console.log('Current annotations:', this.annotations);
            
            const annotationsList = $('#annotationsList');
            annotationsList.empty();

            if (!this.annotations || this.annotations.length === 0) {
                console.log('No annotations available');
                annotationsList.html('<p class="text-muted text-center">No annotations yet</p>');
                return;
            }

            // Get selected filter
            const selectedFilter = $('#annotationFilter').val();
            console.log('Selected filter value:', selectedFilter);

            // Filter and sort annotations
            let filteredAnnotations = [...this.annotations].sort((a, b) => a.time - b.time);
            console.log('Sorted annotations:', filteredAnnotations);
            
            if (selectedFilter && selectedFilter !== 'all') {
                filteredAnnotations = filteredAnnotations.filter(annotation => {
                    const matches = annotation.eventId === selectedFilter;
                    console.log(`Checking annotation eventId: ${annotation.eventId} against filter: ${selectedFilter}, matches: ${matches}`);
                    return matches;
                });
                console.log('Filtered annotations:', filteredAnnotations);
            }

            if (filteredAnnotations.length === 0) {
                console.log('No annotations match the filter');
                annotationsList.html('<p class="text-muted text-center">No annotations match the selected filter</p>');
                return;
            }

            console.log('Rendering filtered annotations:', filteredAnnotations);
            filteredAnnotations.forEach((annotation, index) => {
                const category = CategoryManager.categories.find(c => c.id === annotation.categoryId);
                const event = category?.events.find(e => e.id === annotation.eventId);
                
                if (!category || !event) {
                    console.warn('Category or event not found for annotation:', annotation);
                    return;
                }

                const annotationElement = $(`
                    <div class="annotation-item mb-2 p-2 rounded cursor-pointer" 
                         style="border-left: 3px solid ${event.color}; background-color: ${event.color}10"
                         data-time="${annotation.time}"
                         data-annotation-index="${this.annotations.indexOf(annotation)}">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="annotation-content" style="flex-grow: 1;">
                                <div class="fw-bold">${formatTime(annotation.time)}</div>
                                <div>${category.name} - ${event.name}</div>
                                ${this.renderAnnotationFields(annotation.fields)}
                            </div>
                            <div class="annotation-actions">
                                <button class="btn btn-sm btn-outline-secondary edit-annotation me-1" 
                                        data-index="${this.annotations.indexOf(annotation)}">
                                <i class="fas fa-edit"></i>
                            </button>
                                <button class="btn btn-sm btn-outline-danger delete-annotation" 
                                        data-index="${this.annotations.indexOf(annotation)}">
                                    <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `);
            
                // Add click handler for the content area
                annotationElement.find('.annotation-content').on('click', function() {
                    const time = $(this).closest('.annotation-item').data('time');
                    if (player) {
                        player.currentTime(time);
                        player.play();
                    }
                });

                // Add edit handler
                annotationElement.find('.edit-annotation').on('click', (e) => {
            e.stopPropagation();
                    this.showEditAnnotationModal(annotation, index);
                });

                // Add delete handler
                annotationElement.find('.delete-annotation').on('click', (e) => {
                    e.stopPropagation();
                    const actualIndex = $(e.currentTarget).data('index');
                    console.log('Deleting annotation at index:', actualIndex);
                    
                    if (confirm('Are you sure you want to delete this annotation?')) {
                        this.annotations.splice(actualIndex, 1);
                        this.saveAnnotations();
                        updateVideoMarkers();
                        this.updateAnnotationsList(); // Refresh the list
                    }
                });

                annotationsList.append(annotationElement);
            });
        },

        renderAnnotationFields(fields) {
            if (!fields || Object.keys(fields).length === 0) return '';

            return `
                <div class="annotation-fields small text-muted mt-1">
                    ${Object.entries(fields).map(([key, value]) => `
                        <div><strong>${key}:</strong> ${value}</div>
                    `).join('')}
                </div>
            `;
        },

        saveAnnotations() {
            if (!videoFile || !selectedCategoryId) {
                console.error('Missing required data for saving annotations');
            return;
        }

            const annotationData = {
                filename: videoFile.name,
                categoryId: selectedCategoryId,
                annotations: this.annotations
            };

            console.log('Saving annotations:', annotationData);

        $.ajax({
                url: '/save_annotations',
            type: 'POST',
            contentType: 'application/json',
                data: JSON.stringify(annotationData),
                success: (response) => {
                    console.log('Annotations saved successfully:', response);
                    showToast('Annotations saved successfully', 'success');
                    this.updateAnnotationsList();
                },
                error: (xhr) => {
                    console.error('Error saving annotations:', xhr);
                    showToast(xhr.responseJSON?.error || 'Error saving annotations', 'error');
                }
            });
        },

        handleSaveAnnotation() {
            const eventValue = $('#annotationEvent').val();
            if (!eventValue) {
                showToast('Please select an event', 'error');
                return;
            }
            
            const [categoryId, eventId] = eventValue.split(':');
            const currentTime = player.currentTime();
            
            // Collect all field values
            const fields = {};
            $('#eventFields [name]').each(function() {
                const field = $(this);
                if (field.attr('type') === 'checkbox') {
                    fields[field.attr('name')] = field.is(':checked');
                } else {
                    fields[field.attr('name')] = field.val();
                }
            });
            
            // Validate required fields
            let missingFields = [];
            $('#eventFields [required]').each(function() {
                if (!$(this).val()) {
                    missingFields.push($(this).closest('.mb-3').find('.form-label').text().trim());
                }
            });
            
            if (missingFields.length > 0) {
                showToast(`Please fill in required fields: ${missingFields.join(', ')}`, 'error');
            return;
        }

            const annotation = {
                time: currentTime,
                categoryId: categoryId,
                eventId: eventId,
                fields: fields
            };
            
            this.annotations.push(annotation);
            this.saveAnnotations();
            
            // Update markers after adding new annotation
            updateVideoMarkers();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('annotationModal'));
            if (modal) {
                modal.hide();
            }
            
            showToast('Annotation added successfully', 'success');
            this.updateAnnotationsList();
        },

        loadExistingAnnotations(videoData) {
            if (videoData.annotations) {
                this.annotations = videoData.annotations.annotations || [];
                this.updateAnnotationsList();
            }
        },

        showEditAnnotationModal(annotation, index) {
            console.log('Editing annotation:', annotation);
            
            // Set the form values
            $('#editAnnotationIndex').val(index);
            const timeMinutes = Math.floor(annotation.time / 60);
            const timeSeconds = Math.floor(annotation.time % 60);
            $('#editAnnotationMinutes').val(timeMinutes);
            $('#editAnnotationSeconds').val(timeSeconds);

            // Update event dropdown with only the selected category's events
            const editAnnotationSelect = $('#editAnnotationEvent');
            editAnnotationSelect.empty();
            editAnnotationSelect.append('<option value="">Select an event</option>');

            const category = CategoryManager.categories.find(c => c.id === annotation.categoryId);
            if (category && category.events.length > 0) {
                console.log('Loading events for edit modal:', category.name);
                category.events.forEach(event => {
                    editAnnotationSelect.append(`
                        <option value="${category.id}:${event.id}" 
                            data-has-fields="${event.customFields?.length > 0}"
                            ${event.id === annotation.eventId ? 'selected' : ''}>
                            ${event.name}
                        </option>
                    `);
                });
            }

            // Add custom fields container if it doesn't exist
            if (!$('#editCustomFields').length) {
                $('.modal-body #editAnnotationForm').append('<div id="editCustomFields" class="mt-3"></div>');
            }

            // Handle custom fields
            const updateCustomFields = () => {
                const [categoryId, eventId] = editAnnotationSelect.val().split(':');
                const selectedCategory = CategoryManager.categories.find(c => c.id === categoryId);
                const selectedEvent = selectedCategory?.events.find(e => e.id === eventId);
                
                const customFieldsContainer = $('#editCustomFields');
                customFieldsContainer.empty();

                if (selectedEvent?.customFields?.length > 0) {
                    selectedEvent.customFields.forEach(field => {
                        const fieldValue = annotation.fields?.[field.name] || '';
                        let fieldHtml = `
                            <div class="mb-3">
                                <label class="form-label">${field.name}${field.required ? ' *' : ''}</label>
                        `;

                        switch (field.type) {
                            case 'text':
                                fieldHtml += `
                                    <input type="text" 
                                           class="form-control" 
                                           name="${field.name}" 
                                           value="${fieldValue}"
                                           ${field.required ? 'required' : ''}>
                                `;
                                break;
                            case 'select':
                                fieldHtml += `
                                    <select class="form-select" 
                                            name="${field.name}"
                                            ${field.required ? 'required' : ''}>
                                        <option value="">Select...</option>
                                        ${field.options.map(opt => 
                                            `<option value="${opt}" ${fieldValue === opt ? 'selected' : ''}>${opt}</option>`
                                        ).join('')}
                                    </select>
                                `;
                                break;
                            case 'number':
                                fieldHtml += `
                                    <input type="number" 
                                           class="form-control" 
                                           name="${field.name}" 
                                           value="${fieldValue}"
                                           ${field.required ? 'required' : ''}>
                                `;
                                break;
                            case 'checkbox':
                                fieldHtml += `
                                    <div class="form-check">
                                        <input type="checkbox" 
                                               class="form-check-input" 
                                               name="${field.name}" 
                                               ${fieldValue ? 'checked' : ''}
                                               ${field.required ? 'required' : ''}>
                                        <label class="form-check-label">${field.name}</label>
                                    </div>
                                `;
                                break;
                        }

                        fieldHtml += `</div>`;
                        customFieldsContainer.append(fieldHtml);
                    });
                }
            };

            // Add change handler for event selection
            editAnnotationSelect.off('change').on('change', updateCustomFields);

            // Initialize custom fields for current event
            updateCustomFields();

            // Update the save handler
            $('#updateAnnotationBtn').off('click').on('click', () => {
                const index = parseInt($('#editAnnotationIndex').val());
                const minutes = parseInt($('#editAnnotationMinutes').val()) || 0;
                const seconds = parseInt($('#editAnnotationSeconds').val()) || 0;
                const eventValue = $('#editAnnotationEvent').val();

                if (!eventValue) {
                    showToast('Please select an event', 'error');
                    return;
                }

                const [categoryId, eventId] = eventValue.split(':');
                const time = minutes * 60 + seconds;

                // Collect custom fields
                const fields = {};
                $('#editCustomFields [name]').each(function() {
                    const field = $(this);
                    if (field.attr('type') === 'checkbox') {
                        fields[field.attr('name')] = field.is(':checked');
                    } else {
                        fields[field.attr('name')] = field.val();
                    }
                });

                if (index >= 0 && index < this.annotations.length) {
                    this.annotations[index] = {
                        ...this.annotations[index],
                        time: time,
                        categoryId: categoryId,
                        eventId: eventId,
                        fields: fields
                    };

                    this.saveAnnotations();
                    updateVideoMarkers();
                    
                    const modal = bootstrap.Modal.getInstance(document.getElementById('editAnnotationModal'));
                    modal.hide();
                    showToast('Annotation updated successfully', 'success');
                }
            });
            
            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('editAnnotationModal'));
            modal.show();
        },

        showAddAnnotationModal() {
            if (!player) {
                showToast('Please upload a video first', 'error');
            return;
        }

            // Pause the video
            player.pause();
            
            // Show annotation modal with current time
            const currentTime = player.currentTime();
            $('#annotationTime').text(formatTime(currentTime));
            
            // Reset form
            $('#annotationEvent').val('');
            $('#eventFields').empty();
            
            // Update event dropdown
            this.updateAnnotationEventDropdown();
            
            // Get modal element
            const modalElement = document.getElementById('annotationModal');
            const modal = new bootstrap.Modal(modalElement);

            // Add hidden event handler to clean up
            $(modalElement).one('hidden.bs.modal', () => {
                // Clean up event handlers
                $('#annotationEvent').off('change');
                $('#eventFields').empty();
                // Resume video if needed
                if (player) {
                    player.play();
                }
            });
            
            modal.show();
        },

        updateAnnotationEventDropdown() {
            const annotationEventSelect = $('#annotationEvent');
            // Only proceed if the select element exists
            if (!annotationEventSelect.length) return;

            annotationEventSelect.empty();
            annotationEventSelect.append('<option value="">Select an event</option>');

            // Find the selected category
            const selectedCategory = CategoryManager.categories.find(c => c.id === selectedCategoryId);
            
            if (selectedCategory && selectedCategory.events.length > 0) {
                console.log('Loading events for category:', selectedCategory.name);
                
                // Add events from selected category only
                selectedCategory.events.forEach(event => {
                    annotationEventSelect.append(`
                        <option value="${selectedCategory.id}:${event.id}" 
                            data-has-fields="${event.customFields?.length > 0}">
                            ${event.name}
                        </option>
                    `);
                });
            } else {
                console.log('No category selected or no events found');
                annotationEventSelect.append('<option value="" disabled>No events available</option>');
            }

            // Add change handler for custom fields
            annotationEventSelect.off('change').on('change', (e) => {
                const [categoryId, eventId] = e.target.value.split(':');
                const category = CategoryManager.categories.find(c => c.id === categoryId);
                const event = category?.events.find(e => e.id === eventId);
                
                if (event?.customFields) {
                    this.renderCustomFields(event.customFields);
                } else {
                    $('#eventFields').empty();
                }
            });

            // Also update the filter dropdown
            const filterSelect = $('#annotationFilter');
            filterSelect.empty();
            filterSelect.append('<option value="all">All Events</option>');
            
            if (selectedCategory && selectedCategory.events.length > 0) {
                selectedCategory.events.forEach(event => {
                    filterSelect.append(`
                        <option value="${event.id}">${event.name}</option>
                    `);
                });
            }

            // Add change handler for filter
            filterSelect.off('change').on('change', () => {
                this.updateAnnotationsList();
            });
        },

        renderCustomFields(fields) {
            const container = $('#eventFields');
            container.empty();

            fields.forEach(field => {
                let inputHtml = '';
                const fieldId = `field_${field.name.toLowerCase().replace(/\s+/g, '_')}`;

                switch (field.type) {
                    case 'text':
                        inputHtml = `<input type="text" class="form-control" id="${fieldId}" 
                            name="${field.name}" ${field.required ? 'required' : ''}>`;
                        break;
                    case 'select':
                        inputHtml = `
                            <select class="form-select" id="${fieldId}" name="${field.name}" 
                                ${field.required ? 'required' : ''}>
                                <option value="">Select ${field.name}</option>
                                ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                            </select>`;
                        break;
                    case 'number':
                        inputHtml = `<input type="number" class="form-control" id="${fieldId}" 
                            name="${field.name}" ${field.required ? 'required' : ''}>`;
                        break;
                    case 'checkbox':
                        inputHtml = `
                            <div class="form-check">
                                <input type="checkbox" class="form-check-input" id="${fieldId}" 
                                    name="${field.name}" ${field.required ? 'required' : ''}>
                                <label class="form-check-label" for="${fieldId}">${field.name}</label>
                            </div>`;
                        break;
                }

                container.append(`
                    <div class="mb-3">
                        ${field.type !== 'checkbox' ? `<label for="${fieldId}" class="form-label">
                            ${field.name}${field.required ? ' *' : ''}</label>` : ''}
                        ${inputHtml}
                    </div>
                `);
            });
        }
    };
    
    const CategoryManager = {
        categories: [],
        
        init() {
            console.log('CategoryManager: Initializing...');
            this.loadCategories();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            console.log('CategoryManager: Setting up event listeners');
            
            // Add Category button
            $(document).on('click', '#addCategoryBtn', () => {
                console.log('Add category button clicked');
                $('#categoryName').val('');
                $('#categoryColor').val('#808080');
                $('#categoryEvents').val('');
                const modal = new bootstrap.Modal(document.getElementById('addCategoryModal'));
            modal.show();
        });

            // Save category button
            $(document).on('click', '#saveCategoryBtn', () => {
                console.log('Save category button clicked');
                this.handleSaveCategory();
            });

            // Save event button
            $(document).on('click', '#saveEventBtn', () => {
                console.log('Save event button clicked');
                this.handleSaveEvent();
            });

            // Category item click - Updated to collapse other categories
            $(document).on('click', '.category-item', function(e) {
                if (!$(e.target).closest('.category-actions').length) {
                    console.log('Category clicked');
                    
                    // Remove active class from all categories and collapse them
                    $('.category-item').not(this).removeClass('active');
                    $('.category-item').not(this).find('.category-events').slideUp();
                    $('.category-item').not(this).find('.toggle-events i')
                        .removeClass('fa-chevron-up')
                        .addClass('fa-chevron-down');
                    
                    // Handle the clicked category
                    const $this = $(this);
                    $this.addClass('active');
                    
                    // Show this category's events
                    $this.find('.category-events').slideDown();
                    $this.find('.toggle-events i')
                        .removeClass('fa-chevron-down')
                        .addClass('fa-chevron-up');
                    
                    // Update selected category
                    selectedCategoryId = $this.data('category-id');
                    $('#uploadContainer').removeClass('disabled');
                }
            });

            // Toggle events
            $(document).on('click', '.toggle-events', (e) => {
                e.stopPropagation(); // Prevent category selection when clicking toggle
                const categoryItem = $(e.currentTarget).closest('.category-item');
                const eventsDiv = categoryItem.find('.category-events');
                const icon = $(e.currentTarget).find('i');
                
                eventsDiv.slideToggle(200, function() {
                    icon.toggleClass('fa-chevron-down fa-chevron-up');
                });
            });

            // Add event
            $(document).on('click', '.add-event', (e) => {
                console.log('Add event clicked');
                e.stopPropagation();
                const categoryId = $(e.currentTarget).closest('.category-item').data('category-id');
                console.log('Adding event to category:', categoryId);
                this.showAddEventModal(categoryId);
            });

            // Delete event
            $(document).on('click', '.delete-event', (e) => {
                console.log('Delete event clicked');
                e.stopPropagation();
                const eventItem = $(e.target).closest('.event-item');
                const categoryItem = $(e.target).closest('.category-item');
                const categoryId = categoryItem.data('category-id');
                const eventId = eventItem.data('event-id');
                
                if (confirm('Are you sure you want to delete this event?')) {
                    this.deleteEvent(categoryId, eventId);
                }
            });

            // Update event selection handler
            $(document).on('click', '.event-item', function(e) {
                e.stopPropagation();
                console.log('Event item clicked');
                
                $('.event-item').removeClass('selected');
                const eventItem = $(this);
                eventItem.addClass('selected');
                
                const categoryId = eventItem.closest('.category-item').data('category-id');
                const eventId = eventItem.data('event-id');
                
                console.log('Selected event:', { categoryId, eventId });
                
                selectedCategoryId = categoryId;
                selectedEventId = eventId;
                
                const category = CategoryManager.categories.find(c => c.id === categoryId);
                const event = category?.events.find(e => e.id === eventId);
                
                if (event) {
                    console.log('Found event:', event);
                    selectedEventName = event.name;
                    $('#selectedEventDisplay').text(`${category.name} - ${event.name}`);
                    $('#addAnnotationBtn').prop('disabled', false);
                    
                    // Update filter dropdown and select the current event
                    const filterSelect = $('#annotationFilter');
                    console.log('Current filter value before update:', filterSelect.val());
                    
                    filterSelect.empty();
                    filterSelect.append('<option value="all">All Events</option>');
                    
                    if (category.events.length > 0) {
                        category.events.forEach(evt => {
                            const isSelected = evt.id === eventId;
                            console.log(`Adding event option: ${evt.name}, id: ${evt.id}, selected: ${isSelected}`);
                            filterSelect.append(`
                                <option value="${evt.id}" ${isSelected ? 'selected' : ''}>
                                    ${evt.name}
                                </option>
                            `);
                        });
                    }
                    
                    // Set the value and trigger change explicitly
                    console.log('Setting filter to:', eventId);
                    filterSelect.val(eventId);
                    console.log('Filter value after set:', filterSelect.val());
                    filterSelect.trigger('change');
                    
                    // Update annotation event dropdown if it exists
                    if (typeof AnnotationManager !== 'undefined' && AnnotationManager.updateAnnotationEventDropdown) {
                        AnnotationManager.updateAnnotationEventDropdown();
                    }
                }
            });

            // Update edit category handler
            $(document).on('click', '.edit-category', (e) => {
                e.stopPropagation();
                const categoryId = $(e.currentTarget).closest('.category-item').data('category-id');
                window.location.href = `/category_setup?category_id=${categoryId}`;
            });

            // Add save edited category handler
            $(document).on('click', '#saveEditCategoryBtn', () => {
                this.handleEditCategory();
            });

            // Delete category handler
            $(document).on('click', '.delete-category', (e) => {
                e.stopPropagation();
                const categoryItem = $(e.currentTarget).closest('.category-item');
                const categoryId = categoryItem.data('category-id');
                const categoryName = categoryItem.find('.category-name').text();
                
                if (confirm(`Are you sure you want to delete the category "${categoryName}" and all its events?`)) {
                    this.deleteCategory(categoryId);
                }
            });

            // Update the collapse all categories handler
            $(document).on('click', '.collapse-categories', (e) => {
                e.stopPropagation();
                const $button = $(e.currentTarget);
                const $icon = $button.find('i');
                const $categoriesList = $('#categoriesList');
                const $allCategories = $('.category-item');
                
                if ($icon.hasClass('fa-chevron-up')) {
                    // Hide all categories except the active one
                    $allCategories.each(function() {
                        const $category = $(this);
                        const $eventsList = $category.find('.events-list');
                        const $indicator = $category.find('.collapse-indicator');
                        
                        if (!$category.hasClass('active')) {
                            $category.hide();
                        } else {
                            $eventsList.show();
                            $indicator.removeClass('fa-chevron-right').addClass('fa-chevron-down');
                        }
                    });
                    $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
                } else {
                    // Show all categories
                    $allCategories.each(function() {
                        const $category = $(this);
                        const $eventsList = $category.find('.events-list');
                        const $indicator = $category.find('.collapse-indicator');
                        
                        $category.show();
                        $eventsList.show();
                        $indicator.removeClass('fa-chevron-right').addClass('fa-chevron-down');
                    });
                    $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
                }
            });
        },

        handleSaveCategory() {
            console.log('CategoryManager: Handling save category');
            const name = $('#categoryName').val().trim();
            const color = $('#categoryColor').val();
            const eventsText = $('#categoryEvents').val();
            
            console.log('Category data:', { name, color, eventsText });
        
        if (!name) {
            showToast('Please enter a category name', 'error');
            return;
        }
        
            const categoryId = name.toLowerCase().replace(/\s+/g, '_');
            
            if (this.categories.some(c => c.id === categoryId)) {
                showToast('A category with this name already exists', 'error');
                return;
            }
            
            const events = eventsText.split('\n')
                .map(event => event.trim())
                .filter(event => event.length > 0)
                .map(event => ({
                    id: event.toLowerCase().replace(/\s+/g, '_'),
                    name: event,
                    color: color,
                    description: `${event} event`
                }));
            
            console.log('Processed events:', events);

            const newCategory = {
                id: categoryId,
                name: name,
                color: color,
                description: '',
                events: events
            };
            
            console.log('New category:', newCategory);
            this.categories.push(newCategory);
            this.saveCategories();
            $('#addCategoryModal').modal('hide');
        },

        handleSaveEvent() {
        const categoryId = $('#eventCategoryId').val();
        const name = $('#eventName').val().trim();
        const color = $('#eventColor').val();
        
        if (!name) {
            showToast('Please enter an event name', 'error');
            return;
        }
        
            const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            const eventId = name.toLowerCase().replace(/\s+/g, '_');
            
                if (category.events.some(e => e.id === eventId)) {
                showToast('An event with this name already exists', 'error');
                return;
            }
            
            const newEvent = {
                id: eventId,
                name: name,
                color: color,
                    customFields: [] // Initialize empty custom fields array
            };
            
            category.events.push(newEvent);
                
                // Save categories and update UI
                this.saveCategories().then(() => {
                    // Update the categories list first
                    this.updateCategoriesList();
                    
                    // Update annotation dropdown if AnnotationManager exists
                    if (typeof AnnotationManager !== 'undefined' && AnnotationManager.updateAnnotationEventDropdown) {
                        AnnotationManager.updateAnnotationEventDropdown();
                    }
                    
                    // Auto-select the newly created event
                    selectedEventId = eventId;
                    selectedEventName = name;
                    $('#selectedEventDisplay').text(`${category.name} - ${name}`);
                    $('#addAnnotationBtn').prop('disabled', false);
                    
                    // Add selected class to the new event
                    $(`.event-item[data-event-id="${eventId}"]`).addClass('selected');
                    
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addEventModal'));
                    if (modal) modal.hide();
                    
                    showToast('Event added successfully', 'success');
                }).catch(error => {
                    console.error('Error saving event:', error);
                    showToast('Error saving event', 'error');
                });
            }
        },
        
        loadCategories() {
            console.log('CategoryManager: Loading categories');
            $.ajax({
                url: '/annotation_categories',
                type: 'GET',
                success: (response) => {
                    console.log('Categories loaded:', response);
                    this.categories = response.annotation_categories || [];
                    this.updateCategoriesList();
                },
                error: (xhr) => {
                    console.error('Error loading categories:', xhr);
                    showToast('Error loading categories', 'error');
                }
            });
        },
        
        updateCategoriesList() {
            console.log('CategoryManager: Updating categories list');
            const categoriesList = $('#categoriesList');
            categoriesList.empty();
            
            this.categories.forEach(category => {
                const categoryElement = $(`
                    <div class="category-item mb-2" data-category-id="${category.id}">
                        <div class="category-header">
                            <div class="d-flex align-items-center" style="cursor: pointer;">
                                <i class="fas fa-chevron-right me-2 collapse-indicator"></i>
                                <span class="category-name" style="color: ${category.color}">${category.name}</span>
                        </div>
                            <div class="category-actions">
                                <button class="btn btn-sm btn-outline-secondary edit-category">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-primary add-event">
                                    <i class="fas fa-plus"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger delete-category">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            </div>
                        <div class="events-list mt-2" style="display: none;">
                            ${this.renderEvents(category.events)}
                        </div>
                        </div>
                `);
                
                // Add click handler for collapse/expand and selection
                categoryElement.find('.category-header .d-flex').on('click', function(e) {
                    e.stopPropagation();
                    const $categoryItem = $(this).closest('.category-item');
                    const eventsList = $categoryItem.find('.events-list');
                    const indicator = $(this).find('.collapse-indicator');
                    
                    // Update selection state
                    $('.category-item').removeClass('active');
                    $categoryItem.addClass('active');
                    
                    // Update selected category
                    selectedCategoryId = $categoryItem.data('category-id');
                    
                    // Update filter dropdown with the selected category's events
                    const category = CategoryManager.categories.find(c => c.id === selectedCategoryId);
                    const filterSelect = $('#annotationFilter');
                    filterSelect.empty();
                    filterSelect.append('<option value="all">All Events</option>');
                    
                    if (category && category.events.length > 0) {
                        category.events.forEach(event => {
                            filterSelect.append(`
                                <option value="${event.id}">${event.name}</option>
                            `);
                        });
                    }
                    
                    // Toggle events list
                    $('.events-list').not(eventsList).slideUp(200);
                    $('.collapse-indicator').not(indicator).removeClass('fa-chevron-down').addClass('fa-chevron-right');
                    
                    eventsList.slideToggle(200, function() {
                        indicator.toggleClass('fa-chevron-right fa-chevron-down');
                    });
                    
                    // Enable upload if needed
                    $('#uploadContainer').removeClass('disabled');
                });
                
                categoriesList.append(categoryElement);
                
                // If this is the selected category, show its events
                if (category.id === selectedCategoryId) {
                    categoryElement.addClass('active');
                    categoryElement.find('.events-list').show();
                    categoryElement.find('.collapse-indicator').removeClass('fa-chevron-right').addClass('fa-chevron-down');
                }
            });
        },
        
        renderEvents(events) {
            if (!events || events.length === 0) {
                return '<p class="text-muted small">No events</p>';
            }
            
            return events.map(event => `
                <div class="event-item" 
                     style="background-color: ${event.color}20; border-left: 3px solid ${event.color}"
                     data-event-id="${event.id}">
                    <span class="event-name">${event.name}</span>
                    ${event.customFields?.length > 0 ? 
                        '<span class="badge bg-info ms-2"><i class="fas fa-cog"></i></span>' 
                        : ''}
                </div>
            `).join('');
        },
        
        showAddEventModal(categoryId) {
            console.log('Showing add event modal for category:', categoryId);
            const category = this.categories.find(c => c.id === categoryId);
            if (!category) {
                console.error('Category not found:', categoryId);
                return;
            }
            
            // Reset and show modal
            $('#eventName').val('');
            $('#eventColor').val(category.color);
            $('#eventCategoryId').val(categoryId);
            
            // Show the modal using Bootstrap's modal method
            const modal = new bootstrap.Modal(document.getElementById('addEventModal'));
            modal.show();
        },
        
        deleteEvent(categoryId, eventId) {
            const category = this.categories.find(c => c.id === categoryId);
            if (!category) return;
            
            category.events = category.events.filter(e => e.id !== eventId);
            this.saveCategories();
        },
        
        saveCategories() {
            console.log('CategoryManager: Saving categories');
            return $.ajax({
                url: '/save_categories',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    category_id: selectedCategoryId,
                    categories: this.categories
                }),
                success: () => {
                    console.log('Categories saved successfully');
                    this.updateCategoriesList();
                    showToast('Categories updated successfully', 'success');
                },
                error: (xhr) => {
                    console.error('Error saving categories:', xhr);
                    showToast('Error saving categories', 'error');
                }
            });
        },

        showEditCategoryModal(categoryId) {
            const category = this.categories.find(c => c.id === categoryId);
            if (!category) return;

            $('#editCategoryId').val(categoryId);
            $('#editCategoryName').val(category.name);
            $('#editCategoryColor').val(category.color);

            const modal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
            modal.show();
        },

        handleEditCategory() {
        const categoryId = $('#editCategoryId').val();
            const name = $('#editCategoryName').val().trim();
            const color = $('#editCategoryColor').val();

            const category = this.categories.find(c => c.id === categoryId);
            if (!category) return;

            category.name = name;
            category.color = color;

            this.saveCategories().then(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('editCategoryModal'));
                modal.hide();
                showToast('Category updated successfully', 'success');
            });
        },

        deleteCategory(categoryId) {
            $.ajax({
                url: `/delete_category/${categoryId}`,
                type: 'DELETE',
                success: (response) => {
                    this.categories = this.categories.filter(c => c.id !== categoryId);
                    this.updateCategoriesList();
                    
                    // Clear selection if the deleted category was selected
                    if (selectedCategoryId === categoryId) {
                        selectedCategoryId = null;
                        selectedEventId = null;
                        $('#selectedEventDisplay').text('None');
                        $('#addAnnotationBtn').prop('disabled', true);
                    }
                    
                    showToast('Category deleted successfully', 'success');
                },
                error: (xhr) => {
                    console.error('Error deleting category:', xhr);
                    showToast('Error deleting category', 'error');
                }
            });
        }
    };
    
    // Initialize all modules
    VideoManager.init();
    AnnotationManager.init();
    CategoryManager.init();

    // Initialize variables
    const videoPlayer = document.getElementById('videoPlayer');
    const uploadContainer = document.getElementById('uploadContainer');
    const videoContainer = document.getElementById('videoContainer');
    let videoFile = null;
    let selectedCategoryId = null;
    let selectedEventId = null;
    let selectedEventName = null;
    let player = null;

    // Drag and drop functionality
    uploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadContainer.classList.add('drag-over');
    });

    uploadContainer.addEventListener('dragleave', () => {
        uploadContainer.classList.remove('drag-over');
    });

    uploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadContainer.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('video/')) {
            handleVideoUpload(files[0]);
        }
    });

    // File input change handler
    $('#videoUpload').on('change', function(e) {
        if (e.target.files.length > 0) {
            handleVideoUpload(e.target.files[0]);
        }
    });

    // Handle video upload
    function handleVideoUpload(file) {
        if (!selectedCategoryId) {
            showToast('Please select a category first!', 'error');
            $('#videoUpload').val('');
            return;
        }

        videoFile = file;
            const formData = new FormData();
        formData.append('video', file);
        formData.append('categoryId', selectedCategoryId);

        // Show loading state with progress bar
        const uploadArea = $('#uploadArea');
        const originalContent = uploadArea.html();
        uploadArea.html(`
            <div class="text-center">
                <div class="upload-progress mb-3">
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" style="width: 0%">0%</div>
                    </div>
                </div>
                <h4 class="upload-status">Uploading video...</h4>
            </div>
        `);

        $.ajax({
                url: '/upload',
            type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
            xhr: function() {
                const xhr = new window.XMLHttpRequest();
                xhr.upload.addEventListener('progress', function(e) {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        $('.progress-bar').css('width', percent + '%').text(percent + '%');
                        $('.upload-status').text(`Uploading video... ${percent}%`);
                    }
                }, false);
                return xhr;
            },
            success: function(response) {
                uploadContainer.classList.add('d-none');
                videoContainer.classList.remove('d-none');
                
                // Initialize video player
                const newPlayer = initializeVideoPlayer(`/uploads/${response.filename}`);
                
                newPlayer.ready(function() {
                    // Load existing annotations
                    AnnotationManager.loadExistingAnnotations(response);
                    showToast('Video loaded successfully!', 'success');
                });
            },
            error: function(xhr) {
                uploadArea.html(originalContent);
                showToast(xhr.responseJSON?.error || 'Error uploading video', 'error');
                $('#videoUpload').val('');
            }
        });
    }

    // Video player controls
    videoPlayer.addEventListener('loadedmetadata', function() {
        updateDurationDisplay();
        initializeTimeline();
    });

    videoPlayer.addEventListener('timeupdate', function() {
        updateTimeDisplay();
    });

    $('#playPauseBtn').click(function() {
        if (videoPlayer.paused) {
            videoPlayer.play();
            $(this).find('i').removeClass('fa-play').addClass('fa-pause');
        } else {
            videoPlayer.pause();
            $(this).find('i').removeClass('fa-pause').addClass('fa-play');
        }
    });

    // Timeline functionality
    function initializeTimeline() {
        const timeline = document.getElementById('timeline');
        timeline.addEventListener('click', function(e) {
            const rect = timeline.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            videoPlayer.currentTime = pos * videoPlayer.duration;
        });
    }

    function updateTimeDisplay() {
        $('#currentTimeDisplay').text(formatTime(videoPlayer.currentTime));
    }

    function updateDurationDisplay() {
        $('#durationDisplay').text(formatTime(videoPlayer.duration));
    }

    // Helper functions
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Helper function to show toasts
    window.showToast = function(message, type = 'info') {
        const toast = $(`
            <div class="toast-notification ${type}">
                <div class="toast-message">${message}</div>
            </div>
        `).appendTo('body');
        
        toast.fadeIn(300).delay(3000).fadeOut(300, function() {
            $(this).remove();
        });
    };

    function initializeVideoPlayer(videoUrl) {
        if (player) {
            player.dispose();
        }

        player = videojs('videoPlayer', {
            controls: true,
            fluid: true,
            playbackRates: [0.5, 1, 1.5, 2],
            controlBar: {
                children: [
                    'playToggle',
                    'volumePanel',
                    'currentTimeDisplay',
                    'timeDivider',
                    'durationDisplay',
                    'progressControl',
                    'playbackRateMenuButton',
                    'fullscreenToggle'
                ]
            }
        });

        player.ready(function() {
            player.src({
                type: 'video/mp4',
                src: videoUrl
            });

            // Enable markers
            player.on('loadedmetadata', function() {
                console.log('Video metadata loaded, initializing markers');
                    updateVideoMarkers();
            });

            setupCustomControls();
            setupKeyboardShortcuts();
        });

        return player;
    }

    function setupCustomControls() {
        if (!player) return;

        // Remove old event listeners
        $(document).off('click', '#playPauseBtn');
        $(document).off('change', '#playbackSpeed');
        $(document).off('input', '#volumeControl');

        // Play/Pause button
        $(document).on('click', '#playPauseBtn', function() {
            if (player.paused()) {
                player.play();
            } else {
                player.pause();
            }
        });

        // Playback speed
        $(document).on('change', '#playbackSpeed', function() {
            const speed = parseFloat(this.value);
            player.playbackRate(speed);
        });

        // Volume control
        $(document).on('input', '#volumeControl', function() {
            const volume = parseFloat(this.value);
            player.volume(volume);
            updateVolumeIcon(volume);
        });

        // Player event handlers
        player.on('play', function() {
            $('#playPauseBtn i').removeClass('fa-play').addClass('fa-pause');
        });

        player.on('pause', function() {
            $('#playPauseBtn i').removeClass('fa-pause').addClass('fa-play');
        });

        player.on('timeupdate', function() {
            const currentTime = player.currentTime();
            const duration = player.duration();
            $('#currentTimeDisplay').text(formatTime(currentTime));
            $('#durationDisplay').text(formatTime(duration));
            $('#annotationTimeDisplay').text(formatTime(currentTime));
        });

        player.on('volumechange', function() {
            const volume = player.volume();
            $('#volumeControl').val(volume);
            updateVolumeIcon(volume);
        });

        player.on('ratechange', function() {
            $('#playbackSpeed').val(player.playbackRate());
        });
    }

    // Helper function to update volume icon
    function updateVolumeIcon(volume) {
        const icon = $('.volume-control i');
        icon.removeClass('fa-volume-up fa-volume-down fa-volume-off fa-volume-mute');
        
        if (volume >= 0.6) {
            icon.addClass('fa-volume-up');
        } else if (volume >= 0.3) {
            icon.addClass('fa-volume-down');
        } else if (volume > 0) {
            icon.addClass('fa-volume-off');
        } else {
            icon.addClass('fa-volume-mute');
        }
    }

    function updateVideoMarkers() {
        if (!player || !AnnotationManager.annotations.length) {
            console.log('No player or annotations available for markers');
            return;
        }

        console.log('Updating video markers');
        const duration = player.duration();
        const progressControl = player.controlBar.progressControl.seekBar.el();
        
        // Clear existing markers
        $('.vjs-marker').remove();

        // Add markers for each annotation
        AnnotationManager.annotations.forEach(annotation => {
            const category = CategoryManager.categories.find(c => c.id === annotation.categoryId);
            const event = category?.events.find(e => e.id === annotation.eventId);
            
            if (event) {
                console.log(`Adding marker for event: ${event.name} with color: ${event.color}`);
                const position = (annotation.time / duration) * 100;
                const marker = $(`
                    <div class="vjs-marker" 
                         style="left: ${position}%; background-color: ${event.color}"
                         title="${category.name} - ${event.name}: ${formatTime(annotation.time)}"
                    ></div>
                `);
                $(progressControl).append(marker);
            }
        });
    }

    function findEventById(eventId) {
        for (const category of categories) {
            const event = category.events.find(e => e.id === eventId);
            if (event) return event;
        }
        console.warn('Event not found:', eventId);
        return {
            name: 'Unknown Event',
            color: '#cccccc'
        };
    }

    // Update the save annotation handler
    function saveAnnotations() {
        if (!videoFile || !selectedCategoryId) {
            console.error('Missing required data for saving annotations');
            return;
        }
        
        const annotationData = {
            filename: videoFile.name,
            categoryId: selectedCategoryId,
            annotations: annotations.map(ann => ({
                time: ann.time,
                categoryId: ann.categoryId,
                eventId: ann.eventId
            }))
        };

        console.log('Saving annotations:', annotationData); // Debug log

        $.ajax({
            url: '/save_annotations',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(annotationData),
            success: function(response) {
                console.log('Annotations saved successfully:', response);
                showToast('Annotations saved successfully', 'success');
            },
            error: function(xhr, status, error) {
                console.error('Error saving annotations:', error, xhr.responseText);
                showToast(xhr.responseJSON?.error || 'Error saving annotations', 'error');
            }
        });
    }

    // Add this to handle keyboard shortcuts
    function setupKeyboardShortcuts() {
        $(document).on('keydown', function(e) {
            // Only handle shortcuts if video is loaded
            if (!player) return;

            // Don't trigger shortcuts if user is typing in an input
            if ($(e.target).is('input, textarea')) return;

            console.log('Key pressed:', e.key);

            switch(e.key) {
                case 'Enter':
                    // Add annotation
                    e.preventDefault();
                    if (!$('#annotationModal').is(':visible')) {  // Only if modal is not already open
                        AnnotationManager.showAddAnnotationModal();
                    }
                    break;

                case 'ArrowLeft':
                    // Seek backward 10 seconds
                    e.preventDefault();
        const currentTime = player.currentTime();
                    player.currentTime(Math.max(0, currentTime - 10));
                    break;

                case 'ArrowRight':
                    // Seek forward 10 seconds
                    e.preventDefault();
                    const newTime = player.currentTime() + 10;
                    player.currentTime(Math.min(player.duration(), newTime));
                    break;

                case ' ':
                    // Space bar to play/pause
                    e.preventDefault();
                    if (player.paused()) {
                        player.play();
                    } else {
                        player.pause();
                    }
                    break;
            }
        });
    }

    // Initialize tooltips
    $('[data-bs-toggle="tooltip"]').tooltip();
});