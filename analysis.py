"""
Analysis utilities for BioFASTA

This module provides analysis functions for bacteriocin sequences.
"""
import os
import io
import base64
import numpy as np
import plotly.graph_objects as go
import plotly.io as pio
from plotly.subplots import make_subplots
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba
import umap
import joblib
import database
import shap
from bacpred import BacteriocinPredictor
import logging
from Bio import SeqIO, AlignIO, Phylo
from Bio.Align.Applications import ClustalOmegaCommandline
from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.Align import MultipleSeqAlignment
from io import StringIO
import tempfile
import subprocess
import json
import random
from datetime import datetime
import pandas as pd
import plotly

# Initialize logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Constants for file paths
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
SCALER_FILE = os.path.join(MODEL_DIR, 'bacteriocin_scaler.joblib')
MODEL_FILE = os.path.join(MODEL_DIR, 'bacteriocin_model.joblib')

# Handle the generation of FEATURE_NAMES in one place - comment out older definition
# FEATURE_NAMES = [f"AA_{aa}" for aa in "ACDEFGHIKLMNPQRSTVWY"] + [f"Di_{a}{b}" for a in "ACDEFGHIKLMNPQRSTVWY" for b in "ACDEFGHIKLMNPQRSTVWY"]

def sanitize_json(obj):
    """
    Recursively sanitize an object for JSON serialization.
    Handles numpy arrays, pandas DataFrames, and other non-serializable objects.
    
    Args:
        obj: Any Python object
        
    Returns:
        JSON serializable object
    """
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, list) or isinstance(obj, tuple):
        return [sanitize_json(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return sanitize_json(obj.tolist())
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, pd.DataFrame):
        return sanitize_json(obj.to_dict('records'))
    elif isinstance(obj, pd.Series):
        return sanitize_json(obj.to_dict())
    elif hasattr(obj, 'to_json'):
        return json.loads(obj.to_json())
    elif hasattr(obj, '__dict__'):
        return sanitize_json(obj.__dict__)
    else:
        try:
            # Try to see if it's JSON serializable as-is
            json.dumps(obj)
            return obj
        except (TypeError, OverflowError):
            # If not, convert to string representation
            return str(obj)

# Feature names for SHAP plotting
AA_FEATURES = list("ACDEFGHIKLMNPQRSTVWY")
DIPEPTIDE_FEATURES = []
for aa1 in AA_FEATURES:
    for aa2 in AA_FEATURES:
        DIPEPTIDE_FEATURES.append(aa1 + aa2)

# Get full feature names from BacteriocinPredictor
try:
    predictor = BacteriocinPredictor()
    FEATURE_NAMES = predictor.get_feature_names()
    logger.info(f"Loaded {len(FEATURE_NAMES)} feature names from BacteriocinPredictor")
except Exception as e:
    logger.warning(f"Failed to get feature names from BacteriocinPredictor: {e}")
    FEATURE_NAMES = AA_FEATURES + DIPEPTIDE_FEATURES
    logger.info(f"Using default feature names ({len(FEATURE_NAMES)} features)")

def encode_protein_sequence(sequence):
    """
    Extract features from a protein sequence using the BacPred feature extraction
    """
    predictor = BacteriocinPredictor()
    return predictor.extract_features(sequence)

def get_sequences_from_vaults_and_bags(vault_ids, bag_ids):
    """
    Get sequences from selected vaults and bags
    
    Args:
        vault_ids (list): List of vault IDs to include
        bag_ids (list): List of bag IDs to include
        
    Returns:
        dict: Dictionary containing sequences with their source (reference or candidate)
    """
    sequences = {}
    
    # Get sequences from vaults (reference bacteriocins)
    if vault_ids:
        for vault_id in vault_ids:
            vault_result = database.get_vault_items(vault_id)
            if vault_result.get('success', False):
                for item in vault_result.get('data', []):
                    seq_id = item.get('sequence_id', '')
                    if seq_id and seq_id not in sequences:
                        sequences[seq_id] = {
                            'sequence': item.get('sequence', ''),
                            'name': item.get('name', seq_id),
                            'source': 'reference'
                        }
    
    # Get sequences from bags (candidate bacteriocins)
    if bag_ids:
        for bag_id in bag_ids:
            bag_result = database.get_bag_items(bag_id)
            if bag_result.get('success', False):
                for item in bag_result.get('data', []):
                    seq_id = item.get('sequence_id', '')
                    if seq_id and seq_id not in sequences:
                        sequences[seq_id] = {
                            'sequence': item.get('sequence', ''),
                            'name': item.get('name', seq_id),
                            'source': 'candidate'
                        }
    
    return sequences

def generate_shap_analysis(feature_matrix, feature_names=None):
    """
    Generate SHAP feature importance analysis
    
    Args:
        feature_matrix (numpy.ndarray): Matrix of features for analysis
        feature_names (list, optional): Names of features
        
    Returns:
        dict: Result with SHAP explanation and visualization
    """
    try:
        logger.info("Generating SHAP analysis with feature matrix shape: %s", feature_matrix.shape)
        
        # Load the model
        if not os.path.exists(MODEL_FILE):
            logger.error(f"Model file not found: {MODEL_FILE}")
            return {
                'success': False,
                'message': 'Model file not found for SHAP analysis'
            }
        
        # Load the model
        model = joblib.load(MODEL_FILE)
        logger.info("Model loaded successfully for SHAP analysis")
        
        # Get model feature importances if it's a Random Forest model
        model_feature_importance = []
        if hasattr(model, 'feature_importances_'):
            try:
                importances = model.feature_importances_
                if feature_names is None:
                    feature_names = FEATURE_NAMES[:len(importances)]
                model_feature_importance = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)
                logger.info(f"Extracted model feature importance ({len(model_feature_importance)} features)")
            except Exception as e:
                logger.warning(f"Could not extract model feature importance: {e}")
        
        # Create a SHAP explainer - handle potential issues with tree structure
        try:
            explainer = shap.TreeExplainer(model)
            logger.info("SHAP TreeExplainer created successfully")
        except Exception as tree_error:
            logger.warning(f"TreeExplainer failed: {tree_error}. Falling back to KernelExplainer.")
            # Fallback to KernelExplainer which works with any model
            background = shap.kmeans(feature_matrix, 10).data  # Create background data
            explainer = shap.KernelExplainer(model.predict_proba, background)
            logger.info("SHAP KernelExplainer created as fallback")
        
        # Calculate SHAP values - handle both explainer types
        try:
            shap_values = explainer.shap_values(feature_matrix)
            logger.info("SHAP values calculated successfully")
        except Exception as e:
            logger.error(f"Error calculating SHAP values: {e}")
            return {
                'success': False,
                'message': f"Failed to calculate SHAP values: {str(e)}"
            }
        
        # If we have multiple classes, take the class 1 (bacteriocin) SHAP values
        if isinstance(shap_values, list):
            logger.info(f"Multiple SHAP value sets found ({len(shap_values)}), using class 1")
            shap_values = shap_values[1]  # Class 1 (bacteriocin)
        
        # Get feature names if not provided
        if feature_names is None:
            feature_names = FEATURE_NAMES
            logger.info(f"Using default feature names ({len(FEATURE_NAMES)} features)")
        
        # Ensure we don't have more feature names than features
        feature_names = feature_names[:feature_matrix.shape[1]]
        logger.info(f"Using {len(feature_names)} feature names")
        
        # Create a summary plot using Plotly
        # Get the mean absolute SHAP values for each feature
        mean_abs_shap = np.abs(shap_values).mean(0)
        logger.info("Calculated mean absolute SHAP values")
        
        # Sort features by importance
        feature_importance = sorted(zip(feature_names, mean_abs_shap), key=lambda x: x[1], reverse=True)
        logger.info(f"Sorted {len(feature_importance)} features by importance")
        
        # Take top 20 features for visualization
        top_features = feature_importance[:20]
        
        # Create the bar chart
        fig = go.Figure()
        
        # Add a horizontal bar chart
        fig.add_trace(go.Bar(
            y=[f[0] for f in top_features],
            x=[f[1] for f in top_features],
            orientation='h',
            marker=dict(
                color='#167A6E',
                line=dict(color='#0E4944', width=1)
            )
        ))
        
        # Update layout
        fig.update_layout(
            title='Top 20 Features by SHAP Importance',
            xaxis_title='Mean |SHAP Value|',
            yaxis_title='Feature',
            height=600,
            margin=dict(l=150, r=20, t=50, b=50),
            template='plotly_white'
        )
        
        # Convert to HTML
        shap_html = fig.to_html(include_plotlyjs=False, full_html=False)
        logger.info("SHAP visualization created successfully")
        
        # Create a waterfall plot for a representative example
        if len(feature_matrix) > 0:
            # Choose a representative example (high probability bacteriocin)
            example_idx = 0  # Default to first example
            try:
                # Predict probabilities for all examples
                probs = model.predict_proba(feature_matrix)[:, 1]
                # Find an example with high probability (> 0.8) if possible
                high_prob_indices = np.where(probs > 0.8)[0]
                if len(high_prob_indices) > 0:
                    example_idx = high_prob_indices[0]
                    logger.info(f"Selected high probability example {example_idx} with prob {probs[example_idx]:.2f}")
                else:
                    # Otherwise use the highest probability example
                    example_idx = np.argmax(probs)
                    logger.info(f"Selected highest probability example {example_idx} with prob {probs[example_idx]:.2f}")
            except Exception as e:
                logger.warning(f"Could not select optimal example: {e}, using first example")
            
            # Get SHAP values for the example
            example_shap_values = shap_values[example_idx]
            
            # Sort by absolute value
            sorted_idx = np.argsort(np.abs(example_shap_values))[::-1]
            top_idx = sorted_idx[:15]  # Take top 15 features
            
            # Create waterfall chart data
            waterfall_x = example_shap_values[top_idx]
            waterfall_y = [feature_names[i] for i in top_idx]
            
            # Create colors (red for negative, blue for positive)
            colors = ['#FF4136' if x < 0 else '#0074D9' for x in waterfall_x]
            
            # Create waterfall chart
            waterfall_fig = go.Figure(go.Bar(
                x=waterfall_x,
                y=waterfall_y,
                orientation='h',
                marker=dict(color=colors)
            ))
            
            # Update layout
            waterfall_fig.update_layout(
                title='SHAP Values for Selected Example',
                xaxis_title='SHAP Value',
                yaxis_title='Feature',
                height=500,
                margin=dict(l=150, r=20, t=50, b=50),
                template='plotly_white'
            )
            
            # Convert to HTML
            waterfall_html = waterfall_fig.to_html(include_plotlyjs=False, full_html=False)
            logger.info("Waterfall plot created successfully")
        else:
            waterfall_html = ''
            logger.warning("No examples available for waterfall plot")
        
        return {
            'success': True,
            'shap_html': shap_html,
            'waterfall_html': waterfall_html,
            'feature_importance': feature_importance,
            'model_feature_importance': model_feature_importance
        }
    except Exception as e:
        logger.error(f"Error in SHAP analysis: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Error in SHAP analysis: {str(e)}",
            'shap_html': '',
            'waterfall_html': '',
            'feature_importance': []
        }

def generate_umap_visualization(vault_ids, bag_ids):
    """
    Generate a UMAP 2D and 3D visualization for selected bacteriocin sequences using Plotly
    with SHAP feature importance analysis
    
    Args:
        vault_ids (list): List of vault IDs to include (reference bacteriocins)
        bag_ids (list): List of bag IDs to include (candidate bacteriocins)
        
    Returns:
        dict: Result with success status and visualization data
    """
    try:
        # Get sequences from selected vaults and bags
        sequences = get_sequences_from_vaults_and_bags(vault_ids, bag_ids)
        
        if not sequences:
            return {
                'success': False,
                'message': 'No sequences found in the selected vaults and bags'
            }
        
        logger.info(f"Generating UMAP visualization for {len(sequences)} sequences")
        
        # Extract features for each sequence
        feature_vectors = []
        labels = []
        seq_ids = []
        names = []
        sequences_data = []
        
        for seq_id, seq_data in sequences.items():
            sequence = seq_data['sequence']
            source = seq_data['source']
            name = seq_data['name']
            
            if not sequence or len(sequence) < 5:
                logger.warning(f"Skipping too short sequence: {seq_id}")
                continue
            
            try:
                # Extract features using BacPred feature extraction
                features = encode_protein_sequence(sequence)
                feature_vectors.append(features)
                labels.append(source)
                seq_ids.append(seq_id)
                names.append(name)
                sequences_data.append({
                    'id': seq_id,
                    'name': name,
                    'sequence': sequence,
                    'source': source
                })
            except Exception as e:
                logger.error(f"Error extracting features for {seq_id}: {e}")
        
        if not feature_vectors:
            return {
                'success': False,
                'message': 'Failed to extract features from sequences'
            }
        
        # Load the feature scaler if available
        scaler = None
        if os.path.exists(SCALER_FILE):
            try:
                scaler = joblib.load(SCALER_FILE)
                feature_matrix = scaler.transform(feature_vectors)
                logger.info(f"Scaled feature matrix with shape: {feature_matrix.shape}")
            except Exception as e:
                logger.error(f"Error loading or applying scaler: {e}")
                feature_matrix = np.array(feature_vectors)
        else:
            # If scaler is not available, use raw features
            feature_matrix = np.array(feature_vectors)
            logger.info(f"Using unscaled feature matrix with shape: {feature_matrix.shape}")
        
        # Apply UMAP dimensionality reduction for 2D
        n_neighbors = min(15, len(feature_matrix) - 1)  # Adjust n_neighbors based on dataset size
        umap_reducer_2d = umap.UMAP(
            n_components=2, 
            n_neighbors=n_neighbors, 
            min_dist=0.1, 
            metric='euclidean', 
            random_state=42
        )
        
        umap_result_2d = umap_reducer_2d.fit_transform(feature_matrix)
        logger.info("Generated 2D UMAP projection")
        
        # Apply UMAP dimensionality reduction for 3D
        umap_reducer_3d = umap.UMAP(
            n_components=3, 
            n_neighbors=n_neighbors, 
            min_dist=0.1, 
            metric='euclidean', 
            random_state=42
        )
        
        umap_result_3d = umap_reducer_3d.fit_transform(feature_matrix)
        logger.info("Generated 3D UMAP projection")
        
        # Generate SHAP analysis
        shap_result = generate_shap_analysis(feature_matrix, FEATURE_NAMES)
        
        # Create Plotly subplot figure with 2D and 3D plots
        fig = make_subplots(
            rows=1, cols=2,
            specs=[[{"type": "xy"}, {"type": "scene"}]],
            subplot_titles=("2D UMAP Projection", "3D UMAP Projection"),
            horizontal_spacing=0.05
        )
        
        # Set color scheme: gold for reference, teal for candidate
        colors = {
            'reference': '#FFD700',  # Gold 
            'candidate': '#167A6E'   # Teal
        }
        
        # Assign unique IDs to each point for cross-highlighting
        point_ids = [f"point_{i}" for i in range(len(seq_ids))]
        
        # Create scatter plots for each category in 2D
        for category in set(labels):
            # Create mask for this category
            indices = [i for i, l in enumerate(labels) if l == category]
            
            hover_texts = []
            for i in indices:
                hover_texts.append(
                    f"<b>{names[i]}</b><br>" +
                    f"ID: {seq_ids[i]}<br>" +
                    f"Type: {category.capitalize()}<br>" +
                    f"Length: {len(sequences_data[i]['sequence'])}<br>" +
                    f"Sequence: {sequences_data[i]['sequence'][:20]}..."
                )
            
            # Add 2D scatter traces
            fig.add_trace(
                go.Scatter(
                    x=umap_result_2d[indices, 0],
                    y=umap_result_2d[indices, 1],
                    mode='markers',
                    marker=dict(
                        color=colors[category],
                        size=10,
                        opacity=0.8,
                        line=dict(width=1, color='white')
                    ),
                    text=hover_texts,
                    hoverinfo='text',
                    name=category.capitalize(),
                    customdata=[point_ids[i] for i in indices],
                    hovertemplate="%{text}<extra></extra>"
                ),
                row=1, col=1
            )
            
            # Add 3D scatter traces
            fig.add_trace(
                go.Scatter3d(
                    x=umap_result_3d[indices, 0],
                    y=umap_result_3d[indices, 1],
                    z=umap_result_3d[indices, 2],
                    mode='markers',
                    marker=dict(
                        color=colors[category],
                        size=6,
                        opacity=0.8,
                        line=dict(width=1, color='white')
                    ),
                    text=hover_texts,
                    hoverinfo='text',
                    name=category.capitalize(),
                    customdata=[point_ids[i] for i in indices],
                    hovertemplate="%{text}<extra></extra>"
                ),
                row=1, col=2
            )
        
        # Update layout
        fig.update_layout(
            title='UMAP Projection of Bacteriocin Sequences',
            template='plotly_white',
            autosize=True,
            width=1200,
            height=600,
            legend=dict(
                orientation="h",
                yanchor="top",
                y=-0.1,  # Negative value to place below the chart
                xanchor="center",
                x=0.5,
                bgcolor='rgba(255, 255, 255, 0.8)',
                bordercolor='rgba(0, 0, 0, 0.2)',
                borderwidth=1
            ),
            scene=dict(
                xaxis_title='UMAP Component 1',
                yaxis_title='UMAP Component 2',
                zaxis_title='UMAP Component 3',
                aspectmode='cube'
            ),
            margin=dict(l=10, r=10, t=50, b=50)
        )
        
        # Make 2D plot 50% more zoomed out by expanding the axis ranges
        x_min = umap_result_2d[:, 0].min()
        x_max = umap_result_2d[:, 0].max()
        y_min = umap_result_2d[:, 1].min()
        y_max = umap_result_2d[:, 1].max()
        
        x_range = x_max - x_min
        y_range = y_max - y_min
        
        # Expand ranges by 50%
        fig.update_xaxes(range=[x_min - x_range * 0.5, x_max + x_range * 0.5], row=1, col=1)
        fig.update_yaxes(range=[y_min - y_range * 0.5, y_max + y_range * 0.5], row=1, col=1)
        
        # Add cross-highlighting JavaScript
        cross_highlight_js = """
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Wait for the plots to be fully rendered
            setTimeout(function() {
                const plots = document.querySelectorAll('.js-plotly-plot');
                if (plots.length >= 2) {
                    const plot2d = plots[0];
                    const plot3d = plots[1];
                    
                    console.log("Setting up UMAP cross-highlight between 2D and 3D plots");
                    
                    // When hovering on 2D plot, highlight same point in 3D
                    plot2d.on('plotly_hover', function(data) {
                        if (data.points && data.points.length > 0 && data.points[0].customdata) {
                            const pointId = data.points[0].customdata;
                            console.log("2D hover point:", pointId);
                            
                            // Find and highlight the same point in 3D plot
                            for (let i = 0; i < plot3d.data.length; i++) {
                                const trace = plot3d.data[i];
                                if (!trace.customdata) continue;
                                
                                const index = trace.customdata.indexOf(pointId);
                                
                                if (index !== -1) {
                                    const update = {
                                        marker: {
                                            color: Array(trace.customdata.length).fill(trace.marker.color),
                                            size: Array(trace.customdata.length).fill(6),
                                            opacity: Array(trace.customdata.length).fill(0.4)
                                        }
                                    };
                                    
                                    // Highlight the matching point
                                    update.marker.size[index] = 12;
                                    update.marker.opacity[index] = 1.0;
                                    
                                    Plotly.restyle(plot3d, update, [i]);
                                    break;
                                }
                            }
                        }
                    });
                    
                    // When hovering on 3D plot, highlight same point in 2D
                    plot3d.on('plotly_hover', function(data) {
                        if (data.points && data.points.length > 0 && data.points[0].customdata) {
                            const pointId = data.points[0].customdata;
                            console.log("3D hover point:", pointId);
                            
                            // Find and highlight the same point in 2D plot
                            for (let i = 0; i < plot2d.data.length; i++) {
                                const trace = plot2d.data[i];
                                if (!trace.customdata) continue;
                                
                                const index = trace.customdata.indexOf(pointId);
                                
                                if (index !== -1) {
                                    const update = {
                                        marker: {
                                            color: Array(trace.customdata.length).fill(trace.marker.color),
                                            size: Array(trace.customdata.length).fill(10),
                                            opacity: Array(trace.customdata.length).fill(0.4)
                                        }
                                    };
                                    
                                    // Reset all points to base state
                                    for (let j = 0; j < update.marker.size.length; j++) {
                                        update.marker.size[j] = 10;
                                    }
                                    
                                    // Highlight the matching point
                                    update.marker.size[index] = 18;
                                    update.marker.opacity[index] = 1.0;
                                    
                                    Plotly.restyle(plot2d, update, [i]);
                                    break;
                                }
                            }
                        }
                    });
                    
                    // Reset highlighting when hover ends
                    plot2d.on('plotly_unhover', function() {
                        for (let i = 0; i < plot3d.data.length; i++) {
                            const trace = plot3d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot3d, {
                                'marker.size': Array(trace.customdata.length).fill(6),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                    });
                    
                    plot3d.on('plotly_unhover', function() {
                        for (let i = 0; i < plot2d.data.length; i++) {
                            const trace = plot2d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot2d, {
                                'marker.size': Array(trace.customdata.length).fill(10),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                    });
                    
                    // Handle lasso and box selection
                    plot2d.on('plotly_selected', function(eventData) {
                        if (eventData && eventData.points && eventData.points.length > 0) {
                            console.log("2D selection:", eventData.points.length, "points");
                            
                            // Get selected point IDs
                            const selectedIds = eventData.points.map(pt => pt.customdata);
                            
                            // Highlight those points in 3D
                            for (let i = 0; i < plot3d.data.length; i++) {
                                const trace = plot3d.data[i];
                                if (!trace.customdata) continue;
                                
                                const updateMarkerSize = Array(trace.customdata.length).fill(4);
                                const updateMarkerOpacity = Array(trace.customdata.length).fill(0.2);
                                
                                // Highlight selected points
                                trace.customdata.forEach((id, idx) => {
                                    if (selectedIds.includes(id)) {
                                        updateMarkerSize[idx] = 12;
                                        updateMarkerOpacity[idx] = 1.0;
                                    }
                                });
                                
                                Plotly.restyle(plot3d, {
                                    'marker.size': [updateMarkerSize],
                                    'marker.opacity': [updateMarkerOpacity]
                                }, [i]);
                            }
                        }
                    });
                    
                    plot3d.on('plotly_selected', function(eventData) {
                        if (eventData && eventData.points && eventData.points.length > 0) {
                            console.log("3D selection:", eventData.points.length, "points");
                            
                            // Get selected point IDs
                            const selectedIds = eventData.points.map(pt => pt.customdata);
                            
                            // Highlight those points in 2D
                            for (let i = 0; i < plot2d.data.length; i++) {
                                const trace = plot2d.data[i];
                                if (!trace.customdata) continue;
                                
                                const updateMarkerSize = Array(trace.customdata.length).fill(6);
                                const updateMarkerOpacity = Array(trace.customdata.length).fill(0.2);
                                
                                // Highlight selected points
                                trace.customdata.forEach((id, idx) => {
                                    if (selectedIds.includes(id)) {
                                        updateMarkerSize[idx] = 16;
                                        updateMarkerOpacity[idx] = 1.0;
                                    }
                                });
                                
                                Plotly.restyle(plot2d, {
                                    'marker.size': [updateMarkerSize],
                                    'marker.opacity': [updateMarkerOpacity]
                                }, [i]);
                            }
                        }
                    });
                    
                    // Reset when selecting is completed or cancelled
                    plot2d.on('plotly_deselect', function() {
                        console.log("2D deselect");
                        for (let i = 0; i < plot3d.data.length; i++) {
                            const trace = plot3d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot3d, {
                                'marker.size': Array(trace.customdata.length).fill(6),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                    });
                    
                    plot3d.on('plotly_deselect', function() {
                        console.log("3D deselect");
                        for (let i = 0; i < plot2d.data.length; i++) {
                            const trace = plot2d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot2d, {
                                'marker.size': Array(trace.customdata.length).fill(10),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                    });
                    
                    // Add utility button to reset both plots
                    const resetButton = document.createElement('button');
                    resetButton.innerText = 'Reset Views';
                    resetButton.className = 'reset-views-btn';
                    resetButton.style.position = 'absolute';
                    resetButton.style.top = '10px';
                    resetButton.style.left = '10px';
                    resetButton.style.zIndex = '999';
                    resetButton.style.padding = '5px 10px';
                    resetButton.style.background = '#fff';
                    resetButton.style.border = '1px solid #ddd';
                    resetButton.style.borderRadius = '4px';
                    resetButton.style.cursor = 'pointer';
                    
                    resetButton.addEventListener('click', function() {
                        Plotly.relayout(plot2d, {
                            'xaxis.autorange': true,
                            'yaxis.autorange': true
                        });
                        
                        Plotly.relayout(plot3d, {
                            'scene.camera': {
                                up: {x: 0, y: 0, z: 1},
                                center: {x: 0, y: 0, z: 0},
                                eye: {x: 1.25, y: 1.25, z: 1.25}
                            }
                        });
                        
                        // Reset all points to default state
                        for (let i = 0; i < plot2d.data.length; i++) {
                            const trace = plot2d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot2d, {
                                'marker.size': Array(trace.customdata.length).fill(10),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                        
                        for (let i = 0; i < plot3d.data.length; i++) {
                            const trace = plot3d.data[i];
                            if (!trace.customdata) continue;
                            
                            Plotly.restyle(plot3d, {
                                'marker.size': Array(trace.customdata.length).fill(6),
                                'marker.opacity': Array(trace.customdata.length).fill(0.8)
                            }, [i]);
                        }
                    });
                    
                    const plotContainer = document.querySelector('.plot-container');
                    if (plotContainer) {
                        plotContainer.style.position = 'relative';
                        plotContainer.appendChild(resetButton);
                    }
                    
                    console.log("UMAP cross-highlight setup complete");
                }
            }, 500); // Wait for plots to be fully rendered
        });
        </script>
        """
        
        # Convert the Plotly figure to HTML
        plot_html = fig.to_html(include_plotlyjs='cdn', full_html=False) + cross_highlight_js
        
        # Create sequence data array with 2D and 3D coordinates for use in alignment and phylogeny
        sequence_data = []
        for i, seq_id in enumerate(seq_ids):
            sequence_data.append({
                'id': seq_id,
                'name': names[i],
                'sequence': sequences_data[i]['sequence'],
                'source': labels[i],
                'coords_2d': {
                    'x': float(umap_result_2d[i, 0]),
                    'y': float(umap_result_2d[i, 1])
                },
                'coords_3d': {
                    'x': float(umap_result_3d[i, 0]),
                    'y': float(umap_result_3d[i, 1]),
                    'z': float(umap_result_3d[i, 2])
                }
            })
        
        # Generate plot HTML using plotly
        plot_html = plotly.io.to_html(fig, full_html=False, include_plotlyjs=False)
        logger.info("UMAP visualization complete")
        
        # Prepare the return data
        result = {
            'success': True,
            'plot_html': plot_html,
            'plot_data': fig.data,  # Include raw plot data for direct rendering
            'points': len(sequences),
            'reference_count': labels.count('reference'),
            'candidate_count': labels.count('candidate'),
            'timestamp': datetime.now().isoformat(),
            'sequence_data': sequences_data
        }
        
        # Add SHAP analysis results if available
        if shap_result and shap_result.get('success'):
            result['shap_html'] = shap_result.get('shap_html')
            result['shap_data'] = shap_result.get('feature_importance')
            result['waterfall_html'] = shap_result.get('waterfall_html')
            result['waterfall_data'] = shap_result.get('waterfall_data')
            
        # Convert any numpy arrays to Python native types for JSON serialization
        try:
            result = sanitize_json(result)
        except Exception as e:
            logger.error(f"Error sanitizing JSON: {e}")
            
        return result
    except Exception as e:
        logger.error(f"Error generating UMAP visualization: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Error generating UMAP visualization: {str(e)}"
        } 

def generate_multiple_sequence_alignment(sequence_data):
    """
    Generate multiple sequence alignment visualization using Clustal Omega
    
    Args:
        sequence_data (list): List of sequence data dictionaries with id, name, sequence, etc.
        
    Returns:
        dict: Result with success status and alignment visualization
    """
    try:
        if not sequence_data or len(sequence_data) < 2:
            return {
                'success': False,
                'message': 'Multiple sequence alignment requires at least 2 sequences'
            }
        
        logger.info(f"Generating multiple sequence alignment for {len(sequence_data)} sequences")
        
        # Create temporary files for input and output
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.fasta', delete=False) as input_file, \
             tempfile.NamedTemporaryFile(mode='w+', suffix='.clustal', delete=False) as output_file:
            
            input_path = input_file.name
            output_path = output_file.name
            
            # Write sequences to input FASTA file
            for seq in sequence_data:
                input_file.write(f">{seq['id']}_{seq['name']}\n{seq['sequence']}\n")
            input_file.flush()
            
            # Check if Clustal Omega is installed
            try:
                # Try to run Clustal Omega command
                clustal_cmd = ClustalOmegaCommandline(
                    infile=input_path,
                    outfile=output_path,
                    verbose=True,
                    auto=True,
                    force=True
                )
                logger.info(f"Running Clustal Omega: {str(clustal_cmd)}")
                stdout, stderr = clustal_cmd()
                logger.info("Clustal Omega alignment complete")
                
                # Read the alignment file
                alignment = AlignIO.read(output_path, "clustal")
                logger.info(f"Read alignment with {len(alignment)} sequences of length {alignment.get_alignment_length()}")
                
                # Create alignment visualization using Plotly
                fig = generate_msa_visualization(alignment, sequence_data)
                
                # Convert to HTML
                msa_html = fig.to_html(include_plotlyjs='cdn', full_html=False)
                
                # Return result
                return {
                    'success': True,
                    'msa_html': msa_html,
                    'alignment_length': alignment.get_alignment_length(),
                    'num_sequences': len(alignment)
                }
                
            except Exception as e:
                logger.error(f"Error running Clustal Omega: {e}")
                logger.info("Falling back to Bio.Align for MSA")
                
                # Fallback to manual alignment using Biopython
                records = []
                for seq in sequence_data:
                    records.append(SeqRecord(
                        Seq(seq['sequence']),
                        id=f"{seq['id']}_{seq['name']}",
                        name=seq['name'],
                        description=""
                    ))
                
                # Create a simple alignment (this is not as good as Clustal Omega)
                from Bio import pairwise2
                from Bio.Align import MultipleSeqAlignment
                
                # Start with the first sequence
                aligned_records = [records[0]]
                
                # For each remaining sequence, align it to the first one
                for record in records[1:]:
                    # Align this sequence to the first one
                    alignments = pairwise2.align.globalms(
                        str(records[0].seq), 
                        str(record.seq),
                        2, -1, -0.5, -0.1
                    )
                    
                    # Get the best alignment
                    if alignments:
                        best = alignments[0]
                        # Create new sequence with gaps
                        aligned_seq = SeqRecord(
                            Seq(best.seqB),
                            id=record.id,
                            name=record.name,
                            description=""
                        )
                        aligned_records.append(aligned_seq)
                    else:
                        # If alignment fails, just add the original sequence
                        aligned_records.append(record)
                
                # Create a MultipleSeqAlignment object
                alignment = MultipleSeqAlignment(aligned_records)
                
                # Create alignment visualization using Plotly
                fig = generate_msa_visualization(alignment, sequence_data)
                
                # Convert to HTML
                msa_html = fig.to_html(include_plotlyjs='cdn', full_html=False)
                
                # Return result
                return {
                    'success': True,
                    'msa_html': msa_html,
                    'alignment_length': len(aligned_records[0].seq),
                    'num_sequences': len(aligned_records),
                    'note': "Using Biopython alignment (Clustal Omega not available)"
                }
    
    except Exception as e:
        logger.error(f"Error generating multiple sequence alignment: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Error generating multiple sequence alignment: {str(e)}"
        }
    finally:
        # Clean up temporary files
        try:
            if 'input_path' in locals() and os.path.exists(input_path):
                os.unlink(input_path)
            if 'output_path' in locals() and os.path.exists(output_path):
                os.unlink(output_path)
        except Exception as e:
            logger.error(f"Error cleaning up temporary files: {e}")

def generate_msa_visualization(alignment, sequence_data):
    """
    Generate MSA visualization using Plotly
    
    Args:
        alignment: Bio.Align.MultipleSeqAlignment object
        sequence_data: List of sequence data dictionaries
        
    Returns:
        plotly.graph_objects.Figure: Plotly figure for MSA
    """
    # Map sequence types based on ID
    seq_types = {}
    for seq in sequence_data:
        seq_types[f"{seq['id']}_{seq['name']}"] = seq['source']
    
    # Color scheme for amino acids (Clustal-like)
    aa_colors = {
        'A': '#80a0f0',  # blue
        'R': '#f01505',  # red
        'N': '#00ff00',  # green
        'D': '#c048c0',  # purple
        'C': '#f08080',  # pink
        'Q': '#00ff00',  # green
        'E': '#c048c0',  # purple
        'G': '#f09048',  # orange
        'H': '#15a4a4',  # cyan
        'I': '#80a0f0',  # blue
        'L': '#80a0f0',  # blue
        'K': '#f01505',  # red
        'M': '#80a0f0',  # blue
        'F': '#80a0f0',  # blue
        'P': '#ffff00',  # yellow
        'S': '#00ff00',  # green
        'T': '#00ff00',  # green
        'W': '#80a0f0',  # blue
        'Y': '#15a4a4',  # cyan
        'V': '#80a0f0',  # blue
        '-': '#ffffff',  # white (gap)
        '.': '#ffffff',  # white (gap)
        '*': '#ffffff'   # white (stop)
    }
    
    # Default color for any other character
    default_color = '#cccccc'  # light gray
    
    # Create figure
    fig = go.Figure()
    
    # Process each sequence in the alignment
    for i, record in enumerate(alignment):
        seq_id = record.id
        sequence = str(record.seq)
        
        # Get sequence type (reference or candidate)
        seq_type = seq_types.get(seq_id, 'unknown')
        
        # Prepare data for visualization
        x_positions = []
        y_positions = []
        colors = []
        hover_texts = []
        text_labels = []
        
        for j, aa in enumerate(sequence):
            x_positions.append(j)
            y_positions.append(i)
            colors.append(aa_colors.get(aa, default_color))
            hover_texts.append(f"Sequence: {seq_id}<br>Position: {j+1}<br>Amino Acid: {aa}")
            text_labels.append(aa)
        
        # Add markers for each amino acid
        fig.add_trace(go.Scatter(
            x=x_positions,
            y=y_positions,
            mode='markers',
            marker=dict(
                color=colors,
                size=15,
                symbol='square',
                line=dict(color='rgba(0,0,0,0.3)', width=0.5)
            ),
            text=text_labels,
            hoverinfo='text',
            hovertext=hover_texts,
            showlegend=False
        ))
        
        # Add text labels for amino acids
        fig.add_trace(go.Scatter(
            x=x_positions,
            y=y_positions,
            mode='text',
            text=text_labels,
            textfont=dict(
                family='monospace',
                size=12,
                color='black'
            ),
            hoverinfo='text',
            hovertext=hover_texts,
            showlegend=False
        ))
        
        # Add sequence labels on the left side
        truncated_id = seq_id[:25] + "..." if len(seq_id) > 25 else seq_id
        border_color = '#FFD700' if seq_type == 'reference' else '#167A6E'
        
        fig.add_annotation(
            x=-1,
            y=i,
            text=truncated_id,
            showarrow=False,
            font=dict(
                family='monospace',
                size=11,
                color='black'
            ),
            bgcolor='rgba(255,255,255,0.7)',
            bordercolor=border_color,
            borderwidth=2,
            borderpad=2,
            xanchor='right',
            yanchor='middle'
        )
    
    # Add title and axis labels
    fig.update_layout(
        title='Multiple Sequence Alignment',
        showlegend=False,
        xaxis=dict(
            title='Position',
            showgrid=False,
            zeroline=False,
            showticklabels=True,
            range=[-2, alignment.get_alignment_length() + 1]
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            showticklabels=False,
            range=[-1, len(alignment) + 1]
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        dragmode='pan',
        height=max(400, 30 * len(alignment) + 100),
        width=min(1200, 10 * alignment.get_alignment_length() + 150),
        margin=dict(l=120, r=20, t=70, b=50)
    )
    
    # Add sequence count and length annotations
    fig.add_annotation(
        x=0.5,
        y=1.05,
        xref='paper',
        yref='paper',
        text=f"Aligned {len(alignment)} sequences ({alignment.get_alignment_length()} positions)",
        showarrow=False,
        font=dict(size=14),
        align='center'
    )
    
    # Add color legends for amino acids
    legend_items = []
    for aa, color in sorted(aa_colors.items()):
        if aa not in ['-', '.', '*']:  # Skip gap and stop symbols
            legend_items.append({
                'name': aa,
                'color': color
            })
    
    legend_x = alignment.get_alignment_length() + 2
    for i, item in enumerate(legend_items):
        fig.add_trace(go.Scatter(
            x=[legend_x],
            y=[i],
            mode='markers+text',
            text=[item['name']],
            textposition='middle right',
            marker=dict(
                color=item['color'],
                size=15,
                symbol='square',
                line=dict(color='rgba(0,0,0,0.3)', width=0.5)
            ),
            showlegend=False
        ))
    
    # Add a legend title
    fig.add_annotation(
        x=legend_x,
        y=-1,
        text="AA Legend",
        showarrow=False,
        font=dict(size=12, color='black'),
        bgcolor='rgba(255,255,255,0.7)',
        bordercolor='black',
        borderwidth=1,
        borderpad=2,
        xanchor='left',
        yanchor='top'
    )
    
    # Set up range slider and buttons for navigation
    axis_range = [0, alignment.get_alignment_length()]
    fig.update_layout(
        xaxis=dict(
            range=axis_range,
            rangeslider=dict(visible=True),
            type='linear'
        )
    )
    
    # Add buttons for visibility control and interactivity
    fig.update_layout(
        updatemenus=[
            dict(
                type="buttons",
                direction="right",
                active=0,
                x=0.1,
                y=1.15,
                buttons=[
                    dict(
                        label="Reset View",
                        method="relayout",
                        args=[{"xaxis.range": axis_range}]
                    ),
                    dict(
                        label="Zoom In",
                        method="relayout",
                        args=[{"xaxis.range": [axis_range[0], (axis_range[1] - axis_range[0]) / 2 + axis_range[0]]}]
                    ),
                    dict(
                        label="Zoom Out",
                        method="relayout",
                        args=[{"xaxis.range": [axis_range[0] - (axis_range[1] - axis_range[0]) / 4, 
                                               axis_range[1] + (axis_range[1] - axis_range[0]) / 4]}]
                    )
                ]
            )
        ]
    )
    
    # Add pan/zoom info annotation
    fig.add_annotation(
        x=1.0,
        y=1.10,
        xref='paper',
        yref='paper',
        text="Drag to pan, scroll to zoom, double-click to reset view",
        showarrow=False,
        font=dict(size=12, color='gray'),
        align='right'
    )
    
    return fig

def generate_phylogenetic_tree(sequence_data):
    """
    Generate phylogenetic tree visualization using Biopython and Plotly
    
    Args:
        sequence_data (list): List of sequence data dictionaries with id, name, sequence, etc.
        
    Returns:
        dict: Result with success status and phylogenetic tree visualization
    """
    try:
        if not sequence_data or len(sequence_data) < 3:
            return {
                'success': False,
                'message': 'Phylogenetic tree requires at least 3 sequences'
            }
        
        logger.info(f"Generating phylogenetic tree for {len(sequence_data)} sequences")
        
        # Create records from sequence data
        records = []
        for seq in sequence_data:
            records.append(SeqRecord(
                Seq(seq['sequence']),
                id=f"{seq['id']}_{seq['name']}",
                name=seq['name'],
                description=""
            ))
        
        # First, generate a multiple sequence alignment
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.fasta', delete=False) as input_file, \
             tempfile.NamedTemporaryFile(mode='w+', suffix='.clustal', delete=False) as output_file:
            
            input_path = input_file.name
            output_path = output_file.name
            
            # Write sequences to input FASTA file
            SeqIO.write(records, input_file, "fasta")
            input_file.flush()
            
            try:
                # Try to run Clustal Omega command
                clustal_cmd = ClustalOmegaCommandline(
                    infile=input_path,
                    outfile=output_path,
                    verbose=True,
                    auto=True,
                    force=True
                )
                logger.info(f"Running Clustal Omega: {str(clustal_cmd)}")
                stdout, stderr = clustal_cmd()
                logger.info("Clustal Omega alignment complete")
                
                # Read the alignment file
                alignment = AlignIO.read(output_path, "clustal")
                logger.info(f"Read alignment with {len(alignment)} sequences of length {alignment.get_alignment_length()}")
                
            except Exception as e:
                logger.error(f"Error running Clustal Omega: {e}")
                logger.info("Falling back to simple alignment")
                
                # Create a simple alignment
                alignment = MultipleSeqAlignment(records)
        
        # Calculate distance matrix
        calculator = DistanceCalculator('identity')
        dm = calculator.get_distance(alignment)
        
        # Construct tree
        constructor = DistanceTreeConstructor()
        tree = constructor.upgma(dm)
        
        # Generate Plotly visualization of the tree
        fig = generate_tree_visualization(tree, sequence_data)
        
        # Convert to HTML
        tree_html = fig.to_html(include_plotlyjs='cdn', full_html=False)
        
        # Generate Newick format string for the tree
        newick_file = io.StringIO()
        Phylo.write(tree, newick_file, 'newick')
        newick_str = newick_file.getvalue()
        
        # Return results
        return {
            'success': True,
            'tree_html': tree_html,
            'newick': newick_str,
            'num_sequences': len(alignment)
        }
        
    except Exception as e:
        logger.error(f"Error generating phylogenetic tree: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Error generating phylogenetic tree: {str(e)}"
        }
    finally:
        # Clean up temporary files
        try:
            if 'input_path' in locals() and os.path.exists(input_path):
                os.unlink(input_path)
            if 'output_path' in locals() and os.path.exists(output_path):
                os.unlink(output_path)
        except Exception as e:
            logger.error(f"Error cleaning up temporary files: {e}")

def generate_tree_visualization(tree, sequence_data):
    """
    Generate tree visualization using Plotly
    
    Args:
        tree: Bio.Phylo.BaseTree.Tree object
        sequence_data: List of sequence data dictionaries
        
    Returns:
        plotly.graph_objects.Figure: Plotly figure for phylogenetic tree
    """
    # Map sequence types based on ID
    seq_types = {}
    for seq in sequence_data:
        seq_id = f"{seq['id']}_{seq['name']}"
        seq_types[seq_id] = {
            'source': seq['source'],
            'sequence': seq['sequence'],
            'name': seq['name']
        }
    
    # Create tree coordinates
    coords = {}
    max_depth = 0
    
    def get_leaf_names(clade):
        """Get names of leaf nodes in the clade"""
        return [leaf.name for leaf in clade.get_terminals()]
    
    def calc_row(clade, row, depth):
        """Calculate row and depth for plotting"""
        nonlocal max_depth
        if depth > max_depth:
            max_depth = depth
            
        if clade.is_terminal():
            coords[clade] = (depth, row)
            return 1
        else:
            rows_needed = 0
            for subclade in clade:
                rows_needed += calc_row(subclade, row + rows_needed, depth + 1)
            coords[clade] = (depth, row + rows_needed / 2)
            return rows_needed
    
    calc_row(tree.root, 0, 0)
    
    # Create figure
    fig = go.Figure()
    
    # Colors for different sequence types
    colors = {
        'reference': '#FFD700',  # Gold
        'candidate': '#167A6E',  # Teal
        'unknown': '#CCCCCC'     # Gray
    }
    
    # Draw edges as line segments
    for clade in tree.find_clades(order='preorder'):
        if clade != tree.root:
            parent = clade.parent
            px, py = coords[parent]
            cx, cy = coords[clade]
            
            # Horizontal line from parent to this clade's x-coord
            fig.add_trace(go.Scatter(
                x=[px, cx],
                y=[py, py],
                mode='lines',
                line=dict(color='black', width=1),
                hoverinfo='none',
                showlegend=False
            ))
            
            # Vertical line to this clade's y-coord
            fig.add_trace(go.Scatter(
                x=[cx, cx],
                y=[py, cy],
                mode='lines',
                line=dict(color='black', width=1),
                hoverinfo='none',
                showlegend=False
            ))
    
    # Add markers and labels for leaf nodes
    for clade in tree.get_terminals():
        x, y = coords[clade]
        
        # Get sequence type for coloring
        seq_type = seq_types.get(clade.name, {}).get('source', 'unknown')
        color = colors.get(seq_type, colors['unknown'])
        
        # Node marker
        fig.add_trace(go.Scatter(
            x=[x],
            y=[y],
            mode='markers',
            marker=dict(
                color=color,
                size=10,
                line=dict(color='black', width=1)
            ),
            name=seq_type.capitalize(),
            hoverinfo='text',
            hovertext=[f"Sequence: {clade.name}<br>Type: {seq_type.capitalize()}"],
            showlegend=True
        ))
        
        # Sequence info
        seq_info = seq_types.get(clade.name, {})
        sequence = seq_info.get('sequence', '')
        name = seq_info.get('name', clade.name)
        
        # Label
        truncated_name = name[:30] + "..." if len(name) > 30 else name
        
        fig.add_trace(go.Scatter(
            x=[x + 0.1],
            y=[y],
            mode='text',
            text=[truncated_name],
            textposition='middle right',
            textfont=dict(
                family='Arial',
                size=11,
                color='black'
            ),
            hoverinfo='text',
            hovertext=[f"Sequence: {name}<br>Type: {seq_type.capitalize()}<br>Length: {len(sequence)}"],
            showlegend=False
        ))
    
    # Add markers for internal nodes
    for clade in tree.get_nonterminals():
        x, y = coords[clade]
        
        fig.add_trace(go.Scatter(
            x=[x],
            y=[y],
            mode='markers',
            marker=dict(
                color='white',
                size=7,
                line=dict(color='black', width=1)
            ),
            hoverinfo='text',
            hovertext=[get_leaf_names(clade)],
            showlegend=False
        ))
    
    # Update layout
    fig.update_layout(
        title='Phylogenetic Tree',
        showlegend=True,
        legend=dict(
            title="Sequence Types",
            traceorder="normal", 
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01,
            bgcolor='rgba(255,255,255,0.8)',
            bordercolor='rgba(0,0,0,0.2)',
            borderwidth=1
        ),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            showticklabels=False,
            title='Evolutionary Distance'
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            showticklabels=False,
            scaleanchor="x",
            scaleratio=1
        ),
        plot_bgcolor='rgba(255,255,255,1)',
        height=max(500, 30 * len(tree.get_terminals()) + 100),
        width=800,
        margin=dict(l=20, r=200, t=70, b=50),
        hovermode='closest'
    )
    
    # Add an annotation explaining how to interact with the tree
    fig.add_annotation(
        x=0.5,
        y=1.05,
        xref='paper',
        yref='paper',
        text="Phylogenetic Tree of Bacteriocin Sequences",
        showarrow=False,
        font=dict(size=15),
        align='center'
    )
    
    fig.add_annotation(
        x=0.5,
        y=1.02,
        xref='paper',
        yref='paper',
        text="Hover over nodes for more information, drag to pan, scroll to zoom",
        showarrow=False,
        font=dict(size=12, color='gray'),
        align='center'
    )
    
    # Add a scale bar
    scale_length = max_depth / 10
    scale_x = max_depth * 1.1
    scale_y = -1
    
    fig.add_shape(
        type="line",
        x0=scale_x,
        y0=scale_y,
        x1=scale_x + scale_length,
        y1=scale_y,
        line=dict(
            color="black",
            width=2
        )
    )
    
    fig.add_annotation(
        x=scale_x + scale_length/2,
        y=scale_y - 1,
        text=f"{scale_length:.2f} distance",
        showarrow=False,
        font=dict(size=10)
    )
    
    return fig 