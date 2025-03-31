from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from sklearn.neighbors import NearestNeighbors  # <--- Added import
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from flask_cors import CORS
import re # For cleaning track names
from thefuzz import fuzz # For string similarity

app = Flask(__name__)
CORS(app)

# Load data and ensure no NaN values
preprocessed_tracks = pd.read_parquet("tracks_with_embeddings.parquet")
embedding_cols = [col for col in preprocessed_tracks.columns if col.startswith('emb_')]
preprocessed_tracks = preprocessed_tracks.dropna(subset=embedding_cols)


# --- get_user_embeddings function remains the same ---
def get_user_embeddings(user_track_ids, max_clusters=5):
    """Get cluster centroids for user's diverse tastes"""
    valid_tracks = preprocessed_tracks[
        preprocessed_tracks['track_id'].isin(user_track_ids)
    ]

    if valid_tracks.empty:
        return None, []

    embeddings = valid_tracks[embedding_cols].values

    # Automatically determine cluster count (up to max_clusters)
    n_clusters = min(max_clusters, len(embeddings))
    if n_clusters > 1:
        # Consider adding n_init='auto' for newer scikit-learn versions
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)  # Added n_init explicitly
        clusters = kmeans.fit_predict(embeddings)
        centroids = kmeans.cluster_centers_
    else:
        centroids = [np.mean(embeddings, axis=0)]

    return centroids, valid_tracks['track_id'].tolist()


# --- find_similar_tracks function MODIFIED ---
def find_similar_tracks(user_centroids, n_per_cluster=500):
    """Find similar tracks for each cluster centroid using sklearn.neighbors"""
    all_results_indices = []

    # Get the embeddings from the main dataset
    all_embeddings = preprocessed_tracks[embedding_cols].values

    # Initialize NearestNeighbors.
    # 'cosine' is a good metric for embeddings (similar to Annoy's 'angular').
    # 'n_jobs=-1' uses all available CPU cores for potentially faster fitting/querying.
    # 'algorithm='auto'' lets sklearn choose the best algorithm (like BallTree for cosine).
    nn_model = NearestNeighbors(
        n_neighbors=n_per_cluster,
        metric='cosine',
        algorithm='auto',
        n_jobs=-1
    )

    # Fit the model on all track embeddings
    print("Fitting NearestNeighbors model...")
    nn_model.fit(all_embeddings)
    print("NearestNeighbors model fitted.")

    # Search for neighbors for each centroid
    print(f"Querying neighbors for {len(user_centroids)} centroids...")
    # kneighbors expects a 2D array of query points
    distances, indices = nn_model.kneighbors(user_centroids)

    # indices is now a list of arrays, one per centroid. Flatten it.
    all_results_indices = indices.flatten().tolist()
    print(f"Found {len(all_results_indices)} raw neighbor indices.")

    # Deduplicate and limit the total number of results
    # Using dict.fromkeys preserves order (in Python 3.7+) while deduplicating efficiently
    unique_indices = list(dict.fromkeys(all_results_indices))[:1000]
    print(f"Returning {len(unique_indices)} unique track indices.")

    return preprocessed_tracks.iloc[unique_indices]

# --- Helper Functions for Deduplication ---

def normalize_name(name):
    """Lowercase, remove common parentheticals/suffixes, and punctuation."""
    if not isinstance(name, str):
        return "" # Handle non-string inputs
    name = name.lower()
    # Remove content within brackets/parentheses (like feat., with, etc.)
    name = re.sub(r'\s*[\(\[].*?[\)\]]', '', name).strip()
    # Remove common suffixes
    name = re.sub(r'\s*-\s*(radio edit|remix|live|acoustic|version|edit|remastered.*|explicit.*|single version)', '', name).strip()
    # Remove basic punctuation (optional, depending on how clean names are)
    # Keep alphanumeric and spaces, allows for names like 'Mr. Brightside'
    name = re.sub(r'[^\w\s\-]', '', name) # Keep alphanumeric, spaces, and hyphens
    return name.strip()

def get_artist_key(artists_string):
    """
    Create a consistent, hashable key for artist comparison.
    Handles semicolon-separated artist strings like 'Ingrid Michaelson;ZAYN'.
    """
    if not isinstance(artists_string, str):
         # If it's somehow not a string but iterable (like a list)
         if hasattr(artists_string, '__iter__'):
              try:
                  # Sort directly if it's already a list/tuple of strings
                  return tuple(sorted([str(a).lower().strip() for a in artists_string]))
              except:
                  # Fallback for unexpected non-string iterables
                  return str(artists_string).lower().strip()
         # Fallback for other non-string types
         return str(artists_string).lower().strip()

    # If it is a string, split by semicolon, clean, sort, and return as tuple
    artist_list = [a.strip().lower() for a in artists_string.split(';') if a.strip()]
    return tuple(sorted(artist_list))


# --- Updated Mood Aware Filter Function ---

def mood_aware_filter(tracks_df: pd.DataFrame, mood_filters: dict, user_centroids: np.ndarray) -> pd.DataFrame:
    """
    Filters tracks based on mood criteria using a tiered fallback approach,
    prioritizes tracks similar to user clusters, and deduplicates results
    based on similar track name and same artists (handles semicolon-separated artists).

    Args:
        tracks_df: DataFrame of candidate tracks (e.g., 1000 similar tracks).
                   Expected columns: 'track_name', 'artists', embedding columns ('emb_*'),
                   and audio feature columns matching mood_filters keys.
        mood_filters: Dictionary for mood filtering {'feature': {'min': x, 'max': y}}.
        user_centroids: Numpy array of user cluster centroid embeddings.

    Returns:
        DataFrame containing up to 100 deduplicated, filtered, and sorted tracks.
    """
    print("--- Starting Tiered Mood Aware Filtering & Deduplication ---")
    print(f"Input tracks: {len(tracks_df)}")
    print(f"Mood filters received: {mood_filters}")

    FINAL_RECOMMENDATION_COUNT = 100
    MIN_TRACKS_THRESHOLD = 30 # For tiered filtering logic (less relevant now?)
    DEDUPLICATION_SIMILARITY_THRESHOLD = 90 # Threshold for track name similarity (tune this: 85-95 is common)

    # --- Handle Empty Inputs ---
    if tracks_df.empty:
        print("Input tracks_df is empty. Returning empty DataFrame.")
        return tracks_df

    # --- Check for required columns ---
    required_cols = ['track_name', 'artists']
    embedding_cols = [col for col in tracks_df.columns if col.startswith('emb_')]
    if not embedding_cols:
         print("Error: No embedding columns ('emb_*') found. Cannot calculate similarity.")
         return pd.DataFrame(columns=tracks_df.columns) # Return empty DF
    required_cols.extend(embedding_cols)
    if mood_filters:
        required_cols.extend(mood_filters.keys())

    missing_cols = [col for col in required_cols if col not in tracks_df.columns and col not in embedding_cols] # Avoid double-counting embeddings
    # Check specifically for track_name and artists needed for deduplication
    if 'track_name' not in tracks_df.columns or 'artists' not in tracks_df.columns:
        print("Error: Missing 'track_name' or 'artists' column required for deduplication.")
        return tracks_df.head(FINAL_RECOMMENDATION_COUNT).copy() # Or return empty


    # --- Calculate All Scores Upfront ---
    print("Calculating similarity scores for all candidate tracks...")
    all_cluster_sims = np.array([
        cosine_similarity(tracks_df[embedding_cols].values, [centroid]).flatten()
        for centroid in user_centroids
    ])
    all_track_scores = np.max(all_cluster_sims, axis=0)
    track_scores_series = pd.Series(all_track_scores, index=tracks_df.index)
    print("Similarity scores calculated.")


    # --- Generate Prioritized Candidate List (potential_indices) ---
    potential_indices = []

    # Handle No Mood Filters Provided
    if not mood_filters:
        print("No mood filters provided. Will sort all candidates by similarity.")
        potential_indices = track_scores_series.sort_values(ascending=False).index.tolist()
    else:
        # Apply Mood Filters Step-by-Step and Store Stages
        filter_order = list(mood_filters.keys())
        valid_filter_keys = [key for key in filter_order if key in tracks_df.columns]

        if not valid_filter_keys:
            print("Warning: None requested mood filter features found. Will sort all candidates by similarity.")
            potential_indices = track_scores_series.sort_values(ascending=False).index.tolist()
        else:
            print(f"Applying filters in order: {valid_filter_keys}")
            filter_stages = []
            cumulative_mask = np.ones(len(tracks_df), dtype=bool)

            for i, feature in enumerate(valid_filter_keys):
                ranges = mood_filters[feature]
                if 'min' not in ranges or 'max' not in ranges:
                     print(f"Warning: Skipping feature '{feature}' due to missing 'min' or 'max'.")
                     continue
                min_range, max_range = ranges['min'], ranges['max']
                feature_values = tracks_df[feature]
                current_feature_mask = (feature_values >= min_range) & (feature_values <= max_range) & (~feature_values.isna())
                cumulative_mask &= current_feature_mask
                filter_stages.append((i + 1, feature, cumulative_mask.copy()))
                print(f"--- Applied Filter {i+1}: {feature} ---")
                print(f"  Tracks remaining after cumulative filter: {cumulative_mask.sum()}")

            # Tiered Fallback Logic (to get initial candidate list)
            added_indices_set_tiered = set()
            print("\n--- Starting Tiered Selection (Pre-Deduplication) ---")
            for i in range(len(filter_stages) - 1, -1, -1):
                num_filters, feature_name, stage_mask = filter_stages[i]
                current_stage_indices = set(tracks_df.index[stage_mask])
                stricter_stage_indices = set(tracks_df.index[filter_stages[i+1][2]]) if i + 1 < len(filter_stages) else set()
                newly_passed_indices = list(current_stage_indices - stricter_stage_indices)

                if not newly_passed_indices: continue

                # Sort newly passed indices within this tier by similarity
                sorted_new_indices = track_scores_series.loc[newly_passed_indices].sort_values(ascending=False).index

                for track_index in sorted_new_indices:
                    if track_index not in added_indices_set_tiered:
                        potential_indices.append(track_index)
                        added_indices_set_tiered.add(track_index)
                # print(f"Stage {num_filters} ({feature_name}): Added {len(newly_passed_indices)} unique candidates. Total potential: {len(potential_indices)}") # Can be verbose

            # Add remaining top similarity tracks (those not caught by any filter stage)
            print("\nAdding remaining tracks sorted by similarity (Pre-Deduplication)...")
            all_sorted_indices_fallback = track_scores_series.sort_values(ascending=False).index
            for track_index in all_sorted_indices_fallback:
                 if track_index not in added_indices_set_tiered:
                      potential_indices.append(track_index)
                      # Keep track if needed, but potential_indices should now contain all tracks ordered
                      # added_indices_set_tiered.add(track_index) # Not strictly necessary here if just appending

    print(f"Total potential candidates before deduplication: {len(potential_indices)}")


    # --- Deduplication Step ---
    print("\n--- Starting Deduplication ---")
    final_deduplicated_indices = []
    # Store details of songs already added to check against
    # key = artist_key (tuple), value = list of (norm_name, index)
    added_songs_by_artist = {}

    processed_count = 0
    # Iterate through the candidates in their priority order (mood tiers -> similarity)
    for track_index in potential_indices:
        processed_count += 1
        if len(final_deduplicated_indices) >= FINAL_RECOMMENDATION_COUNT:
            print(f"Reached target count ({FINAL_RECOMMENDATION_COUNT}) after processing {processed_count} candidates.")
            break # Stop if we have enough unique recommendations

        try:
            # Get details for the current track using .loc for safety
            track_details = tracks_df.loc[track_index]
            current_name = track_details['track_name']
            current_artists_str = track_details['artists'] # Raw artist string

            # Normalize name and get canonical artist key
            current_norm_name = normalize_name(current_name)
            current_artist_key = get_artist_key(current_artists_str) # Uses the updated function

            is_duplicate = False

            # Check only against songs with the exact same artist key (tuple)
            if current_artist_key in added_songs_by_artist:
                for added_norm_name, added_index in added_songs_by_artist[current_artist_key]:
                    # Compare normalized names using fuzzy matching
                    similarity = fuzz.ratio(current_norm_name, added_norm_name)
                    if similarity >= DEDUPLICATION_SIMILARITY_THRESHOLD:
                        # Optional: Log the duplication found
                        # print(f"  Duplicate Check: Index {track_index} ('{current_name}') vs Index {added_index} ('{added_norm_name}'). Artists: {current_artist_key}. Similarity: {similarity} >= {DEDUPLICATION_SIMILARITY_THRESHOLD}")
                        is_duplicate = True
                        break # Found a duplicate for this artist group, stop checking

            # If it's not a duplicate, add its index to the final list
            if not is_duplicate:
                final_deduplicated_indices.append(track_index)

                # Store its details (normalized name, index) under its artist key
                if current_artist_key not in added_songs_by_artist:
                    added_songs_by_artist[current_artist_key] = []
                added_songs_by_artist[current_artist_key].append((current_norm_name, track_index))

        except KeyError as e:
             print(f"Warning: Skipping index {track_index}. Missing expected column: {e}")
        except Exception as e:
             # Log other potential errors during processing
             print(f"Warning: Error processing index {track_index} ('{track_details.get('track_name', 'N/A')}', Artists: '{track_details.get('artists', 'N/A')}'): {type(e).__name__} - {e}")


    print(f"--- Final Deduplicated Recommendation Count: {len(final_deduplicated_indices)} ---")

    # Return the final DataFrame based on the collected indices (maintaining order)
    if not final_deduplicated_indices:
         print("Warning: No tracks remained after deduplication.")
         return pd.DataFrame(columns=tracks_df.columns) # Return empty DF if nothing survived

    # Use .loc to ensure order and select only the final tracks
    final_df = tracks_df.loc[final_deduplicated_indices]
    return final_df

# --- /recommend route remains largely the same ---
@app.route('/recommend', methods=['POST'])
def recommend():
    try:
        data = request.json
        user_track_ids = data.get('track_ids', [])
        mood_filters = data.get('mood_filters', {})

        # Validate input
        if not user_track_ids:
            return jsonify({"error": "No track IDs provided"}), 400
        if not isinstance(user_track_ids, list):
            return jsonify({"error": "track_ids must be a list"}), 400
        if not isinstance(mood_filters, dict):
            return jsonify({"error": "mood_filters must be an object/dictionary"}), 400

        print(f"Received request with {len(user_track_ids)} track IDs.")
        # Step 1: Get user embeddings
        user_centroids, valid_tracks_found = get_user_embeddings(user_track_ids)

        if user_centroids is None or len(user_centroids) == 0:
            # Check if any tracks were valid but resulted in no embeddings (shouldn't happen with dropna)
            if len(valid_tracks_found) > 0:
                return jsonify({
                    "error": "Could not compute user profile from valid tracks.",
                    "valid_tracks_found": valid_tracks_found
                }), 400
            else:
                return jsonify({
                    "error": "None of the provided track IDs exist in our database.",
                    "valid_tracks_found": []
                }), 400

        print(f"Generated {len(user_centroids)} user cluster centroids from {len(valid_tracks_found)} valid tracks.")

        # Step 2: Find similar tracks
        similar_tracks = find_similar_tracks(user_centroids)
        if similar_tracks.empty:
            print("No similar tracks found.")
            return jsonify({
                "set_1": [],
                "valid_tracks_used": valid_tracks_found,
                "message": "No similar tracks found in the database."
            }), 200  # Or 404 maybe? 200 ok with empty list is common.

        print(f"Found {len(similar_tracks)} potentially similar tracks.")

        # Step 3: Apply mood-aware filtering
        mood_filtered_tracks = mood_aware_filter(similar_tracks, mood_filters, user_centroids)
        print(f"Filtered down to {len(mood_filtered_tracks)} tracks based on mood and similarity.")

        # Filter out the input tracks from the recommendations
        final_recommendations = mood_filtered_tracks[
            ~mood_filtered_tracks['track_id'].isin(valid_tracks_found)  # Use valid_tracks_found
        ]['track_id'].tolist()

        print(f"Returning {len(final_recommendations)} final recommendations.")

        return jsonify({
            "set_1": final_recommendations,
            "valid_tracks_used": valid_tracks_found,
            "message": f"Recommendations generated using {len(valid_tracks_found)}/{len(user_track_ids)} valid input tracks."
        })

    except Exception as e:
        import traceback
        print(f"Error in /recommend: {str(e)}")
        print(traceback.format_exc())  # Log the full traceback for debugging
        return jsonify({
            "error": "An unexpected error occurred.",
            "details": str(e)  # Provide error details in response (consider security implications)
        }), 500


if __name__ == '__main__':
    # Consider adding debug=True for development, but remove for production
    app.run(host='0.0.0.0', port=5173)  # , debug=True)
