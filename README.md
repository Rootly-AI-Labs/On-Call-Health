
# On-call Burnout Detector

Detects potential signs of overwork in incident responders which could lead to burnout. To compute a per-responder risk score, it integrates with Rootly, PagerDuty, GitHub, and Slack.

![Rootly AI Labs On-call Burnout Detector screenshot](assets/rootly-burnout-detector.png)

Two ways to get started:
* Use our hosted version [www.oncallburnout.com](https://www.oncallburnout.com/) (contains mock data if you just want to test it out)
* Host it [locally](#Installation)

## Installation
Use our Docker Compose file.
```
# Clone the repo
git clone https://github.com/Rootly-AI-Labs/on-call-burnout-detector
cd on-call-burnout-detector

# Launch with Docker Compose
docker compose up -d
```

### Environment Variables
⚠️ For login purposes, you **must** configure OAuth tokens for Google OR GitHub OAuth:
```
# Create a copy of the .env file
cp backend/.env.example backend/.env
```

<details>
<summary><b>📝 Instructions to get token for Google Auth</b></summary>

1. **Enable [Google People API](https://console.cloud.google.com/marketplace/product/google/people.googleapis.com)**
2. **Get your tokens**
	* Create a [new project](https://console.cloud.google.com/projectcreate)
 	* In the ** Overview ** tab, click on ** Get started ** button and fill out info	
 	* Go to the ** Clients ** tab and click on ** + Create client ** button
  	* Set ** Appliecation type ** to ** Web application **
	* Set ** Authorized redirect URIs ** to ** http://localhost:8000/auth/google/callback **
	* Keep the pop-up that contains your ** Client ID ** and ** Client secret ** open
3. **Fill out the variable `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `backend/.env` file**
4. **Restart backend `docker compose restart backend`**
</details>

<details>
<summary><b>📝 Instructions to get token for GitHub Auth</b></summary>

1. **Visit [https://github.com/settings/developers](https://github.com/settings/developers)**
	*  Click **OAuth Apps** → **New OAuth App**
	* **Application name**: On-Call Burnout Detector
	- **Homepage URL**: http://localhost:3000
	- **Authorization callback URL**: http://localhost:8000/auth/github/callback
2. **Create the app:**
	* Click **Register application**
	* You'll see your **Client ID**
	* Click **Generate a new client secret** to get your **Client Secret**
3. **Add to `backend/.env:`**
4. **Restart backend:**
</details>

### Manual setup
<details><summary>You can also set it up manually, but this method isn't actively supported.</summary>

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
</details>

##  Features

- ** Multi Layer Signals**: Individual and team-level insights
- ** Interactive Dashboard**: Visual  and AI-powered burnout risk analysis
- ** Real-time Analysis**: Progress tracking during data processing
- ** Tailor to Your organization**: Ability to customize tool integration and signal weights

##  Methodology

The On-call Burnout Detector (OCB) takes inspiration from the [Copenhagen Burnout Inventory](https://nfa.dk/media/hl5nbers/cbi-first-edition.pdf) (CBI), a scientifically validated approach to measuring burnout risk in professional settings. The Burnout Detector isn’t a medical tool and doesn’t provide a diagnosis; it is designed to help identify patterns and trends that may suggest overwork.

### Methodology breakdown
Our implementation uses the two core dimensions:

1. **Personal Burnout**
   - Physical and psychological fatigue from workload
   - Work-life boundary violations (after-hours/weekend work)
   - Temporal stress patterns and recovery time deficits

2. **Work-Related Burnout** 
   - Fatigue specifically tied to work processes
   - Response time, pressure, and incident load
   - Team collaboration, stress, and communication quality

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
Built with ❤️ by the [Rootly AI Labs](https://rootly.com/ai-labs) for engineering teams everywhere. The Rootly AI Labs is a fellow-led community designed to redefine reliability engineering. We develop innovative prototypes, create open-source tools, and produce research that's shared to advance the standards of operational excellence. We would like to thank Anthropic, Google Cloud, and Google DeepMind for their support.

This project is licensed under the Apache License 2.0.
