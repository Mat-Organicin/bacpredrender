document.addEventListener('DOMContentLoaded', function() {
    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Deactivate all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));
            
            // Activate target tab
            button.classList.add('active');
            document.getElementById(`${targetTab}-panel`).classList.add('active');
        });
    });
    
    // File upload handling with drag and drop
    const fileInput = document.getElementById('fasta-file');
    const fileUploadLabel = document.querySelector('.file-upload-label');
    
    if (fileUploadLabel) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileUploadLabel.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            fileUploadLabel.addEventListener(eventName, () => {
                fileUploadLabel.classList.add('highlight');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            fileUploadLabel.addEventListener(eventName, () => {
                fileUploadLabel.classList.remove('highlight');
            }, false);
        });
        
        fileUploadLabel.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length) {
                fileInput.files = files;
                const fileName = files[0].name;
                fileUploadLabel.querySelector('span').textContent = fileName;
            }
        }, false);
        
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                const fileName = fileInput.files[0].name;
                fileUploadLabel.querySelector('span').textContent = fileName;
            }
        });
    }
    
    // Form submissions
    const uploadForm = document.getElementById('upload-form');
    const searchForm = document.getElementById('search-form');
    const pasteForm = document.getElementById('paste-form');
    const loadingOverlay = document.getElementById('loading-overlay');
    const resultsContainer = document.getElementById('results-container');
    const sequenceList = document.getElementById('sequence-list');
    
    // FASTA Upload Form
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(uploadForm);
            
            if (!formData.get('fastaFile').name) {
                showNotification('Please select a file to upload', 'error');
                return;
            }
            
            loadingOverlay.style.display = 'flex';
            
            fetch('/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to upload file');
                    });
                }
                return response.json();
            })
            .then(data => {
                displaySequences(data.sequences);
                showNotification('File uploaded successfully', 'success');
            })
            .catch(error => {
                console.error('Upload error:', error);
                let errorMessage = error.message;
                if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                    errorMessage = 'Network error: Unable to connect to the server. Please check if the server is running.';
                }
                showNotification(errorMessage, 'error');
            })
            .finally(() => {
                loadingOverlay.style.display = 'none';
            });
        });
    }
    
    // NCBI Search Form
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const query = document.getElementById('search-query').value;
            const type = document.getElementById('search-type').value;
            const length = document.getElementById('seq-length').value;
            
            if (!query) {
                showNotification('Please enter a search query', 'error');
                return;
            }
            
            loadingOverlay.style.display = 'flex';
            
            fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    type: type,
                    length: length
                })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Search failed');
                    });
                }
                return response.json();
            })
            .then(data => {
                if (data.sequences && data.sequences.length > 0) {
                    displaySequences(data.sequences);
                    showNotification(`Found ${data.sequences.length} sequences`, 'success');
                } else {
                    showNotification('No sequences found matching your criteria', 'info');
                }
            })
            .catch(error => {
                console.error('Search error:', error);
                let errorMessage = error.message;
                if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                    errorMessage = 'Network error: Unable to connect to the server. Please check if the server is running.';
                }
                showNotification(errorMessage, 'error');
            })
            .finally(() => {
                loadingOverlay.style.display = 'none';
            });
        });
    }
    
    // Paste Sequence Form
    if (pasteForm) {
        pasteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const name = document.getElementById('sequence-name').value || 'Unnamed Sequence';
            const sequence = document.getElementById('sequence-input').value;
            
            if (!sequence) {
                showNotification('Please enter a sequence', 'error');
                return;
            }
            
            loadingOverlay.style.display = 'flex';
            
            fetch('/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    sequence: sequence
                })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to process sequence');
                    });
                }
                return response.json();
            })
            .then(data => {
                displaySequences(data.sequences);
                showNotification('Sequence processed successfully', 'success');
            })
            .catch(error => {
                console.error('Processing error:', error);
                let errorMessage = error.message;
                if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                    errorMessage = 'Network error: Unable to connect to the server. Please check if the server is running.';
                }
                showNotification(errorMessage, 'error');
            })
            .finally(() => {
                loadingOverlay.style.display = 'none';
            });
        });
    }
    
    // Results actions
    const downloadButton = document.getElementById('download-button');
    const predictButton = document.getElementById('predict-button');
    const clearButton = document.getElementById('clear-button');
    
    if (downloadButton) {
        downloadButton.addEventListener('click', function() {
            downloadSequences();
        });
    }
    
    if (predictButton) {
        predictButton.addEventListener('click', function() {
            predictBacteriocins();
        });
    }
    
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            clearResults();
        });
    }
    
    // Prediction actions
    const backToResultsButton = document.getElementById('back-to-results-button');
    const downloadPredictionsButton = document.getElementById('download-predictions-button');
    
    if (backToResultsButton) {
        backToResultsButton.addEventListener('click', function() {
            showResultsView();
        });
    }
    
    if (downloadPredictionsButton) {
        downloadPredictionsButton.addEventListener('click', function() {
            downloadPredictions();
        });
    }
    
    // Helper functions
    function displaySequences(sequences) {
        if (!sequences || sequences.length === 0) {
            return;
        }
        
        // Store sequences in window object for later use
        window.currentSequences = sequences;
        
        // Clear previous results
        sequenceList.innerHTML = '';
        
        // Create sequence cards
        sequences.forEach((seq, index) => {
            const sequenceCard = document.createElement('div');
            sequenceCard.className = 'sequence-card';
            
            const header = seq.header || seq.description || `Sequence ${index + 1}`;
            const sequence = seq.sequence;
            
            sequenceCard.innerHTML = `
                <div class="sequence-header">
                    <h3 class="sequence-title">${header}</h3>
                    <div class="sequence-actions">
                        <button class="action-button sequence-select-btn" data-index="${index}">
                            <i class="fas fa-check-circle"></i> Select
                        </button>
                    </div>
                </div>
                <div class="sequence-body">
                    <div class="sequence-info">Length: ${sequence.length} amino acids</div>
                    <div class="sequence-content">${sequence}</div>
                </div>
            `;
            
            sequenceList.appendChild(sequenceCard);
        });
        
        // Add event listeners to select buttons
        document.querySelectorAll('.sequence-select-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(btn.getAttribute('data-index'));
                toggleSequenceSelection(btn, index);
            });
        });
        
        // Show results container
        resultsContainer.style.display = 'block';
    }
    
    // Selection handling for sequences
    let selectedSequences = [];
    
    function toggleSequenceSelection(button, index) {
        const isSelected = button.classList.contains('selected');
        
        if (isSelected) {
            // Deselect
            button.classList.remove('selected');
            button.innerHTML = '<i class="fas fa-check-circle"></i> Select';
            
            // Remove from selected sequences
            selectedSequences = selectedSequences.filter(i => i !== index);
        } else {
            // Select
            button.classList.add('selected');
            button.innerHTML = '<i class="fas fa-times-circle"></i> Deselect';
            
            // Add to selected sequences
            selectedSequences.push(index);
        }
        
        // Selection is no longer needed for prediction
        // updatePredictButtonState();
    }
    
    // This function is no longer needed since we're predicting all sequences
    // function updatePredictButtonState() {
    //    if (predictButton) {
    //        predictButton.disabled = selectedSequences.length === 0;
    //    }
    // }
    
    // Download selected sequences as FASTA
    function downloadSequences() {
        if (!window.currentSequences || window.currentSequences.length === 0) {
            showNotification('No sequences to download', 'warning');
            return;
        }
        
        let sequencesToDownload = window.currentSequences;
        
        // If there are selected sequences, only download those
        if (selectedSequences.length > 0) {
            sequencesToDownload = selectedSequences.map(index => window.currentSequences[index]);
        }
        
        loadingOverlay.style.display = 'flex';
        
        fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sequences: sequencesToDownload
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Download failed');
                });
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'sequences.fasta';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showNotification('Download complete', 'success');
        })
        .catch(error => {
            console.error('Download error:', error);
            let errorMessage = error.message;
            if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                errorMessage = 'Network error: Unable to connect to the server. Please check if the server is running.';
            }
            showNotification(errorMessage, 'error');
        })
        .finally(() => {
            loadingOverlay.style.display = 'none';
        });
    }
    
    // Predict bacteriocins for selected sequences
    function predictBacteriocins() {
        if (!window.currentSequences || window.currentSequences.length === 0) {
            showNotification('No sequences available for prediction', 'warning');
            return;
        }
        
        // Always use all sequences instead of only selected ones
        const sequencesToPredict = window.currentSequences;
        
        loadingOverlay.style.display = 'flex';
        
        // Use a relative URL instead of hardcoding the port
        const predictionUrl = '/predict';
        
        fetch(predictionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sequences: sequencesToPredict
            })
        })
        .then(response => {
            console.log('Prediction response status:', response.status);
            if (!response.ok) {
                return response.json().then(data => {
                    console.error('Prediction error response data:', data);
                    throw new Error(data.error || `Prediction failed with status ${response.status}`);
                }).catch(e => {
                    // If JSON parsing fails, throw a generic error with status code
                    console.error('Error parsing error response:', e);
                    throw new Error(`Prediction failed (${response.status}): Please check server logs`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log('Prediction success data:', data);
            displayPredictions(data.predictions);
            showNotification('Prediction completed successfully', 'success');
        })
        .catch(error => {
            console.error('Prediction error:', error);
            let errorMessage = error.message;
            if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                errorMessage = 'Network error: Unable to connect to the server. Please check if the server is running.';
            }
            showNotification(errorMessage, 'error');
        })
        .finally(() => {
            loadingOverlay.style.display = 'none';
        });
    }
    
    // Display prediction results
    const predictionContainer = document.getElementById('prediction-container');
    const predictionList = document.getElementById('prediction-list');
    
    function displayPredictions(predictions) {
        if (!predictions || predictions.length === 0) {
            showNotification('No prediction results available', 'warning');
            return;
        }
        
        // Store predictions in window object for later use
        window.currentPredictions = predictions;
        
        // Apply initial sort (high to low probability)
        sortPredictions('probability-desc');
        
        // Set up event listeners for sorting and filtering controls
        setupSortingAndFiltering();
        
        // Hide results view and show prediction view
        resultsContainer.style.display = 'none';
        predictionContainer.style.display = 'block';
    }
    
    function setupSortingAndFiltering() {
        // Sort buttons
        document.getElementById('sort-probability-desc').addEventListener('click', function() {
            setActiveButton(this, 'sort');
            sortPredictions('probability-desc');
        });
        
        document.getElementById('sort-probability-asc').addEventListener('click', function() {
            setActiveButton(this, 'sort');
            sortPredictions('probability-asc');
        });
        
        // Filter buttons
        document.getElementById('filter-all').addEventListener('click', function() {
            setActiveButton(this, 'filter');
            filterPredictions('all');
        });
        
        document.getElementById('filter-bacteriocin').addEventListener('click', function() {
            setActiveButton(this, 'filter');
            filterPredictions('bacteriocin');
        });
        
        document.getElementById('filter-non-bacteriocin').addEventListener('click', function() {
            setActiveButton(this, 'filter');
            filterPredictions('non-bacteriocin');
        });
        
        // Threshold slider
        const thresholdSlider = document.getElementById('probability-threshold');
        const thresholdValue = document.getElementById('threshold-value');
        
        thresholdSlider.addEventListener('input', function() {
            const value = this.value;
            thresholdValue.textContent = value + '%';
            filterByThreshold(value / 100);
        });
    }
    
    function setActiveButton(activeButton, type) {
        // Find all buttons in the same control group
        const selector = type === 'sort' ? '[id^=sort-]' : '[id^=filter-]';
        const buttons = document.querySelectorAll(selector);
        
        // Remove active class from all buttons
        buttons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked button
        activeButton.classList.add('active');
    }
    
    function sortPredictions(sortBy) {
        if (!window.currentPredictions || window.currentPredictions.length === 0) {
            return;
        }
        
        // Sort predictions
        const sortedPredictions = [...window.currentPredictions];
        
        if (sortBy === 'probability-desc') {
            sortedPredictions.sort((a, b) => b.probability - a.probability);
        } else if (sortBy === 'probability-asc') {
            sortedPredictions.sort((a, b) => a.probability - b.probability);
        }
        
        // Re-render the predictions
        renderPredictions(sortedPredictions);
    }
    
    function filterPredictions(filterType) {
        if (!window.currentPredictions || window.currentPredictions.length === 0) {
            return;
        }
        
        let filteredPredictions = [...window.currentPredictions];
        
        if (filterType === 'bacteriocin') {
            filteredPredictions = filteredPredictions.filter(pred => pred.probability > 0.5);
        } else if (filterType === 'non-bacteriocin') {
            filteredPredictions = filteredPredictions.filter(pred => pred.probability <= 0.5);
        }
        
        // Apply current threshold filter as well
        const thresholdValue = document.getElementById('probability-threshold').value / 100;
        
        // Get current sort method
        const currentSortMethod = document.querySelector('[id^=sort-].active').id;
        
        // Sort the filtered predictions
        if (currentSortMethod === 'sort-probability-desc') {
            filteredPredictions.sort((a, b) => b.probability - a.probability);
        } else if (currentSortMethod === 'sort-probability-asc') {
            filteredPredictions.sort((a, b) => a.probability - b.probability);
        }
        
        // Re-render the predictions
        renderPredictions(filteredPredictions);
    }
    
    function filterByThreshold(threshold) {
        if (!window.currentPredictions || window.currentPredictions.length === 0) {
            return;
        }
        
        // Get current filter type
        const activeFilterButton = document.querySelector('[id^=filter-].active');
        let filterType = 'all';
        
        if (activeFilterButton) {
            filterType = activeFilterButton.id.replace('filter-', '');
        }
        
        // Filter predictions based on both type and threshold
        let filteredPredictions = [...window.currentPredictions];
        
        if (filterType === 'bacteriocin') {
            filteredPredictions = filteredPredictions.filter(pred => pred.probability > 0.5);
        } else if (filterType === 'non-bacteriocin') {
            filteredPredictions = filteredPredictions.filter(pred => pred.probability <= 0.5);
        }
        
        // Apply threshold filter
        filteredPredictions = filteredPredictions.filter(pred => {
            if (threshold <= 0.5) {
                // When threshold is below 0.5, we show all predictions ≤ threshold
                return pred.probability <= threshold;
            } else {
                // When threshold is above 0.5, we show all predictions ≥ threshold
                return pred.probability >= threshold;
            }
        });
        
        // Get current sort method
        const currentSortMethod = document.querySelector('[id^=sort-].active').id;
        
        // Sort the filtered predictions
        if (currentSortMethod === 'sort-probability-desc') {
            filteredPredictions.sort((a, b) => b.probability - a.probability);
        } else if (currentSortMethod === 'sort-probability-asc') {
            filteredPredictions.sort((a, b) => a.probability - b.probability);
        }
        
        // Re-render the predictions
        renderPredictions(filteredPredictions);
    }
    
    function renderPredictions(predictions) {
        // Clear previous results
        predictionList.innerHTML = '';
        
        if (predictions.length === 0) {
            predictionList.innerHTML = '<div class="no-results">No predictions match your criteria</div>';
            return;
        }
        
        // Add "Add All" button for filtered results
        const addAllButtonContainer = document.createElement('div');
        addAllButtonContainer.className = 'add-all-container';
        addAllButtonContainer.innerHTML = `
            <button id="add-all-to-collection" class="add-all-button">
                <i class="fas fa-plus-circle"></i> Add All Filtered Bacteriocins to Collection
            </button>
        `;
        predictionList.appendChild(addAllButtonContainer);
        
        // Setup Add All button listener
        document.getElementById('add-all-to-collection').addEventListener('click', function() {
            const bacteriocins = predictions.filter(pred => pred.probability > 0.5);
            if (bacteriocins.length === 0) {
                showNotification('No bacteriocins to add', 'warning');
                return;
            }
            
            // Count of successfully added bacteriocins
            let addedCount = 0;
            let totalToAdd = bacteriocins.length;
            
            // Process each bacteriocin
            bacteriocins.forEach(pred => {
                // Get the name (description)
                let name = pred.name || '';
                if (!name && pred.header && pred.id) {
                    name = pred.header.substring(pred.id.length).trim();
                }
                
                // Prepare data for the backend
                const collectionData = {
                    sequence_id: pred.sequence_id || pred.id || pred.header.split(' ')[0],
                    name: name || pred.header || pred.id || pred.sequence_id,
                    sequence: pred.sequence,
                    probability: pred.probability
                };
                
                // Send data to the backend
                fetch('/add_to_collection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(collectionData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        addedCount++;
                        
                        // Find and disable the add button for this card
                        const buttonSelector = `.add-to-collection[data-sequence-id="${pred.sequence_id || pred.id || pred.header.split(' ')[0]}"]`;
                        console.log('Looking for buttons with selector:', buttonSelector);
                        const buttons = document.querySelectorAll(buttonSelector);
                        buttons.forEach(button => {
                            button.classList.add('added');
                            button.innerHTML = '<i class="fas fa-check"></i> Added to Collection';
                            button.disabled = true;
                        });
                        
                        // Show completion notification when all are processed
                        if (addedCount === totalToAdd) {
                            showNotification(`Added ${addedCount} bacteriocins to your collection`, 'success');
                        }
                    }
                })
                .catch(error => {
                    console.error('Error adding to collection:', error);
                });
            });
        });
        
        // Create prediction cards
        predictions.forEach(pred => {
            const predictionCard = document.createElement('div');
            predictionCard.className = 'prediction-card';
            
            const isBacteriocin = pred.prediction === 'Bacteriocin' || pred.probability > 0.5;
            const confidenceClass = isBacteriocin ? 'positive' : 'negative';
            const probabilityPercent = (pred.probability * 100).toFixed(2);
            
            const sequencePreview = pred.sequence.length > 50 
                ? pred.sequence.substring(0, 50) + '...' 
                : pred.sequence;
            
            // Get the name (description) for the card title
            let titleText = pred.name || '';
            
            // If name is not available, extract it from header
            if (!titleText && pred.header && pred.id) {
                titleText = pred.header.substring(pred.id.length).trim();
            }
            
            // Fall back to ID if no name is found
            if (!titleText) {
                titleText = pred.id;
            }
            
            // Store sequence ID for backend reference
            const sequenceId = pred.sequence_id || pred.id || (pred.header ? pred.header.split(' ')[0] : null);
            
            // Add collection button only for bacteriocins
            const collectionButton = isBacteriocin ? 
                `<div class="collection-action">
                    <button class="add-to-collection" data-sequence-id="${sequenceId}">
                        <i class="fas fa-plus"></i> Add to Collection
                    </button>
                </div>` : '';
            
            predictionCard.innerHTML = `
                <div class="prediction-card-header">
                    <h3 class="prediction-card-title">${titleText}</h3>
                </div>
                <div class="prediction-card-body">
                    <div class="prediction-result">
                        <span class="prediction-label">Prediction:</span>
                        <span class="prediction-value ${confidenceClass}">${pred.prediction}</span>
                    </div>
                    <div class="prediction-result">
                        <span class="prediction-label">Probability:</span>
                        <span class="prediction-value ${confidenceClass}">${probabilityPercent}%</span>
                    </div>
                    <div class="prediction-result">
                        <span class="prediction-label">Confidence:</span>
                        <span class="prediction-value ${confidenceClass}">${pred.confidence}</span>
                    </div>
                    <div class="sequence-preview">${sequencePreview}</div>
                    ${collectionButton}
                </div>
            `;
            
            predictionList.appendChild(predictionCard);
        });
        
        // Add event listeners to collection buttons
        addCollectionButtonListeners();
    }
    
    function addCollectionButtonListeners() {
        // Find all "Add to Collection" buttons
        const collectionButtons = document.querySelectorAll('.add-to-collection');
        
        collectionButtons.forEach(button => {
            button.addEventListener('click', function() {
                const sequenceId = this.getAttribute('data-sequence-id');
                const buttonElement = this;
                
                // Find the prediction data for this sequence
                const predictionData = window.currentPredictions.find(pred => 
                    (pred.sequence_id === sequenceId) || 
                    (pred.id === sequenceId) || 
                    (pred.header && pred.header.split(' ')[0] === sequenceId)
                );
                
                if (!predictionData) {
                    showNotification('Error: Could not find sequence data', 'error');
                    console.error('Sequence ID not found:', sequenceId);
                    console.debug('Available predictions:', window.currentPredictions);
                    return;
                }
                
                // Get the name (description) from title
                const cardTitle = this.closest('.prediction-card').querySelector('.prediction-card-title').textContent;
                
                // Prepare data for the backend
                const collectionData = {
                    sequence_id: predictionData.sequence_id || predictionData.id || predictionData.header.split(' ')[0],
                    name: cardTitle || predictionData.header || predictionData.id || predictionData.sequence_id,
                    sequence: predictionData.sequence,
                    probability: predictionData.probability
                };
                
                // Send data to the backend
                fetch('/add_to_collection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(collectionData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Visual feedback
                        buttonElement.classList.add('added');
                        buttonElement.innerHTML = '<i class="fas fa-check"></i> Added to Collection';
                        
                        // Show notification
                        showNotification('Bacteriocin added to your collection', 'success');
                        
                        // Disable button to prevent duplicate additions
                        buttonElement.disabled = true;
                    } else {
                        throw new Error(data.message || 'Failed to add to collection');
                    }
                })
                .catch(error => {
                    console.error('Error adding to collection:', error);
                    showNotification(`Error: ${error.message}`, 'error');
                });
            });
        });
    }
    
    // Show results view (hide prediction view)
    function showResultsView() {
        predictionContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
    }
    
    // Download prediction results as CSV
    function downloadPredictions() {
        if (!window.currentPredictions || window.currentPredictions.length === 0) {
            showNotification('No prediction results to download', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = 'Sequence ID,Prediction,Probability,Confidence,Sequence\n';
        
        window.currentPredictions.forEach(pred => {
            const row = [
                `"${pred.id}"`,
                `"${pred.prediction}"`,
                pred.probability,
                `"${pred.confidence}"`,
                `"${pred.sequence}"`
            ].join(',');
            
            csvContent += row + '\n';
        });
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'bacteriocin_predictions.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        showNotification('Predictions downloaded as CSV', 'success');
    }
    
    // Clear results
    function clearResults() {
        sequenceList.innerHTML = '';
        resultsContainer.style.display = 'none';
        predictionContainer.style.display = 'none';
        
        // Clear stored data
        window.currentSequences = [];
        window.currentPredictions = [];
        selectedSequences = [];
        
        showNotification('Results cleared', 'info');
    }
    
    // Notification system
    function showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = '';
        switch (type) {
            case 'success':
                icon = '<i class="fas fa-check-circle"></i>';
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-circle"></i>';
                break;
            case 'warning':
                icon = '<i class="fas fa-exclamation-triangle"></i>';
                break;
            default:
                icon = '<i class="fas fa-info-circle"></i>';
        }
        
        notification.innerHTML = `
            <div class="notification-content">
                ${icon}
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;
        
        notifications.appendChild(notification);
        
        // Add close button event listener
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
});
