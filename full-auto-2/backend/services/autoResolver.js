import { createClient } from '@supabase/supabase-js'

export class AutoResolver {
  constructor(supabase, apiIntegrations) {
    this.supabase = supabase
    this.api = apiIntegrations
  }

  // Main resolution check - runs every 5 minutes
  async checkAndResolve() {
    console.log('[AutoResolver] Checking for predictions to resolve...')
    
    const { data: predictions } = await this.supabase
      .from('predictions')
      .select('*')
      .eq('status', 'active')
      .lt('ends_at', new Date().toISOString())

    if (!predictions || predictions.length === 0) {
      console.log('[AutoResolver] No predictions to resolve')
      return
    }

    console.log(`[AutoResolver] Found ${predictions.length} predictions to resolve`)

    for (const prediction of predictions) {
      await this.resolvePrediction(prediction)
    }
  }

  // Resolve a single prediction
  async resolvePrediction(prediction) {
    const metadata = prediction.metadata || {}
    let winner = null

    try {
      // Determine winner based on type
      if (metadata.type === 'sports') {
        winner = await this.resolveSports(metadata)
      } else if (metadata.type === 'crypto') {
        winner = await this.resolveCrypto(metadata)
      } else if (metadata.type === 'stock') {
        winner = await this.resolveStock(metadata)
      } else {
        // Manual prediction - mark as locked, needs admin resolution
        await this.lockPrediction(prediction.id)
        return
      }

      if (winner) {
        await this.distributeWinnings(prediction.id, winner)
        console.log(`[AutoResolver] Resolved prediction: ${prediction.title} - Winner: ${winner}`)
      }
    } catch (error) {
      console.error(`[AutoResolver] Error resolving ${prediction.id}:`, error.message)
    }
  }

  // Resolve sports prediction
  async resolveSports(metadata) {
    const result = await this.api.getSportsResult(metadata.eventId, metadata.sport)
    
    if (result.completed) {
      // Home team won
      if (result.winner === 'home') {
        return 'Yes'
      } else {
        return 'No'
      }
    }
    return null
  }

  // Resolve crypto prediction
  async resolveCrypto(metadata) {
    const currentPrice = await this.api.getCryptoPrice(metadata.coinId)
    
    if (currentPrice) {
      if (currentPrice >= metadata.targetPrice) {
        return 'Yes'
      } else {
        return 'No'
      }
    }
    return null
  }

  // Resolve stock prediction
  async resolveStock(metadata) {
    const currentPrice = await this.api.getStockPrice(metadata.symbol)
    
    if (currentPrice) {
      if (currentPrice >= metadata.targetPrice) {
        return 'Yes'
      } else {
        return 'No'
      }
    }
    return null
  }

  // Lock prediction (needs manual resolution)
  async lockPrediction(predictionId) {
    await this.supabase
      .from('predictions')
      .update({ status: 'locked' })
      .eq('id', predictionId)
  }

  // Distribute winnings to correct voters
  async distributeWinnings(predictionId, winningOption) {
    // Get all votes for this prediction
    const { data: votes } = await this.supabase
      .from('votes')
      .select('*')
      .eq('prediction_id', predictionId)

    if (!votes || votes.length === 0) return

    // Calculate total pool and winner pool
    const totalPool = votes.reduce((sum, v) => sum + v.credits_staked, 0)
    const winnerVotes = votes.filter(v => v.selected_option === winningOption)
    const winnerPool = winnerVotes.reduce((sum, v) => sum + v.credits_staked, 0)

    if (winnerPool === 0) {
      // No winners - refund everyone
      for (const vote of votes) {
        await this.refundVote(vote)
      }
    } else {
      // Distribute proportionally to winners
      for (const vote of votes) {
        if (vote.selected_option === winningOption) {
          const share = vote.credits_staked / winnerPool
          const winnings = Math.floor(totalPool * share)
          await this.payoutWinner(vote, winnings)
        } else {
          await this.markLoser(vote)
        }
      }
    }

    // Mark prediction as resolved
    await this.supabase
      .from('predictions')
      .update({ 
        status: 'resolved',
        winning_option: winningOption,
        resolved_at: new Date().toISOString()
      })
      .eq('id', predictionId)
  }

  // Payout to winner
  async payoutWinner(vote, winnings) {
    // Update vote
    await this.supabase
      .from('votes')
      .update({ 
        is_winner: true, 
        credits_won: winnings 
      })
      .eq('id', vote.id)

    // Add credits to user
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('credits, correct_votes, total_votes')
      .eq('id', vote.user_id)
      .single()

    if (profile) {
      await this.supabase
        .from('profiles')
        .update({ 
          credits: profile.credits + winnings,
          correct_votes: profile.correct_votes + 1,
          total_votes: profile.total_votes + 1,
          accuracy_percentage: ((profile.correct_votes + 1) / (profile.total_votes + 1)) * 100
        })
        .eq('id', vote.user_id)
    }
  }

  // Mark as loser
  async markLoser(vote) {
    await this.supabase
      .from('votes')
      .update({ 
        is_winner: false, 
        credits_won: 0 
      })
      .eq('id', vote.id)

    // Update user stats
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('total_votes, correct_votes')
      .eq('id', vote.user_id)
      .single()

    if (profile) {
      await this.supabase
        .from('profiles')
        .update({ 
          total_votes: profile.total_votes + 1,
          accuracy_percentage: (profile.correct_votes / (profile.total_votes + 1)) * 100
        })
        .eq('id', vote.user_id)
    }
  }

  // Refund vote
  async refundVote(vote) {
    await this.supabase
      .from('votes')
      .update({ 
        is_winner: null, 
        credits_won: vote.credits_staked 
      })
      .eq('id', vote.id)

    // Refund credits
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('credits')
      .eq('id', vote.user_id)
      .single()

    if (profile) {
      await this.supabase
        .from('profiles')
        .update({ 
          credits: profile.credits + vote.credits_staked 
        })
        .eq('id', vote.user_id)
    }
  }
}
