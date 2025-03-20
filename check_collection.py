import database

# Get all bacteriocins from the collection
result = database.get_bacteriocin_collection()

if result['success']:
    bacteriocins = result['data']
    print(f"Successfully retrieved {len(bacteriocins)} bacteriocins from your collection:")
    
    for i, bacteriocin in enumerate(bacteriocins, 1):
        print(f"\n--- Bacteriocin #{i} ---")
        print(f"Name: {bacteriocin['name']}")
        print(f"Sequence ID: {bacteriocin['sequence_id']}")
        print(f"Probability: {bacteriocin['probability'] * 100:.2f}%")
        print(f"Added on: {bacteriocin['added_date']}")
        
        # Show sequence preview (first 50 characters)
        sequence = bacteriocin['sequence']
        sequence_preview = sequence[:50] + "..." if len(sequence) > 50 else sequence
        print(f"Sequence: {sequence_preview}")
else:
    print(f"Error retrieving collection: {result['message']}")
