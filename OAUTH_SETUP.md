# OAuth Configuration Guide

This document outlines the OAuth redirect URIs that need to be configured in each provider's console after updating to use `api.oncallhealth.ai`.

## Environment Variables

Ensure these are set in your Railway backend environment:

```env
GOOGLE_REDIRECT_URI=https://api.oncallhealth.ai/auth/google/callback
GITHUB_REDIRECT_URI=https://api.oncallhealth.ai/auth/github/callback
SLACK_REDIRECT_URI=https://api.oncallhealth.ai/auth/slack/callback
FRONTEND_URL=https://oncallhealth.ai
PRODUCTION_FRONTEND_URL=https://oncallhealth.ai
```

Frontend (Vercel):
```env
NEXT_PUBLIC_API_URL=https://api.oncallhealth.ai
NEXT_PUBLIC_API_BASE_URL=https://api.oncallhealth.ai
```

## Provider Console Updates

### 1. Google OAuth (Google Cloud Console)

**Location:** https://console.cloud.google.com/apis/credentials

**Steps:**
1. Navigate to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Update **Authorized redirect URIs**:
   - Add: `https://api.oncallhealth.ai/auth/google/callback`
   - Remove old: `https://rootly-burnout-detector-web-production.up.railway.app/auth/google/callback`
4. Update **Authorized JavaScript origins**:
   - Add: `https://oncallhealth.ai`
   - Add: `https://api.oncallhealth.ai`
5. Click **Save**

**OAuth Consent Screen (Optional branding update):**
1. Go to **OAuth consent screen** tab
2. Update **Application name** to "On-Call Health"
3. Update **Application homepage** to `https://oncallhealth.ai`
4. Upload logo if desired

### 2. GitHub OAuth (GitHub Developer Settings)

**Location:** https://github.com/settings/developers

**Steps:**
1. Click on your OAuth App
2. Update **Authorization callback URL**:
   - Change to: `https://api.oncallhealth.ai/auth/github/callback`
3. Update **Homepage URL** to: `https://oncallhealth.ai`
4. Click **Update application**

### 3. Slack OAuth (Slack API Dashboard)

**Location:** https://api.slack.com/apps

**Steps:**
1. Select your app
2. Go to **OAuth & Permissions** in the sidebar
3. Under **Redirect URLs**:
   - Add: `https://api.oncallhealth.ai/auth/slack/callback`
   - Remove old Railway URL
4. Click **Save URLs**

**App Settings (branding):**
1. Go to **Basic Information**
2. Update **App Name** to "On-Call Health"
3. Update **Short Description**
4. Upload app icon
5. Click **Save Changes**

### 4. Jira OAuth (Atlassian Developer Console)

**Location:** https://developer.atlassian.com/console/myapps/

**Steps:**
1. Select your app
2. Go to **Authorization** → **OAuth 2.0 (3LO)**
3. Update **Callback URL**:
   - Change to: `https://api.oncallhealth.ai/setup/jira/callback`
4. Click **Save changes**

### 5. Linear OAuth (Linear Settings)

**Location:** https://linear.app/settings/api/applications

**Steps:**
1. Select your OAuth application
2. Update **Callback URLs**:
   - Change to: `https://api.oncallhealth.ai/setup/linear/callback`
3. Update **Application URL** to: `https://oncallhealth.ai`
4. Click **Update**

## Testing Checklist

After updating all OAuth providers:

- [ ] Google Sign-in shows `oncallhealth.ai` in consent screen
- [ ] GitHub OAuth redirects correctly
- [ ] Slack workspace connection works
- [ ] Jira integration connects successfully
- [ ] Linear integration connects successfully
- [ ] No CORS errors in browser console
- [ ] All callbacks redirect to correct domain

## Rollback Plan

If issues occur, revert environment variables to use Railway domain:

```env
# Backend
GOOGLE_REDIRECT_URI=https://rootly-burnout-detector-web-production.up.railway.app/auth/google/callback
GITHUB_REDIRECT_URI=https://rootly-burnout-detector-web-production.up.railway.app/auth/github/callback

# Frontend
NEXT_PUBLIC_API_URL=https://rootly-burnout-detector-web-production.up.railway.app
```

And re-add Railway URLs to OAuth provider consoles.

## Notes

- Keep both old and new redirect URIs active during transition period
- Test thoroughly in staging before removing old URIs
- Update documentation/README with new domain
- Consider adding `api.oncallhealth.ai` to your DNS if not already set up
