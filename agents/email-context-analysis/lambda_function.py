import json, logging, re
from http import HTTPStatus
from typing import Any, Dict, List

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SUSPICIOUS_TERMS = [
    r"\bconfirm\b", r"\bverify\b", r"\bupdate\b", r"\bcredential(s)?\b", r"\bpassword\b",
    r"\bbank( account)?\b", r"\bsecure\b", r"\bportal\b",
    r"\bclick\b.*\blink\b", r"\bfollow\b.*\blink\b", r"\buse\b.*\blink\b",
    r"\blink below\b", r"\blink provided\b", r"\bvia the link\b"
]
URGENCY_TERMS = [
    r"\burgent\b", r"\baction required\b", r"\bimmediately\b", r"\basap\b",
    r"\bavoid delay(s)?\b", r"\bfinal notice\b", r"\bmust\b", r"\brequired\b",
    r"\bprevent\b.*\b(interruption|suspension|lockout)\b",
    r"\bimmediate processing\b", r"\bdelay(ed)? payment(s)?\b"
]
MANIPULATIVE_TONE_TERMS = [
    r"\bto avoid\b.*\b(delay|suspension|termination)\b",
    r"\bfailure to\b.*\bwill result\b",
    r"\bfailure to\b.*\b(delay|issue|penalt(y|ies)|suspension|lockout|cancel)\b",
    r"\bwithout\b.*\b(confirmation|response|action)\b.*\b(delay|hold|impact)\b"
]
CREDENTIAL_INTENT_TERMS = [
    r"\blogin\b", r"\bsign in\b", r"\bverify (?:your )?account\b",
    r"\benter (?:your )?(?:details|credentials|password)\b",
    r"\bconfirm (?:bank|account|details)\b", r"\breactivate\b"
]
FINANCIAL_TERMS = [r"\bpayment\b", r"\binvoice\b", r"\brefund\b", r"\btransfer\b", r"\bbilling\b"]
SUPPORT_TERMS = [r"\bsupport\b", r"\bhelp\b", r"\bassist\b", r"\bissue\b", r"\bticket\b"]
SCHEDULING_TERMS = [r"\bmeeting\b", r"\bappointment\b", r"\bcalendar\b", r"\breschedule\b"]
ATTACHMENT_TERMS = [
    r"\bsee attached\b", r"\bopen the attachment\b", r"\battached file\b",
    r"\battachment\b", r"\battached document\b", r"\battached payroll\b"
]

WEIGHTS = {
    "credential_language": 0.35,
    "suspicious_link": 0.5,
    "urgency_language": 0.25,
    "manipulative_tone": 0.25,
    "attachment_reference": 0.25
}
THRESHOLDS = {"phishing": 0.5}

def find_matches(patterns: List[str], text: str) -> List[str]:
    return [p for p in patterns if re.search(p, text, flags=re.IGNORECASE)]

def extract_urls(text: str) -> List[str]:
    return re.findall(r'https?://[^\s)>\]]+', text, flags=re.IGNORECASE)

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, round(x, 3)))

def classify_tone(body: str) -> str:
    if find_matches(MANIPULATIVE_TONE_TERMS, body): return "manipulative"
    if re.search(r"\bthank(s| you)\b", body) or "appreciate" in body: return "friendly"
    if re.search(r"\bregards\b|\bbest\b|\bsincerely\b", body): return "professional"
    return "neutral"

def classify_urgency(body: str) -> str:
    return "urgent" if find_matches(URGENCY_TERMS, body) else "routine"

def infer_intent(body: str) -> str:
    if find_matches(CREDENTIAL_INTENT_TERMS, body): return "credential_request"
    if find_matches(FINANCIAL_TERMS, body): return "financial_action"
    if find_matches(SUPPORT_TERMS, body): return "support_request"
    if find_matches(SCHEDULING_TERMS, body): return "scheduling"
    return "informational"

def score_features(subject: str, body: str) -> Dict[str, bool]:
    text = f"{subject} {body}"
    urls = extract_urls(text)
    return {
        "credential_language": bool(find_matches(CREDENTIAL_INTENT_TERMS + SUSPICIOUS_TERMS, text)),
        "urgency_language": bool(find_matches(URGENCY_TERMS, text)),
        "manipulative_tone": bool(find_matches(MANIPULATIVE_TONE_TERMS, text)),
        "suspicious_link": bool(urls),
        "attachment_reference": bool(find_matches(ATTACHMENT_TERMS, text))
    }

def compute_scores(signals: Dict[str, bool]) -> Dict[str, float]:
    return {k: (WEIGHTS[k] if v else 0.0) for k, v in signals.items()}

def classify(total: float) -> str:
    return "phishing" if total >= THRESHOLDS["phishing"] else "safe"

def compute_confidence(total: float, classification: str) -> float:
    return clamp01(0.7 + 0.3 * (total - THRESHOLDS["phishing"]) / (1 - THRESHOLDS["phishing"])
                   if classification == "phishing" else
                   0.7 + 0.3 * (THRESHOLDS["phishing"] - total) / THRESHOLDS["phishing"])

def agentic_reasoning(subject: str, body: str, signals: Dict[str, bool]) -> List[str]:
    trace = []
    if find_matches(CREDENTIAL_INTENT_TERMS, body):
        trace.append("Detected credential-related phrases suggesting access verification.")
    if find_matches(FINANCIAL_TERMS, body):
        trace.append("Detected financial terminology (e.g., payment, refund).")
    if find_matches(URGENCY_TERMS, body):
        trace.append("Detected urgency indicators.")
    if find_matches(ATTACHMENT_TERMS, body):
        trace.append("Detected reference to an attachment, which can be a phishing lure.")
    if re.search(r"\blink\b", body, re.I):
        trace.append("Detected reference to a link, often used in phishing to direct users to malicious sites.")
    if extract_urls(body):
        trace.append("Found URL(s) that might lead outside trusted domains.")
    if signals["credential_language"] and not extract_urls(body):
        trace.append("Detected credential request even without visible link, potential HTML or embedded form phishing.")
    if not trace:
        trace.append("No strong phishing cues detected; normal business tone.")
    return trace

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        params = event.get("parameters", [])
        compact_raw = next((p.get("value") for p in params if p.get("name") == "compact"), "")
        compact = json.loads(compact_raw)
        subject, body = compact.get("subject", ""), compact.get("body", "")
        intent, tone, urgency = infer_intent(body), classify_tone(body), classify_urgency(body)
        signals = score_features(subject, body)
        scores, total = compute_scores(signals), clamp01(sum(compute_scores(signals).values()))
        classification, confidence = classify(total), compute_confidence(total, classify(total))
        reasoning = agentic_reasoning(subject, body, signals)
        result = {"confidence_final": confidence, "notes": [{
            "intent": intent, "tone": tone, "urgency": urgency,
            "classification": classification, "reasoning": reasoning,
            "signals": signals, "scores": scores
        }]}
        return {
            "response": {"actionGroup": event.get("actionGroup"),
                         "function": event.get("function"),
                         "functionResponse": {"responseBody": {"TEXT": {"body": json.dumps(result, ensure_ascii=False)}}}},
            "messageVersion": event.get("messageVersion", "1.0")
        }
    except Exception as e:
        return {"statusCode": HTTPStatus.INTERNAL_SERVER_ERROR, "body": f"Error: {str(e)}"}
