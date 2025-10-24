# Healthcare Email Defense Agent Demo

A web-based demo for an AI Email Defense Agent designed for healthcare organizations. This tool analyzes incoming emails to classify them as Safe, Suspicious, or Phishing using AI models via OpenRouter API, with agentic capabilities and human-in-the-loop feedback.

## Table of Contents

- [Code](#code)
- [Data](#data)
- [LLM Prompts Used](#llm-prompts-used)
- [Dependencies](#dependencies)
- [Stakeholder Interview Notes](#stakeholder-interview-notes)
- [LLM Summarization of Class Feedback](#llm-summarization-of-class-feedback)
- [Setup](#setup)
- [Usage](#usage)
- [Sample Test Emails](#sample-test-emails)
- [Technical Details](#technical-details)
- [Agentic Features](#agentic-features)
- [Limitations](#limitations)
- [Healthcare-Specific Analysis](#healthcare-specific-analysis)
- [Browser Compatibility](#browser-compatibility)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Code

The repository contains the following key components:

### Frontend (`index.html`)
- **Main Application**: Complete healthcare email defense interface
- **AI Integration**: OpenRouter API integration for email analysis
- **UI Components**: Modern glassmorphism design with responsive layout
- **Agentic Features**: Memory system, learning capabilities, autonomous actions
- **Review System**: Human-in-the-loop feedback mechanism

### Backend (`server.js`)
- **Express Server**: Node.js server for API key management
- **Environment Configuration**: Secure API key handling
- **Static File Serving**: Serves the main application

### Configuration Files
- **`package.json`**: Node.js dependencies and scripts
- **`.env.example`**: Environment variable template
- **`LICENSE`**: MIT License file

## Data

### Email Analysis Data
- **Classification Results**: Safe, Suspicious, Phishing classifications
- **Confidence Scores**: AI model confidence levels
- **Threat Intelligence**: Domain analysis, link scanning, attachment detection
- **Learning Patterns**: Feedback-based pattern recognition

### Storage
- **Browser localStorage**: Persistent storage for analysis history
- **Session Data**: Real-time analysis results and metrics
- **Feedback Data**: IT reviewer corrections and learning patterns

### Sample Data
- **Test Emails**: Pre-written examples for Safe, Suspicious, and Phishing categories
- **Healthcare Scenarios**: Medical-specific threat examples
- **Urgency Classification**: Priority-based email sorting

## LLM Prompts Used

### Email Analysis Prompt
```
Healthcare email security analysis with urgency detection. Respond with valid JSON only.

EMAIL DATA:
From: {sender}
To: {userRole} ({recipientInfo.name} - {recipientInfo.role})
Subject: {subject}
Body: {body}
{roleCheck ? `Role Issue: ${roleCheck.reason}` : ''}
{threatIntel ? `Threats: ${threatIntel.threatScore}/100, ${threatIntel.suspiciousLinks} suspicious links` : ''}

REQUIRED JSON OUTPUT:
{
  "classification": "Safe",
  "urgency": "Normal", 
  "confidence": 85,
  "comment": "Brief explanation",
  "reasoningReport": {
    "summary": "2-sentence analysis summary",
    "threatIndicators": ["threat1", "threat2"],
    "roleAnalysis": "Role appropriateness explanation",
    "technicalFindings": ["finding1", "finding2"], 
    "recommendation": "Clear action recommendation",
    "urgencyReason": "Why this email is urgent or normal"
  }
}

CLASSIFICATION RULES:
- Safe: legitimate healthcare communication
- Suspicious: unclear/inappropriate content
- Phishing: malicious intent

URGENCY RULES (CRITICAL - ALWAYS DETECT URGENCY):
- Urgent: medical emergencies, critical alerts, time-sensitive patient care, urgent requests, any email with urgency keywords
- Normal: routine communications, general updates, non-critical information

IMPORTANT: If ANY urgency indicator is present in the email (subject OR body), classify as "Urgent". Err on the side of urgency for healthcare communications.

URGENCY INDICATORS: "emergency", "urgent", "critical", "immediate", "stat", "asap", "patient in distress", "code blue", "time sensitive", "deadline", "urgent response needed", "life threatening", "emergency room", "trauma", "cardiac arrest", "immediately", "as soon as possible", "right away", "without delay", "expires", "deadline", "due today", "must complete", "action required", "response needed"
```

### Email Generation Prompt
```
Generate a unique, realistic healthcare email that would be classified as "{randomType}".

Context: {randomHospital} - {randomDept} Department
Sender Role: {randomRole}
Recipient: {randomRecipient}
Urgency: {randomTime}
Generation #{generationCounter}
Unique ID: {randomId}
Timestamp: {timestamp}

Requirements:
- Make it completely unique and different from typical examples
- Include specific healthcare details, terminology, and context for {randomHospital}
- Use realistic sender domains and professional language
- Address the email appropriately to the recipient: {randomRecipient}
- For Safe: Normal hospital communications (schedules, reminders, announcements, policy updates, training notifications)
- For Suspicious: Unusual requests that might be legitimate but raise questions (access requests, data sharing, policy changes)
- For Phishing: Clear malicious intent targeting healthcare workers/patients (credential theft, fake alerts, urgent actions)

Be creative and avoid common patterns. Make each email feel like a real, unique communication.

Respond ONLY with this JSON format:
{
  "type": "{randomType}",
  "sender": "realistic.email@domain.com",
  "recipient": "{randomRecipient}",
  "subject": "Unique realistic subject line",
  "body": "Detailed unique email body content"
}

Make the email detailed, believable, and completely unique.
```

## Dependencies

### Node.js Dependencies (`package.json`)
```json
{
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {},
  "scripts": {
    "start": "node server.js"
  }
}
```

### External Dependencies
- **OpenRouter API**: AI model access (Alibaba Tongyi, Microsoft WizardLM, Meta Llama)
- **Modern Browser**: Fetch API, ES6+ JavaScript, CSS Grid/Flexbox support

### Environment Requirements
- **Node.js**: Version 14+ recommended
- **API Key**: OpenRouter API key (free tier available)
- **Browser**: Modern browser with JavaScript enabled

## Stakeholder Interview Notes

### Interview 1: Healthcare IT Security Professional
**Link**: [Stakeholder Interview Notes 1](https://docs.google.com/document/d/1v-JA_fMWU8BTfyirkAur9Ttzgm4gYSRmlmv-8oaC3fg/edit?usp=sharing)


### Interview 2: Certified Clinical Medical Assistant
**Link**: [Stakeholder Interview Notes 2](https://docs.google.com/document/d/1Z5haY_CN6UcKJs23IL9b9Q5xTB7i7pu-6vGAbXVa6Lw/edit?usp=sharing)


## LLM Summarization of Class Feedback

### Class Feedback Analysis
**Link**: [LLM Feedback Summary](https://docs.google.com/document/d/1LdIhOaMyLEjzospOPMIjfieTOR_CKVCiK4HebnLg5eg/edit?usp=sharing)


## Setup

1. **Get an OpenRouter API Key**:
   - Sign up at [OpenRouter](https://openrouter.ai/keys)
   - Generate an API key (free tier available)

2. **Configure Environment**:
   - Copy `.env.example` to `.env`
   - Add your OpenRouter API key: `OPENROUTER_API_KEY=your_key_here`

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run the Demo**:
   ```bash
   npm start
   ```
   - Open http://localhost:3000 in your browser
   - The API key will be loaded automatically from environment variables

## Usage

1. **Automatic Setup**: API key is loaded from environment variables automatically
2. **Analyze Email**: Fill in the sender, subject, and email body fields
3. **Review Results**: Check the classification, confidence score, and AI reasoning
4. **Provide Feedback**: Use the "Correct" or "Incorrect" buttons to mark AI decisions

## Sample Test Emails

### Safe Email
```
Sender: noreply@hospital.org
Subject: Monthly Staff Meeting Reminder
Body: Dear Staff, This is a reminder about our monthly staff meeting scheduled for next Friday at 2 PM in the main conference room. Please confirm your attendance.
```

### Suspicious Email
```
Sender: urgent@medical-alert.net
Subject: URGENT: Patient Data Verification Required
Body: We need to verify your patient database credentials immediately. Click here to update your information or your access will be suspended.
```

### Phishing Email
```
Sender: security@hospital-security.com
Subject: HIPAA Violation Alert - Immediate Action Required
Body: Your account has been flagged for HIPAA violations. Click this link immediately to avoid legal action and account suspension.
```

## Technical Details

- **AI Models**: Supports multiple models via OpenRouter API (Alibaba Tongyi, Microsoft WizardLM, Meta Llama, etc.)
- **Backend**: Express.js server for API key management and configuration
- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks required)
- **Agentic Features**: Memory system, pattern learning, autonomous actions
- **Security**: Threat intelligence, domain analysis, content filtering
- **Styling**: Healthcare-themed with medical blue color scheme
- **Responsive**: Mobile-friendly design with modal overlays
- **Privacy**: API key stored in environment variables, not exposed to client

## Agentic Features

This demo implements agentic email screening capabilities:

- **🧠 Memory System**: Learns from IT reviewer feedback and builds pattern recognition
- **🔄 Autonomous Actions**: Can automatically classify based on learned patterns
- **📊 Threat Intelligence**: Analyzes domains, links, headers, and attachments
- **🎯 Context Awareness**: Considers healthcare-specific threat vectors
- **🛡️ Fail-Safe Default**: Unsure emails go to review queue (never auto-blocked)
- **📈 Continuous Learning**: Improves accuracy through human feedback

## Limitations

This is a demo/experiment tool, not a production system:
- Results stored in browser localStorage (not persistent across devices)
- No user authentication or multi-user support
- No direct email integration (manual input required)
- Uses AI models with potential rate limits
- Designed for educational/experimental purposes

## Healthcare-Specific Analysis

The AI is prompted to focus on healthcare-specific threats including:
- HIPAA compliance issues
- Medical identity theft attempts
- Healthcare data breaches
- Fake medical alerts
- Suspicious medical attachments
- Urgent medical requests from unknown sources
- Requests for patient information

## Browser Compatibility

Works with all modern browsers that support:
- Fetch API
- ES6+ JavaScript features
- CSS Grid and Flexbox

## Contributing

This is an educational demo for cybersecurity research. Feel free to:
- Fork the repository
- Experiment with different AI models
- Add new agentic features
- Improve the threat detection algorithms

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built for cybersecurity education and research
- Demonstrates agentic AI concepts in healthcare security
- Uses OpenRouter API for AI model access
