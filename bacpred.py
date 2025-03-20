"""
BacPred integration for BioFASTA
Integrates bacteriocin prediction functionality from the BacPred model
"""

import os
import numpy as np
import pandas as pd
import joblib
from Bio import SeqIO
import logging
import tempfile
import multiprocessing
from io import StringIO

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('bacpred')
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Paths to training data and model
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

POSITIVE_FASTA = os.path.join(SCRIPT_DIR, 'data', 'positive_datasets.fasta')
NEGATIVE_FASTA = os.path.join(SCRIPT_DIR, 'data', 'negative_datasets.fasta')

class BacteriocinPredictor:
    def __init__(self, model_dir=None):
        """
        Initialize the BacteriocinPredictor with default settings
        """
        # Set model directory
        self.model_dir = model_dir if model_dir else MODEL_DIR
        
        # Model file paths
        self.model_file = os.path.join(self.model_dir, 'bacteriocin_model.joblib')
        self.scaler_file = os.path.join(self.model_dir, 'feature_scaler.joblib')
        self.features_file = os.path.join(self.model_dir, 'selected_features.joblib')
        
        # Load model if available, otherwise it will need to be trained
        self.is_trained = self._load_model()
        
    def _load_model(self):
        """
        Load the trained model if it exists
        """
        try:
            if os.path.exists(self.model_file) and os.path.exists(self.scaler_file):
                self.model = joblib.load(self.model_file)
                self.scaler = joblib.load(self.scaler_file)
                if os.path.exists(self.features_file):
                    self.selected_features_idx = joblib.load(self.features_file)
                else:
                    self.selected_features_idx = None
                logger.info("Loaded existing model from %s", self.model_file)
                return True
        except Exception as e:
            logger.error("Failed to load model: %s", str(e))
        
        logger.info("No existing model found. Model needs to be trained.")
        return False
        
    def extract_features(self, sequence):
        """
        Extract features from a protein sequence for prediction
        
        Returns a feature vector with amino acid composition, dipeptide composition,
        and additional pseudofeatures important for bacteriocin prediction.
        """
        seq = sequence.upper()
        L = len(seq)
        features = []
        
        # 1. Amino Acid Composition (fraction of each amino acid)
        aa_list = list("ACDEFGHIKLMNPQRSTVWY")
        aa_counts = {aa: 0 for aa in aa_list}
        for aa in seq:
            if aa in aa_counts:
                aa_counts[aa] += 1
        AAC = [aa_counts[aa] / L if L > 0 else 0.0 for aa in aa_list]
        features.extend(AAC)
        
        # 2. Dipeptide Composition (fraction of each possible dipeptide)
        dipeptide_counts = {}
        for aa1 in aa_list:
            for aa2 in aa_list:
                dipeptide_counts[aa1 + aa2] = 0
        for i in range(L - 1):
            dipept = seq[i:i+2]
            if dipept in dipeptide_counts:
                dipeptide_counts[dipept] += 1
        DC = [dipeptide_counts[dp] / (L - 1) if L > 1 else 0.0 for dp in sorted(dipeptide_counts.keys())]
        features.extend(DC)
        
        # 3. Pseudofeatures - Features known to be important for bacteriocin prediction
        
        # 3.1 Cysteine content and cysteine pairs (common in bacteriocins)
        cysteine_count = aa_counts.get('C', 0)
        cysteine_fraction = cysteine_count / L if L > 0 else 0
        cysteine_pair_count = dipeptide_counts.get('CC', 0)
        
        # 3.2 Hydrophobicity - important for membrane interactions
        # Hydrophobicity scale (Kyte & Doolittle)
        hydrophobicity = {
            'A': 1.8, 'R': -4.5, 'N': -3.5, 'D': -3.5, 'C': 2.5, 
            'Q': -3.5, 'E': -3.5, 'G': -0.4, 'H': -3, 'I': 4.5, 
            'L': 3.8, 'K': -3.9, 'M': 1.9, 'F': 2.8, 'P': -1.6, 
            'S': -0.8, 'T': -0.7, 'W': -0.9, 'Y': -1.3, 'V': 4.2
        }
        avg_hydrophobicity = sum(hydrophobicity.get(aa, 0) for aa in seq) / L if L > 0 else 0
        
        # 3.3 Charge properties
        # Positive residues important for bacteriocin activity
        positive_aas = ['K', 'R', 'H']
        negative_aas = ['D', 'E']
        positive_count = sum(aa_counts.get(aa, 0) for aa in positive_aas)
        negative_count = sum(aa_counts.get(aa, 0) for aa in negative_aas)
        net_charge = positive_count - negative_count
        charge_density = net_charge / L if L > 0 else 0
        
        # 3.4 Amphipathicity - alternating hydrophobic/hydrophilic residues
        # Simplified calculation - count transitions between hydrophobic and hydrophilic
        hydrophobic_aas = ['A', 'C', 'F', 'I', 'L', 'M', 'V', 'W', 'Y']
        amphipathic_transitions = 0
        for i in range(L - 1):
            curr_is_hydrophobic = seq[i] in hydrophobic_aas
            next_is_hydrophobic = seq[i+1] in hydrophobic_aas
            if curr_is_hydrophobic != next_is_hydrophobic:
                amphipathic_transitions += 1
        amphipathicity = amphipathic_transitions / (L - 1) if L > 1 else 0
        
        # 3.5 Size features
        size_factor = 1.0 if 20 <= L <= 60 else 0.5  # Most bacteriocins are 20-60 amino acids
        
        # 3.6 Presence of common bacteriocin motifs
        # Look for common motifs in sequence
        motifs = ['CXC', 'CXXC', 'GG', 'PGP', 'LSXX']
        motif_scores = []
        for motif in motifs:
            if motif == 'CXC':
                # Find CXC pattern where X is any amino acid
                score = 0
                for i in range(L - 2):
                    if seq[i] == 'C' and seq[i+2] == 'C':
                        score += 1
                motif_scores.append(score / (L - 2) if L > 2 else 0)
            elif motif == 'CXXC':
                # Find CXXC pattern
                score = 0
                for i in range(L - 3):
                    if seq[i] == 'C' and seq[i+3] == 'C':
                        score += 1
                motif_scores.append(score / (L - 3) if L > 3 else 0)
            elif len(motif) == 2:
                # For 2-char motifs
                count = 0
                for i in range(L - 1):
                    if seq[i:i+2] == motif:
                        count += 1
                motif_scores.append(count / (L - 1) if L > 1 else 0)
            elif len(motif) == 3:
                # For 3-char motifs
                count = 0
                for i in range(L - 2):
                    if seq[i:i+3] == motif:
                        count += 1
                motif_scores.append(count / (L - 2) if L > 2 else 0)
            elif motif == 'LSXX':
                # Lanthionine synthetase motif (often present in lantibiotics)
                count = 0
                for i in range(L - 3):
                    if seq[i:i+2] == 'LS':
                        count += 1
                motif_scores.append(count / (L - 3) if L > 3 else 0)
        
        # Add all pseudofeatures
        pseudofeatures = [
            cysteine_fraction,
            cysteine_pair_count / (L - 1) if L > 1 else 0,
            avg_hydrophobicity,
            charge_density, 
            positive_count / L if L > 0 else 0,
            negative_count / L if L > 0 else 0,
            amphipathicity,
            size_factor
        ]
        pseudofeatures.extend(motif_scores)
        
        features.extend(pseudofeatures)
        
        # Return the feature vector
        return np.array(features)
    
    def get_feature_names(self):
        """
        Get names of all features used in the model
        
        Returns a list of feature names in the same order as extract_features
        """
        # 1. Amino Acid Composition
        aa_features = list("ACDEFGHIKLMNPQRSTVWY")
        
        # 2. Dipeptide Composition
        dipeptide_features = []
        for aa1 in aa_features:
            for aa2 in aa_features:
                dipeptide_features.append(aa1 + aa2)
        
        # 3. Pseudofeatures
        pseudofeature_names = [
            'Cysteine_Fraction',
            'Cysteine_Pair_Density',
            'Avg_Hydrophobicity',
            'Charge_Density',
            'Positive_AA_Fraction',
            'Negative_AA_Fraction',
            'Amphipathicity',
            'Size_Factor',
            'Motif_CXC',
            'Motif_CXXC',
            'Motif_GG',
            'Motif_PGP',
            'Motif_LSXX'
        ]
        
        # Combine all feature names
        all_features = aa_features + dipeptide_features + pseudofeature_names
        
        return all_features
    
    def train(self, positive_fasta, negative_fasta):
        """
        Train the model using positive and negative FASTA files
        """
        logger.info("Training bacteriocin prediction model...")
        
        # Load sequences from FASTA files
        positive_seqs = []
        for record in SeqIO.parse(positive_fasta, "fasta"):
            positive_seqs.append(str(record.seq))
        
        negative_seqs = []
        for record in SeqIO.parse(negative_fasta, "fasta"):
            negative_seqs.append(str(record.seq))
        
        logger.info(f"Loaded {len(positive_seqs)} positive and {len(negative_seqs)} negative sequences")
        
        # Extract features
        X = []
        y = []
        
        # Process positive examples
        for seq in positive_seqs:
            try:
                features = self.extract_features(seq)
                X.append(features)
                y.append(1)  # 1 for bacteriocin
            except Exception as e:
                logger.error(f"Error processing positive sequence: {e}")
        
        # Process negative examples
        for seq in negative_seqs:
            try:
                features = self.extract_features(seq)
                X.append(features)
                y.append(0)  # 0 for non-bacteriocin
            except Exception as e:
                logger.error(f"Error processing negative sequence: {e}")
        
        # Convert to numpy arrays
        X = np.array(X)
        y = np.array(y)
        
        # Scale features
        from sklearn.preprocessing import StandardScaler
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Train the model
        from sklearn.ensemble import RandomForestClassifier
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.model.fit(X_scaled, y)
        
        # Save the model
        os.makedirs(self.model_dir, exist_ok=True)
        joblib.dump(self.model, self.model_file)
        joblib.dump(self.scaler, self.scaler_file)
        
        self.is_trained = True
        logger.info("Model training completed and saved to %s", self.model_file)
        return True
    
    def predict(self, sequences):
        """
        Predict whether sequences are bacteriocins
        
        Args:
            sequences: List of sequences or FASTA string
            
        Returns:
            List of dictionaries with prediction results
        """
        # Check if model is trained
        if not self.is_trained:
            # Try to train with default data if available
            if os.path.exists(POSITIVE_FASTA) and os.path.exists(NEGATIVE_FASTA):
                self.train(POSITIVE_FASTA, NEGATIVE_FASTA)
            else:
                raise ValueError("Model is not trained and default training data not found")
        
        # Process input sequences
        if isinstance(sequences, str):
            # Parse FASTA format
            if ">" in sequences:
                seq_records = list(SeqIO.parse(StringIO(sequences), "fasta"))
                seq_list = [(record.id, str(record.seq)) for record in seq_records]
            else:
                # Single sequence without header
                seq_list = [("Sequence", sequences)]
        elif isinstance(sequences, list):
            if all(isinstance(seq, str) for seq in sequences):
                # List of sequence strings
                seq_list = [(f"Sequence_{i+1}", seq) for i, seq in enumerate(sequences)]
            else:
                # Assume list of (id, sequence) tuples
                seq_list = sequences
        else:
            raise ValueError("Input must be a FASTA string or list of sequences")
        
        # Extract features
        features_list = []
        for seq_id, seq in seq_list:
            try:
                features = self.extract_features(seq)
                # Log the feature shape for debugging
                logger.debug(f"Features for {seq_id} have length: {len(features)}")
                features_list.append((seq_id, seq, features))
            except Exception as e:
                logger.error(f"Error extracting features for {seq_id}: {e}")
        
        # Check if we have any valid features
        if not features_list:
            logger.error("No valid features extracted from any sequence")
            return []
        
        # Scale features
        try:
            X = np.array([features for _, _, features in features_list])
            logger.info(f"Feature matrix shape before adjustment: {X.shape}")
            
            # Handle feature dimension mismatch - ensure we have exactly 420 features
            expected_features = 420
            
            # If we have more features than expected, truncate
            if X.shape[1] > expected_features:
                logger.warning(f"Truncating feature set from {X.shape[1]} to {expected_features}")
                X = X[:, :expected_features]
            
            # If we have fewer features than expected, pad with zeros
            elif X.shape[1] < expected_features:
                logger.warning(f"Padding feature set from {X.shape[1]} to {expected_features}")
                padding = np.zeros((X.shape[0], expected_features - X.shape[1]))
                X = np.hstack((X, padding))
            
            logger.info(f"Feature matrix shape after adjustment: {X.shape}")
            
            # Now transform with scaler
            X_scaled = self.scaler.transform(X)
            
            # Make predictions
            probabilities = self.model.predict_proba(X_scaled)
            
            # Format results
            results = []
            for i, (seq_id, seq, _) in enumerate(features_list):
                bac_prob = probabilities[i][1]  # Probability of being a bacteriocin
                results.append({
                    "header": seq_id,  # Use header instead of id for consistency with app.py
                    "sequence": seq,
                    "probability": float(bac_prob),
                    "prediction": "Bacteriocin" if bac_prob >= 0.5 else "Non-bacteriocin",
                    "confidence": "High" if abs(bac_prob - 0.5) > 0.3 else "Medium" if abs(bac_prob - 0.5) > 0.15 else "Low"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Error in prediction processing: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise

def ensure_model_trained():
    """
    Ensure the BacPred model is trained and ready for use
    """
    predictor = BacteriocinPredictor()
    
    # If model is not trained, look for training data
    if not predictor.is_trained:
        data_dir = os.path.join(SCRIPT_DIR, 'data')
        os.makedirs(data_dir, exist_ok=True)
        
        # Check if we have training data in the specified location
        positive_exists = os.path.exists(POSITIVE_FASTA)
        negative_exists = os.path.exists(NEGATIVE_FASTA)
        
        if not positive_exists or not negative_exists:
            # Copy training data from BacPred directory
            bacpred_dir = os.path.join(os.path.dirname(SCRIPT_DIR), 'BacPred')
            positive_src = os.path.join(bacpred_dir, 'positive_datasets.fasta')
            negative_src = os.path.join(bacpred_dir, 'negative_datasets.fasta')
            
            if os.path.exists(positive_src) and os.path.exists(negative_src):
                import shutil
                if not positive_exists:
                    shutil.copy(positive_src, POSITIVE_FASTA)
                    logger.info(f"Copied positive training data from {positive_src}")
                if not negative_exists:
                    shutil.copy(negative_src, NEGATIVE_FASTA)
                    logger.info(f"Copied negative training data from {negative_src}")
        
        # Train the model if we now have the data
        if os.path.exists(POSITIVE_FASTA) and os.path.exists(NEGATIVE_FASTA):
            predictor.train(POSITIVE_FASTA, NEGATIVE_FASTA)
        else:
            logger.error("Training data not found. Model cannot be trained.")
    
    return predictor.is_trained
