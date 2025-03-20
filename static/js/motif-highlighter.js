// Bacteriocin Motif Highlighter and Tooltip System
document.addEventListener('DOMContentLoaded', function() {
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
        {
            name: "Lanthionine Ring Formation Motif",
            pattern: "SxxxC", 
            regex: /S[A-Z]{3}C/g,
            class: "motif-class-i",
            subclass: "motif-lanthionine",
            tooltip: "Represents a dehydrated serine (S) and a downstream cysteine (C) separated by ~3 variable residues; these pair to form a thioether (lanthionine) bridge that rigidifies the mature peptide and supports lipid II binding (e.g., nisin's ring A). (Bierbaum & Sahl, 2009)",
            color: "#457b9d"
        },
        {
            name: "Hinge Region",
            pattern: "NMK",
            regex: /NMK/g,
            class: "motif-class-i",
            subclass: "motif-hinge",
            tooltip: "A short (~3-residue) flexible linker (commonly 'NMK') connecting the lipid II-binding domain to the membrane-active segment, allowing the peptide to bend during pore formation. (Drider et al., 2006)",
            color: "#f1c453"
        },
        
        // Class IIa: Pediocin-Like Bacteriocins
        {
            name: "Pediocin Box – YGNGV Motif",
            pattern: "YGNGV",
            regex: /YGNGV/g,
            class: "motif-class-iia",
            subclass: "motif-pediocin",
            tooltip: "A highly conserved N-terminal sequence critical for binding the mannose-phosphotransferase (Man-PTS) receptor on target cells; it defines the pediocin-like family. (Drider et al., 2006)",
            color: "#2a9d8f"
        },
        {
            name: "Disulfide-Bridge Motif",
            pattern: "CxxC",
            regex: /C[A-Z]{2}C/g,
            class: "motif-class-iia",
            subclass: "motif-disulfide",
            tooltip: "Two cysteines (C) separated by ~2 variable residues form a disulfide bond that stabilizes the N-terminal β-sheet structure needed for correct receptor binding. (Drider et al., 2006)",
            color: "#e9c46a"
        },
        {
            name: "C-Terminal Hydrophobic Helix/Tail",
            pattern: "xxALxxVLxx",
            regex: /[A-Z]{2}AL[A-Z]{2}VL[A-Z]{2}/g,
            class: "motif-class-iia",
            subclass: "motif-hydrophobic",
            tooltip: "An amphipathic stretch rich in hydrophobic residues (e.g., A, L, V) that folds into a helix, facilitating membrane insertion after receptor binding. (Drider et al., 2006; Ekblad et al., 2016)",
            color: "#f4a261"
        },
        
        // Class IIb: Two-Peptide Bacteriocins
        {
            name: "GxxxG Helix–Helix Interaction Motif",
            pattern: "GxxxG",
            regex: /G[A-Z]{3}G/g,
            class: "motif-class-iib",
            subclass: "motif-helix-interaction",
            tooltip: "Two glycine (G) residues separated by any three amino acids; this 'glycine zipper' promotes close helix–helix packing between complementary peptides that act together to form a membrane pore. (Ekblad et al., 2016)",
            color: "#264653"
        },
        
        // Class IIc: Circular Bacteriocins 
        // This is more conceptual than a direct pattern
        
        // Class IId: Leaderless Bacteriocins
        // N-formyl methionine would require special handling
        
        // Class III: Bacteriolysins
        {
            name: "Signal Peptide Motif (Sec-Dependent)",
            // Simplified pattern for detection
            pattern: "MKxxLLLLLLLLLLLAxA",
            regex: /M[KR][A-Z]{2}[LIVF]{8,15}A[A-Z]A/g,
            class: "motif-class-iii",
            subclass: "motif-signal-peptide",
            tooltip: "A typical N-terminal signal peptide that includes a basic region (M followed by K/R), a hydrophobic core of 8–15 residues (composed of L/I/V), and a C-terminal cleavage motif (AxA); it targets the protein for secretion via the Sec pathway. (Yuan et al., 2004)",
            color: "#023e8a"
        },
        {
            name: "Catalytic HxH Motif",
            pattern: "HxH",
            regex: /H[A-Z]H/g,
            class: "motif-class-iii",
            subclass: "motif-catalytic",
            tooltip: "A motif featuring two histidine residues (with 0–2 intervening residues) that coordinate a Zn²⁺ ion in metallopeptidase bacteriolysins, essential for cell wall degradation. (Yuan et al., 2004; Bierbaum & Sahl, 2009)",
            color: "#0077b6"
        },
        {
            name: "Catalytic HxxH Motif",
            pattern: "HxxH",
            regex: /H[A-Z]{2}H/g,
            class: "motif-class-iii",
            subclass: "motif-catalytic",
            tooltip: "A motif featuring two histidine residues (with 0–2 intervening residues) that coordinate a Zn²⁺ ion in metallopeptidase bacteriolysins, essential for cell wall degradation. (Yuan et al., 2004; Bierbaum & Sahl, 2009)",
            color: "#0077b6"
        },
        {
            name: "LysM Motif",
            pattern: "xxGxxDxx",
            regex: /[A-Z]{2}G[A-Z]{2}D[A-Z]{2}/g,
            class: "motif-class-iii",
            subclass: "motif-lysm",
            tooltip: "A short sequence fragment from the LysM domain, where conserved glycine (G) and aspartate (D) residues contribute to peptidoglycan binding. (Cleveland et al., 2001)",
            color: "#00b4d8"
        },
        {
            name: "SH3b Motif",
            pattern: "xxYxxPxx",
            regex: /[A-Z]{2}Y[A-Z]{2}P[A-Z]{2}/g,
            class: "motif-class-iii",
            subclass: "motif-sh3b",
            tooltip: "A representative segment from the SH3b domain, with conserved tyrosine (Y) and proline (P) that help stabilize the beta-barrel fold for specific binding to cell wall components. (Cleveland et al., 2001)",
            color: "#90e0ef"
        }
    ];

    // Function to find and highlight motifs in text
    function highlightMotifs() {
        // Elements that may contain sequence data
        const sequenceContainers = document.querySelectorAll('.sequence-preview, .sequence-display, .sequence-content, pre, code, .sequence');
        
        sequenceContainers.forEach(container => {
            if (!container || container.getAttribute('data-motifs-processed') === 'true') {
                return; // Skip if already processed
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
    }
    
    // Create and initialize tooltip
    function initializeTooltipSystem() {
        // Create tooltip element if it doesn't exist
        let tooltip = document.getElementById('bacteriocin-motif-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'bacteriocin-motif-tooltip';
            tooltip.className = 'bacteriocin-tooltip';
            tooltip.style.cssText = `
                position: absolute;
                visibility: hidden;
                z-index: 1000;
                max-width: 300px;
                background-color: #fff;
                color: #333;
                border-radius: 8px;
                box-shadow: 0 3px 15px rgba(0,0,0,0.2);
                padding: 10px 15px;
                font-size: 14px;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(tooltip);
        }
        
        // Add event listeners to document for motif hover
        document.addEventListener('mouseover', function(e) {
            const target = e.target;
            if (target.classList && target.classList.contains('bacteriocin-motif')) {
                showTooltip(target, tooltip);
            }
        });
        
        document.addEventListener('mouseout', function(e) {
            const target = e.target;
            if (target.classList && target.classList.contains('bacteriocin-motif')) {
                hideTooltip(tooltip);
            }
        });

        // Update tooltip position on scroll
        document.addEventListener('scroll', function() {
            const activeMotif = document.querySelector('.bacteriocin-motif:hover');
            if (activeMotif && tooltip.style.visibility === 'visible') {
                showTooltip(activeMotif, tooltip);
            }
        }, true);
    }
    
    function showTooltip(element, tooltip) {
        // Get tooltip content
        const motifName = element.getAttribute('data-motif');
        const tooltipText = element.getAttribute('data-tooltip');
        
        // Set tooltip content
        tooltip.innerHTML = `
            <strong>${motifName}</strong>
            <hr style="margin: 5px 0; opacity: 0.3;">
            <p style="margin: 5px 0;">${tooltipText}</p>
        `;
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        const tooltipWidth = 300; // Max width of tooltip
        
        // Calculate position to avoid going off screen
        let leftPos = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        
        // Adjust if off screen
        if (leftPos + tooltipWidth > window.innerWidth) {
            leftPos = window.innerWidth - tooltipWidth - 20;
        }
        if (leftPos < 20) {
            leftPos = 20;
        }
        
        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10 + window.scrollY}px`;
        
        // If tooltip would go off screen top, show below element instead
        if (rect.top - tooltip.offsetHeight - 10 < 0) {
            tooltip.style.top = `${rect.bottom + 10 + window.scrollY}px`;
        }
        
        // Show tooltip
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
    }
    
    function hideTooltip(tooltip) {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    }
    
    // Helper functions for dynamic content
    function observeNewContent() {
        // Use MutationObserver to watch for new content
        const observer = new MutationObserver(function(mutations) {
            let shouldProcess = false;
            
            mutations.forEach(function(mutation) {
                // Check for added nodes that might contain sequences
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    shouldProcess = true;
                }
            });
            
            if (shouldProcess) {
                highlightMotifs();
            }
        });
        
        // Observe the entire body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Initialize everything
    function init() {
        highlightMotifs(); // Initial highlighting
        initializeTooltipSystem(); // Set up tooltips
        observeNewContent(); // Watch for dynamic changes
    }
    
    // Start highlighter
    init();
}); 