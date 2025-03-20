import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import logging
from decimal import Decimal
from datetime import datetime

# Initialize logger
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Database connection parameters
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

# Create a connection pool
connection_pool = None

def init_connection_pool():
    """Initialize the database connection pool"""
    global connection_pool
    try:
        connection_pool = psycopg2.pool.SimpleConnectionPool(
            1,  # minconn
            10,  # maxconn
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        print("Database connection pool created successfully")
        
        # Initialize tables
        create_tables()
        
        return connection_pool
    except (Exception, psycopg2.Error) as error:
        print("Error while connecting to PostgreSQL:", error)
        return None

def get_connection():
    """Get a connection from the pool"""
    if connection_pool:
        return connection_pool.getconn()
    return None

def release_connection(conn):
    """Release a connection back to the pool"""
    if connection_pool:
        connection_pool.putconn(conn)

def close_all_connections():
    """Close all connections in the pool"""
    if connection_pool:
        connection_pool.closeall()
        print("All database connections closed")

def create_tables():
    """Create necessary tables if they don't exist"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Create bacteriocin_collection table if it doesn't exist
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS bacteriocin_collection (
            id SERIAL PRIMARY KEY,
            sequence_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sequence TEXT NOT NULL,
            probability NUMERIC(5, 4) NOT NULL,
            added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sequence_id)
        );
        """)
        
        # Create vaults table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vaults (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Create bags table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS bags (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Create vault_items table (many-to-many relationship)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vault_items (
            id SERIAL PRIMARY KEY,
            vault_id INTEGER REFERENCES vaults(id) ON DELETE CASCADE,
            bacteriocin_id INTEGER REFERENCES bacteriocin_collection(id) ON DELETE CASCADE,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vault_id, bacteriocin_id)
        );
        """)
        
        # Create bag_items table (many-to-many relationship)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS bag_items (
            id SERIAL PRIMARY KEY,
            bag_id INTEGER REFERENCES bags(id) ON DELETE CASCADE,
            bacteriocin_id INTEGER REFERENCES bacteriocin_collection(id) ON DELETE CASCADE,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(bag_id, bacteriocin_id)
        );
        """)
        
        # Create a default vault and bag if they don't exist
        cursor.execute("""
        INSERT INTO vaults (name, description)
        SELECT 'Reference Bacteriocins', 'Default vault for reference bacteriocins'
        WHERE NOT EXISTS (SELECT 1 FROM vaults LIMIT 1);
        """)
        
        cursor.execute("""
        INSERT INTO bags (name, description)
        SELECT 'Candidate Bacteriocins', 'Default bag for predicted bacteriocins'
        WHERE NOT EXISTS (SELECT 1 FROM bags LIMIT 1);
        """)
        
        conn.commit()
        logger.info("Tables created successfully")
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            release_connection(conn)

def add_bacteriocin(sequence_id, name, sequence, probability):
    """Add a bacteriocin to the collection"""
    conn = None
    result = {
        'success': False,
        'message': '',
        'data': None
    }
    
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Insert bacteriocin record
        cursor.execute("""
        INSERT INTO bacteriocin_collection (sequence_id, name, sequence, probability)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (sequence_id) 
        DO UPDATE SET 
            name = EXCLUDED.name,
            sequence = EXCLUDED.sequence,
            probability = EXCLUDED.probability,
            added_date = CURRENT_TIMESTAMP
        RETURNING id, sequence_id, name, probability, added_date;
        """, (sequence_id, name, sequence, probability))
        
        # Get the inserted/updated record
        record = cursor.fetchone()
        conn.commit()
        
        result['success'] = True
        result['message'] = 'Bacteriocin added to collection successfully'
        result['data'] = record
        
    except (Exception, psycopg2.Error) as error:
        print("Error while adding bacteriocin:", error)
        if conn:
            conn.rollback()
        result['message'] = str(error)
    finally:
        if conn:
            release_connection(conn)
    
    return result

def get_bacteriocin_collection(search='', sort_by='date-desc'):
    """Get all bacteriocins in the collection
    
    Args:
        search (str): Optional search term to filter bacteriocins
        sort_by (str): Optional sort parameter (e.g., 'date-desc', 'date-asc', 'prob-desc', 'prob-asc')
    
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Log the connection state
        logger.info(f"Database connection status: {'Open' if not conn.closed else 'Closed'}")
        
        # First check if there are any bacteriocins in the collection
        cursor.execute("SELECT COUNT(*) FROM bacteriocin_collection")
        total_count = cursor.fetchone()['count']
        logger.info(f"Total bacteriocin count in database: {total_count}")
        
        if total_count == 0:
            logger.warning("No bacteriocins found in the collection!")
            return {
                'success': True,
                'data': [],
                'message': 'No bacteriocins in collection'
            }
        
        # Get all bacteriocins from the collection first
        # This ensures we get all bacteriocins even if they're not in any vault or bag
        query = """
        SELECT 
            id, sequence_id, name, sequence, probability, added_date
        FROM bacteriocin_collection
        """
        
        # Add search condition if search term is provided
        parameters = []
        if search and search.strip():
            query += " WHERE name ILIKE %s OR sequence_id ILIKE %s OR sequence ILIKE %s"
            search_param = f"%{search}%"
            parameters = [search_param, search_param, search_param]
        
        # Add sorting
        if sort_by == 'date-asc':
            query += " ORDER BY added_date ASC"
        elif sort_by == 'prob-desc':
            query += " ORDER BY probability DESC"
        elif sort_by == 'prob-asc':
            query += " ORDER BY probability ASC"
        else:  # Default to date-desc
            query += " ORDER BY added_date DESC"
        
        # Log the exact query before execution
        logger.info(f"Executing collection query: {query} with parameters {parameters}")
        
        cursor.execute(query, parameters)
        bacteriocins = cursor.fetchall()
        
        # Log initial bacteriocin count
        logger.info(f"Raw bacteriocin count from query: {len(bacteriocins)}")
        
        # Check if we have any results
        if not bacteriocins:
            logger.warning(f"Query returned no bacteriocins with search='{search}', sort_by='{sort_by}'")
            return {
                'success': True,
                'data': [],
                'message': 'No matching bacteriocins found'
            }
        
        # Convert to list of dicts and add empty containers
        result = []
        for b in bacteriocins:
            b_dict = dict(b)
            # Ensure probability is a float
            b_dict['probability'] = float(b_dict['probability'])
            
            # Add empty containers by default
            b_dict['vaults'] = []
            b_dict['bags'] = []
            
            result.append(b_dict)
        
        # If we have bacteriocins, get their vaults and bags
        if result:
            # Get vault associations
            try:
                vault_query = """
                SELECT 
                    vi.bacteriocin_id, 
                    json_agg(json_build_object('vault_id', v.id, 'vault_name', v.name)) as vaults
                FROM vault_items vi
                JOIN vaults v ON vi.vault_id = v.id
                WHERE vi.bacteriocin_id IN %s
                GROUP BY vi.bacteriocin_id
                """
                cursor.execute(vault_query, (tuple([b["id"] for b in result]),))
                vault_data = {row["bacteriocin_id"]: row["vaults"] for row in cursor.fetchall()}
                
                logger.info(f"Found vault associations for {len(vault_data)} bacteriocins")
            except Exception as e:
                logger.error(f"Error fetching vault associations: {str(e)}")
                vault_data = {}
            
            # Get bag associations
            try:
                bag_query = """
                SELECT 
                    bi.bacteriocin_id, 
                    json_agg(json_build_object('bag_id', b.id, 'bag_name', b.name)) as bags
                FROM bag_items bi
                JOIN bags b ON bi.bag_id = b.id
                WHERE bi.bacteriocin_id IN %s
                GROUP BY bi.bacteriocin_id
                """
                cursor.execute(bag_query, (tuple([b["id"] for b in result]),))
                bag_data = {row["bacteriocin_id"]: row["bags"] for row in cursor.fetchall()}
                
                logger.info(f"Found bag associations for {len(bag_data)} bacteriocins")
            except Exception as e:
                logger.error(f"Error fetching bag associations: {str(e)}")
                bag_data = {}
            
            # Update each bacteriocin with its vaults and bags
            for b in result:
                if b["id"] in vault_data:
                    b["vaults"] = vault_data[b["id"]]
                if b["id"] in bag_data:
                    b["bags"] = bag_data[b["id"]]
        
        # Log first item for debugging
        if result:
            logger.info(f"First item in result: {result[0]['name']} (ID: {result[0]['id']})")
        
        logger.info(f"Returning {len(result)} bacteriocins from collection")
        
        return {
            'success': True,
            'data': result,
            'message': f"Retrieved {len(result)} bacteriocins"
        }
    except Exception as e:
        logger.error(f"Error getting bacteriocin collection: {str(e)}")
        # Include traceback for more detailed error information
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}",
            'data': []
        }
    finally:
        if conn:
            release_connection(conn)
            logger.info("Database connection released back to pool")

def remove_bacteriocin(bacteriocin_id):
    """Remove a bacteriocin from the collection by its ID
    
    Args:
        bacteriocin_id: The ID of the bacteriocin to remove
        
    Returns:
        dict: Result with success status and message
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        DELETE FROM bacteriocin_collection
        WHERE id = %s
        RETURNING id;
        """, (bacteriocin_id,))
        
        conn.commit()
        result = cursor.fetchone()
        
        if result:
            return {
                'success': True,
                'message': 'Bacteriocin removed from collection'
            }
        else:
            return {
                'success': False,
                'message': 'Bacteriocin not found in collection'
            }
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error removing bacteriocin from collection: {e}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def get_vaults():
    """Get all vaults
    
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        SELECT id, name, description, created_at,
            (SELECT COUNT(*) FROM vault_items WHERE vault_id = vaults.id) as item_count
        FROM vaults
        ORDER BY created_at;
        """)
        
        vaults = cursor.fetchall()
        
        return {
            'success': True,
            'data': vaults
        }
    except Exception as e:
        logger.error(f"Error getting vaults: {e}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def get_bags():
    """Get all bags
    
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        SELECT id, name, description, created_at,
            (SELECT COUNT(*) FROM bag_items WHERE bag_id = bags.id) as item_count
        FROM bags
        ORDER BY created_at;
        """)
        
        bags = cursor.fetchall()
        
        return {
            'success': True,
            'data': bags
        }
    except Exception as e:
        logger.error(f"Error getting bags: {e}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def create_vault(name, description=""):
    """Create a new vault
    
    Args:
        name (str): The name of the vault
        description (str): Optional description
        
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        INSERT INTO vaults (name, description)
        VALUES (%s, %s)
        RETURNING id, name, description, created_at;
        """, (name, description))
        
        new_vault = cursor.fetchone()
        conn.commit()
        
        return {
            'success': True,
            'data': new_vault
        }
    except Exception as e:
        logger.error(f"Error creating vault: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def create_bag(name, description=""):
    """Create a new bag
    
    Args:
        name (str): The name of the bag
        description (str): Optional description
        
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        INSERT INTO bags (name, description)
        VALUES (%s, %s)
        RETURNING id, name, description, created_at;
        """, (name, description))
        
        new_bag = cursor.fetchone()
        conn.commit()
        
        return {
            'success': True,
            'data': new_bag
        }
    except Exception as e:
        logger.error(f"Error creating bag: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def add_to_vault(vault_id, bacteriocin_id):
    """Add a bacteriocin to a vault
    
    Args:
        vault_id (int): The ID of the vault
        bacteriocin_id (int): The ID of the bacteriocin
        
    Returns:
        dict: Result with success status and message
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT INTO vault_items (vault_id, bacteriocin_id)
        VALUES (%s, %s)
        ON CONFLICT (vault_id, bacteriocin_id) DO NOTHING
        RETURNING id;
        """, (vault_id, bacteriocin_id))
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {
                'success': True,
                'message': "Added to vault successfully"
            }
        else:
            return {
                'success': True,
                'message': "Item already in vault"
            }
    except Exception as e:
        logger.error(f"Error adding to vault: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def add_to_bag(bag_id, bacteriocin_id):
    """Add a bacteriocin to a bag
    
    Args:
        bag_id (int): The ID of the bag
        bacteriocin_id (int): The ID of the bacteriocin
        
    Returns:
        dict: Result with success status and message
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT INTO bag_items (bag_id, bacteriocin_id)
        VALUES (%s, %s)
        ON CONFLICT (bag_id, bacteriocin_id) DO NOTHING
        RETURNING id;
        """, (bag_id, bacteriocin_id))
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {
                'success': True,
                'message': "Added to bag successfully"
            }
        else:
            return {
                'success': True,
                'message': "Item already in bag"
            }
    except Exception as e:
        logger.error(f"Error adding to bag: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def remove_from_vault(vault_id, bacteriocin_id):
    """Remove a bacteriocin from a vault
    
    Args:
        vault_id (int): The ID of the vault
        bacteriocin_id (int): The ID of the bacteriocin
        
    Returns:
        dict: Result with success status and message
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        DELETE FROM vault_items
        WHERE vault_id = %s AND bacteriocin_id = %s
        RETURNING id;
        """, (vault_id, bacteriocin_id))
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {
                'success': True,
                'message': "Removed from vault successfully"
            }
        else:
            return {
                'success': False,
                'message': "Item not found in vault"
            }
    except Exception as e:
        logger.error(f"Error removing from vault: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def remove_from_bag(bag_id, bacteriocin_id):
    """Remove a bacteriocin from a bag
    
    Args:
        bag_id (int): The ID of the bag
        bacteriocin_id (int): The ID of the bacteriocin
        
    Returns:
        dict: Result with success status and message
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        DELETE FROM bag_items
        WHERE bag_id = %s AND bacteriocin_id = %s
        RETURNING id;
        """, (bag_id, bacteriocin_id))
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {
                'success': True,
                'message': "Removed from bag successfully"
            }
        else:
            return {
                'success': False,
                'message': "Item not found in bag"
            }
    except Exception as e:
        logger.error(f"Error removing from bag: {e}")
        if conn:
            conn.rollback()
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def get_vault_items(vault_id):
    """Get all items in a vault
    
    Args:
        vault_id (int): The ID of the vault
        
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        SELECT b.id, b.sequence_id, b.name, b.sequence, b.probability, b.added_date, vi.added_at
        FROM bacteriocin_collection b
        JOIN vault_items vi ON b.id = vi.bacteriocin_id
        WHERE vi.vault_id = %s
        ORDER BY vi.added_at DESC;
        """, (vault_id,))
        
        items = cursor.fetchall()
        
        # Process results
        for item in items:
            if isinstance(item['probability'], Decimal):
                item['probability'] = float(item['probability'])
            
            if isinstance(item['added_date'], datetime):
                item['added_date'] = item['added_date'].strftime('%Y-%m-%d %H:%M:%S')
                
            if isinstance(item['added_at'], datetime):
                item['added_at'] = item['added_at'].strftime('%Y-%m-%d %H:%M:%S')
        
        return {
            'success': True,
            'data': items
        }
    except Exception as e:
        logger.error(f"Error getting vault items: {e}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def get_bag_items(bag_id):
    """Get all items in a bag
    
    Args:
        bag_id (int): The ID of the bag
        
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
        SELECT b.id, b.sequence_id, b.name, b.sequence, b.probability, b.added_date, bi.added_at
        FROM bacteriocin_collection b
        JOIN bag_items bi ON b.id = bi.bacteriocin_id
        WHERE bi.bag_id = %s
        ORDER BY bi.added_at DESC;
        """, (bag_id,))
        
        items = cursor.fetchall()
        
        # Process results
        for item in items:
            if isinstance(item['probability'], Decimal):
                item['probability'] = float(item['probability'])
            
            if isinstance(item['added_date'], datetime):
                item['added_date'] = item['added_date'].strftime('%Y-%m-%d %H:%M:%S')
                
            if isinstance(item['added_at'], datetime):
                item['added_at'] = item['added_at'].strftime('%Y-%m-%d %H:%M:%S')
        
        return {
            'success': True,
            'data': items
        }
    except Exception as e:
        logger.error(f"Error getting bag items: {e}")
        return {
            'success': False,
            'message': f"Database error: {str(e)}"
        }
    finally:
        if conn:
            release_connection(conn)

def load_reference_bacteriocins(fasta_path):
    """Load reference bacteriocins from a FASTA file into the collection
    
    Args:
        fasta_path (str): Path to the FASTA file containing reference bacteriocins
        
    Returns:
        dict: Result with success status and data
    """
    conn = None
    try:
        logger.info(f"Loading reference bacteriocins from {fasta_path}")
        
        # Read the FASTA file
        sequences = {}
        current_id = None
        current_full_header = None
        
        with open(fasta_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('>'):
                    # This is a header line - parse ID and full header
                    full_header = line[1:]  # Remove the '>' character
                    parts = full_header.split(' ', 1)  # Split on first space
                    current_id = parts[0]
                    # Save the entire header as the name (without the ID)
                    current_full_header = full_header
                    sequences[current_id] = {
                        "name": current_full_header,  # Use the full header as the name
                        "sequence": ""
                    }
                else:
                    # This is a sequence line
                    if current_id is not None:
                        sequences[current_id]["sequence"] += line
        
        # Get a connection
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check existing bacteriocins to avoid duplicates
        existing_ids = set()
        cursor.execute("SELECT sequence_id FROM bacteriocin_collection")
        for row in cursor.fetchall():
            existing_ids.add(row['sequence_id'])
        
        # Add each sequence to the collection
        added_count = 0
        for seq_id, data in sequences.items():
            if not seq_id or not data["sequence"]:
                logger.warning(f"Skipping invalid sequence: ID={seq_id}")
                continue
            
            # Check if this sequence_id already exists
            if seq_id in existing_ids:
                logger.info(f"Bacteriocin {seq_id} already exists in collection, updating probability to 1.0")
                # Update the existing bacteriocin probability to 1.0 to mark it as reference
                # Also update the name to use the full header
                cursor.execute("""
                    UPDATE bacteriocin_collection 
                    SET probability = 1.0, name = %s
                    WHERE sequence_id = %s
                    RETURNING id
                """, (data["name"], seq_id))
                conn.commit()
                
                if cursor.rowcount > 0:
                    added_count += 1
                continue
                
            # Add the bacteriocin to the collection with 1.0 probability (100% confidence)
            result = add_bacteriocin(seq_id, data["name"], data["sequence"], 1.0)
            if result['success']:
                added_count += 1
            else:
                logger.warning(f"Failed to add reference bacteriocin {seq_id}: {result['message']}")
        
        logger.info(f"Added {added_count} reference bacteriocins from {fasta_path}")
        
        return {
            'success': True,
            'count': added_count
        }
    except Exception as e:
        logger.error(f"Error loading reference bacteriocins: {str(e)}")
        # Include traceback for more detailed error information
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'message': f"Error loading reference bacteriocins: {str(e)}",
            'count': 0
        }
    finally:
        if conn:
            release_connection(conn)

def update_bacteriocin_names():
    """
    Update existing bacteriocin names to properly split ID and name
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get all bacteriocins
        cursor.execute("SELECT id, sequence_id, name FROM bacteriocin_collection")
        records = cursor.fetchall()
        
        # Counter for updated records
        updated_count = 0
        
        # Process each record
        for record in records:
            record_id, sequence_id, name = record
            
            # Skip records that already have a proper name
            if name and name != sequence_id:
                continue
            
            # If sequence_id contains a separating character like '|', split it
            new_name = sequence_id
            
            # Try to extract a better name from the sequence_id
            if '|' in sequence_id:
                parts = sequence_id.split('|')
                if len(parts) > 1 and parts[1]:
                    new_name = parts[1]
            elif '_' in sequence_id:
                parts = sequence_id.split('_')
                if len(parts) > 1:
                    new_name = ' '.join(parts[1:])
            elif ' ' in sequence_id:
                parts = sequence_id.split(' ', 1)
                if len(parts) > 1:
                    new_name = parts[1]
            
            # Skip if the name is exactly the same
            if new_name == name:
                continue
            
            # Update the record
            try:
                cursor.execute(
                    "UPDATE bacteriocin_collection SET name = %s WHERE id = %s",
                    (new_name, record_id)
                )
                updated_count += 1
            except Exception as update_error:
                logger.error(f"Error updating name for record {record_id}: {update_error}")
                # Continue processing other records even if one fails
                continue
        
        # Commit the transaction
        conn.commit()
        
        # Release connection
        release_connection(conn)
        
        return {
            'success': True,
            'count': updated_count,
            'message': f'Updated {updated_count} bacteriocin names'
        }
    except Exception as e:
        logger.error(f"Error updating bacteriocin names: {e}")
        if 'conn' in locals() and conn:
            release_connection(conn)
            
        return {
            'success': False,
            'message': f'Error updating bacteriocin names: {str(e)}'
        }

def delete_vault(vault_id):
    """Delete a vault and all its associations"""
    try:
        conn = get_connection()
        if not conn:
            logger.error("Could not connect to database")
            return {'success': False, 'message': 'Database connection error'}
        
        cursor = conn.cursor()
        
        # First, delete all associations
        cursor.execute(
            "DELETE FROM vault_items WHERE vault_id = %s",
            (vault_id,)
        )
        
        # Then delete the vault
        cursor.execute(
            "DELETE FROM vaults WHERE id = %s RETURNING id, name",
            (vault_id,)
        )
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {'success': True, 'message': f'Vault deleted successfully'}
        else:
            return {'success': False, 'message': 'Vault not found'}
    except Exception as e:
        logger.error(f"Error deleting vault: {str(e)}")
        if conn:
            conn.rollback()
        return {'success': False, 'message': str(e)}
    finally:
        release_connection(conn)

def delete_bag(bag_id):
    """Delete a bag and all its associations"""
    try:
        conn = get_connection()
        if not conn:
            logger.error("Could not connect to database")
            return {'success': False, 'message': 'Database connection error'}
        
        cursor = conn.cursor()
        
        # First, delete all associations
        cursor.execute(
            "DELETE FROM bag_items WHERE bag_id = %s",
            (bag_id,)
        )
        
        # Then delete the bag
        cursor.execute(
            "DELETE FROM bags WHERE id = %s RETURNING id, name",
            (bag_id,)
        )
        
        result = cursor.fetchone()
        conn.commit()
        
        if result:
            return {'success': True, 'message': f'Bag deleted successfully'}
        else:
            return {'success': False, 'message': 'Bag not found'}
    except Exception as e:
        logger.error(f"Error deleting bag: {str(e)}")
        if conn:
            conn.rollback()
        return {'success': False, 'message': str(e)}
    finally:
        release_connection(conn)

def remove_item_from_bag(bag_id, item_id):
    """Remove an item from a bag (alias for remove_from_bag)
    
    Args:
        bag_id (int): The ID of the bag
        item_id (int): The ID of the bacteriocin
        
    Returns:
        dict: Result with success status and message
    """
    # This is just an alias for remove_from_bag to maintain API compatibility
    return remove_from_bag(bag_id, item_id)

# Initialize the connection pool when the module is imported
init_connection_pool()
