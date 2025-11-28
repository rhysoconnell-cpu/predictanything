import axios from 'axios'

export class APIIntegrations {
  constructor(keys) {
    this.oddsApiKey = keys.oddsApiKey
    this.alphaVantageKey = keys.alphaVantageKey
    this.newsApiKey = keys.newsApiKey
  }

  // Get upcoming sports games
  async getUpcomingSports() {
    try {
      const response = await axios.get(
        `https://api.the-odds-api.com/v4/sports/upcoming/odds`,
        {
          params: {
            apiKey: this.oddsApiKey,
            regions: 'us',
            markets: 'h2h',
            oddsFormat: 'american'
          }
        }
      )
      return response.data.slice(0, 10) // Get top 10
    } catch (error) {
      console.error('Odds API error:', error.message)
      return []
    }
  }

  // Get sports game result
  async getSportsResult(eventId, sport) {
    try {
      const response = await axios.get(
        `https://api.the-odds-api.com/v4/sports/${sport}/scores`,
        {
          params: {
            apiKey: this.oddsApiKey,
            daysFrom: 1
          }
        }
      )
      
      const event = response.data.find(e => e.id === eventId)
      if (event && event.completed) {
        return {
          completed: true,
          homeScore: event.scores[0].score,
          awayScore: event.scores[1].score,
          winner: event.scores[0].score > event.scores[1].score ? 'home' : 'away'
        }
      }
      return { completed: false }
    } catch (error) {
      console.error('Sports result error:', error.message)
      return { completed: false }
    }
  }

  // Get crypto price
  async getCryptoPrice(coinId) {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price`,
        {
          params: {
            ids: coinId,
            vs_currencies: 'usd'
          }
        }
      )
      return response.data[coinId]?.usd || null
    } catch (error) {
      console.error('Crypto price error:', error.message)
      return null
    }
  }

  // Get stock price
  async getStockPrice(symbol) {
    try {
      const response = await axios.get(
        `https://www.alphavantage.co/query`,
        {
          params: {
            function: 'GLOBAL_QUOTE',
            symbol: symbol,
            apikey: this.alphaVantageKey
          }
        }
      )
      return parseFloat(response.data['Global Quote']?.['05. price']) || null
    } catch (error) {
      console.error('Stock price error:', error.message)
      return null
    }
  }

  // Get trending news
  async getTrendingNews() {
    try {
      const response = await axios.get(
        `https://newsapi.org/v2/top-headlines`,
        {
          params: {
            country: 'us',
            pageSize: 10,
            apiKey: this.newsApiKey
          }
        }
      )
      return response.data.articles || []
    } catch (error) {
      console.error('News API error:', error.message)
      return []
    }
  }

  // Auto-create sports predictions
  async createSportsPredictions() {
    const games = await this.getUpcomingSports()
    const predictions = []

    for (const game of games) {
      if (game.home_team && game.away_team) {
        predictions.push({
          title: `Will ${game.home_team} beat ${game.away_team}?`,
          description: `${game.sport_title} - ${new Date(game.commence_time).toLocaleDateString()}`,
          category: 'Sports',
          options: ['Yes', 'No'],
          ends_at: game.commence_time,
          metadata: {
            type: 'sports',
            eventId: game.id,
            sport: game.sport_key,
            homeTeam: game.home_team,
            awayTeam: game.away_team
          }
        })
      }
    }

    return predictions
  }

  // Auto-create crypto predictions
  async createCryptoPredictions() {
    const coins = ['bitcoin', 'ethereum', 'cardano']
    const predictions = []

    for (const coin of coins) {
      const price = await this.getCryptoPrice(coin)
      if (price) {
        const targetPrice = Math.round(price * 1.1) // 10% increase
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        predictions.push({
          title: `Will ${coin.toUpperCase()} reach $${targetPrice} by tomorrow?`,
          description: `Current price: $${price.toFixed(2)}`,
          category: 'Crypto',
          options: ['Yes', 'No'],
          ends_at: tomorrow.toISOString(),
          metadata: {
            type: 'crypto',
            coinId: coin,
            targetPrice: targetPrice,
            startPrice: price
          }
        })
      }
    }

    return predictions
  }

  // Auto-create stock predictions
  async createStockPredictions() {
    const stocks = ['AAPL', 'TSLA', 'MSFT', 'GOOGL']
    const predictions = []

    for (const symbol of stocks) {
      const price = await this.getStockPrice(symbol)
      if (price) {
        const targetPrice = Math.round(price * 1.05) // 5% increase
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        predictions.push({
          title: `Will ${symbol} close above $${targetPrice} tomorrow?`,
          description: `Current price: $${price.toFixed(2)}`,
          category: 'Stocks',
          options: ['Yes', 'No'],
          ends_at: tomorrow.toISOString(),
          metadata: {
            type: 'stock',
            symbol: symbol,
            targetPrice: targetPrice,
            startPrice: price
          }
        })
      }
    }

    return predictions
  }
}
