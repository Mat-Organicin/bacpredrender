// Collection page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements
    const collectionList = document.querySelector('.collection-list');
    const searchInput = document.querySelector('input[name="search"]');
    const sortSelect = document.querySelector('select[name="sort"]');
    const searchForm = document.querySelector('.search-container form');
    const addVaultBtn = document.getElementById('add-vault-btn');
    const addBagBtn = document.getElementById('add-bag-btn');
    
    // Collection data store
    let bacteriocins = [];
    
    // Always load data via AJAX if the loading flag is set
    if (typeof isLoading !== 'undefined' && isLoading) {
        console.log("Loading flag is set, loading collection data via AJAX");
        loadCollection();
    }
    // Otherwise, check if we have preloaded data
    else if (typeof collectionData !== 'undefined' && collectionData && collectionData.length > 0) {
        console.log(`Using pre-loaded collection data: ${collectionData.length} items`);
        bacteriocins = collectionData;
        renderCollection(bacteriocins);
    } else {
        // Fall back to API load if no preloaded data
        console.log("No pre-loaded data, fetching from API");
        loadCollection();
    }
    
    // Handle browser navigation events
    window.addEventListener('popstate', function(event) {
        console.log("Navigation detected, reloading collection");
        loadCollection();
    });
    
    // Event listeners for tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to the clicked button
            this.classList.add('active');
            
            // Filter the collection based on the selected tab
            const tabType = this.getAttribute('data-tab');
            filterCollectionByType(tabType);
            
            // Update visibility of bulk action buttons based on tab
            updateBulkActionVisibility(tabType);
        });
    });
    
    // Event listeners for creating new vaults and bags
    if (addVaultBtn) {
        addVaultBtn.addEventListener('click', function() {
            showCreateVaultModal();
        });
    }
    
    if (addBagBtn) {
        addBagBtn.addEventListener('click', function() {
            showCreateBagModal();
        });
    }
    
    // Event listeners for filter controls
    const toggleFiltersBtn = document.getElementById('toggle-filters');
    const filterControls = document.querySelector('.filter-controls');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const addAllToVaultBtn = document.getElementById('add-all-to-vault');
    const addAllToBagBtn = document.getElementById('add-all-to-bag');
    const sameLengthFilter = document.getElementById('same-length-filter');
    
    // Filter controls toggle
    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', function() {
            const filterControls = document.querySelector('.filter-controls');
            if (filterControls) {
                const isVisible = filterControls.style.display !== 'none';
                filterControls.style.display = isVisible ? 'none' : 'block';
                
                // Update button text and icon
                const textSpan = this.querySelector('span');
                const icon = this.querySelector('i');
                
                if (textSpan) {
                    textSpan.textContent = isVisible ? 'Show Filters' : 'Hide Filters';
                }
                
                if (icon) {
                    if (isVisible) {
                        icon.classList.remove('fa-chevron-up');
                        icon.classList.add('fa-chevron-down');
                    } else {
                        icon.classList.remove('fa-chevron-down');
                        icon.classList.add('fa-chevron-up');
                    }
                }
            }
        });
    }
    
    // Apply filters
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
    
    // Reset filters
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
    }
    
    // Add all to vault
    if (addAllToVaultBtn) {
        addAllToVaultBtn.addEventListener('click', addAllToVault);
    }
    
    // Add all to bag
    if (addAllToBagBtn) {
        addAllToBagBtn.addEventListener('click', addAllToBag);
    }
    
    // Same length filter
    if (sameLengthFilter) {
        sameLengthFilter.addEventListener('change', function() {
            const length = this.value;
            if (length) {
                document.getElementById('min-length').value = length;
                document.getElementById('max-length').value = length;
            }
        });
    }
    
    // Set initial visibility for bulk actions
    updateBulkActionVisibility('all');
    
    // Functions
    function loadCollection() {
        showLoading();
        console.log("Loading collection data...");
        
        // Add a timestamp parameter to avoid caching issues
        const timestamp = new Date().getTime();
        const search = searchInput ? searchInput.value : '';
        const sort = sortSelect ? sortSelect.value : 'date-desc';
        
        // Add debug=true parameter to get more verbose logging on the server
        const url = `/api/collection?t=${timestamp}&search=${encodeURIComponent(search)}&sort=${encodeURIComponent(sort)}&debug=true`;
        console.log("Fetching from URL:", url);
        
        fetch(url)
            .then(response => {
                console.log("API Response status:", response.status);
                console.log("API Response headers:", response.headers);
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Collection data received:', JSON.stringify(data, null, 2));
                
                // Check what we got in the response
                if (!data) {
                    console.error("Received empty data from API");
                    throw new Error("No data received from server");
                }
                
                if (typeof data !== 'object') {
                    console.error("Received non-object data:", data);
                    throw new Error("Invalid data format received");
                }
                
                if (!('success' in data)) {
                    console.error("Data missing success field:", data);
                    throw new Error("Invalid data format: missing success field");
                }
                
                if (!('data' in data)) {
                    console.error("Data missing data field:", data);
                    throw new Error("Invalid data format: missing data field");
                }
                
                if (data.success && data.data) {
                    bacteriocins = data.data;
                    console.log(`Rendering ${bacteriocins.length} bacteriocins`);
                    console.log("First item sample:", bacteriocins.length > 0 ? bacteriocins[0] : "No items");
                    renderCollection(bacteriocins);
                    
                    // Check if we have the active tab and filter accordingly
                    const activeTab = document.querySelector('.tab-button.active');
                    if (activeTab) {
                        filterCollectionByType(activeTab.getAttribute('data-tab'));
                    }
                } else {
                    throw new Error(data.message || 'Failed to load collection');
                }
            })
            .catch(error => {
                console.error('Error loading collection:', error);
                showError(error.message);
            });
    }
    
    function showLoading() {
        if (collectionList) {
            collectionList.innerHTML = `
                <div class="loading-indicator">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading collection...</p>
                </div>
            `;
        }
    }
    
    function showError(message) {
        if (collectionList) {
            collectionList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <h2>Error loading collection</h2>
                    <p>${message}</p>
                    <button class="retry-button" onclick="window.location.reload()">Retry</button>
                </div>
            `;
        }
    }
    
    function renderCollection(items) {
        if (!collectionList) return;
        
        if (items.length === 0) {
            collectionList.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h2>No bacteriocins found</h2>
                    <p>${searchInput && searchInput.value ? 'No results match your search criteria. Try a different search term.' : 'Your collection is empty. Add some predictions to see them here.'}</p>
                    <a href="/" class="btn btn-primary">Go to Prediction Tool</a>
                </div>
            `;
            return;
        }
        
        // Empty the collection list
        collectionList.innerHTML = '';
        
        // Create and append each bacteriocin item
        items.forEach(item => {
            const type = item.probability > 0.9 ? 'reference' : 'candidate';
            const itemEl = document.createElement('div');
            itemEl.className = 'collection-item';
            itemEl.dataset.id = item.id;
            itemEl.dataset.type = type;
            itemEl.dataset.tab = `all ${type}`;
            itemEl.draggable = true;
            
            // Format the date
            let formattedDate = item.added_date;
            if (typeof item.added_date === 'string') {
                try {
                    const date = new Date(item.added_date);
                    formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                } catch (e) {
                    console.error('Error formatting date:', e);
                }
            }
            
            itemEl.innerHTML = `
                <div class="collection-item-header">
                    <h3 class="collection-item-title">${item.name}</h3>
                    <div class="collection-meta">
                        <span class="sequence-id">ID: ${item.sequence_id}</span>
                        <span class="added-date">Added: ${formattedDate}</span>
                    </div>
                </div>
                <div class="collection-item-body">
                    <div class="probability-bar">
                        <div class="probability-fill" style="width: ${(item.probability * 100).toFixed(2)}%"></div>
                        <span class="probability-text">${(item.probability * 100).toFixed(2)}% Bacteriocin Probability</span>
                    </div>
                    <div class="sequence-preview-container">
                        <span class="sequence-label">Sequence:</span>
                        <span class="sequence-preview">${item.sequence.substring(0, 30)}${item.sequence.length > 30 ? '...' : ''}</span>
                    </div>
                    <div class="collection-actions">
                        <button class="view-full-sequence" data-id="${item.id}" data-name="${item.name}" data-sequence="${item.sequence}" title="View full sequence details">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="same-length-filter" data-length="${item.sequence.length}" title="Find all sequences with the same length">
                            <i class="fas fa-equals"></i>
                        </button>
                        <button class="rename-sequence" data-id="${item.id}" data-name="${item.name}" title="Rename this bacteriocin">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="add-to-vault-direct" data-id="${item.id}" ${type !== 'reference' ? 'style="display: none;"' : ''} title="Add to reference vault">
                            <i class="fas fa-shield-alt"></i> Vault
                        </button>
                        <button class="add-to-bag-direct" data-id="${item.id}" ${type !== 'candidate' ? 'style="display: none;"' : ''} title="Add to candidate bag">
                            <i class="fas fa-briefcase"></i> Bag
                        </button>
                        <div class="dropdown">
                            <button class="dropdown-toggle" title="More options">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="dropdown-menu">
                                <button class="add-to-vault" data-id="${item.id}" ${type !== 'reference' ? 'style="display: none;"' : ''} title="Add to reference vault">
                                    <i class="fas fa-shield-alt"></i> Add to Vault
                                </button>
                                <button class="add-to-bag" data-id="${item.id}" ${type !== 'candidate' ? 'style="display: none;"' : ''} title="Add to candidate bag">
                                    <i class="fas fa-briefcase"></i> Add to Bag
                                </button>
                                <button class="download-sequence" data-id="${item.id}" data-name="${item.name}" data-sequence="${item.sequence}" title="Download as FASTA file">
                                    <i class="fas fa-download"></i> Download
                                </button>
                                <button class="remove-from-collection" data-id="${item.id}" data-name="${item.name}" title="Remove from collection">
                                    <i class="fas fa-trash-alt"></i> Remove
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            collectionList.appendChild(itemEl);
        });
        
        // Add event listeners to the newly created elements
        addItemListeners();
    }
    
    function filterCollectionByType(type) {
        console.log(`Filtering collection by type: ${type}`);
        if (!collectionList) return;
        
        // Show all items first
        document.querySelectorAll('.collection-item').forEach(item => {
            item.style.display = 'none';
        });
        
        // Then only show the ones matching the filter
        if (type === 'all') {
            document.querySelectorAll('.collection-item[data-tab*="all"]').forEach(item => {
                item.style.display = 'block';
            });
        } else {
            document.querySelectorAll(`.collection-item[data-tab*="${type}"]`).forEach(item => {
                item.style.display = 'block';
            });
        }
        
        // Check if we need to show the empty state
        const visibleItems = document.querySelectorAll('.collection-item[style*="display: block"]');
        if (visibleItems.length === 0) {
            const noResultsEl = document.querySelector('.no-results');
            if (!noResultsEl) {
                collectionList.innerHTML = `
                    <div class="no-results">
                        <i class="fas fa-search"></i>
                        <h2>No bacteriocins found</h2>
                        <p>No ${type} bacteriocins in your collection. Add some predictions to see them here.</p>
                        <a href="/" class="btn btn-primary">Go to Prediction Tool</a>
                    </div>
                `;
            }
        }
    }
    
    function addItemListeners() {
        // View full sequence buttons
        document.querySelectorAll('.view-full-sequence').forEach(button => {
            button.addEventListener('click', function() {
                const sequence = this.getAttribute('data-sequence');
                showSequenceModal(sequence);
            });
        });
        
        // Remove buttons
        document.querySelectorAll('.remove-from-collection').forEach(button => {
            button.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                removeFromCollection(id);
            });
        });
        
        // Download buttons
        document.querySelectorAll('.download-sequence').forEach(button => {
            button.addEventListener('click', function() {
                const sequenceId = this.getAttribute('data-sequence-id');
                const name = this.getAttribute('data-name');
                const sequence = this.getAttribute('data-sequence');
                
                downloadFasta(sequenceId, name, sequence);
            });
        });
        
        // Add to vault buttons
        document.querySelectorAll('.add-to-vault, .add-to-vault-direct').forEach(button => {
            button.addEventListener('click', function() {
                const bacteriocinId = this.getAttribute('data-id');
                showVaultSelectionModal(bacteriocinId);
            });
        });
        
        // Add to bag buttons
        document.querySelectorAll('.add-to-bag, .add-to-bag-direct').forEach(button => {
            button.addEventListener('click', function() {
                const bacteriocinId = this.getAttribute('data-id');
                showBagSelectionModal(bacteriocinId);
            });
        });
        
        // Same length filter buttons
        document.querySelectorAll('.same-length-filter').forEach(button => {
            button.addEventListener('click', function() {
                const length = this.getAttribute('data-length');
                if (length) {
                    // Set the length filter values
                    document.getElementById('min-length').value = length;
                    document.getElementById('max-length').value = length;
                    
                    // Apply the filters
                    applyFilters();
                    
                    // Show the filter controls if they're hidden
                    const filterControls = document.querySelector('.filter-controls');
                    if (filterControls && filterControls.style.display === 'none') {
                        filterControls.style.display = 'block';
                        const toggleBtn = document.getElementById('toggle-filters');
                        if (toggleBtn) {
                            toggleBtn.querySelector('span').textContent = 'Hide Filters';
                            toggleBtn.querySelector('i').classList.remove('fa-chevron-down');
                            toggleBtn.querySelector('i').classList.add('fa-chevron-up');
                        }
                    }
                    
                    // Show notification
                    showNotification(`Filtered to sequences with length ${length}`, 'info');
                }
            });
        });
        
        // Rename sequence buttons
        document.querySelectorAll('.rename-sequence').forEach(button => {
            button.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const currentName = this.getAttribute('data-name');
                showRenameModal(id, currentName);
            });
        });
    }
    
    function showSequenceModal(sequence) {
        // Create modal for showing full sequence
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Full Sequence</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="sequence-display">${sequence}</div>
                    <button class="copy-sequence">
                        <i class="fas fa-copy"></i> Copy Sequence
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });
        
        modal.querySelector('.copy-sequence').addEventListener('click', () => {
            navigator.clipboard.writeText(sequence)
                .then(() => {
                    showNotification('Sequence copied to clipboard', 'success');
                })
                .catch(err => {
                    console.error('Could not copy sequence: ', err);
                    showNotification('Failed to copy sequence', 'error');
                });
        });
    }
    
    function removeFromCollection(id) {
        if (!confirm('Are you sure you want to remove this bacteriocin from your collection?')) {
            return;
        }
        
        fetch('/remove_from_collection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: id })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Bacteriocin removed from collection', 'success');
                loadCollection(); // Refresh the collection
            } else {
                showNotification(data.message || 'Failed to remove bacteriocin', 'error');
            }
        })
        .catch(error => {
            console.error('Error removing bacteriocin:', error);
            showNotification('Error removing bacteriocin', 'error');
        });
    }
    
    function downloadFasta(sequenceId, name, sequence) {
        const fastaContent = `>${sequenceId} ${name}\n${sequence}`;
        const blob = new Blob([fastaContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sequenceId}.fasta`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Auto-hide after 5 seconds
        const timeout = setTimeout(() => {
            hideNotification(notification);
        }, 5000);
        
        // Add close button event listener
        notification.querySelector('.notification-close').addEventListener('click', () => {
            clearTimeout(timeout);
            hideNotification(notification);
        });
    }
    
    function hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }
    
    function showVaultSelectionModal(bacteriocinId) {
        // Fetch available vaults
        fetch('/api/vaults')
            .then(response => response.json())
            .then(data => {
                if (!data.success || !data.data || data.data.length === 0) {
                    showNotification('No vaults available. Create a vault first.', 'warning');
                    return;
                }
                
                const vaults = data.data;
                
                // Create modal for vault selection
                const modal = document.createElement('div');
                modal.className = 'modal';
                
                // Generate vault options
                let vaultOptions = '';
                vaults.forEach(vault => {
                    vaultOptions += `
                        <div class="vault-option" data-id="${vault.id}">
                            <i class="fas fa-shield-alt"></i>
                            <span>${vault.name}</span>
                            <span class="item-count">(${vault.item_count} items)</span>
                        </div>
                    `;
                });
                
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Select Vault</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>Select a vault to add this bacteriocin to:</p>
                            <div class="vault-options">
                                ${vaultOptions}
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Show modal
                setTimeout(() => {
                    modal.classList.add('show');
                }, 10);
                
                // Add event listeners
                modal.querySelector('.modal-close').addEventListener('click', () => {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.remove();
                    }, 300);
                });
                
                // Add click event to vault options
                modal.querySelectorAll('.vault-option').forEach(option => {
                    option.addEventListener('click', function() {
                        const vaultId = this.getAttribute('data-id');
                        addToVault(vaultId, bacteriocinId);
                        modal.classList.remove('show');
                        setTimeout(() => {
                            modal.remove();
                        }, 300);
                    });
                });
            })
            .catch(error => {
                console.error('Error fetching vaults:', error);
                showNotification('Error loading vaults', 'error');
            });
    }
    
    function showBagSelectionModal(bacteriocinId) {
        // Fetch available bags
        fetch('/api/bags')
            .then(response => response.json())
            .then(data => {
                if (!data.success || !data.data || data.data.length === 0) {
                    showNotification('No bags available. Create a bag first.', 'warning');
                    return;
                }
                
                const bags = data.data;
                
                // Create modal for bag selection
                const modal = document.createElement('div');
                modal.className = 'modal';
                
                // Generate bag options
                let bagOptions = '';
                bags.forEach(bag => {
                    bagOptions += `
                        <div class="bag-option" data-id="${bag.id}">
                            <i class="fas fa-briefcase"></i>
                            <span>${bag.name}</span>
                            <span class="item-count">(${bag.item_count} items)</span>
                        </div>
                    `;
                });
                
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Select Bag</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>Select a bag to add this bacteriocin to:</p>
                            <div class="bag-options">
                                ${bagOptions}
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Show modal
                setTimeout(() => {
                    modal.classList.add('show');
                }, 10);
                
                // Add event listeners
                modal.querySelector('.modal-close').addEventListener('click', () => {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.remove();
                    }, 300);
                });
                
                // Add click event to bag options
                modal.querySelectorAll('.bag-option').forEach(option => {
                    option.addEventListener('click', function() {
                        const bagId = this.getAttribute('data-id');
                        addToBag(bagId, bacteriocinId);
                        modal.classList.remove('show');
                        setTimeout(() => {
                            modal.remove();
                        }, 300);
                    });
                });
            })
            .catch(error => {
                console.error('Error fetching bags:', error);
                showNotification('Error loading bags', 'error');
            });
    }
    
    function addToVault(vaultId, bacteriocinId) {
        fetch(`/api/vaults/${vaultId}/add_bacteriocin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ bacteriocin_id: bacteriocinId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Bacteriocin added to vault successfully', 'success');
            } else {
                showNotification(data.message || 'Failed to add to vault', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding to vault:', error);
            showNotification('Error adding to vault', 'error');
        });
    }
    
    function addToBag(bagId, bacteriocinId) {
        fetch(`/api/bags/${bagId}/add_bacteriocin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ bacteriocin_id: bacteriocinId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Bacteriocin added to bag successfully', 'success');
            } else {
                showNotification(data.message || 'Failed to add to bag', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding to bag:', error);
            showNotification('Error adding to bag', 'error');
        });
    }
    
    function showCreateVaultModal() {
        // Create modal for creating a new vault
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create New Vault</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="vault-name">Vault Name:</label>
                        <input type="text" id="vault-name" class="form-control" placeholder="Enter vault name">
                    </div>
                    <div class="form-group">
                        <label for="vault-description">Description (optional):</label>
                        <textarea id="vault-description" class="form-control" placeholder="Enter description"></textarea>
                    </div>
                    <button id="create-vault-btn" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Create Vault
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });
        
        modal.querySelector('#create-vault-btn').addEventListener('click', () => {
            const name = modal.querySelector('#vault-name').value.trim();
            const description = modal.querySelector('#vault-description').value.trim();
            
            if (name === '') {
                showNotification('Please enter a vault name', 'warning');
                return;
            }
            
            createVault(name, description, modal);
        });
    }
    
    function showCreateBagModal() {
        // Create modal for creating a new bag
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create New Bag</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="bag-name">Bag Name:</label>
                        <input type="text" id="bag-name" class="form-control" placeholder="Enter bag name">
                    </div>
                    <div class="form-group">
                        <label for="bag-description">Description (optional):</label>
                        <textarea id="bag-description" class="form-control" placeholder="Enter description"></textarea>
                    </div>
                    <button id="create-bag-btn" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Create Bag
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });
        
        modal.querySelector('#create-bag-btn').addEventListener('click', () => {
            const name = modal.querySelector('#bag-name').value.trim();
            const description = modal.querySelector('#bag-description').value.trim();
            
            if (name === '') {
                showNotification('Please enter a bag name', 'warning');
                return;
            }
            
            createBag(name, description, modal);
        });
    }
    
    function createVault(name, description, modal) {
        fetch('/api/vaults', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, description })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Vault created successfully', 'success');
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    // Refresh the vaults list
                    window.location.reload();
                }, 300);
            } else {
                showNotification(data.message || 'Failed to create vault', 'error');
            }
        })
        .catch(error => {
            console.error('Error creating vault:', error);
            showNotification('Error creating vault', 'error');
        });
    }
    
    function createBag(name, description, modal) {
        fetch('/api/bags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, description })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Bag created successfully', 'success');
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    // Refresh the bags list
                    window.location.reload();
                }, 300);
            } else {
                showNotification(data.message || 'Failed to create bag', 'error');
            }
        })
        .catch(error => {
            console.error('Error creating bag:', error);
            showNotification('Error creating bag', 'error');
        });
    }
    
    function applyFilters() {
        const minLength = document.getElementById('min-length').value;
        const maxLength = document.getElementById('max-length').value;
        const minProb = document.getElementById('min-prob').value;
        const maxProb = document.getElementById('max-prob').value;
        const sameLength = document.getElementById('same-length-filter').value;
        
        // Get all collection items
        const items = document.querySelectorAll('.collection-item');
        let visibleCount = 0;
        
        items.forEach(item => {
            // Get sequence from the item
            const sequenceEl = item.querySelector('.sequence-preview');
            const sequence = sequenceEl ? sequenceEl.textContent : '';
            
            // Get probability from the item
            const probEl = item.querySelector('.probability-text');
            const probText = probEl ? probEl.textContent : '';
            const probability = parseFloat(probText) / 100; // Convert from percentage to decimal
            
            // Apply filters
            let isVisible = true;
            
            // Length filter
            if (minLength && sequence.length < parseInt(minLength)) {
                isVisible = false;
            }
            
            if (maxLength && sequence.length > parseInt(maxLength)) {
                isVisible = false;
            }
            
            // Same length filter
            if (sameLength && sequence.length !== parseInt(sameLength)) {
                isVisible = false;
            }
            
            // Probability filter
            if (minProb && probability < parseFloat(minProb)) {
                isVisible = false;
            }
            
            if (maxProb && probability > parseFloat(maxProb)) {
                isVisible = false;
            }
            
            // Apply visibility
            item.style.display = isVisible ? 'block' : 'none';
            
            if (isVisible) {
                visibleCount++;
            }
        });
        
        // Show notification about filtered results
        showNotification(`Showing ${visibleCount} of ${items.length} bacteriocins`, 'info');
    }
    
    function resetFilters() {
        document.getElementById('min-length').value = '';
        document.getElementById('max-length').value = '';
        document.getElementById('min-prob').value = '';
        document.getElementById('max-prob').value = '';
        document.getElementById('same-length-filter').value = '';
        
        // Show all items
        document.querySelectorAll('.collection-item').forEach(item => {
            item.style.display = 'block';
        });
        
        showNotification('Filters reset', 'info');
    }
    
    function updateBulkActionVisibility(tabType) {
        const addAllToVaultBtn = document.getElementById('add-all-to-vault');
        const addAllToBagBtn = document.getElementById('add-all-to-bag');
        
        if (addAllToVaultBtn && addAllToBagBtn) {
            // Only show "Add All to Vault" when viewing reference bacteriocins
            addAllToVaultBtn.style.display = (tabType === 'all' || tabType === 'reference') ? 'inline-block' : 'none';
            
            // Only show "Add All to Bag" when viewing candidate bacteriocins
            addAllToBagBtn.style.display = (tabType === 'all' || tabType === 'candidate') ? 'inline-block' : 'none';
        }
    }
    
    function addAllToVault() {
        const visibleItems = getVisibleItems();
        
        if (visibleItems.length === 0) {
            showNotification('No bacteriocins to add', 'warning');
            return;
        }
        
        showAddToContainerModal('vault', null, visibleItems);
    }
    
    function addAllToBag() {
        const visibleItems = getVisibleItems();
        
        if (visibleItems.length === 0) {
            showNotification('No bacteriocins to add', 'warning');
            return;
        }
        
        showAddToContainerModal('bag', null, visibleItems);
    }
    
    function getVisibleItems() {
        const items = document.querySelectorAll('.collection-item');
        const visibleItems = [];
        
        items.forEach(item => {
            if (item.style.display !== 'none') {
                const id = item.getAttribute('data-id');
                if (id) {
                    visibleItems.push(id);
                }
            }
        });
        
        return visibleItems;
    }
    
    function showAddToContainerModal(containerType, containerId, itemIds) {
        if (!itemIds || itemIds.length === 0) {
            showNotification('No items selected', 'warning');
            return;
        }
        
        const progressModal = createProgressModal(itemIds.length);
        document.body.appendChild(progressModal);
        setTimeout(() => progressModal.classList.add('show'), 10);
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process items sequentially to avoid overwhelming the server
        const processNextItem = (index) => {
            if (index >= itemIds.length) {
                // All items processed
                updateProgressModal(progressModal, itemIds.length, successCount, errorCount);
                
                setTimeout(() => {
                    // Show final results and close modal after delay
                    const resultMessage = `Added ${successCount} items to ${containerType} (${errorCount} failed)`;
                    showNotification(resultMessage, errorCount > 0 ? 'warning' : 'success');
                    
                    setTimeout(() => {
                        progressModal.classList.remove('show');
                        setTimeout(() => progressModal.remove(), 300);
                    }, 2000);
                }, 500);
                
                return;
            }
            
            const itemId = itemIds[index];
            
            // Update progress
            updateProgressModal(progressModal, itemIds.length, successCount, errorCount, index);
            
            // Add item to container
            fetch(`/api/add_to_container`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    container_type: containerType,
                    container_id: containerId,
                    item_id: itemId
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to add item ${itemId}: ${data.message}`);
                }
                
                // Process next item
                processNextItem(index + 1);
            })
            .catch(error => {
                console.error(`Error adding item ${itemId}:`, error);
                errorCount++;
                
                // Process next item despite error
                processNextItem(index + 1);
            });
        };
        
        // Start processing
        processNextItem(0);
    }
    
    function createProgressModal(totalItems) {
        const modal = document.createElement('div');
        modal.className = 'modal progress-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Adding Items</h3>
                </div>
                <div class="modal-body">
                    <p>Processing <span id="current-item">0</span> of <span id="total-items">${totalItems}</span> items...</p>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <p class="results-summary">
                        <span class="success-count">0</span> added successfully, 
                        <span class="error-count">0</span> failed
                    </p>
                </div>
            </div>
        `;
        return modal;
    }
    
    function updateProgressModal(modal, totalItems, successCount, errorCount, currentIndex = 0) {
        const currentItem = modal.querySelector('#current-item');
        const totalItemsEl = modal.querySelector('#total-items');
        const progressFill = modal.querySelector('.progress-fill');
        const successCountEl = modal.querySelector('.success-count');
        const errorCountEl = modal.querySelector('.error-count');
        
        if (currentItem) currentItem.textContent = currentIndex + 1;
        if (totalItemsEl) totalItemsEl.textContent = totalItems;
        
        const progressPercent = Math.round(((successCount + errorCount) / totalItems) * 100);
        if (progressFill) progressFill.style.width = `${progressPercent}%`;
        
        if (successCountEl) successCountEl.textContent = successCount;
        if (errorCountEl) errorCountEl.textContent = errorCount;
    }
    
    // Rename sequence modal
    function showRenameModal(bacteriocinId, currentName) {
        // Create modal for renaming
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Rename Bacteriocin</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="new-name">New Name:</label>
                        <input type="text" id="new-name" class="form-control" value="${currentName}" placeholder="Enter new name">
                    </div>
                    <button id="save-name-btn" class="btn btn-primary">
                        <i class="fas fa-save"></i> Save
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => {
            modal.classList.add('show');
            // Focus the input field
            const input = modal.querySelector('#new-name');
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
        
        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });
        
        // Add save functionality
        modal.querySelector('#save-name-btn').addEventListener('click', () => {
            const newName = modal.querySelector('#new-name').value.trim();
            
            if (newName === '') {
                showNotification('Please enter a valid name', 'warning');
                return;
            }
            
            renameBacteriocin(bacteriocinId, newName, modal);
        });
        
        // Allow pressing Enter to save
        modal.querySelector('#new-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const newName = e.target.value.trim();
                if (newName !== '') {
                    renameBacteriocin(bacteriocinId, newName, modal);
                }
            }
        });
    }
    
    // Function to rename a bacteriocin
    function renameBacteriocin(bacteriocinId, newName, modal) {
        // Show loading state
        const saveBtn = modal.querySelector('#save-name-btn');
        const originalBtnHtml = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
        
        fetch('/rename_bacteriocin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: bacteriocinId, name: newName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Bacteriocin renamed successfully', 'success');
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    // Update the UI with the new name
                    updateBacteriocinName(bacteriocinId, newName);
                }, 300);
            } else {
                showNotification(data.message || 'Failed to rename bacteriocin', 'error');
                // Reset button
                saveBtn.innerHTML = originalBtnHtml;
                saveBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error renaming bacteriocin:', error);
            showNotification('Error renaming bacteriocin', 'error');
            // Reset button
            saveBtn.innerHTML = originalBtnHtml;
            saveBtn.disabled = false;
        });
    }
    
    // Update bacteriocin name in the UI
    function updateBacteriocinName(bacteriocinId, newName) {
        // Update items in the collection
        const items = document.querySelectorAll(`.collection-item[data-id="${bacteriocinId}"]`);
        
        items.forEach(item => {
            // Update title
            const titleEl = item.querySelector('.collection-item-title');
            if (titleEl) {
                titleEl.textContent = newName;
            }
            
            // Update data attributes for buttons
            const buttons = item.querySelectorAll('button[data-name]');
            buttons.forEach(button => {
                button.setAttribute('data-name', newName);
            });
        });
        
        // Reload the collection to ensure everything is up to date
        loadCollection();
    }
    
    // View container contents
    function viewContainerItems(containerType, containerId) {
        // Get modal elements
        const modal = document.getElementById('containerItemsModal');
        const modalTitle = document.getElementById('containerModalTitle');
        const itemsList = document.getElementById('containerItemsList');
        
        // Update modal title based on container type
        modalTitle.textContent = containerType === 'vault' ? 'Vault Contents' : 'Bag Contents';
        
        // Clear previous items
        itemsList.innerHTML = '<div class="loading-indicator"><div class="spinner"></div><p>Loading items...</p></div>';
        
        // Show the modal
        modal.classList.add('show');
        
        // Fetch container items
        fetch(`/api/${containerType}s/${containerId}/items`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    itemsList.innerHTML = `<div class="error-message"><p>${data.message || 'Failed to load items'}</p></div>`;
                    return;
                }
                
                const items = data.data;
                
                if (!items || items.length === 0) {
                    itemsList.innerHTML = `<div class="no-results"><p>No items in this ${containerType}</p></div>`;
                    return;
                }
                
                // Render items
                itemsList.innerHTML = '';
                
                items.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'container-item-entry';
                    
                    // Format sequence preview
                    const sequencePreview = item.sequence.length > 30 
                        ? item.sequence.substring(0, 30) + '...' 
                        : item.sequence;
                    
                    // Create HTML for the item
                    itemEl.innerHTML = `
                        <div class="container-item-info">
                            <h3>${item.name}</h3>
                            <p><strong>ID:</strong> ${item.sequence_id}</p>
                            <p><strong>Sequence:</strong> ${sequencePreview}</p>
                        </div>
                        <div class="container-item-actions">
                            <button class="view-sequence-btn" data-id="${item.id}" data-name="${item.name}" data-sequence="${item.sequence}" title="View sequence">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="remove-from-container-btn" data-container-type="${containerType}" data-container-id="${containerId}" data-item-id="${item.id}" title="Remove from ${containerType}">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                    
                    itemsList.appendChild(itemEl);
                });
                
                // Add event listeners to buttons
                itemsList.querySelectorAll('.view-sequence-btn').forEach(button => {
                    button.addEventListener('click', function() {
                        const id = this.getAttribute('data-id');
                        const name = this.getAttribute('data-name');
                        const sequence = this.getAttribute('data-sequence');
                        
                        openSequenceModal(name, sequence);
                    });
                });
                
                itemsList.querySelectorAll('.remove-from-container-btn').forEach(button => {
                    button.addEventListener('click', function() {
                        const containerType = this.getAttribute('data-container-type');
                        const containerId = this.getAttribute('data-container-id');
                        const itemId = this.getAttribute('data-item-id');
                        
                        removeFromContainer(containerType, containerId, itemId, this.closest('.container-item-entry'));
                    });
                });
            })
            .catch(error => {
                console.error(`Error loading ${containerType} items:`, error);
                itemsList.innerHTML = `<div class="error-message"><p>Error loading items: ${error.message}</p></div>`;
            });
    }
    
    // Remove item from container
    function removeFromContainer(containerType, containerId, itemId, elementToRemove) {
        if (!confirm(`Are you sure you want to remove this item from the ${containerType}?`)) {
            return;
        }
        
        // Show loading state
        if (elementToRemove) {
            elementToRemove.classList.add('loading');
        }
        
        // Send request to remove item
        fetch(`/api/${containerType}s/${containerId}/remove_item`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item_id: itemId })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Failed to remove item');
            }
            
            // Remove element from DOM
            if (elementToRemove) {
                elementToRemove.classList.add('removed');
                setTimeout(() => {
                    elementToRemove.remove();
                    
                    // Check if container is now empty
                    const itemsList = document.getElementById('containerItemsList');
                    if (itemsList && itemsList.children.length === 0) {
                        itemsList.innerHTML = `<div class="no-results"><p>No items in this ${containerType}</p></div>`;
                    }
                }, 300);
            }
            
            // Update container item count in the main list
            const containerEl = document.querySelector(`.container-item[data-id="${containerId}"][data-type="${containerType}"]`);
            if (containerEl) {
                const countEl = containerEl.querySelector('.container-meta');
                if (countEl) {
                    const currentCount = parseInt(countEl.textContent);
                    if (!isNaN(currentCount)) {
                        countEl.textContent = `${currentCount - 1} items`;
                    }
                }
            }
            
            showNotification(`Item removed from ${containerType}`, 'success');
        })
        .catch(error => {
            console.error(`Error removing item from ${containerType}:`, error);
            showNotification(error.message, 'error');
            
            // Reset loading state
            if (elementToRemove) {
                elementToRemove.classList.remove('loading');
            }
        });
    }
    
    // Delete entire container
    function deleteContainer(containerType, containerId) {
        const containerName = document.querySelector(`.container-item[data-id="${containerId}"][data-type="${containerType}"] h3`).textContent;
        
        if (!confirm(`Are you sure you want to delete the ${containerType} "${containerName}"? This will permanently remove the ${containerType} and all its contents.`)) {
            return;
        }
        
        // Show loading on the container
        const containerEl = document.querySelector(`.container-item[data-id="${containerId}"][data-type="${containerType}"]`);
        if (containerEl) {
            containerEl.classList.add('loading');
        }
        
        // Send request to delete container
        fetch(`/api/${containerType}s/${containerId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || `Failed to delete ${containerType}`);
            }
            
            // Remove container from DOM
            if (containerEl) {
                containerEl.classList.add('removed');
                setTimeout(() => containerEl.remove(), 300);
            }
            
            showNotification(`${containerType.charAt(0).toUpperCase() + containerType.slice(1)} "${containerName}" deleted successfully`, 'success');
        })
        .catch(error => {
            console.error(`Error deleting ${containerType}:`, error);
            showNotification(error.message, 'error');
            
            // Reset loading state
            if (containerEl) {
                containerEl.classList.remove('loading');
            }
        });
    }
    
    // View container buttons
    document.querySelectorAll('.view-container').forEach(button => {
        button.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            const id = this.getAttribute('data-id');
            
            viewContainerItems(type, id);
        });
    });
    
    // Delete container buttons
    document.querySelectorAll('.delete-container').forEach(button => {
        button.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            const id = this.getAttribute('data-id');
            
            deleteContainer(type, id);
        });
    });
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(event) {
            if (event.target === this) {
                this.classList.remove('show');
            }
        });
    });
});
