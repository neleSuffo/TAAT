import json

# Path to the JSON file
json_file_path = "annotations\\fullmatch.json"  # Replace with your file path

# Path to the output TXT file
output_txt_path = "labels.txt"  # Replace with your desired output file path

# Step 1: Read the JSON file
with open(json_file_path, 'r') as json_file:
    json_data = json.load(json_file)

# Step 2: Extract labels
labels = [annotation["label"] for video in json_data["videos"] for annotation in video["annotations"]]

# Step 3: Write labels to a TXT file
with open(output_txt_path, 'w') as txt_file:
    unique=set(labels)
    for label in unique:
        txt_file.write(label + "\n")  # Write each label on a new line

print(f"Labels have been written to {output_txt_path}")