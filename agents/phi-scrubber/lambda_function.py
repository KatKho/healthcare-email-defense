import boto3
import json

client = boto3.client('comprehendmedical', region_name='us-east-1')

def lambda_handler(event, context):
    """
    Lambda entry point: expects JSON with {"email_body": "raw text"}.
    Returns JSON with {"redacted_email": "..."}.
    """
    text = event.get("email_body", "")
    if not text:
        return {"error": "Missing 'email_body' in event"}

    # Detect PHI
    result = client.detect_phi(Text=text)
    entities = result["Entities"]

    # Redact PHI in reverse order (so offsets don't shift)
    entities = sorted(entities, key=lambda e: e["BeginOffset"], reverse=True)
    for e in entities:
        start, end = e["BeginOffset"], e["EndOffset"]
        text = text[:start] + "[REDACTED]" + text[end:]

    return {
        "redacted_email": text,
        "entities_detected": len(entities),
        "model_version": result.get("ModelVersion")
    }
