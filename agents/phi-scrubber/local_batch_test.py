import sys
import os
import json

# Add the lambda folder to Python's path
sys.path.append(os.path.join(os.path.dirname(__file__), "phi-scrubber-lambda"))

from lambda_function import lambda_handler

# Load test emails
with open("test_emails.jsonl", "r", encoding="utf-8") as f:
    lines = [json.loads(line) for line in f if line.strip()]

for i, line in enumerate(lines, 1):
    print(f"\n==============================")
    print(f"TEST {i}")
    print("------------------------------")
    print("INPUT:")
    print(line["email_body"])

    # Run locally
    result = lambda_handler(line, None)

    print("\nOUTPUT:")
    print(json.dumps(result, indent=2))
