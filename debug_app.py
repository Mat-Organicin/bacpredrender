from flask import Flask, jsonify, request
from bacpred import BacteriocinPredictor, ensure_model_trained

app = Flask(__name__)

# Ensure the BacPred model is trained at startup
BACPRED_MODEL_READY = ensure_model_trained()

@app.route('/')
def index():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>BacPred Debug</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            textarea { width: 100%; height: 200px; }
            button { padding: 10px 20px; background: #4CAF50; color: white; border: none; cursor: pointer; }
            .result { margin-top: 20px; border: 1px solid #ddd; padding: 10px; }
            .loading { display: none; }
        </style>
    </head>
    <body>
        <h1>BacPred Debug Interface</h1>
        <p>Model Status: <strong id="model-status">{}</strong></p>
        
        <h2>Predict Bacteriocins</h2>
        <form id="predict-form">
            <textarea id="sequence" placeholder="Enter protein sequence(s) in FASTA format"></textarea>
            <button type="submit">Predict</button>
        </form>
        
        <div class="loading" id="loading">Processing...</div>
        <div class="result" id="result"></div>
        
        <script>
            document.getElementById('model-status').textContent = '{status}';
            
            document.getElementById('predict-form').addEventListener('submit', function(e) {{
                e.preventDefault();
                const sequence = document.getElementById('sequence').value;
                
                if (!sequence) {{
                    alert('Please enter a sequence');
                    return;
                }}
                
                document.getElementById('loading').style.display = 'block';
                document.getElementById('result').innerHTML = '';
                
                fetch('/predict', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json'
                    }},
                    body: JSON.stringify({{
                        sequences: [{{
                            header: 'Test Sequence',
                            sequence: sequence
                        }}]
                    }})
                }})
                .then(response => response.json())
                .then(data => {{
                    document.getElementById('loading').style.display = 'none';
                    if (data.error) {{
                        document.getElementById('result').innerHTML = `<p>Error: ${{data.error}}</p>`;
                    }} else {{
                        let resultHtml = '<h3>Results:</h3>';
                        
                        data.predictions.forEach(pred => {{
                            resultHtml += `
                                <div style="margin-bottom: 20px; padding: 10px; border: 1px solid #ddd;">
                                    <h4>${{pred.id}}</h4>
                                    <p>Prediction: <strong>${{pred.prediction}}</strong></p>
                                    <p>Probability: ${{(pred.probability * 100).toFixed(2)}}%</p>
                                    <p>Confidence: ${{pred.confidence}}</p>
                                    <p>Sequence: ${{pred.sequence.substring(0, 50)}}${{pred.sequence.length > 50 ? '...' : ''}}</p>
                                </div>
                            `;
                        }});
                        
                        document.getElementById('result').innerHTML = resultHtml;
                    }}
                }})
                .catch(error => {{
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('result').innerHTML = `<p>Error: ${{error.message}}</p>`;
                }});
            }});
        </script>
    </body>
    </html>
    """.format(status="Ready" if BACPRED_MODEL_READY else "Not Ready")

@app.route('/predict', methods=['POST'])
def predict_bacteriocin():
    if not BACPRED_MODEL_READY:
        return jsonify({'error': 'BacPred model is not ready. Please check server logs.'}), 500
    
    # Get sequences from the request
    data = request.get_json()
    sequences = data.get('sequences', [])
    
    if not sequences:
        return jsonify({'error': 'No sequences provided for prediction'}), 400
    
    try:
        # Create a new predictor instance
        predictor = BacteriocinPredictor()
        
        # Format the sequences for prediction
        seq_tuples = []
        for seq in sequences:
            header = seq.get('header', seq.get('description', f"Sequence_{len(seq_tuples)+1}"))
            sequence = seq.get('sequence', '')
            if sequence:
                seq_tuples.append((header, sequence))
        
        # Run prediction
        results = predictor.predict(seq_tuples)
        
        # Return the results
        return jsonify({'predictions': results})
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return jsonify({'error': str(e), 'details': error_details}), 500

if __name__ == '__main__':
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
        return 8765
    
    port = find_available_port()
    print(f"Starting debug server on port {port}")
    app.run(debug=True, port=port)
