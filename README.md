
# On-call Burnout Detector

An application that detects signs of overwork in incident responders by analyzing operational, behavioral signals, and self-reported data. It integrates with Rootly, PagerDuty, GitHub, and Slack to compute a per-responder risk score highlighting potential burnout trends.

There are two ways to run the On-call Burnout Detector:
* By self-hosting the app using our [quick start](#-quick-start) guide
* By using a hosted version [www.oncallburnout.com](https://www.oncallburnout.com/)

The On-call Burnout Detector measures and tracks signals over time that may indicate someone is at risk; it isn’t a medical tool and doesn’t diagnose burnout.

![Rootly AI Labs On-call Burnout Detector screenshot](assets/rootly-burnout-detector.png)

## ✨ Features

- **👥 Multi Layer Signals**: Individual and team-level insights
- **📊 Interactive Dashboard**: Visual  and AI-powered burnout risk analysis
- **📈 Real-time Analysis**: Progress tracking during data processing
- **🔄 Tailor to Your organization**: Ability to customize tool integration and signal weights

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend)
- Rootly or PagerDuty API token

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration

# Run the server
python -m app.main
```

The API will be available at `http://localhost:8000`

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

## 🔧 Configuration

### Environment Variables
```bash
# Required
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./test.db

# OAuth (optional for development)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Rootly Integration
ROOTLY_API_BASE_URL=https://api.rootly.com
FRONTEND_URL=http://localhost:3000
```

Once running, visit `http://localhost:8000/docs` for interactive API documentation.

## 📊 Signals Analysis

The On-call Burnout Detector takes inspiration from the [Copenhagen Burnout Inventory](https://nfa.dk/media/hl5nbers/cbi-first-edition.pdf) (CBI), a scientifically validated approach to measuring burnout risk in professional settings. The Burnout Detector isn’t a medical tool and doesn’t provide a diagnosis; it is designed to help identify patterns and trends that may suggest overwork.

### Methodology
Our implementation uses the two core CBI dimensions:

1. **Personal Burnout**
   - Physical and psychological fatigue from workload
   - Work-life boundary violations (after-hours/weekend work)
   - Temporal stress patterns and recovery time deficits

2. **Work-Related Burnout** 
   - Fatigue specifically tied to work processes
   - Response time pressure and incident load
   - Team collaboration stress and communication quality

## 🔐 Security

- OAuth with Google/GitHub (no password storage)
- JWT tokens for session management
- Encrypted API token storage
- HTTPS enforcement
- Input validation and sanitization

## Integrations ⚒️
* [Rootly](https://rootly.com/): For incident management and on-call data
* [PagerDuty](https://www.pagerduty.com/): For incident management and on-call data
* [GitHub](https://github.com/): For commit activity
* [Slack](http://slack.com/): For communication patterns and collect self-reported data

If you are interested in integrating with the On-call Burnout Detector, [get in touch](mailto:sylvain@rootly.com)!

## 🔗 About the Rootly AI Labs
Built with ❤️ by the [Rootly AI Labs](https://rootly.com/ai-labs) for engineering teams everywhere. The Rootly AI Labs is a fellow-led community designed to redefine reliability engineering. We develop innovative prototypes, create open-source tools, and produce research that's shared to advance the standards of operational excellence. Thank you Anthropic, Google Cloud and Google Deepmind for supporting us.

This project is licensed under the Apache License 2.0.

