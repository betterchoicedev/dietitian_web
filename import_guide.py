#!/usr/bin/env python3
"""
Guide for importing large CSV data into database
"""

def print_import_guide():
    print("=== SOLUTIONS FOR 'QUERY TOO LARGE' ERROR ===\n")
    
    print("1. IMPORT CHUNKED FILES:")
    print("   - Use the 6 smaller CSV files in 'csv_chunks/' directory")
    print("   - Import them one by one through your database interface")
    print("   - Each file has 1000 rows (except the last one with 474 rows)\n")
    
    print("2. DATABASE-SPECIFIC SOLUTIONS:")
    print("   - Supabase: Use the REST API or bulk insert functions")
    print("   - PostgreSQL: Use COPY command or pgAdmin import tool")
    print("   - MySQL: Use LOAD DATA INFILE command")
    print("   - SQLite: Use .import command in sqlite3 CLI\n")
    
    print("3. PROGRAMMATIC IMPORT:")
    print("   - Use Python with database libraries (psycopg2, sqlite3, etc.)")
    print("   - Use Node.js with database drivers")
    print("   - Process data in batches of 100-500 rows at a time\n")
    
    print("4. REDUCE DATA SIZE:")
    print("   - Remove unnecessary columns before import")
    print("   - Filter out rows with missing critical data")
    print("   - Compress data or use binary formats\n")
    
    print("5. DATABASE OPTIMIZATION:")
    print("   - Increase query timeout limits")
    print("   - Use bulk insert operations")
    print("   - Disable foreign key checks during import")
    print("   - Use prepared statements\n")

if __name__ == "__main__":
    print_import_guide()
