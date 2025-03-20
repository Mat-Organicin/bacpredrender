from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from Bio import SeqIO, Entrez
from io import StringIO
import tempfile
import os
import json
from bacpred import BacteriocinPredictor, ensure_model_trained
import database  # Import our database module
from psycopg2.extras import RealDictCursor
from database import get_connection
from datetime import datetime
import logging
import random
import string
import threading
import time
import traceback
from decimal import Decimal
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_file
import pandas as pd
import numpy as np

try:
    from config import get_config
    config = get_config()
except ImportError:
    # Fallback for backward compatibility
    class DefaultConfig:
        DEBUG = True
        SECRET_KEY = 'dev-key-change-in-production'
    config = DefaultConfig()

app = Flask(__name__)
app.config.from_object(config)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Set email for NCBI API
Entrez.email = "mat@organicin.scientific"

# Ensure the BacPred model is trained at startup
BACPRED_MODEL_READY = ensure_model_trained()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add sample bacteriocins if collection is empty
def ensure_sample_bacteriocins():
    """Add sample bacteriocins to the collection if it's empty"""
    try:
        # Check if collection is empty
        conn = database.get_connection()
        if not conn:
            logger.error("Failed to get database connection")
            return
        
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM bacteriocin_collection")
        count = cursor.fetchone()[0]
        database.release_connection(conn)
        
        if count > 0:
            logger.info(f"Collection has {count} bacteriocins, no need to add samples")
            return
        
        # Add sample bacteriocins if collection is empty
        logger.info("Collection is empty, adding sample bacteriocins")
        
        # Sample reference bacteriocins (high probability)
        sample_references = [
            {
                "id": "P20384",
                "name": "Nisin A",
                "sequence": "ITSISLCTPGCKTGALMGCNMKTATCHCSIHVSK",
                "probability": 1.0
            },
            {
                "id": "P0A4W9",
                "name": "Subtilin",
                "sequence": "WKSESLCTPGCVTGALQTCFLQTLTCNCKISK",
                "probability": 1.0
            },
            {
                "id": "P84154",
                "name": "Mutacin III",
                "sequence": "DVNFCTTGITQFWCSNGYCCY",
                "probability": 0.98
            }
        ]
        
        # Sample candidate bacteriocins (moderate probability)
        sample_candidates = [
            {
                "id": "SAMPLE1",
                "name": "Candidate 1",
                "sequence": "MKAQLVKKAIESLEVTGQKQIKGTIDKLVDAFKDGSIDFSKEFGVAKLDVKDATNKWDAAGIIK",
                "probability": 0.72
            },
            {
                "id": "SAMPLE2",
                "name": "Candidate 2",
                "sequence": "MGSKSLAKALLSHGLVCADHALKGEYTAYAADKAAAFGAALGAFGCGGGW",
                "probability": 0.85
            },
            {
                "id": "SAMPLE3",
                "name": "Candidate 3",
                "sequence": "MKQLNKFLLSLCAAGMAAQADYLKKKKDASLGDILKFHSAIYGAGKDIFEIYDNQKCNWAANYGKLCKDNKDYEGLWIYYDPNCGSCCLNSEKCMDAIKHNDNKKIIVDYVKKH",
                "probability": 0.66
            }
        ]
        
        # Add samples to collection
        for sample in sample_references + sample_candidates:
            result = database.add_bacteriocin(
                sample["id"], 
                sample["name"], 
                sample["sequence"], 
                sample["probability"]
            )
            if result["success"]:
                logger.info(f"Added sample bacteriocin: {sample['name']}")
            else:
                logger.warning(f"Failed to add sample: {result['message']}")
        
        # Create a sample vault and bag if none exist
        conn = database.get_connection()
        if not conn:
            logger.error("Failed to get database connection")
            return
        
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM vaults")
        vault_count = cursor.fetchone()[0]
        
        if vault_count == 0:
            vault_result = database.create_vault("Reference Bacteriocins", "Collection of known bacteriocins")
            if vault_result["success"]:
                vault_id = vault_result["id"]
                logger.info(f"Created sample vault with ID {vault_id}")
                
                # Add reference samples to vault
                for sample in sample_references:
                    # Get the bacteriocin ID from the database
                    cursor.execute("SELECT id FROM bacteriocin_collection WHERE sequence_id = %s", (sample["id"],))
                    row = cursor.fetchone()
                    if row:
                        bacteriocin_id = row[0]
                        database.add_to_vault(vault_id, bacteriocin_id)
                        logger.info(f"Added {sample['name']} to sample vault")
        
        cursor.execute("SELECT COUNT(*) FROM bags")
        bag_count = cursor.fetchone()[0]
        
        if bag_count == 0:
            bag_result = database.create_bag("Candidate Bacteriocins", "Collection of candidate bacteriocins")
            if bag_result["success"]:
                bag_id = bag_result["id"]
                logger.info(f"Created sample bag with ID {bag_id}")
                
                # Add candidate samples to bag
                for sample in sample_candidates:
                    # Get the bacteriocin ID from the database
                    cursor.execute("SELECT id FROM bacteriocin_collection WHERE sequence_id = %s", (sample["id"],))
                    row = cursor.fetchone()
                    if row:
                        bacteriocin_id = row[0]
                        database.add_to_bag(bag_id, bacteriocin_id)
                        logger.info(f"Added {sample['name']} to sample bag")
        
        database.release_connection(conn)
        
    except Exception as e:
        logger.error(f"Error ensuring sample bacteriocins: {str(e)}")

# Load reference bacteriocins from positive datasets - only on first run
BACPRED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'BacPred')
POSITIVE_DATASETS_PATH = os.path.join(BACPRED_DIR, 'positive_datasets.fasta')

# Check if we need to load reference bacteriocins
conn = None
try:
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM bacteriocin_collection WHERE probability = 1.0")
    reference_count = cursor.fetchone()[0]
    
    # Only load reference bacteriocins if there are none in the database
    if reference_count == 0 and os.path.exists(POSITIVE_DATASETS_PATH):
        logger.info(f"No reference bacteriocins found. Loading from {POSITIVE_DATASETS_PATH}")
        result = database.load_reference_bacteriocins(POSITIVE_DATASETS_PATH)
        if result['success']:
            logger.info(f"Successfully loaded {result['count']} reference bacteriocins")
        else:
            logger.error(f"Failed to load reference bacteriocins: {result['message']}")
    else:
        logger.info(f"Database already has {reference_count} reference bacteriocins, skipping load")
except Exception as e:
    logger.error(f"Error checking reference bacteriocins: {str(e)}")
finally:
    if conn:
        database.release_connection(conn)

# Update existing bacteriocin names to properly split ID and name
result = database.update_bacteriocin_names()
if result['success']:
    app.logger.info(f"Successfully updated {result['count']} bacteriocin names")
else:
    app.logger.error(f"Failed to update bacteriocin names: {result['message']}")

# Ensure we have sample data
ensure_sample_bacteriocins()

@app.route('/')
def index():
    return render_template('index.html', model_ready=BACPRED_MODEL_READY)

@app.route('/test')
def test():
    return "Hello, World! The server is working."

@app.route('/test_route')
def test_route():
    """Simple test endpoint to verify server is running"""
    return "Server is running!"

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'fastaFile' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['fastaFile']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        try:
            sequences = []
            for record in SeqIO.parse(file_path, "fasta"):
                sequences.append({
                    'header': record.id,
                    'description': record.description,
                    'sequence': str(record.seq)
                })
            
            return jsonify({"sequences": sequences})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        return jsonify({"error": "File type not allowed"}), 400

@app.route('/search', methods=['POST'])
def search_sequences():
    data = request.json
    query = data.get('query', '')
    search_type = data.get('type', 'all')
    seq_length = data.get('length', 'any')
    
    if not query:
        return jsonify({"error": "Search query is required"}), 400
    
    try:
        # Build Entrez query
        entrez_query = query
        
        if search_type == 'species':
            entrez_query = f"{query}[Organism]"
        elif search_type == 'keywords':
            entrez_query = f"{query}[Keyword]"
        
        # Search in protein database
        search_handle = Entrez.esearch(db="protein", term=entrez_query, retmax=20)
        search_results = Entrez.read(search_handle)
        search_handle.close()
        
        if not search_results['IdList']:
            return jsonify({"sequences": []})
        
        # Fetch sequences
        fetch_handle = Entrez.efetch(db="protein", id=search_results['IdList'], rettype="fasta", retmode="text")
        sequences_raw = fetch_handle.read()
        fetch_handle.close()
        
        # Parse sequences
        sequences = []
        fasta_io = StringIO(sequences_raw)
        for record in SeqIO.parse(fasta_io, "fasta"):
            seq_len = len(record.seq)
            
            # Apply length filter
            include = True
            if seq_length == 'short' and seq_len >= 100:
                include = False
            elif seq_length == 'medium' and (seq_len < 100 or seq_len > 300):
                include = False
            elif seq_length == 'long' and seq_len <= 300:
                include = False
            
            if include:
                sequences.append({
                    'header': record.id,
                    'description': record.description,
                    'sequence': str(record.seq)
                })
        
        return jsonify({"sequences": sequences})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/process', methods=['POST'])
def process_sequence():
    data = request.json
    sequence_name = data.get('name', '')
    sequence = data.get('sequence', '')
    
    if not sequence:
        return jsonify({"error": "Sequence is required"}), 400
    
    try:
        # Format the sequence for BioPython
        fasta = f">{sequence_name}\n{sequence}"
        sequences = []
        
        fasta_io = StringIO(fasta)
        for record in SeqIO.parse(fasta_io, "fasta"):
            sequences.append({
                'header': record.id,
                'description': record.description,
                'sequence': str(record.seq)
            })
        
        return jsonify({"sequences": sequences})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict_bacteriocin():
    if not BACPRED_MODEL_READY:
        return jsonify({'error': 'BacPred model is not ready. Please check server logs.'}), 500
    
    # Get sequences from the request
    data = request.get_json()
    app.logger.info(f"Predict request received with data: {data}")
    sequences = data.get('sequences', [])
    
    if not sequences:
        app.logger.warning("No sequences provided for prediction")
        return jsonify({'error': 'No sequences provided for prediction'}), 400
    
    try:
        app.logger.info(f"Processing {len(sequences)} sequences for prediction")
        # Sample sequence for debugging
        if sequences:
            app.logger.info(f"Sample sequence: {sequences[0]}")
        
        # Create a new predictor instance
        predictor = BacteriocinPredictor()
        
        # Format the sequences for prediction
        seq_tuples = []
        for i, seq in enumerate(sequences):
            try:
                # Handle different structure types that might be coming from frontend
                if isinstance(seq, str):
                    header = f"Sequence_{i+1}"
                    sequence = seq
                else:
                    header = seq.get('header', seq.get('description', f"Sequence_{i+1}"))
                    sequence = seq.get('sequence', '')
                    
                    # If sequence is missing but we have a content field (which some APIs might use)
                    if not sequence and 'content' in seq:
                        sequence = seq.get('content', '')
                
                if sequence:
                    app.logger.debug(f"Adding sequence {i}: {header} (length: {len(sequence)})")
                    seq_tuples.append((header, sequence))
                else:
                    app.logger.warning(f"Skipping sequence {i} ({header}): Empty sequence")
            except Exception as seq_error:
                app.logger.error(f"Error processing sequence {i}: {str(seq_error)}")
        
        app.logger.info(f"Formatted {len(seq_tuples)} sequences for prediction")
        
        # Run prediction
        results = predictor.predict(seq_tuples)
        app.logger.info(f"Prediction completed with {len(results)} results")
        
        # Process results to extract the name part from the header
        for result in results:
            header = result.get('header', '')
            # Split the header on the first space to separate ID and name
            parts = header.split(' ', 1)
            result['sequence_id'] = parts[0]
            result['name'] = parts[1] if len(parts) > 1 else parts[0]
        
        # Return the results
        return jsonify({'predictions': results})
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        app.logger.error(f"Prediction error: {str(e)}\n{error_details}")
        return jsonify({'error': str(e), 'details': error_details}), 500

@app.route('/download', methods=['POST'])
def download_fasta():
    data = request.json
    sequences = data.get('sequences', [])
    
    if not sequences:
        return jsonify({"error": "No sequences provided"}), 400
    
    try:
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.fasta') as temp:
            for seq in sequences:
                header = seq.get('header', seq.get('description', 'Sequence'))
                sequence = seq.get('sequence', '')
                temp.write(f">{header}\n{sequence}\n".encode())
        
        return send_file(temp.name, as_attachment=True, download_name='sequences.fasta')
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/collection', methods=['GET'])
def api_get_collection():
    """API endpoint to get all bacteriocins in the collection"""
    try:
        # Log that we're entering this function
        app.logger.info("API get_collection called")
        
        # Get query parameters
        search = request.args.get('search', '')
        sort_by = request.args.get('sort', 'date-desc')
        debug = request.args.get('debug', 'false').lower() == 'true'
        
        app.logger.info(f"Fetching bacteriocins with search='{search}', sort_by='{sort_by}', debug={debug}")
        
        # Use our database function to get the data with vault and bag info
        result = database.get_bacteriocin_collection(search, sort_by)
        
        app.logger.info(f"get_bacteriocin_collection returned success: {result.get('success', False)}, data count: {len(result.get('data', []))}")
        
        # Log the first item for debugging
        if debug and result.get('success', False) and result.get('data', []):
            first_item = result['data'][0]
            item_keys = list(first_item.keys())
            app.logger.info(f"First item keys: {item_keys}")
            app.logger.info(f"First item ID: {first_item.get('id')}, name: {first_item.get('name')}, probability: {first_item.get('probability')}")
        
        # Make sure dates are properly formatted for JSON
        if result['success'] and 'data' in result:
            for item in result['data']:
                if 'added_date' in item and isinstance(item['added_date'], datetime):
                    item['added_date'] = item['added_date'].strftime('%Y-%m-%d %H:%M:%S')
        
        # Ensure we're returning a properly formatted response
        response_data = {
            'success': result.get('success', False),
            'data': result.get('data', []),
            'message': result.get('message', ''),
            'count': len(result.get('data', [])),
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Add debug information if requested
        if debug:
            response_data['debug'] = {
                'database_info': 'PostgreSQL connection active',
                'query_params': {
                    'search': search,
                    'sort': sort_by
                }
            }
        
        app.logger.info(f"API returning {len(response_data.get('data', []))} bacteriocins")
        return jsonify(response_data)
    except Exception as e:
        app.logger.error(f"Error in api_get_collection: {str(e)}")
        import traceback
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e), 'data': []}), 500

@app.route('/add_to_collection', methods=['POST'])
def add_to_collection():
    """Add a bacteriocin to the collection"""
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['sequence_id', 'name', 'sequence', 'probability']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400
        
        # Add bacteriocin to the database
        result = database.add_bacteriocin(
            data['sequence_id'],
            data['name'],
            data['sequence'],
            data['probability']
        )
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/remove_from_collection', methods=['POST'])
def remove_from_collection():
    """Remove a bacteriocin from the collection"""
    try:
        data = request.get_json() or request.form
        bacteriocin_id = data.get('id')
        
        if not bacteriocin_id:
            return jsonify({'success': False, 'message': 'No bacteriocin ID provided'}), 400
        
        result = database.remove_bacteriocin(bacteriocin_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/rename_bacteriocin', methods=['POST'])
def rename_bacteriocin():
    """Rename a bacteriocin in the collection"""
    try:
        data = request.get_json()
        bacteriocin_id = data.get('id')
        new_name = data.get('name')
        
        if not bacteriocin_id:
            return jsonify({'success': False, 'message': 'No bacteriocin ID provided'}), 400
        
        if not new_name:
            return jsonify({'success': False, 'message': 'No name provided'}), 400
        
        # Get a database connection
        conn = database.get_connection()
        if not conn:
            return jsonify({'success': False, 'message': 'Could not connect to database'}), 500
        
        try:
            cursor = conn.cursor()
            
            # Update the bacteriocin name
            cursor.execute(
                "UPDATE bacteriocin_collection SET name = %s WHERE id = %s RETURNING id",
                (new_name, bacteriocin_id)
            )
            
            result = cursor.fetchone()
            conn.commit()
            
            if result:
                return jsonify({'success': True, 'message': 'Bacteriocin renamed successfully'})
            else:
                return jsonify({'success': False, 'message': 'Bacteriocin not found'})
        finally:
            database.release_connection(conn)
    except Exception as e:
        app.logger.error(f"Error in rename_bacteriocin: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/get_collection')
def get_collection():
    """Get all bacteriocins in the collection"""
    try:
        print("Fetching bacteriocin collection...")
        # Get the collection from the database
        result = database.get_bacteriocin_collection()
        print(f"Collection result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"Error in get_collection: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/collection_view')
def collection_view():
    """Render the collection view page"""
    search = request.args.get('search', '')
    sort_by = request.args.get('sort', 'date-desc')
    
    # Log page request
    logger.info(f"Collection view requested with search='{search}', sort_by='{sort_by}'")
    
    # Get vaults and bags
    vaults_result = database.get_vaults()
    bags_result = database.get_bags()
    
    vaults = vaults_result.get('data', []) if vaults_result.get('success', False) else []
    bags = bags_result.get('data', []) if bags_result.get('success', False) else []
    
    # Get collection data for the same-length filter
    collection_result = database.get_bacteriocin_collection()
    collection_data = collection_result.get('data', []) if collection_result.get('success', False) else []
    
    return render_template(
        'collection.html',
        vaults=vaults,
        bags=bags,
        search=search,
        sort_by=sort_by,
        collection_data=collection_data
    )

@app.route('/analysis')
def analysis_page():
    """Render the analysis page"""
    # Get vaults and bags for the selector
    vaults_result = database.get_vaults()
    bags_result = database.get_bags()
    
    # Process the results correctly
    vaults = vaults_result.get('data', []) if vaults_result.get('success', False) else []
    bags = bags_result.get('data', []) if bags_result.get('success', False) else []
    
    app.logger.info(f"Analysis page requested. Available vaults: {len(vaults)}, Available bags: {len(bags)}")
    return render_template('analysis.html', vaults=vaults, bags=bags)

@app.route('/umap_visualization')
def umap_visualization_page():
    """Render the dedicated UMAP visualization page"""
    app.logger.info("UMAP visualization page requested")
    return render_template('umap_visualization.html')

@app.route('/motifs')
def motifs_page():
    """Render the bacteriocin motifs reference page"""
    app.logger.info("Bacteriocin motifs reference page requested")
    return render_template('motifs.html')

@app.route('/prediction', methods=['POST'])
def prediction_page():
    """Render the prediction page"""
    app.logger.info("Prediction page requested")
    return render_template('prediction.html')

# === Vault and Bag Management API Endpoints ===

@app.route('/api/vaults', methods=['GET'])
def api_get_vaults():
    """Get all vaults"""
    result = database.get_vaults()
    return jsonify(result)

@app.route('/api/vaults', methods=['POST'])
def api_create_vault():
    """Create a new vault"""
    data = request.json
    name = data.get('name', '')
    description = data.get('description', '')
    
    if not name:
        return jsonify({'success': False, 'message': 'Name is required'})
    
    result = database.create_vault(name, description)
    return jsonify(result)

@app.route('/api/vaults/<int:vault_id>/items', methods=['GET'])
def api_get_vault_items(vault_id):
    """Get all items in a vault"""
    try:
        result = database.get_vault_items(vault_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_get_vault_items: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/vaults/<int:vault_id>/add_bacteriocin', methods=['POST'])
def api_add_to_vault_json(vault_id):
    """Add a bacteriocin to a vault using JSON request body"""
    data = request.get_json()
    if not data or 'bacteriocin_id' not in data:
        return jsonify({'success': False, 'message': 'Missing bacteriocin_id parameter'})
    
    bacteriocin_id = data['bacteriocin_id']
    result = database.add_to_vault(vault_id, bacteriocin_id)
    return jsonify(result)

@app.route('/api/vaults/<int:vault_id>/remove_item', methods=['POST'])
def api_remove_item_from_vault(vault_id):
    """API endpoint to remove an item from a vault"""
    try:
        data = request.get_json()
        item_id = data.get('item_id')
        
        if not item_id:
            return jsonify({'success': False, 'message': 'No item ID provided'}), 400
        
        result = database.remove_from_vault(vault_id, item_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_remove_item_from_vault: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/vaults/<int:vault_id>', methods=['DELETE'])
def api_delete_vault(vault_id):
    """API endpoint to delete a vault"""
    try:
        result = database.delete_vault(vault_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_delete_vault: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/bags', methods=['GET'])
def api_get_bags():
    """Get all bags"""
    result = database.get_bags()
    return jsonify(result)

@app.route('/api/bags', methods=['POST'])
def api_create_bag():
    """Create a new bag"""
    data = request.json
    name = data.get('name', '')
    description = data.get('description', '')
    
    if not name:
        return jsonify({'success': False, 'message': 'Name is required'})
    
    result = database.create_bag(name, description)
    return jsonify(result)

@app.route('/api/bags/<int:bag_id>/items', methods=['GET'])
def api_get_bag_items(bag_id):
    """API endpoint to get items in a bag"""
    try:
        result = database.get_bag_items(bag_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_get_bag_items: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/bags/<bag_id>/add_bacteriocin', methods=['POST'])
def api_add_to_bag_json(bag_id):
    """Add a bacteriocin to a bag using JSON request body"""
    data = request.get_json()
    if not data or 'bacteriocin_id' not in data:
        return jsonify({'success': False, 'message': 'Missing bacteriocin_id parameter'})
    
    bacteriocin_id = data['bacteriocin_id']
    result = database.add_to_bag(bag_id, bacteriocin_id)
    return jsonify(result)

@app.route('/api/bags/<bag_id>/remove_item', methods=['POST'])
def api_remove_item_from_bag(bag_id):
    """API endpoint to remove an item from a bag"""
    try:
        data = request.get_json()
        item_id = data.get('item_id')
        
        if not item_id:
            return jsonify({'success': False, 'message': 'No item ID provided'}), 400
        
        result = database.remove_item_from_bag(bag_id, item_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_remove_item_from_bag: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/bags/<bag_id>', methods=['DELETE'])
def api_delete_bag(bag_id):
    """API endpoint to delete a bag"""
    try:
        result = database.delete_bag(bag_id)
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in api_delete_bag: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

# === Analysis API Endpoints ===

@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    """API endpoint for bacteriocin analysis"""
    try:
        # Parse the request data
        data = request.get_json()
        if not data:
            app.logger.error("No JSON data in request")
            return jsonify({
                'success': False,
                'message': 'No JSON data received',
                'data': None
            })
        
        # Extract the vault and bag IDs
        vault_ids = data.get('vaults', [])
        bag_ids = data.get('bags', [])
        tool_type = data.get('tool', '')
        
        app.logger.info(f"Analysis requested for vaults: {vault_ids}, bags: {bag_ids}, tool: {tool_type}")
        
        # Ensure at least one vault or bag is selected
        if not vault_ids and not bag_ids:
            app.logger.error("No vaults or bags selected for analysis")
            return jsonify({
                'success': False,
                'message': 'At least one vault or bag must be selected',
                'data': None
            })
        
        # Process different analysis tools
        if tool_type == 'umap':
            # Import the analysis module
            import analysis
            
            # Generate UMAP visualization
            result = analysis.generate_umap_visualization(vault_ids, bag_ids)
            
            return jsonify({
                'success': result.get('success', False),
                'message': result.get('message', 'UMAP analysis completed'),
                'data': {
                    'tool': 'umap',
                    'plot_html': result.get('plot_html', ''),  # Use the HTML representation
                    'shap_html': result.get('shap_html', ''),  # SHAP feature importance visualization
                    'waterfall_html': result.get('waterfall_html', ''),  # SHAP waterfall chart
                    'points': result.get('points', 0),
                    'reference_count': result.get('reference_count', 0),
                    'candidate_count': result.get('candidate_count', 0),
                    'feature_importance': result.get('feature_importance', [])[:20],  # Top 20 features
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'sequence_data': result.get('sequence_data', [])  # For MSA and Phylogeny
                }
            })
        elif tool_type == 'msa':
            # Import the analysis module
            import analysis
            
            # Get the sequence data
            sequence_data = data.get('sequence_data', [])
            if not sequence_data:
                # If no sequence data provided, try to get it from the selected vaults and bags
                umap_result = analysis.generate_umap_visualization(vault_ids, bag_ids)
                sequence_data = umap_result.get('sequence_data', [])
            
            # Generate Multiple Sequence Alignment
            result = analysis.generate_multiple_sequence_alignment(sequence_data)
            
            return jsonify({
                'success': result.get('success', False),
                'message': result.get('message', 'MSA analysis completed'),
                'data': {
                    'tool': 'msa',
                    'msa_html': result.get('msa_html', ''),
                    'alignment_length': result.get('alignment_length', 0),
                    'num_sequences': result.get('num_sequences', 0),
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }
            })
        elif tool_type == 'phylogeny':
            # Import the analysis module
            import analysis
            
            # Get the sequence data
            sequence_data = data.get('sequence_data', [])
            if not sequence_data:
                # If no sequence data provided, try to get it from the selected vaults and bags
                umap_result = analysis.generate_umap_visualization(vault_ids, bag_ids)
                sequence_data = umap_result.get('sequence_data', [])
            
            # Generate Phylogenetic Tree
            result = analysis.generate_phylogenetic_tree(sequence_data)
            
            return jsonify({
                'success': result.get('success', False),
                'message': result.get('message', 'Phylogeny analysis completed'),
                'data': {
                    'tool': 'phylogeny',
                    'tree_html': result.get('tree_html', ''),
                    'newick': result.get('newick', ''),
                    'num_sequences': result.get('num_sequences', 0),
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }
            })
        else:
            # For now, return a placeholder response for other tools
            return jsonify({
                'success': True,
                'message': 'Analysis completed successfully',
                'data': {
                    'vaults': vault_ids,
                    'bags': bag_ids,
                    'tool': tool_type,
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'result': 'Placeholder for analysis results'
                }
            })
    except Exception as e:
        app.logger.error(f"Error in api_analyze: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error during analysis: {str(e)}',
            'data': None
        })

@app.route('/api/add_to_container', methods=['POST'])
def add_to_container():
    """Generic endpoint to add a bacteriocin to a container (vault or bag)"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    
    container_type = data.get('container_type')
    container_id = data.get('container_id')
    item_id = data.get('item_id')
    
    if not container_type or not container_id or not item_id:
        return jsonify({'success': False, 'message': 'Missing required parameters'}), 400
    
    # Route to the appropriate handler based on container type
    if container_type == 'vault':
        result = database.add_to_vault(container_id, item_id)
    elif container_type == 'bag':
        result = database.add_to_bag(container_id, item_id)
    else:
        return jsonify({'success': False, 'message': f'Unknown container type: {container_type}'}), 400
    
    return jsonify(result)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'faa', 'fasta'}

if __name__ == '__main__':
    # Set up logging
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Start the BioFASTA application')
    parser.add_argument('--port', type=int, help='Port to run the server on')
    args = parser.parse_args()
    
    # Find an available port if not specified
    import socket
    
    def find_available_port(start_port=5000, max_attempts=10):
        """Find an available port starting from start_port"""
        for port in range(start_port, start_port + max_attempts):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(('localhost', port))
                    return port
                except OSError:
                    continue
        # If no port is found, return a less common port
        return 8766
    
    try:
        # Use the command-line port if provided, otherwise find an available one
        port = args.port if args.port else find_available_port()
        print(f"Starting server on port {port}")
        app.run(debug=True, port=port)
    except Exception as e:
        print(f"Error starting server: {e}")
        import traceback
        traceback.print_exc()
