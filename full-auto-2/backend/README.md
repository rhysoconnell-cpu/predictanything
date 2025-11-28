# PredictAnything Backend - Full Automation

## Features

✅ **Live API Integrations**
- Sports (The Odds API)
- Crypto (CoinGecko)
- Stocks (Alpha Vantage)
- News (NewsAPI)

✅ **Auto-Resolution System**
- Checks every 5 minutes
- Resolves predictions automatically
- Distributes credits to winners

✅ **Auto-Generation**
- Creates new predictions every 12 hours
- Based on live sports, crypto, stocks

✅ **Full REST API**
- Predictions CRUD
- Voting system
- Leaderboard
- User stats

---

## Deploy to Render.com

### 1. Create Account
- Go to https://render.com
- Sign up with GitHub

### 2. Create Web Service
- Click "New +" → "Web Service"
- Connect your GitHub repo
- Or deploy from this folder

### 3. Settings
```
Name: predictanything-api
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

### 4. Environment Variables

Add these in Render dashboard:

```
SUPABASE_URL=https://ywbneonuhfvykjqhyoab.supabase.co
SUPABASE_SERVICE_KEY=[your service key from Supabase]

ODDS_API_KEY=272c77eb4cfad7d900bc93ab25394a60
ALPHA_VANTAGE_KEY=ZK7WLW8GSZ58PL7D
NEWS_API_KEY=0cf5d585965345f893b43e145e17317e

PORT=10000
NODE_ENV=production
```

**IMPORTANT:** Get your Supabase Service Key:
1. Go to Supabase project settings
2. API settings
3. Copy the "service_role" key (not anon key!)

### 5. Deploy
- Click "Create Web Service"
- Wait 5 minutes
- You'll get a URL like: `https://predictanything-api.onrender.com`

---

## API Endpoints

### Predictions
```
GET    /api/predictions              - Get all predictions
GET    /api/predictions/:id          - Get one prediction
POST   /api/predictions              - Create prediction
POST   /api/predictions/:id/vote     - Vote on prediction
GET    /api/predictions/:id/votes    - Get vote stats
```

### Users
```
GET    /api/users/:userId/votes      - Get user's votes
GET    /api/leaderboard              - Get top users
```

### Admin
```
POST   /api/admin/generate-predictions    - Generate predictions
POST   /api/admin/predictions/:id/resolve - Manually resolve
```

---

## How It Works

### Auto-Resolution (Every 5 minutes)
1. Finds predictions past end_at
2. Checks external API for result
3. Determines winner
4. Distributes credits proportionally
5. Updates user stats

### Auto-Generation (Every 12 hours)
1. Fetches upcoming sports games
2. Gets crypto/stock prices
3. Creates predictions automatically
4. Inserts into database

### Vote Distribution
```
Example:
Total Pool: 1000 credits
Yes votes: 600 credits (3 users)
No votes: 400 credits (2 users)

If "Yes" wins:
- Each Yes voter gets their share of 1000 credits
- No voters lose their stake
```

---

## Testing Locally

```bash
cd backend
npm install
cp .env.example .env
# Add your keys to .env
npm start
```

Server runs on http://localhost:3001

---

## Monitoring

### Check Health
```
GET https://your-api.onrender.com/api/health
```

### Logs
- Go to Render dashboard
- Click your service
- View "Logs" tab
- See cron jobs running

---

## Next Steps

1. Deploy backend to Render
2. Get the API URL
3. Add URL to frontend env vars
4. Deploy frontend to Netlify
5. Watch predictions auto-resolve!

---

## Troubleshooting

**Cron jobs not running?**
- Check Render logs
- Free tier might sleep - upgrade to paid ($7/mo) for 24/7

**API errors?**
- Check API keys are correct
- The Odds API: 500 calls/month limit
- Alpha Vantage: 25 calls/day limit

**Predictions not resolving?**
- Check prediction metadata has correct format
- Check external APIs are responding
- View logs for error messages
