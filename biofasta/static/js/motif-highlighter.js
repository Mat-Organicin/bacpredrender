// Bacteriocin Motif Highlighter and Tooltip System
document.addEventListener('DOMContentLoaded', function() {
    console.log("Motif Highlighter loaded - debug version");
    
    // Define bacteriocin motifs with their patterns and tooltips
    const bacteriocinMotifs = [
        // Class I: Lantibiotics
        {
            name: "Leader Peptide FNLD Motif",
            pattern: "FNLD",
            regex: /FNLD/g,
            class: "motif-class-i",
            subclass: "motif-leader-peptide",
            tooltip: "A conserved segment at the C-terminus of the leader peptide that directs post‐translational modifications (via LanB/LanC enzymes) and proper cleavage before the mature peptide forms. (Bierbaum & Sahl, 2009)",
            color: "#e63946"
        },
        // ... existing motifs ...
    ];

    // Find Plotly MSA elements and attach direct handlers
    function findPlotlyElements() {
        // DISABLED PER USER REQUEST
    }
    
    // Show filter UI with selected elements
    function showFilterUI(selectedElements) {
        // DISABLED PER USER REQUEST
    }
    
    // Hide filter UI
    function hideFilterUI() {
        // DISABLED PER USER REQUEST
    }
    
    // Filter sequences by pattern
    function filterByPattern() {
        // DISABLED PER USER REQUEST
    }
    
    // Reset all selections and filtering
    function resetSelection() {
        // DISABLED PER USER REQUEST
    }

    // Function to find and highlight motifs in text
    function highlightMotifs() {
        console.log("Highlighting motifs - processing both regular containers and MSA visualization");
        
        // Elements that may contain sequence data
        const sequenceContainers = document.querySelectorAll('.sequence-preview, .sequence-display, .sequence-content, pre, code, .sequence, #msa-sequences-container .sequence-content');
        
        // Process regular sequence containers
        sequenceContainers.forEach(container => {
            // Skip if already processed or if contained in MSA container
            if (!container || 
                container.getAttribute('data-motifs-processed') === 'true' ||
                isInMsaContainer(container)) {
                return;
            }
            
            // Get the original text content
            let originalText = container.textContent;
            let workingHTML = originalText;
            
            // Create temporary container
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = workingHTML;
            
            // Track motif positions to avoid nesting (more complex motifs first)
            let motifPositions = [];
            
            // Sort motifs by complexity (longer patterns first)
            const sortedMotifs = [...bacteriocinMotifs].sort((a, b) => {
                return b.pattern.length - a.pattern.length;
            });
            
            // Process each motif
            sortedMotifs.forEach(motif => {
                let match;
                const regex = motif.regex;
                let text = tempContainer.textContent;
                let lastIndex = 0;
                let offset = 0;
                
                // Reset regex
                regex.lastIndex = 0;
                
                while ((match = regex.exec(text)) !== null) {
                    const startPos = match.index;
                    const endPos = startPos + match[0].length;
                    
                    // Check if this region overlaps with any already tagged motif
                    const isOverlapping = motifPositions.some(pos => {
                        return (startPos >= pos.start && startPos < pos.end) ||
                               (endPos > pos.start && endPos <= pos.end) ||
                               (startPos <= pos.start && endPos >= pos.end);
                    });
                    
                    if (!isOverlapping) {
                        motifPositions.push({
                            start: startPos,
                            end: endPos,
                            motif: motif
                        });
                    }
                }
            });
            
            // Sort positions by start position (earliest first)
            motifPositions.sort((a, b) => a.start - b.start);
            
            // Apply highlights in reverse order (from end to start)
            let newHTML = originalText;
            for (let i = motifPositions.length - 1; i >= 0; i--) {
                const pos = motifPositions[i];
                const beforeMatch = newHTML.substring(0, pos.start);
                const matchText = newHTML.substring(pos.start, pos.end);
                const afterMatch = newHTML.substring(pos.end);
                
                // Replace with highlighted version
                newHTML = beforeMatch + 
                    `<span class="bacteriocin-motif ${pos.motif.class} ${pos.motif.subclass}" 
                           style="background-color: ${pos.motif.color}30; 
                                  border-bottom: 2px solid ${pos.motif.color}; 
                                  color: inherit;" 
                           data-motif="${pos.motif.name}"
                           data-tooltip="${pos.motif.tooltip}"
                           title="${pos.motif.name}: ${pos.motif.tooltip}">${matchText}</span>` + 
                    afterMatch;
            }
            
            // Replace content
            if (newHTML !== originalText) {
                container.innerHTML = newHTML;
                container.setAttribute('data-motifs-processed', 'true');
            }
        });
        
        // Skip Plotly MSA visualization processing - disabled per user request
    }
    
    // Function to check if an element is inside an MSA container
    function isInMsaContainer(element) {
        // Check if element itself is an MSA container
        if (element.classList && 
            (element.classList.contains('msa-container') || 
             element.classList.contains('msa-visualization-container') ||
             element.classList.contains('plotly-msa-visualization') ||
             element.classList.contains('js-plotly-plot'))) {
            return true;
        }
        
        // Check if element has an MSA container as a parent
        let parent = element.parentElement;
        while (parent) {
            if (parent.classList && 
                (parent.classList.contains('msa-container') || 
                 parent.classList.contains('msa-visualization-container') ||
                 parent.classList.contains('plotly-msa-visualization') ||
                 parent.classList.contains('js-plotly-plot'))) {
                return true;
            }
            parent = parent.parentElement;
        }
        
        // Also check based on ID in case the class names vary
        if (element.id && 
            (element.id.includes('msa') || 
             element.id.includes('plotly'))) {
            return true;
        }
        
        return false;
    }
    
    // Function to find sequences in the Plotly visualization - DISABLED FOR MSA
    function findAndProcessPlotlySequences() {
        // DISABLED PER USER REQUEST
    }
    
    // ... rest of file unchanged ...
}); 