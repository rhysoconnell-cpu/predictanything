import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import { APIIntegrations } from './services/apiIntegrations.js'
import { AutoResolver } from './services/autoResolver.js'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Initialize services
const apiIntegrations = new APIIntegrations({
  oddsApiKey: process.env.ODDS_API_KEY,
  alphaVantageKey: process.env.ALPHA_VANTAGE_KEY,
  newsApiKey: process.env.NEWS_API_KEY
})

const autoResolver = new AutoResolver(supabase, apiIntegrations)

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Get all predictions
app.get('/api/predictions', async (req, res) => {
  try {
    const { status = 'active', category, limit = 50 } = req.query
    
    let query = supabase
      .from('predictions')
      .select('*')
      .order('trending_score', { ascending: false })
      .limit(parseInt(limit))

    if (status) {
      query = query.eq('status', status)
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single prediction
app.get('/api/predictions/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create prediction
app.post('/api/predictions', async (req, res) => {
  try {
    const { title, description, category, options, ends_at, creator_id, metadata } = req.body

    const { data, error } = await supabase
      .from('predictions')
      .insert({
        title,
        description,
        category,
        options: JSON.stringify(options),
        ends_at,
        creator_id,
        metadata: metadata || {},
        status: 'active',
        total_votes: 0,
        total_credits_staked: 0
      })
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Vote on prediction
app.post('/api/predictions/:id/vote', async (req, res) => {
  try {
    const { user_id, selected_option, credits_staked } = req.body
    const prediction_id = req.params.id

    // Check user has enough credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user_id)
      .single()

    if (!profile || profile.credits < credits_staked) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Deduct credits
    await supabase
      .from('profiles')
      .update({ credits: profile.credits - credits_staked })
      .eq('id', user_id)

    // Create vote
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .insert({
        prediction_id,
        user_id,
        selected_option,
        credits_staked
      })
      .select()
      .single()

    if (voteError) {
      // Refund credits on error
      await supabase
        .from('profiles')
        .update({ credits: profile.credits })
        .eq('id', user_id)
      throw voteError
    }

    // Update prediction totals
    const { data: prediction } = await supabase
      .from('predictions')
      .select('total_votes, total_credits_staked')
      .eq('id', prediction_id)
      .single()

    await supabase
      .from('predictions')
      .update({
        total_votes: prediction.total_votes + 1,
        total_credits_staked: prediction.total_credits_staked + credits_staked
      })
      .eq('id', prediction_id)

    res.json(vote)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get votes for a prediction
app.get('/api/predictions/:id/votes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('prediction_id', req.params.id)

    if (error) throw error
    
    // Calculate vote percentages
    const total = data.length
    const optionCounts = {}
    data.forEach(vote => {
      optionCounts[vote.selected_option] = (optionCounts[vote.selected_option] || 0) + 1
    })

    const percentages = {}
    Object.keys(optionCounts).forEach(option => {
      percentages[option] = total > 0 ? (optionCounts[option] / total) * 100 : 0
    })

    res.json({ votes: data, percentages, total })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get user's votes
app.get('/api/users/:userId/votes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('*, predictions(*)')
      .eq('user_id', req.params.userId)
      .order('voted_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, credits, accuracy_percentage, total_votes, correct_votes')
      .order('credits', { ascending: false })
      .limit(100)

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Auto-generate predictions (admin endpoint)
app.post('/api/admin/generate-predictions', async (req, res) => {
  try {
    const sportsPredictions = await apiIntegrations.createSportsPredictions()
    const cryptoPredictions = await apiIntegrations.createCryptoPredictions()
    const stockPredictions = await apiIntegrations.createStockPredictions()

    const allPredictions = [
      ...sportsPredictions,
      ...cryptoPredictions,
      ...stockPredictions
    ]

    // Insert into database
    const { data, error } = await supabase
      .from('predictions')
      .insert(allPredictions.map(p => ({
        ...p,
        options: JSON.stringify(p.options),
        status: 'active',
        total_votes: 0,
        total_credits_staked: 0
      })))
      .select()

    if (error) throw error
    res.json({ created: data.length, predictions: data })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Manual resolve prediction (admin)
app.post('/api/admin/predictions/:id/resolve', async (req, res) => {
  try {
    const { winning_option } = req.body
    const prediction_id = req.params.id

    const { data: prediction } = await supabase
      .from('predictions')
      .select('*')
      .eq('id', prediction_id)
      .single()

    await autoResolver.distributeWinnings(prediction_id, winning_option)
    
    res.json({ success: true, winner: winning_option })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ==================== CRON JOBS ====================

// Check for predictions to resolve every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('[CRON] Running auto-resolution check...')
  try {
    await autoResolver.checkAndResolve()
  } catch (error) {
    console.error('[CRON] Auto-resolution error:', error)
  }
})

// Auto-generate new predictions every 12 hours
cron.schedule('0 */12 * * *', async () => {
  console.log('[CRON] Auto-generating new predictions...')
  try {
    const sportsPredictions = await apiIntegrations.createSportsPredictions()
    const cryptoPredictions = await apiIntegrations.createCryptoPredictions()

    const allPredictions = [...sportsPredictions, ...cryptoPredictions]

    await supabase
      .from('predictions')
      .insert(allPredictions.map(p => ({
        ...p,
        options: JSON.stringify(p.options),
        status: 'active',
        total_votes: 0,
        total_credits_staked: 0
      })))

    console.log(`[CRON] Created ${allPredictions.length} new predictions`)
  } catch (error) {
    console.error('[CRON] Auto-generation error:', error)
  }
})

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
  console.log('✅ Auto-resolution active (every 5 minutes)')
  console.log('✅ Auto-generation active (every 12 hours)')
})
