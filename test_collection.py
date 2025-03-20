import database
import json

def test_get_collection():
    """Test getting the bacteriocin collection"""
    print("Testing get_bacteriocin_collection function...")
    result = database.get_bacteriocin_collection()
    print(f"Result success: {result.get('success')}")
    print(f"Number of items: {len(result.get('data', []))}")
    
    # Pretty print the first item if any
    if result.get('success') and result.get('data'):
        print("\nFirst item in collection:")
        print(json.dumps(result['data'][0], indent=2, default=str))
    else:
        print(f"Error or no data: {result.get('message', 'No message')}")
    
    return result

if __name__ == "__main__":
    test_get_collection()
