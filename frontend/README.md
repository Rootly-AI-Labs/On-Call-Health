# Rootly Burnout Detector - Frontend

This is the frontend application built with Next.js, TypeScript, and Tailwind CSS using Vercel v0.

## Getting Started

This frontend connects to the FastAPI backend running on `http://localhost:8000`.

### Development Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Backend Integration

The frontend communicates with the FastAPI backend via these endpoints:

### Authentication
- `GET /auth/google` - Get Google OAuth URL
- `GET /auth/github` - Get GitHub OAuth URL  
- `GET /auth/me` - Get current user info

### Rootly Integration
- `POST /rootly/token` - Set Rootly API token
- `GET /rootly/token/test` - Test token validity
- `GET /rootly/data/preview` - Preview data

### Analysis
- `POST /analysis/start` - Start burnout analysis
- `GET /analysis/{id}` - Get analysis status
- `GET /analysis/{id}/results` - Get analysis results
- `GET /analysis/current` - Get latest analysis
- `GET /analysis/history` - Get analysis history

## OAuth Flow

1. User clicks login button (Google/GitHub)
2. Frontend requests OAuth URL from backend
3. User redirects to OAuth provider
4. OAuth provider redirects to backend callback
5. Backend redirects to frontend with JWT token
6. Frontend stores token and makes authenticated requests

## Project Structure

```
frontend/
├── src/
│   ├── app/          # Next.js app router pages
│   ├── components/   # Reusable UI components
│   ├── lib/          # Utilities and API clients
│   └── types/        # TypeScript type definitions
├── public/           # Static assets
└── package.json      # Dependencies and scripts
```

## v0 Integration

This project uses components generated with Vercel v0:

1. Generate components with v0
2. Download the code
3. Copy components to `src/components/`
4. Update imports and integrate with API
5. Commit changes to GitHub
6. Vercel auto-deploys the updates

## Environment Variables

Required environment variables:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For production:
```bash
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
```# Force new deployment
# Trigger rebuild
