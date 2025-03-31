from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from sklearn.neighbors import NearestNeighbors
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Load data and ensure no NaN values
preprocessed_tracks = pd.read_parquet("tracks_with_embeddings.parquet")
embedding_cols = [col for col in preprocessed_tracks.columns if col.startswith('emb_')]
preprocessed_tracks = preprocessed_tracks.dropna(subset=embedding_cols)


def filter_by_mood(tracks_df, mood_filters, min_tracks=30):
  """Flexible mood filtering with iterative relaxation."""
  if not mood_filters:
    return tracks_df.head(min_tracks) if len(tracks_df) > min_tracks else tracks_df

  # Track filter relaxation steps
  relaxation_steps = []
  current_filters = mood_filters.copy()

  while True:
    # Apply current filters
    filtered = tracks_df.copy()
    for feature, ranges in current_filters.items():
      min_val = ranges['min']
      max_val = ranges['max']
      filtered = filtered[
        (filtered[feature] >= min_val) &
        (filtered[feature] <= max_val)
        ]

    # Check if we have enough tracks
    if len(filtered) >= min_tracks:
      if relaxation_steps:
        print(f"Reached {len(filtered)} tracks by relaxing filters: {relaxation_steps}")
      return filtered

    # If no filters left to remove, return top tracks
    if not current_filters:
      print(f"Could not reach {min_tracks} tracks after removing all filters")
      return tracks_df.head(min_tracks)

    # Calculate which filter is most restrictive
    filter_counts = {}
    for feature in current_filters:
      ranges = current_filters[feature]
      count = len(tracks_df[
                    (tracks_df[feature] >= ranges['min']) &
                    (tracks_df[feature] <= ranges['max'])
                    ])
      filter_counts[feature] = count

    # Find the least satisfied filter
    least_common_feature = min(filter_counts, key=filter_counts.get)

    # Remove the most restrictive filter
    del current_filters[least_common_feature]
    relaxation_steps.append(least_common_feature)
    print(f"Removing {least_common_feature} filter, remaining: {list(current_filters.keys())}")


def get_user_embedding(user_track_ids):
    """Get valid tracks and compute average embedding."""
    valid_tracks = preprocessed_tracks[
        preprocessed_tracks['track_id'].isin(user_track_ids)
    ]

    if valid_tracks.empty:
        return None, []

    user_embeddings = valid_tracks[embedding_cols].values
    return np.mean(user_embeddings, axis=0), valid_tracks['track_id'].tolist()


def find_similar_tracks(user_embedding, n=10000):
    """Find similar tracks with input validation."""
    if user_embedding is None:
        raise ValueError("User embedding cannot be None")

    all_embeddings = preprocessed_tracks[embedding_cols].values
    knn = NearestNeighbors(n_neighbors=n, metric='cosine')
    knn.fit(all_embeddings)

    # Ensure user_embedding is 2D (reshape if needed)
    query_embedding = np.array(user_embedding).reshape(1, -1)
    _, indices = knn.kneighbors(query_embedding)

    return preprocessed_tracks.iloc[indices[0]]


@app.route('/recommend', methods=['POST'])
def recommend():
    try:
        data = request.json
        user_track_ids = data.get('track_ids', [])
        mood_filters = data.get('mood_filters', {})

        print(f"Received track IDs: {user_track_ids}")
        print(f"Received mood filters: {mood_filters}")

        # Validate input
        if not user_track_ids:
            return jsonify({"error": "No track IDs provided"}), 400

        # Step 1: Get user embedding
        user_embedding, valid_tracks_found = get_user_embedding(user_track_ids)
        if user_embedding is None:
            return jsonify({
                "error": "None of the provided tracks exist in our database",
                "valid_tracks_found": []
            }), 400

        # Step 2: Find similar tracks
        similar_tracks = find_similar_tracks(user_embedding, n=1000)
        print(f"Found {len(similar_tracks)} similar tracks")

        # Step 3: Apply mood filtering with minimum track requirement
        mood_filtered_tracks = filter_by_mood(similar_tracks, mood_filters)

        return jsonify({
          "set_1": mood_filtered_tracks['track_id'].tolist()[:100],  # Return max 100 tracks
          "valid_tracks_used": valid_tracks_found,
          "message": f"Used {len(valid_tracks_found)}/{len(user_track_ids)} valid tracks"
        })

    except Exception as e:
        return jsonify({
            "error": str(e),
            "details": "Internal server error"
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5173)