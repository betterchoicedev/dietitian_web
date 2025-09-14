#!/usr/bin/env python3
"""
Script to split large CSV into smaller chunks for easier import
"""

import pandas as pd
import os

def split_csv(input_file, chunk_size=1000):
    """
    Split a large CSV file into smaller chunks
    """
    # Read the CSV file
    df = pd.read_csv(input_file, encoding='utf-8')
    
    # Calculate number of chunks needed
    total_rows = len(df)
    num_chunks = (total_rows + chunk_size - 1) // chunk_size
    
    print(f"Total rows: {total_rows}")
    print(f"Splitting into {num_chunks} chunks of {chunk_size} rows each")
    
    # Create output directory
    output_dir = "csv_chunks"
    os.makedirs(output_dir, exist_ok=True)
    
    # Split the dataframe
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_rows)
        
        chunk_df = df.iloc[start_idx:end_idx]
        output_file = os.path.join(output_dir, f"food_dictionary_chunk_{i+1:03d}.csv")
        
        chunk_df.to_csv(output_file, index=False, encoding='utf-8')
        print(f"Created {output_file} with {len(chunk_df)} rows")
    
    print(f"\nAll chunks created in '{output_dir}' directory")
    return num_chunks

if __name__ == "__main__":
    # Split the CSV into chunks of 100 rows each
    num_chunks = split_csv('food_dictionary_new_format.csv', chunk_size=100)
    print(f"\nYou can now import {num_chunks} smaller CSV files instead of one large file.")
