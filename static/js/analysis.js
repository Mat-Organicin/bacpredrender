/**
 * Analysis page functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements
    const vaultCheckboxes = document.querySelectorAll('.vault-checkbox');
    const bagCheckboxes = document.querySelectorAll('.bag-checkbox');
    const analysisResults = document.getElementById('analysis-results');
    const resultsContainer = document.getElementById('results-container');
    const downloadButton = document.getElementById('download-results');
    const umapToolButton = document.getElementById('umap-tool');
    const msaToolButton = document.getElementById('msa-tool');
    const phylogenyToolButton = document.getElementById('phylogeny-tool');
    const selectNotice = document.querySelector('.select-notice');
    const analysisTabs = document.querySelectorAll('.analysis-tab');
    const toolDescriptions = document.querySelectorAll('.tool-description');
    
    // Track selected items
    let selectedVaults = [];
    let selectedBags = [];
    let activeTab = null;
    
    // Track sequence data for MSA and Phylogeny analysis
    let sequenceData = [];
    
    // Add event listeners to checkboxes
    vaultCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedVaults.push(this.value);
            } else {
                selectedVaults = selectedVaults.filter(id => id !== this.value);
            }
            updateAnalysisState();
        });
    });
    
    bagCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedBags.push(this.value);
            } else {
                selectedBags = selectedBags.filter(id => id !== this.value);
            }
            updateAnalysisState();
        });
    });
    
    // Add event listeners for tabs
    analysisTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const toolType = this.getAttribute('data-tool');
            // Switch tabs
            analysisTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Show tool description
            toolDescriptions.forEach(desc => {
                if (desc.getAttribute('data-tool') === toolType) {
                    desc.style.display = 'block';
                } else {
                    desc.style.display = 'none';
                }
            });
            
            // If tab is enabled, run analysis
            if (!this.disabled) {
                performAnalysis(toolType);
            }
        });
    });
    
    // Add event listener to the analysis tool buttons
    if (umapToolButton) {
        umapToolButton.addEventListener('click', function() {
            performAnalysis('umap');
        });
    }
    
    if (msaToolButton) {
        msaToolButton.addEventListener('click', function() {
            performAnalysis('msa');
        });
    }
    
    if (phylogenyToolButton) {
        phylogenyToolButton.addEventListener('click', function() {
            performAnalysis('phylogeny');
        });
    }
    
    function updateAnalysisState() {
        console.log('Selected vaults:', selectedVaults);
        console.log('Selected bags:', selectedBags);
        
        // Update UI based on selections
        const hasSelections = selectedVaults.length > 0 || selectedBags.length > 0;
        
        // Check if elements exist before trying to use them
        if (umapToolButton) {
            umapToolButton.disabled = !hasSelections;
        }
        
        if (msaToolButton) {
            msaToolButton.disabled = !hasSelections;
        }
        
        if (phylogenyToolButton) {
            phylogenyToolButton.disabled = !hasSelections;
        }
        
        // Show/hide the selection notice
        if (selectNotice) {
            selectNotice.style.display = hasSelections ? 'none' : 'block';
        }
        
        // Check if resultsContainer exists
        if (!resultsContainer) {
            console.error('Results container not found!');
            return;
        }
        
        // Find placeholder message if it exists
        const placeholderMessage = resultsContainer.querySelector('.placeholder-message');
        
        // Update placeholder message if it exists
        if (hasSelections && placeholderMessage) {
            placeholderMessage.innerHTML = `
                <p>Ready to analyze ${selectedVaults.length} vault(s) and ${selectedBags.length} bag(s).</p>
                <p>Please select an analysis tool above.</p>
            `;
            
            if (analysisResults) {
                analysisResults.style.display = 'block';
            }
        } else if (analysisResults) {
            analysisResults.style.display = 'none';
        }
    }
    
    /**
     * Perform analysis with the selected vaults and bags
     */
    function performAnalysis(toolType, additionalData = {}) {
        if (selectedVaults.length === 0 && selectedBags.length === 0) {
            showNotification('Please select at least one vault or bag to analyze', 'error');
            return;
        }
        
        // Hide all result containers first
        const resultContainers = document.querySelectorAll('.analysis-result-content');
        resultContainers.forEach(container => {
            container.style.display = 'none';
        });
        
        showLoading();
        
        // Construct the data to send
        const requestData = {
            vaults: selectedVaults,
            bags: selectedBags,
            tool: toolType,
            ...additionalData
        };
        
        // Set this as the active tab
        activeTab = toolType;
        
        // Send the analysis request
        fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            hideLoading();
            
            if (data.success) {
                displayResults(data.data, toolType);
                downloadButton.disabled = false;
            } else {
                throw new Error(data.message || 'Analysis failed');
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Analysis error:', error);
            
            // Extract the detailed error message when possible
            let errorMessage = error.message || 'Analysis failed';
            
            // Check for our custom sequence length error messages
            if (errorMessage.includes('Sequences must all be the same length')) {
                // This is a sequence length error
                resultsContainer.querySelector('.placeholder-message').innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Sequence Length Error</h3>
                        <p>${errorMessage}</p>
                        <div class="error-help">
                            <p>To fix this issue:</p>
                            <ol>
                                <li>Go to the <a href="/collection_view">Collection</a> page</li>
                                <li>Use the "Same Length As" filter to select sequences of identical length</li>
                                <li>Add filtered sequences to a vault or bag</li>
                                <li>Return to analysis and select only that vault or bag</li>
                            </ol>
                        </div>
                        <button id="retry-button" class="btn btn-primary mt-3">Choose Different Vaults/Bags</button>
                    </div>
                `;
            } else {
                // Generic error
                resultsContainer.querySelector('.placeholder-message').innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error: ${errorMessage}</p>
                        <button id="retry-button" class="btn btn-primary mt-3">Retry</button>
                    </div>
                `;
            }
            
            resultsContainer.querySelector('.placeholder-message').style.display = 'block';
            
            if (document.getElementById('retry-button')) {
                document.getElementById('retry-button').addEventListener('click', () => performAnalysis(toolType));
            }
        });
    }
    
    /**
     * Display analysis results
     */
    function displayResults(results, toolType) {
        const placeholderMessage = resultsContainer.querySelector('.placeholder-message');
        placeholderMessage.style.display = 'none';
        
        // Store sequence data for later use
        if (results.sequence_data) {
            sequenceData = results.sequence_data;
        }
        
        // Log the results to debug
        console.log(`Received ${toolType} results:`, { 
            hasPlotHtml: !!results.plot_html,
            plotHtmlLength: results.plot_html ? results.plot_html.length : 0,
            plotHtmlStart: results.plot_html ? results.plot_html.substring(0, 100) + '...' : 'none',
            hasShapHtml: !!results.shap_html
        });
        
        // Ensure results containers are visible before rendering
        if (analysisResults) {
            analysisResults.style.display = 'block';
        }
        if (resultsContainer) {
            resultsContainer.style.display = 'block';
        }
        
        // Get the appropriate tab content element
        let tabContentElement = document.getElementById(`${toolType}-visualization`);
        if (!tabContentElement) {
            console.error(`Tab content element for ${toolType} not found. Looking for #${toolType}-visualization`);
            
            // Try to find it by class instead of ID as a fallback
            tabContentElement = document.querySelector(`.tab-content[data-tool="${toolType}"]`);
            if (!tabContentElement) {
                console.error(`Could not find tab content element for ${toolType} by class either`);
                
                // Create the element if it doesn't exist
                tabContentElement = document.createElement('div');
                tabContentElement.id = `${toolType}-visualization`;
                tabContentElement.className = 'tab-content';
                tabContentElement.style.display = 'none';
                
                // Append it to the results container
                if (resultsContainer) {
                    resultsContainer.appendChild(tabContentElement);
                    console.log(`Created new tab content element for ${toolType}`);
                } else {
                    console.error('Results container not found, cannot create tab content element');
                    return;
                }
            }
        }
        
        // Show the appropriate tab content
        tabContentElement.style.display = 'block';
        
        // Check for errors in the results
        if (results.error) {
            tabContentElement.innerHTML = `
                <div class="error-message">
                    <h3>Error in ${toolType.toUpperCase()} Analysis</h3>
                    <p>${results.error}</p>
                    <button id="retry-${toolType}" class="btn btn-primary">Retry Analysis</button>
                </div>
            `;
            
            const retryButton = document.getElementById(`retry-${toolType}`);
            if (retryButton) {
                retryButton.addEventListener('click', () => performAnalysis(toolType));
            }
            return;
        }
        
        // Display results based on tool type
        if (toolType === 'umap') {
            if (results.plot_html) {
                // Store all visualization data in localStorage for use in dedicated page
                if (results.plot_html) {
                    console.log("Storing UMAP HTML in localStorage");
                    localStorage.setItem('lastUmapHtml', results.plot_html);
                }
                
                // Extract and store the raw plot data (important for reliable rendering)
                if (results.plot_data) {
                    console.log("Storing raw UMAP plot data in localStorage");
                    localStorage.setItem('umap_plot_data', JSON.stringify(results.plot_data));
                } else {
                    // Try to extract plot data from HTML if not provided separately
                    try {
                        const dataMatch = results.plot_html.match(/Plotly\.newPlot\(['"]([^'"]+)['"]\s*,\s*(\[[\s\S]*?\])\s*,/i);
                        if (dataMatch && dataMatch[2]) {
                            console.log("Extracted plot data from HTML");
                            const plotData = eval(dataMatch[2]);
                            localStorage.setItem('umap_plot_data', JSON.stringify(plotData));
                        }
                    } catch (e) {
                        console.error("Failed to extract plot data from HTML:", e);
                    }
                }
                
                if (results.shap_html) {
                    console.log("Storing SHAP HTML in localStorage");
                    localStorage.setItem('lastShapHtml', results.shap_html);
                    
                    if (results.shap_data) {
                        localStorage.setItem('shap_plot_data', JSON.stringify(results.shap_data));
                    }
                }
                if (results.waterfall_html) {
                    console.log("Storing waterfall HTML in localStorage"); 
                    localStorage.setItem('lastWaterfallHtml', results.waterfall_html);
                    
                    if (results.waterfall_data) {
                        localStorage.setItem('waterfall_plot_data', JSON.stringify(results.waterfall_data));
                    }
                }
                
                // Store metadata too
                const metadata = {
                    points: results.points || 0,
                    reference_count: results.reference_count || 0,
                    candidate_count: results.candidate_count || 0,
                    timestamp: results.timestamp || new Date().toISOString()
                };
                
                localStorage.setItem('umap_metadata', JSON.stringify(metadata));
                
                // Use our new in-page visualization instead of opening a new window
                openUmapWindow(results);
                
                // Show summary in the main page
                tabContentElement.innerHTML = `
                    <h3>UMAP Analysis Results</h3>
                    <p>Showing ${results.points || 0} sequences (${results.reference_count || 0} reference, ${results.candidate_count || 0} candidate)</p>
                    <div class="tool-links">
                        <p>Use this data for further analysis:</p>
                        <button id="msa-from-umap" class="btn btn-secondary">Run Multiple Sequence Alignment</button>
                        <button id="phylogeny-from-umap" class="btn btn-secondary">Run Phylogenetic Tree Analysis</button>
                    </div>
                `;
                
                // Add event listeners for the tool links
                const msaFromUmapBtn = document.getElementById('msa-from-umap');
                if (msaFromUmapBtn) {
                    msaFromUmapBtn.addEventListener('click', function() {
                        const msaTab = document.querySelector('.analysis-tab[data-tool="msa"]');
                        if (msaTab) {
                            msaTab.click();
                        }
                    });
                }
                
                const phylogenyFromUmapBtn = document.getElementById('phylogeny-from-umap');
                if (phylogenyFromUmapBtn) {
                    phylogenyFromUmapBtn.addEventListener('click', function() {
                        const phylogenyTab = document.querySelector('.analysis-tab[data-tool="phylogeny"]');
                        if (phylogenyTab) {
                            phylogenyTab.click();
                        }
                    });
                }
            } else {
                tabContentElement.innerHTML = `
                    <h3>UMAP Analysis</h3>
                    <p>No visualization data available.</p>
                `;
            }
        } else if (toolType === 'msa') {
            if (results.msa_html) {
                // Show summary in the main page
                tabContentElement.innerHTML = `
                    <h3>Multiple Sequence Alignment Results</h3>
                    <p>Aligned ${results.num_sequences} sequences (${results.alignment_length} positions)</p>
                    <p>Visualization opened in a new window. If it was blocked, <a href="#" id="reopen-vis" class="view-link">click here to open it</a>.</p>
                `;
                
                // Open the visualization in a new window
                openMsaWindow(results);
                
                // Add event listener for the reopen link if it exists
                const reopenLink = document.getElementById('reopen-vis');
                if (reopenLink) {
                    reopenLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        openMsaWindow(results);
                    });
                }
            } else {
                tabContentElement.innerHTML = `
                    <h3>Multiple Sequence Alignment</h3>
                    <p>No alignment data available.</p>
                    <p class="error-message">${results.message || 'Error generating alignment. Try selecting fewer sequences or a different set of sequences.'}</p>
                `;
            }
        } else if (toolType === 'phylogeny') {
            if (results.tree_html) {
                // Show summary in the main page
                tabContentElement.innerHTML = `
                    <h3>Phylogenetic Tree Results</h3>
                    <p>Generated tree with ${results.num_sequences} sequences</p>
                    <p>Visualization opened in a new window. If it was blocked, <a href="#" id="reopen-vis" class="view-link">click here to open it</a>.</p>
                `;
                
                // Open the visualization in a new window
                openPhylogenyWindow(results);
                
                // Add event listener for the reopen link if it exists
                const reopenLink = document.getElementById('reopen-vis');
                if (reopenLink) {
                    reopenLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        openPhylogenyWindow(results);
                    });
                }
            } else {
                tabContentElement.innerHTML = `
                    <h3>Phylogenetic Tree</h3>
                    <p>No tree data available.</p>
                    <p class="error-message">${results.message || 'Error generating tree. Try selecting fewer sequences or a different set of sequences.'}</p>
                `;
            }
        } else {
            // For other tool types, show generic results
            tabContentElement.innerHTML = `
                <div class="empty-state">
                    <h3>Analysis Complete</h3>
                    <p>Analysis results will be displayed here based on the selected tool.</p>
                    <pre>${JSON.stringify(results, null, 2)}</pre>
                </div>
            `;
        }
        
        // Add tool links for running additional analyses
        const toolLinks = document.createElement('div');
        toolLinks.className = 'tool-links';
        toolLinks.innerHTML = `
            <p>Use this data for further analysis:</p>
            ${toolType !== 'msa' ? `<button id="msa-from-current" class="btn btn-secondary">Run Multiple Sequence Alignment</button>` : ''}
            ${toolType !== 'phylogeny' ? `<button id="phylogeny-from-current" class="btn btn-secondary">Run Phylogenetic Tree Analysis</button>` : ''}
            ${toolType !== 'umap' ? `<button id="umap-from-current" class="btn btn-secondary">Run UMAP Analysis</button>` : ''}
        `;
        
        tabContentElement.appendChild(toolLinks);
        
        // Add event listeners for the tool links
        const msaFromCurrentBtn = document.getElementById('msa-from-current');
        if (msaFromCurrentBtn) {
            msaFromCurrentBtn.addEventListener('click', function() {
                const msaTab = document.querySelector('.analysis-tab[data-tool="msa"]');
                if (msaTab) {
                    msaTab.click();
                }
            });
        }
        
        const phylogenyFromCurrentBtn = document.getElementById('phylogeny-from-current');
        if (phylogenyFromCurrentBtn) {
            phylogenyFromCurrentBtn.addEventListener('click', function() {
                const phylogenyTab = document.querySelector('.analysis-tab[data-tool="phylogeny"]');
                if (phylogenyTab) {
                    phylogenyTab.click();
                }
            });
        }
        
        const umapFromCurrentBtn = document.getElementById('umap-from-current');
        if (umapFromCurrentBtn) {
            umapFromCurrentBtn.addEventListener('click', function() {
                const umapTab = document.querySelector('.analysis-tab[data-tool="umap"]');
                if (umapTab) {
                    umapTab.click();
                }
            });
        }
    }
    
    // Show loading indicator
    function showLoading() {
        if (!resultsContainer) {
            console.error('Results container not found!');
            return;
        }
        
        const loadingIndicator = resultsContainer.querySelector('.loading-indicator');
        const placeholderMessage = resultsContainer.querySelector('.placeholder-message');
        
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
        
        if (placeholderMessage) {
            placeholderMessage.style.display = 'none';
        }
    }
    
    // Hide loading indicator
    function hideLoading() {
        if (!resultsContainer) {
            console.error('Results container not found!');
            return;
        }
        
        const loadingIndicator = resultsContainer.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    /**
     * Show notification
     */
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <p>${message}</p>
            </div>
            <button class="close-notification">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // Add event listener for close button
        notification.querySelector('.close-notification').addEventListener('click', function() {
            notification.remove();
        });
        
        // Auto-hide after 5 seconds for info notifications
        if (type === 'info') {
            setTimeout(() => {
                notification.classList.add('hiding');
                setTimeout(() => notification.remove(), 500);
            }, 5000);
        }
    }
    
    // Add CSS for visualization tabs and content
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .analysis-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .analysis-tab {
            padding: 10px 20px;
            background-color: #ecf0f1;
            color: #2c3e50;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .analysis-tab:hover:not(:disabled) {
            background-color: #d6dcde;
        }
        
        .analysis-tab.active {
            background-color: #167A6E;
            color: white;
        }
        
        .analysis-tab:disabled, .analysis-tab.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .tool-descriptions {
            margin-bottom: 15px;
        }
        
        .visualization-controls {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .control-header {
            margin-bottom: 15px;
        }
        
        .control-header h3 {
            margin: 0 0 5px 0;
            color: #2c3e50;
        }
        
        .control-header p {
            margin: 0;
            color: #7f8c8d;
        }
        
        .tab-buttons {
            display: flex;
            gap: 10px;
        }
        
        .viz-tab {
            padding: 8px 15px;
            background-color: #ecf0f1;
            color: #2c3e50;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .viz-tab:hover {
            background-color: #d6dcde;
        }
        
        .viz-tab.active {
            background-color: #3498db;
            color: white;
        }
        
        .tab-content {
            display: block;
        }
        
        .tab-content.hidden {
            display: none;
        }
        
        .info-panel {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .legend {
            background-color: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            min-width: 200px;
        }
        
        .legend h4 {
            margin-top: 0;
            margin-bottom: 10px;
            color: #2c3e50;
        }
        
        .legend-items {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
        }
        
        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        
        .color-reference {
            background-color: #f1c40f;
        }
        
        .color-candidate {
            background-color: #167A6E;
        }
        
        .info-card {
            position: absolute;
            bottom: 45px;
            left: 24px;
            width: 500px;
            height: 200px;
            background-color: white;
            border-radius: var(--border-radius);
            padding: 1rem;
            box-shadow: var(--box-shadow);
            z-index: 10;
            overflow-y: hidden;
            border-top-right-radius: var(--border-radius);
            border-bottom-right-radius: var(--border-radius);
            border-bottom-left-radius: var(--border-radius);
        }
        
        .info-card-content {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        
        .info-card h3 {
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 16px;
            color: var(--primary-color);
        }
        
        .info-card p {
            margin: 3px 0;
            font-size: 12px;
            color: #7f8c8d;
        }
        
        .legend-section {
            margin-bottom: 4px;
        }
        
        .legend-items {
            display: flex;
            gap: 16px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
        }
        
        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        
        .color-reference {
            background-color: #f1c40f;
        }
        
        .color-candidate {
            background-color: #167A6E;
        }
        
        .interaction-tips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: auto;
            padding-top: 6px;
            border-top: 1px solid #f0f0f0;
        }
        
        .tip {
            font-size: 11px;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            color: #666;
            background-color: #f9f9f9;
            padding: 2px 5px;
            border-radius: 3px;
        }
        
        .plot-container, .msa-container, .phylogeny-container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            overflow: auto;
            max-height: 800px;
            min-height: 500px;
            width: 100%;
        }
        
        .plot-container .js-plotly-plot, 
        .msa-container .js-plotly-plot, 
        .phylogeny-container .js-plotly-plot {
            width: 100% !important;
            height: 100% !important;
            min-height: 500px !important;
        }
        
        .plotly-graph-div {
            width: 100% !important;
            min-height: 500px !important;
        }
        
        /* Target the Plotly SVG directly */
        .js-plotly-plot .main-svg {
            width: 100% !important;
            height: 100% !important;
            min-height: 500px !important;
        }
        
        /* Fix Plotly specific issues */
        .js-plotly-plot .svg-container {
            width: 100% !important;
            height: auto !important;
        }
        
        /* Fix for visualization content */
        .visualization-content {
            width: 100%;
        }
        
        .shap-card {
            background-color: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
        }
        
        .shap-plot-container, .waterfall-plot-container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
            min-height: 400px;
        }
        
        .empty-state {
            text-align: center;
            padding: 30px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .empty-state h3 {
            margin-top: 0;
            color: #2c3e50;
        }
        
        .empty-state p {
            color: #7f8c8d;
        }
        
        .tool-links {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px dashed #ccc;
        }
        
        .tool-links p {
            margin-bottom: 10px;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .btn-secondary {
            background-color: #ecf0f1;
            color: #2c3e50;
            padding: 8px 15px;
            border-radius: 4px;
            border: 1px solid #bdc3c7;
            margin-right: 10px;
            margin-bottom: 10px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        }
        
        .btn-secondary:hover {
            background-color: #d6dcde;
            border-color: #95a5a6;
        }
        
        .btn-secondary:active {
            transform: translateY(1px);
        }
        
        /* Make sure analysis results have sufficient space */
        .analysis-tab-content {
            min-height: 600px;
        }
        
        /* Isolated Plotly container styles as per recommendation */
        .umap-plot-wrapper {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            padding: 10px;
            background: #fff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            margin-bottom: 20px;
            z-index: 5;
            position: relative;
            overflow: visible;
        }
        
        .plotly-isolated-container {
            width: 100%;
            height: 700px;
            position: relative;
            overflow: visible;
            min-height: 500px;
        }
        
        /* Ensure Plotly elements are displayed correctly */
        .plotly-isolated-container .js-plotly-plot,
        .plotly-isolated-container .plotly-graph-div {
            width: 100%;
            height: 700px;
            min-height: 500px;
            position: relative;
            display: block;
            visibility: visible;
        }
        
        /* Override any global styles that might affect Plotly elements */
        .plotly-isolated-container .main-svg {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: all;
            z-index: 10;
            width: 100%;
            height: 100%;
        }
        
        .plotly-isolated-container .svg-container {
            position: relative;
            display: block;
            width: 100%;
            height: 100%;
        }
        
        /* Fix for Plotly SVG container */
        .js-plotly-plot .svg-container {
            width: 100%;
            height: 100%;
        }
        
        /* Ensure modebar displays properly */
        .js-plotly-plot .modebar {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
        }
        
        /* Reset any overflow issues on containers */
        .visualization-content,
        .plot-container,
        .msa-container,
        .phylogeny-container {
            overflow: visible;
        }
        
        /* Fix for Plotly tooltip/hover elements */
        .plotly-notifier,
        .plotly-tooltip {
            position: absolute;
            z-index: 2000;
        }
        
        /* Additional fixes for Plotly rendering */
        .plotly-graph-div {
            width: 100% !important; 
            height: 100% !important;
        }
        
        /* Ensure consistent sizing for all plot containers */
        .plot-container, 
        .plotly-container, 
        .plotly-isolated-container {
            width: 100%;
            height: 700px;
            position: relative;
            display: block;
        }
        
        /* Critical fix for main plot graphic */
        .main-svg {
            background: transparent !important;
        }
        
        /* Tab content fixes */
        .tab-content {
            position: relative;
            height: auto;
            min-height: 750px;
            padding: 15px;
        }
        
        /* Ensure the info-card and legend don't interfere with the plot */
        .info-card, .legend {
            pointer-events: none;
            z-index: 1001;
        }
        
        .info-card *, .legend * {
            pointer-events: auto;
        }
    `;
    document.head.appendChild(styleElement);
    
    // Initialize the page state
    updateAnalysisState();
    
    // Add a global handler for Plotly plots
    function initializePlotlyPlots() {
        console.log("Running initializePlotlyPlots");
        const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');
        if (plotlyGraphs.length > 0 && window.Plotly) {
            console.log(`Found ${plotlyGraphs.length} Plotly plots`);
            plotlyGraphs.forEach((plot, index) => {
                try {
                    // If the plot is already initialized, just relayout
                    if (plot._context) {
                        console.log(`Plot ${index} already initialized, performing relayout`);
                        window.Plotly.relayout(plot, {});
                    } 
                    // Otherwise try to initialize it from data attributes
                    else {
                        try {
                            const plotData = plot.getAttribute('data-plotly');
                            if (plotData) {
                                const parsedData = JSON.parse(plotData);
                                window.Plotly.newPlot(plot.id, parsedData.data, parsedData.layout, parsedData.config);
                                console.log(`Successfully initialized plot ${index}`);
                            }
                        } catch (e) {
                            console.error(`Error initializing Plotly from data attribute: ${e.message}`);
                        }
                    }
                } catch (e) {
                    console.error(`Error handling Plotly plot: ${e.message}`);
                }
            });
        } else {
            console.log("No Plotly plots found or Plotly not available");
            
            // Look for containers that might need direct rendering
            const containers = [
                document.getElementById('umap-plot'),
                document.getElementById('umap-visualization'),
                ...document.querySelectorAll('.plot-container')
            ];
            
            containers.forEach(container => {
                if (container) {
                    // Check if container has Plotly content
                    if (!container.querySelector('.js-plotly-plot') && 
                        !container.querySelector('svg')) {
                        
                        // Get parent tab content
                        const tabContent = container.closest('.analysis-tab-content');
                        if (tabContent && tabContent.id === 'umap-visualization') {
                            console.log("Found UMAP container to render directly");
                            
                            // Make sure the container is empty or has placeholder content
                            if (!container.innerHTML.trim() || 
                                container.innerHTML.includes('No visualization data available')) {
                                
                                // Attempt to find raw HTML in a data attribute
                                const rawHTML = container.getAttribute('data-raw-html');
                                if (rawHTML) {
                                    console.log("Rendering raw HTML from data attribute");
                                    container.innerHTML = rawHTML;
                                } else {
                                    console.log("No raw HTML found in data attribute");
                                    
                                    // Try to find raw HTML in a hidden element
                                    const hiddenContent = document.getElementById('raw-umap-html');
                                    if (hiddenContent) {
                                        console.log("Found hidden raw HTML element");
                                        container.innerHTML = hiddenContent.innerHTML;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Force browser to recalculate layout
        window.dispatchEvent(new Event('resize'));
    }
    
    // Set up a MutationObserver to watch for changes to the DOM
    const observer = new MutationObserver((mutations) => {
        // Look for added nodes that might contain Plotly elements
        let shouldInitialize = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && 
                            (node.classList.contains('plot-container') || 
                             node.classList.contains('analysis-tab-content') ||
                             node.classList.contains('js-plotly-plot'))) {
                            shouldInitialize = true;
                            break;
                        }
                        
                        // Also check for any descendants that might be Plotly containers
                        if (node.querySelector && node.querySelector('.js-plotly-plot')) {
                            shouldInitialize = true;
                            break;
                        }
                    }
                }
            }
            if (shouldInitialize) break;
        }
        
        if (shouldInitialize) {
            // Do the initialization after a short delay to ensure DOM is stable
            setTimeout(initializePlotlyPlots, 200);
        }
    });
    
    // Start observing the document with the configured parameters
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Expose functions globally for tools to use
    window.analysisTools = {
        performAnalysis,
        showNotification,
        initializePlotlyPlots
    };
});

/**
 * Open UMAP visualization in a new window
 */
function openUmapWindow(results) {
    // Store the plot HTML in localStorage for the visualization page to use
    if (results && results.plot_html) {
        console.log("Storing UMAP plot data in localStorage");
        
        // Store the raw plot HTML without processing to preserve all Plotly data
        localStorage.setItem('lastUmapHtml', results.plot_html);
        
        // Extract and store the raw plot data (important for reliable rendering)
        if (results.plot_data) {
            console.log("Storing raw UMAP plot data in localStorage");
            localStorage.setItem('umap_plot_data', JSON.stringify(results.plot_data));
        } else {
            // Try to extract plot data from HTML if not provided separately
            try {
                const dataMatch = results.plot_html.match(/Plotly\.newPlot\(['"]([^'"]+)['"]\s*,\s*(\[[\s\S]*?\])\s*,/i);
                if (dataMatch && dataMatch[2]) {
                    console.log("Extracted plot data from HTML");
                    const plotData = eval(dataMatch[2]);
                    localStorage.setItem('umap_plot_data', JSON.stringify(plotData));
                }
            } catch (e) {
                console.error("Failed to extract plot data from HTML:", e);
            }
        }
        
        // Store SHAP and waterfall plots if available
        if (results.shap_html) {
            console.log("Storing SHAP HTML in localStorage");
            localStorage.setItem('lastShapHtml', results.shap_html);
            
            if (results.shap_data) {
                localStorage.setItem('shap_plot_data', JSON.stringify(results.shap_data));
            }
        }
        
        if (results.waterfall_html) {
            console.log("Storing waterfall HTML in localStorage"); 
            localStorage.setItem('lastWaterfallHtml', results.waterfall_html);
            
            if (results.waterfall_data) {
                localStorage.setItem('waterfall_plot_data', JSON.stringify(results.waterfall_data));
            }
        }
        
        // Store metadata too
        const metadata = {
            points: results.points || 0,
            reference_count: results.reference_count || 0,
            candidate_count: results.candidate_count || 0,
            timestamp: results.timestamp || new Date().toISOString()
        };
        
        localStorage.setItem('umap_metadata', JSON.stringify(metadata));
        
        // Also store the complete results object in case we need it
        try {
            const safeResults = {...results};
            // Remove large HTML properties to avoid storage limits
            delete safeResults.plot_html;
            delete safeResults.shap_html;
            delete safeResults.waterfall_html;
            
            localStorage.setItem('umap_results', JSON.stringify(safeResults));
        } catch (e) {
            console.error("Error storing results:", e);
        }
        
        // Find the analysis container and replace its contents
        const analysisContainer = document.querySelector('.analysis-container');
        if (analysisContainer) {
            // Save original content to restore when going back
            const originalContent = analysisContainer.innerHTML;
            localStorage.setItem('analysisOriginalContent', originalContent);
            
            // Create HTML content with proper wrappers for isolation
    const htmlContent = `
                <header>
                    <div class="header-title">
                        <h1>Bacteriocin Sequence Analysis</h1>
                        <p>UMAP Dimensionality Reduction Visualization</p>
                    </div>
                    <div class="header-actions">
                        <button id="export-png" class="btn btn-primary">
                            <i class="fas fa-download"></i> Export PNG
                        </button>
                        <button id="toggle-info" class="btn btn-outline">
                            <i class="fas fa-info-circle"></i> Toggle Info
                        </button>
                        <button id="back-to-analysis" class="btn btn-outline">
                            <i class="fas fa-arrow-left"></i> Back to Analysis
                        </button>
                    </div>
                </header>
                
                <main>
                    <div class="visualization-container">
                        <div class="visualization-header">
                            <div class="visualization-title">
                                <h2>UMAP Visualization of Bacteriocin Sequences</h2>
                                <div class="stats">
                                    <div class="stat-item">
                                        <div class="stat-icon reference-icon">
                                            <i class="fas fa-bookmark"></i>
                                        </div>
                                        <div class="stat-text">
                                            <div class="stat-value">${results.reference_count}</div>
                                            <div class="stat-label">Reference Sequences</div>
                                        </div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-icon candidate-icon">
                                            <i class="fas fa-flask"></i>
                                        </div>
                                        <div class="stat-text">
                                            <div class="stat-value">${results.candidate_count}</div>
                                            <div class="stat-label">Candidate Sequences</div>
                                        </div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-icon total-icon">
                                            <i class="fas fa-dna"></i>
                                        </div>
                                        <div class="stat-text">
                                            <div class="stat-value">${results.points}</div>
                                            <div class="stat-label">Total Sequences</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="tools-container">
                                <div class="tabs">
                                    <div class="tab active" data-content="umap">UMAP Visualization</div>
                                    <div class="tab" data-content="shap">SHAP Analysis</div>
                                </div>
                                <button id="toggle-legend" class="btn btn-primary">
                                    <i class="fas fa-palette"></i> Legend
                                </button>
                            </div>
                        </div>
                        
                        <div class="visualization-content">
                            <div id="umap-content" class="tab-content">
                                <div class="info-card">
                                    <div class="info-card-content">
                                        <h3>Bacteriocin UMAP Visualization</h3>
                                        
                                        <div class="legend-section">
                                            <div class="legend-items">
                                                <div class="legend-item">
                                                    <div class="legend-color color-reference"></div>
                                                    <div>Reference Sequences</div>
                                                </div>
                                                <div class="legend-item">
                                                    <div class="legend-color color-candidate"></div>
                                                    <div>Candidate Sequences</div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <p>Points that are close together represent sequences with similar characteristics.</p>
                                        
                                        <div class="interaction-tips">
                                            <span class="tip"><i class="fas fa-mouse-pointer"></i> Hover: View details</span>
                                            <span class="tip"><i class="fas fa-arrows-alt"></i> Drag: Pan view</span>
                                            <span class="tip"><i class="fas fa-search"></i> Scroll: Zoom</span>
                                            <span class="tip"><i class="fas fa-undo"></i> Double-click: Reset</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Isolated plot container with wrapper as recommended -->
                                <div class="umap-plot-wrapper">
                                    <div id="umap-container" class="plotly-isolated-container">
                                        <div id="loading-message" style="text-align: center; padding: 30px;">
                                            <div class="spinner"></div>
                                            <p>Loading UMAP visualization...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div id="shap-content" class="tab-content hidden">
                                <div class="shap-card">
                                    <h3>SHAP Feature Importance Analysis</h3>
                                    <p>SHAP values help explain which features (amino acids and dipeptides) are most important for predicting bacteriocins.</p>
                                    <p>Higher values indicate greater importance to the model's predictions.</p>
                                    
                                    <div class="help-tips">
                                        <h4>Understanding SHAP Values:</h4>
                                        <ul>
                                            <li>Single amino acids (e.g., 'K', 'C') represent the frequency of that amino acid in the sequence</li>
                                            <li>Dipeptides (e.g., 'GG', 'CC') represent the frequency of that amino acid pair</li>
                                            <li>Higher SHAP values indicate stronger influence on the prediction</li>
                                        </ul>
                                    </div>
                                </div>
                                
                                <!-- Isolated SHAP plot container with wrapper -->
                                <div class="umap-plot-wrapper">
                                    <div id="shap-container" class="plotly-isolated-container">
                                        <!-- SHAP plot will be inserted here -->
                                    </div>
                                </div>
                                
                                <!-- Isolated waterfall plot container with wrapper -->
                                <div class="umap-plot-wrapper">
                                    <div id="waterfall-container" class="plotly-isolated-container">
                                        <h3>Feature Contributions for Selected Example</h3>
                                        <p>This chart shows how individual features contribute to the prediction for a representative sequence.</p>
                                        <!-- Waterfall plot will be inserted here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            `;
            
            // Replace the content
            analysisContainer.innerHTML = htmlContent;
            
            // Add the needed styles with specific isolation for Plotly elements
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                /* Basic styles for the visualization UI */
                :root {
                    --primary-color: #2c3e50;
                    --secondary-color: #167A6E;
                    --accent-color: #e67e22;
                    --light-color: #f5f7fa;
                    --dark-color: #2c3e50;
                    --success-color: #27ae60;
                    --warning-color: #f39c12;
                    --danger-color: #e74c3c;
                    --border-radius: 8px;
                    --box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                
                /* Header styles */
                header {
                    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                    color: white;
                    padding: 1rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: var(--box-shadow);
                }
                
                .header-title h1 {
                    font-size: 24px;
                    margin: 0;
                }
                
                .header-title p {
                    font-size: 14px;
                    opacity: 0.8;
                    margin: 0;
                }
                
                .header-actions {
                    display: flex;
                    gap: 15px;
                }
                
                .btn {
                    padding: 8px 16px;
                    border-radius: var(--border-radius);
                    border: none;
                    cursor: pointer;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    text-decoration: none;
                    gap: 8px;
                }
                
                .btn-primary {
                    background-color: white;
                    color: var(--primary-color);
                }
                
                .btn-primary:hover {
                    background-color: rgba(255, 255, 255, 0.9);
                }
                
                .btn-outline {
                    background-color: transparent;
                    color: white;
                    border: 1px solid white;
                }
                
                .btn-outline:hover {
                    background-color: rgba(255, 255, 255, 0.1);
                }
                
                /* Main content styles */
                main {
                    flex: 1;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    overflow-x: hidden;
                }
                
                .visualization-container {
                    background-color: white;
                    border-radius: var(--border-radius);
                    box-shadow: var(--box-shadow);
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                }
                
                .visualization-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                
                .visualization-title {
                    flex: 1;
                }
                
                .visualization-title h2 {
                    font-size: 20px;
                    margin: 0 0 5px 0;
                    color: var(--primary-color);
                }
                
                .stats {
                    display: flex;
                    gap: 2rem;
                    flex-wrap: wrap;
                }
                
                .stat-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .stat-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                }
                
                .reference-icon {
                    background-color: rgba(241, 196, 15, 0.2);
                    color: #f1c40f;
                }
                
                .candidate-icon {
                    background-color: rgba(22, 122, 110, 0.2);
                    color: #167A6E;
                }
                
                .total-icon {
                    background-color: rgba(52, 152, 219, 0.2);
                    color: #3498db;
                }
                
                .stat-text {
                    display: flex;
                    flex-direction: column;
                }
                
                .stat-value {
                    font-weight: bold;
                    font-size: 18px;
                }
                
                .stat-label {
                    font-size: 12px;
                    color: #7f8c8d;
                }
                
                .tools-container {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                
                .visualization-content {
                    flex: 1;
                    padding: 1rem;
                    overflow: auto;
                    position: relative;
                }
                
                /* Isolated Plotly container styles as per recommendation */
                .umap-plot-wrapper {
                    width: 100%;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 10px;
                    background: #fff;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    border-radius: 8px;
                    margin-bottom: 20px;
                    z-index: 5;
                    position: relative;
                    overflow: visible;
                }
                
                .plotly-isolated-container {
                    width: 100%;
                    height: 700px;
                    position: relative;
                    overflow: visible;
                    min-height: 500px;
                }
                
                /* Ensure Plotly elements are displayed correctly */
                .plotly-isolated-container .js-plotly-plot,
                .plotly-isolated-container .plotly-graph-div {
                    width: 100%;
                    height: 700px;
                    min-height: 500px;
                    position: relative;
                    display: block;
                    visibility: visible;
                }
                
                /* Override any global styles that might affect Plotly elements */
                .plotly-isolated-container .main-svg {
                    position: absolute;
                    top: 0;
                    left: 0;
                    pointer-events: all;
                    z-index: 10;
                    width: 100%;
                    height: 100%;
                }
                
                .plotly-isolated-container .svg-container {
                    position: relative;
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                
                /* Styling for info cards and legends */
                .legend {
                    position: absolute;
                    top: 30px;
                    right: 30px;
                    background-color: white;
                    border-radius: var(--border-radius);
                    padding: 1rem;
                    box-shadow: var(--box-shadow);
                    z-index: 10;
                }
                
                .legend-title {
                    font-weight: bold;
                    margin-bottom: 8px;
                }
                
                .legend-items {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .legend-color {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                }
                
                .color-reference {
                    background-color: #f1c40f;
                }
                
                .color-candidate {
                    background-color: #167A6E;
                }
                
                .info-card {
                    position: absolute;
                    bottom: 45px;
                    left: 24px;
                    width: 500px;
                    height: 200px;
                    background-color: white;
                    border-radius: var(--border-radius);
                    padding: 1rem;
                    box-shadow: var(--box-shadow);
                    z-index: 10;
                    overflow-y: hidden;
                    border-top-right-radius: var(--border-radius);
                    border-bottom-right-radius: var(--border-radius);
                    border-bottom-left-radius: var(--border-radius);
                }
                
                .info-card-content {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                
                .info-card h3 {
                    margin-top: 0;
                    margin-bottom: 8px;
                    font-size: 16px;
                    color: var(--primary-color);
                }
                
                .info-card p {
                    margin: 3px 0;
                    font-size: 12px;
                    color: #7f8c8d;
                }
                
                .legend-section {
                    margin-bottom: 4px;
                }
                
                .legend-items {
                    display: flex;
                    gap: 16px;
                }
                
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                }
                
                .legend-color {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                
                .color-reference {
                    background-color: #f1c40f;
                }
                
                .color-candidate {
                    background-color: #167A6E;
                }
                
                .interaction-tips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-top: auto;
                    padding-top: 6px;
                    border-top: 1px solid #f0f0f0;
                }
                
                .tip {
                    font-size: 11px;
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    color: #666;
                    background-color: #f9f9f9;
                    padding: 2px 5px;
                    border-radius: 3px;
                }
                
                /* Tab styling */
                .tabs {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                
                .tab {
                    padding: 0.5rem 1rem;
                    background-color: #eee;
                    border-radius: var(--border-radius);
                    cursor: pointer;
                    font-weight: 500;
                }
                
                .tab.active {
                    background-color: var(--secondary-color);
                    color: white;
                }
                
                /* Utility classes */
                .hidden {
                    display: none !important;
                }
                
                .spinner {
                    border: 5px solid #f3f3f3;
                    border-top: 5px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 15px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                /* Responsive styles */
                @media (max-width: 768px) {
                    .header-actions {
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .visualization-header {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    
                    .stats, .tools-container {
                        margin-top: 10px;
                    }
                }
            `;
            document.head.appendChild(styleElement);
            
            // Initialize tab switching and other UI functionality
            initializeUmapUI();
            
            // Initialize the visualization with the recommended approach
            initializeVisualization();
        } else {
            // Fallback to the old method if container not found but using redirect instead of popup
            window.location.href = '/umap_visualization';
        }
    } else {
        // Show error message if no HTML is available
        showNotification('No visualization data available. Please try again.', 'warning');
    }
}

// Helper function to initialize UI elements 
function initializeUmapUI() {
    // Toggle info card
    const toggleInfoBtn = document.getElementById('toggle-info');
    const infoCard = document.querySelector('.info-card');
    
    if (toggleInfoBtn && infoCard) {
        toggleInfoBtn.addEventListener('click', function() {
            infoCard.classList.toggle('hidden');
        });
    }
    
    // Remove the separate toggle for legend since it's now combined with info card
    const toggleLegendBtn = document.getElementById('toggle-legend');
    if (toggleLegendBtn) {
        toggleLegendBtn.style.display = 'none'; // Hide the toggle legend button
    }
    
    // Export PNG button
    const exportPngBtn = document.getElementById('export-png');
    
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', function() {
            const activeTab = document.querySelector('.tab.active').getAttribute('data-content');
            
            if (activeTab === 'umap') {
                const plotElement = document.querySelector('#umap-content .js-plotly-plot');
                if (plotElement && window.Plotly) {
                    Plotly.downloadImage(plotElement, {
                        format: 'png',
                        width: 1200,
                        height: 800,
                        filename: 'bacteriocin_umap_visualization'
                    });
                } else {
                    alert('Unable to export the plot. Plotly library not loaded correctly.');
                }
            } else if (activeTab === 'shap') {
                const plotElement = document.querySelector('#shap-content .js-plotly-plot');
                if (plotElement && window.Plotly) {
                    Plotly.downloadImage(plotElement, {
                        format: 'png',
                        width: 1200,
                        height: 800,
                        filename: 'bacteriocin_shap_analysis'
                    });
                } else {
                    alert('Unable to export the plot. Plotly library not loaded correctly.');
                }
            }
        });
    }

    // Add back button functionality
    const backButton = document.getElementById('back-to-analysis');
    if (backButton) {
        backButton.addEventListener('click', function() {
            // Restore original content
            const savedContent = localStorage.getItem('analysisOriginalContent');
            const analysisContainer = document.querySelector('.analysis-container');
            if (savedContent && analysisContainer) {
                analysisContainer.innerHTML = savedContent;
                
                // Reinitialize the analysis page
                // Restore event listeners and any other needed functionality
                if (window.analysisTools && window.analysisTools.initAnalysisPage) {
                    window.analysisTools.initAnalysisPage();
                }
            }
        });
    }
    
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const contentId = this.getAttribute('data-content');
            
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(contentId + '-content').classList.remove('hidden');
        });
    });
}

// Helper function to initialize the visualization
function initializeVisualization() {
    console.log("Initializing inline UMAP visualization");
    
    // Get data from localStorage
    const umapHtml = localStorage.getItem('lastUmapHtml');
    const loadingMessage = document.getElementById('loading-message');
    const plotContainer = document.getElementById('umap-container');
    
    // Check if Plotly is loaded and add onload handler
    function ensurePlotlyLoaded(callback) {
        // If Plotly is already loaded from the base template, just proceed
        if (typeof Plotly !== 'undefined') {
            console.log("Plotly already loaded, proceeding to render");
            callback();
            return;
        }
        
        console.log("Plotly not detected, adding script");
        const plotlyScript = document.createElement('script');
        plotlyScript.src = 'https://cdn.plot.ly/plotly-2.29.0.min.js';
        plotlyScript.onload = function() {
            console.log("Plotly script loaded successfully");
            callback();
        };
        
        plotlyScript.onerror = function() {
            console.error("Failed to load Plotly script from primary CDN");
            // Try alternative CDN
            const altScript = document.createElement('script');
            altScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.29.0/plotly.min.js';
            altScript.onload = function() {
                console.log("Plotly script loaded from alternative CDN");
                callback();
            };
            
            altScript.onerror = function() {
                console.error("Failed to load Plotly from both CDNs");
                if (loadingMessage) {
                    loadingMessage.innerHTML = `
                        <div class="error-message">
                            <h3>Error Loading Visualization</h3>
                            <p>Failed to load the Plotly library. Please check your internet connection.</p>
                        </div>
                    `;
                }
            };
            
            document.head.appendChild(altScript);
        };
        
        document.head.appendChild(plotlyScript);
    }
    
    // Function to render all plots
    function renderPlots() {
        console.log("DOM at render time:", {
            plotContainer: document.getElementById('umap-container'),
            loadingMessage: document.getElementById('loading-message'),
            plotlyDiv: document.querySelector('.js-plotly-plot'),
            allPlotContainers: document.querySelectorAll('.plotly-isolated-container')
        });
        
        // Create a fallback plot if needed
        function createFallbackPlot(container) {
            if (window.Plotly) {
                console.log("Creating fallback plot in", container.id);
                try {
                    // Ensure container has width and height set
                    container.style.width = '100%';
                    container.style.height = '700px';
                    
                    Plotly.newPlot(
                        container, 
                        [{
                            x: [1, 2, 3, 4],
                            y: [10, 15, 13, 17],
                            type: 'scatter',
                            mode: 'markers',
                            marker: {
                                size: 12, 
                                color: ['yellow', 'yellow', 'green', 'green']
                            },
                            text: ['Reference 1', 'Reference 2', 'Candidate 1', 'Candidate 2'],
                            hoverinfo: 'text'
                        }],
                        {
                            title: 'UMAP Projection of Bacteriocin Sequences',
                            height: 700,
                            width: container.offsetWidth,
                            autosize: true,
                            legend: {
                                orientation: "h",
                                yanchor: "top",
                                y: -0.2,
                                xanchor: "center",
                                x: 0.5
                            }
                        },
                        { responsive: true }
                    );
                    
                    // Force resize after plot creation
                    setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                    }, 100);
                } catch (e) {
                    console.error("Error creating fallback plot:", e);
                }
            }
        }
        
        // Render UMAP plot
        if (umapHtml && plotContainer) {
            console.log("Found container for UMAP plot:", plotContainer);
            
            try {
                console.log("Rendering UMAP via DOM manipulation");
                if (loadingMessage) loadingMessage.style.display = 'none';
                
                // Generate a unique ID for this plot instance
                const plotId = `umap-plot-${Date.now()}`;
                
                // First clean the container
                plotContainer.innerHTML = '';
                
                // Create a new Plotly div with explicit size settings
                const newPlotDiv = document.createElement('div');
                newPlotDiv.id = plotId;
                newPlotDiv.className = 'plotly-graph-div js-plotly-plot';
                newPlotDiv.style.width = '100%';
                newPlotDiv.style.height = '700px';
                plotContainer.appendChild(newPlotDiv);
                
                if (window.Plotly) {
                    try {
                        // Direct implementation of the raw plot data from localStorage
                        const rawData = localStorage.getItem('umap_plot_data');
                        if (rawData) {
                            const plotData = JSON.parse(rawData);
                            
                            // Set up a basic layout
                            const plotLayout = {
                                title: 'UMAP Projection of Bacteriocin Sequences',
                                autosize: true,
                                height: 700,
                                margin: {l: 50, r: 50, t: 50, b: 50},
                                legend: {
                                    orientation: "h",
                                    yanchor: "top",
                                    y: -0.2,
                                    xanchor: "center",
                                    x: 0.5
                                }
                            };
                            
                            const plotConfig = {
                                responsive: true,
                                displayModeBar: true
                            };
                            
                            console.log("Creating UMAP plot with stored data");
                            Plotly.newPlot(plotId, plotData, plotLayout, plotConfig)
                                .then(() => {
                                    console.log("UMAP plot successfully created from raw data");
                                    // Force a resize to ensure proper rendering
                                    setTimeout(() => {
                                        window.dispatchEvent(new Event('resize'));
                                    }, 100);
                                });
                        } else {
                            // If no raw data is available, try inserting the HTML directly
                            console.log("No raw data available, trying HTML insertion");
                            
                            // Extract the script part separately
                            const scriptMatch = umapHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
                            let scriptContent = scriptMatch ? scriptMatch[1] : '';
                            
                            // Remove the script from html to avoid duplicate execution
                            let cleanHtml = umapHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
                            
                            // Insert the HTML content
                            plotContainer.innerHTML = cleanHtml;
                            
                            // Execute any script content separately
                            if (scriptContent) {
                                setTimeout(() => {
                                    try {
                                        // Execute extracted script via Function to avoid scope issues
                                        (new Function(scriptContent))();
                                    } catch (scriptErr) {
                                        console.error("Error executing extracted script:", scriptErr);
                                    }
                                }, 100);
                            }
                            
                            // Force resize after a delay
                            setTimeout(() => {
                                window.dispatchEvent(new Event('resize'));
                                
                                // Find any Plotly graphs and ensure they're properly sized
                                const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');
                                plotlyGraphs.forEach(plot => {
                                    if (plot && typeof Plotly !== 'undefined') {
                                        Plotly.relayout(plot, {autosize: true});
                                    }
                                });
                            }, 300);
                        }
                    } catch (e) {
                        console.error("Error creating plot from extracted data:", e);
                        createFallbackPlot(newPlotDiv);
                    }
                } else {
                    console.error("Plotly not available for rendering");
                    createFallbackPlot(newPlotDiv);
                }
            } catch (e) {
                console.error("Error rendering UMAP:", e);
                if (plotContainer) {
                    plotContainer.innerHTML = `
                        <div class="error-message">
                            <h3>Error Rendering Visualization</h3>
                            <p>${e.message}</p>
                        </div>
                    `;
                }
            }
        } else {
            console.error("UMAP HTML not available or container not found");
            if (plotContainer) {
                createFallbackPlot(plotContainer);
            }
        }
        
        // Hide SHAP tab if not needed
        const shapTab = document.querySelector('.tab[data-content="shap"]');
        if (shapTab) {
            shapTab.style.display = 'none';
        }
        
        // Final resize to ensure all plots are properly sized
        setTimeout(() => {
            console.log("Final resize to ensure proper rendering");
            window.dispatchEvent(new Event('resize'));
        }, 500);
    }
    
    // Start the rendering process by ensuring Plotly is loaded
    ensurePlotlyLoaded(renderPlots);
}
