# Healthcare Email Defense Agent Demo

A web-based demo for an AI Email Defense Agent designed for healthcare organizations. This tool analyzes incoming emails to classify them as Safe, Suspicious, or Phishing using AI models via OpenRouter API, with agentic capabilities and human-in-the-loop feedback.

## Features

- **🤖 Agentic AI Analysis**: Intelligent email analysis with learning capabilities and autonomous threat detection
- **📧 Email Classification**: Classifies emails as Safe, Suspicious, or Phishing with confidence scores
- **🏥 Healthcare Focus**: Specialized for healthcare threats (HIPAA compliance, medical identity theft, data breaches)
- **👁️ Email Review Modal**: Full email content review with detailed AI analysis
- **🔄 Human-in-the-Loop**: IT reviewer feedback system for continuous learning
- **📊 Agent Memory**: Persistent learning from feedback with pattern recognition
- **🎲 Example Generator**: AI-powered realistic email generation for testing
- **📱 Responsive Design**: Clean, healthcare-themed interface for desktop and mobile
- **🔒 Security Features**: Threat intelligence, link analysis, and attachment scanning
- **⚡ Real-time Analysis**: Fast AI processing with multiple model support

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
