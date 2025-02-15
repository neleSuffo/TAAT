class CategorySetup {
    constructor() {
        this.events = [];
        this.isEditing = !!$('#categoryId').val();
        
        // Load existing category data if editing
        if (this.isEditing && window.CATEGORY_DATA) {
            console.log('Initial category data:', window.CATEGORY_DATA);
            this.loadExistingCategory(window.CATEGORY_DATA);
        }
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add Event button
        $('#addEventBtn').on('click', () => this.addNewEvent());

        // Save Category button
        $('#saveCategoryBtn').on('click', () => this.saveCategory());

        // Event delegation for dynamic elements
        $(document).on('click', '.delete-event', (e) => {
            $(e.target).closest('.event-setup-card').remove();
        });

        $(document).on('click', '.add-field', (e) => {
            const eventCard = $(e.target).closest('.event-setup-card');
            this.addCustomField(eventCard);
        });

        $(document).on('change', '.field-type', (e) => {
            const fieldItem = $(e.target).closest('.custom-field-item');
            const optionsField = fieldItem.find('.field-options');
            optionsField.toggle(e.target.value === 'select');
        });

        $(document).on('click', '.delete-field', (e) => {
            $(e.target).closest('.custom-field-item').remove();
        });
    }

    loadExistingCategory(category) {
        console.log('Loading existing category:', category);
        
        // Set basic category info
        $('#categoryId').val(category.id);
        $('#categoryName').val(category.name);
        $('#categoryColor').val(category.color);

        // Clear existing events first
        $('#eventsList').empty();

        // Load events
        if (category.events && category.events.length > 0) {
            category.events.forEach(event => {
                console.log('Loading event:', event);
                this.addNewEvent(event);
            });
        }
    }

    addNewEvent(existingEvent = null) {
        console.log('Adding event with data:', existingEvent);
        const template = document.getElementById('eventTemplate');
        const eventNode = template.content.cloneNode(true);
        const eventCard = $(eventNode);

        if (existingEvent) {
            // Set basic event info
            eventCard.find('.event-name').val(existingEvent.name);
            eventCard.find('.event-color').val(existingEvent.color);
            
            // Add existing custom fields4
        console.log('Existing event:', existingEvent);
       // console.log("custom fields ",)
            if (existingEvent.customFields && existingEvent.customFields.length > 0) {
                console.log('Loading custom fields:', existingEvent.customFields);
                existingEvent.customFields.forEach(field => {
                    this.addCustomField(eventCard, field);
                });
            }
        }

        $('#eventsList').append(eventCard);
    }

    addCustomField(eventCard, existingField = null) {
        console.log('Adding custom field:', existingField);
        const template = document.getElementById('customFieldTemplate');
        const fieldNode = template.content.cloneNode(true);
        const fieldItem = $(fieldNode);
        const customFieldsList = eventCard.find('.custom-fields-list');

        if (existingField) {
            // Set field name and type
            fieldItem.find('.field-name').val(existingField.name);
            fieldItem.find('.field-type').val(existingField.type);
            fieldItem.find('.field-required').prop('checked', existingField.required);

            // Handle select type fields with options
            if (existingField.type === 'select') {
                const optionsField = fieldItem.find('.field-options');
                // First append the field item to the DOM
                customFieldsList.append(fieldItem);
                // Then show the options field
                optionsField.css('display', 'block');
                if (existingField.options && existingField.options.length > 0) {
                    optionsField.find('.field-options-input').val(existingField.options.join('\n'));
                }
            } else {
                // For non-select fields, just append
                customFieldsList.append(fieldItem);
            }
        } else {
            // For new fields, just append
            customFieldsList.append(fieldItem);
        }

        if (!customFieldsList.length) {
            console.warn('Could not find custom-fields-list in event card');
            console.log('Event card structure:', eventCard.html());
        }
    }

    collectEventData(eventCard) {
        const $eventCard = $(eventCard);
        console.log('Collecting data from event card:', $eventCard);

        const customFields = [];
        $eventCard.find('.custom-field-item').each((_, fieldItem) => {
            const $field = $(fieldItem);
            const fieldData = {
                name: $field.find('.field-name').val(),
                type: $field.find('.field-type').val(),
                required: $field.find('.field-required').is(':checked'),
                options: []
            };

            if (fieldData.type === 'select') {
                fieldData.options = $field.find('.field-options-input')
                    .val()
                    .split('\n')
                    .map(opt => opt.trim())
                    .filter(opt => opt);
            }

            customFields.push(fieldData);
        });

        const eventData = {
            name: $eventCard.find('.event-name').val(),
            color: $eventCard.find('.event-color').val(),
            customFields: customFields
        };

        console.log('Collected event data:', eventData);
        return eventData;
    }

    saveCategory() {
        const categoryData = {
            id: $('#categoryId').val(),
            name: $('#categoryName').val(),
            color: $('#categoryColor').val(),
            events: []
        };

        $('.event-setup-card').each((_, eventCard) => {
            categoryData.events.push(this.collectEventData($(eventCard)));
        });

        console.log('Saving category data:', categoryData);

        // Save to server
        $.ajax({
            url: '/save_category_setup',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(categoryData),
            success: (response) => {
                console.log('Category saved successfully:', response);
                alert('Category saved successfully!');
                window.location.href = '/';
            },
            error: (xhr) => {
                console.error('Error saving category:', xhr.responseText);
                alert('Error saving category: ' + xhr.responseText);
            }
        });
    }
}

// Initialize when document is ready
$(document).ready(() => {
    window.categorySetup = new CategorySetup();
}); 