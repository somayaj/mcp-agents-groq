import { z } from 'zod';
import { AgentTool } from '../types/index.js';

/**
 * Creates a search tool that can be used by agents
 * This is a basic implementation that can be extended with actual search functionality
 * 
 * @param options - Configuration options for the search tool
 * @returns An AgentTool instance for searching
 */
export function createSearchTool(options?: {
  searchFunction?: (query: string) => Promise<string>;
}): AgentTool {
  // Use DuckDuckGo search by default for real results
  const searchFunction = options?.searchFunction || duckDuckGoSearch;

  return {
    name: 'search',
    description: 'Search for information and fetch REAL-TIME financial data from Yahoo Finance. For ANY financial data analysis, stock prices, commodity prices, cryptocurrency, market data, or price queries, this tool ALWAYS fetches REAL-TIME data directly from Yahoo Finance API. Yahoo Finance is the PRIMARY source for all financial data. For non-financial queries, it uses DuckDuckGo. ALWAYS use the real data provided by this tool - NEVER generate hypothetical, simulated, or fictional data. If the tool returns real data from Yahoo Finance, you MUST use that exact data in your response.',
    parameters: z.object({
      query: z.string().describe('The search query. For ANY financial/market data (stocks, commodities, crypto, prices, analysis, forecasts), this ALWAYS returns real-time data from Yahoo Finance. For other queries, returns current information from DuckDuckGo.'),
    }),
    handler: async (params: { query: string }) => {
      try {
        console.log('[Search Tool Handler] Processing query:', params.query);
        const results = await searchFunction(params.query);
        console.log('[Search Tool Handler] Search successful, result length:', results?.length || 0);
        return results;
      } catch (error: any) {
        console.error('[Search Tool Handler] Search error:', error);
        // Don't return a generic error - try to provide helpful information
        const errorMsg = error.message || 'Unknown error';
        return `⚠️ Search Tool Error: ${errorMsg}\n\nPlease try:\n- Using a specific ticker symbol (e.g., "NFLX" for Netflix)\n- Using a company name (e.g., "Netflix stock")\n- Rephrasing your query to be more specific`;
      }
    },
  };
}

/**
 * Default search function - simulates a search
 * Replace this with actual search implementation (e.g., Google Search API, DuckDuckGo, etc.)
 */
async function defaultSearchFunction(query: string): Promise<string> {
  // This should not be called anymore since we use duckDuckGoSearch by default
  // But if it is, provide a helpful error message
  return `⚠️ Search Error: Unable to fetch data for "${query}".\n\n` +
    `For financial/market data, please try:\n` +
    `- Using a specific ticker symbol (e.g., "NFLX" for Netflix)\n` +
    `- Using a company name (e.g., "Netflix stock")\n` +
    `- Rephrasing your query to be more specific\n\n` +
    `The search tool is configured to fetch real-time data from Yahoo Finance for financial queries.`;
}

/**
 * Example: Wikipedia search implementation
 */
export async function wikipediaSearch(query: string): Promise<string> {
  try {
    // Example: Using Wikipedia API
    const encodedQuery = encodeURIComponent(query);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { extract?: string; description?: string };
    return `Wikipedia results for "${query}":\n\n${data.extract || data.description || 'No summary available'}`;
  } catch (error: any) {
    return `Wikipedia search error: ${error.message}`;
  }
}

/**
 * DuckDuckGo search implementation (using DuckDuckGo Instant Answer API)
 * This provides real search results without requiring an API key
 */
export async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const lowerQuery = query.toLowerCase();
    
    // Check if this looks like a financial/market data query - EXPANDED list
    const financialKeywords = [
      'stock', 'price', 'prices', 'share', 'shares', 'ticker', 'nasdaq', 'nyse', 
      'financial', 'market', 'trading', 'commodity', 'commodities', 'futures',
      'silver', 'gold', 'copper', 'oil', 'crude', 'natural gas', 'platinum', 
      'palladium', 'currency', 'forex', 'exchange rate', 'crypto', 'bitcoin',
      'ethereum', 'dollar', 'euro', 'yen', 'pound', 'analysis', 'forecast',
      'prediction', 'trend', 'chart', 'graph', 'data', 'value', 'worth',
      'cost', 'rate', 'quote', 'current', 'today', 'now', 'latest', 'recent',
      'earnings', 'revenue', 'profit', 'loss', 'dividend', 'yield', 'volume',
      'market cap', 'marketcap', 'pe ratio', 'p/e', 'eps', 'sales'
    ];
    const isFinancialQuery = financialKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // Also check if query contains any ticker-like patterns (2-5 uppercase letters)
    const hasTickerPattern = /\b[A-Z]{2,5}(?:=F|-USD)?\b/.test(query);
    
    // PRIORITY: For ANY financial query, ALWAYS try Yahoo Finance FIRST
    if (isFinancialQuery || hasTickerPattern) {
      console.log('[Search Tool] Financial query detected - PRIORITIZING Yahoo Finance');
      
      // First, try to extract a known ticker symbol
      const knownTicker = extractTicker(query);
      if (knownTicker) {
        try {
          console.log('[Search Tool] Fetching from Yahoo Finance for ticker:', knownTicker);
          return await getStockData(knownTicker, query);
        } catch (error) {
          console.log('[Search Tool] Known ticker fetch failed, trying smart detection:', error);
          // Continue to smart detection below
        }
      }
      
      // Smart detection: Try to find any potential ticker/commodity symbol in the query
      // Extract potential ticker symbols (2-5 uppercase letters, or commodity patterns like SI=F)
      const tickerPatterns = [
        /\b([A-Z]{2,5}(?:=F)?)\b/g,  // Standard tickers like AAPL, GOOGL, SI=F
        /\b([A-Z]{1,2}=F)\b/g,       // Short futures like SI=F, GC=F
        /\b([A-Z]{3,6})\s+(?:stock|price|ticker|shares?)/i,  // Ticker before keywords
        /(?:stock|price|ticker|shares?)\s+of\s+([A-Z]{2,5})\b/i,  // Keywords before ticker
      ];
      
      for (const pattern of tickerPatterns) {
        const matches = query.matchAll(pattern);
        for (const match of matches) {
          const potentialTicker = match[1].toUpperCase();
          // Skip common words that might match
          const skipWords = ['THE', 'FOR', 'AND', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE'];
          if (skipWords.includes(potentialTicker)) continue;
          
          // Try to fetch data for this potential ticker
          try {
            const data = await getStockData(potentialTicker, query);
            if (data && !data.includes('Unable to fetch')) {
              return data;
            }
          } catch (error) {
            // Not a valid ticker, continue searching
            continue;
          }
        }
      }
      
      // If no ticker found but it's a financial query, try extracting commodity/asset names
      const commodityMap: Record<string, string> = {
        'silver': 'SI=F',
        'gold': 'GC=F',
        'copper': 'HG=F',
        'oil': 'CL=F',
        'crude oil': 'CL=F',
        'crude': 'CL=F',
        'wti': 'CL=F',
        'brent': 'BZ=F',
        'natural gas': 'NG=F',
        'platinum': 'PL=F',
        'palladium': 'PA=F',
        'bitcoin': 'BTC-USD',
        'ethereum': 'ETH-USD',
        'btc': 'BTC-USD',
        'eth': 'ETH-USD',
      };
      
      for (const [commodity, ticker] of Object.entries(commodityMap)) {
        if (lowerQuery.includes(commodity)) {
          try {
            return await getStockData(ticker, query);
          } catch (error) {
            // Continue to next commodity or fall through to regular search
            continue;
          }
        }
      }
      
      // If we couldn't find market data but it's a financial query, 
      // return a message directing to Yahoo Finance
      return `⚠️ FINANCIAL QUERY DETECTED: This appears to be a financial/market data query. 
      
To get REAL-TIME data from Yahoo Finance, please:
1. Use a specific ticker symbol (e.g., "AAPL", "GOOGL", "SI=F" for silver)
2. Use a commodity name (e.g., "silver", "gold", "oil")
3. Use a company name (e.g., "Apple", "Google", "Mastercard")

Example queries that will fetch real-time data from Yahoo Finance:
- "AAPL stock price"
- "silver price"
- "GOOGL financial data"
- "bitcoin price"

For general information, trying DuckDuckGo search...`;
    }
    
    // Non-financial query - use DuckDuckGo
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { 
      AbstractText?: string; 
      AbstractURL?: string; 
      Answer?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      Heading?: string;
    };
    
    let result = `Search results for "${query}":\n\n`;
    
    if (data.AbstractText) {
      result += `${data.AbstractText}\n\n`;
      if (data.AbstractURL) {
        result += `Source: ${data.AbstractURL}\n\n`;
      }
    } else if (data.Answer) {
      result += `Answer: ${data.Answer}\n\n`;
    } else if (data.Heading) {
      result += `${data.Heading}\n\n`;
    }
    
    // Add related topics if available
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      result += `Related topics:\n`;
      data.RelatedTopics.slice(0, 5).forEach((topic, index) => {
        if (topic.Text) {
          result += `${index + 1}. ${topic.Text}\n`;
          if (topic.FirstURL) {
            result += `   ${topic.FirstURL}\n`;
          }
        }
      });
    }
    
    // If we got some results, return them; otherwise provide a helpful message
    if (result.length > `Search results for "${query}":\n\n`.length) {
      return result;
    } else {
      // Fallback: try to get more information using a web search approach
      return `Search results for "${query}":\n\n` +
        `Found information about ${query}. For more detailed results, try:\n` +
        `- Rephrasing your query to be more specific\n` +
        `- Using more specific keywords\n` +
        `- Searching for related terms\n\n` +
        `Note: DuckDuckGo Instant Answer API provides concise answers. For comprehensive results, consider integrating a full web search API.`;
    }
  } catch (error: any) {
    console.error('[Search Tool] DuckDuckGo search error:', error);
    
    // If it's a financial query, try one more time with Yahoo Finance directly
    const lowerQuery = query.toLowerCase();
    const financialKeywords = ['stock', 'price', 'ticker', 'financial', 'market', 'commodity', 'silver', 'gold', 'oil', 'bitcoin', 'crypto', 'earnings', 'revenue', 'netflix', 'nflx'];
    const isFinancialQuery = financialKeywords.some(keyword => lowerQuery.includes(keyword));
    
    if (isFinancialQuery) {
      // Try to extract ticker and fetch directly from Yahoo Finance
      const ticker = extractTicker(query);
      if (ticker) {
        try {
          console.log('[Search Tool] Retrying with direct Yahoo Finance fetch for:', ticker);
          return await getStockData(ticker, query);
        } catch (stockError: any) {
          console.error('[Search Tool] Yahoo Finance fetch also failed:', stockError);
          return `⚠️ Unable to fetch real-time data for "${query}" (ticker: ${ticker}).\n\n` +
            `Error: ${stockError.message || 'Unknown error'}\n\n` +
            `Please verify the ticker symbol is correct and try again.`;
        }
      }
    }
    
    // For non-financial queries, return helpful error message
    return `⚠️ Search Error: Unable to fetch data for "${query}".\n\n` +
      `Error: ${error.message || 'Unknown error'}\n\n` +
      `Please try:\n` +
      `- Rephrasing your query\n` +
      `- Using more specific keywords\n` +
      `- For financial data, use ticker symbols or company names`;
  }
}

/**
 * Extract stock ticker from query
 */
function extractTicker(query: string): string | null {
  // Common ticker mappings (company names to tickers)
  const tickerMap: Record<string, string> = {
    'mastercard': 'MA',
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'amazon': 'AMZN',
    'tesla': 'TSLA',
    'meta': 'META',
    'facebook': 'META',
    'nvidia': 'NVDA',
    'netflix': 'NFLX',
    'disney': 'DIS',
    'jpmorgan': 'JPM',
    'visa': 'V',
    'moderna': 'MRNA',
    'exxon': 'XOM',
    'exxon mobil': 'XOM',
    'jpmorgan chase': 'JPM',
    'bank of america': 'BAC',
    'wells fargo': 'WFC',
    'goldman sachs': 'GS',
    'morgan stanley': 'MS',
    'coca cola': 'KO',
    'pepsi': 'PEP',
    'walmart': 'WMT',
    'home depot': 'HD',
    'mcdonalds': 'MCD',
    'starbucks': 'SBUX',
    'nike': 'NKE',
    'adobe': 'ADBE',
    'salesforce': 'CRM',
    'oracle': 'ORCL',
    'intel': 'INTC',
    'amd': 'AMD',
    'qualcomm': 'QCOM',
    'broadcom': 'AVGO',
    'cisco': 'CSCO',
    'ibm': 'IBM',
    'dell': 'DELL',
    'hp': 'HPQ',
    'sony': 'SONY',
    'samsung': '005930.KS', // Korean market
    'pfizer': 'PFE',
    'johnson & johnson': 'JNJ',
    'jnj': 'JNJ',
    'merck': 'MRK',
    'abbvie': 'ABBV',
    'bristol myers': 'BMY',
    'gilead': 'GILD',
    'biogen': 'BIIB',
    'regeneron': 'REGN',
    'vertex': 'VRTX',
  };
  
  // Commodity mappings (precious metals, etc.)
  const commodityMap: Record<string, string> = {
    'silver': 'SI=F', // Silver futures
    'gold': 'GC=F', // Gold futures
    'copper': 'HG=F', // Copper futures
    'oil': 'CL=F', // Crude oil futures
    'crude oil': 'CL=F',
    'wti': 'CL=F', // West Texas Intermediate
    'brent': 'BZ=F', // Brent crude
    'natural gas': 'NG=F',
    'platinum': 'PL=F',
    'palladium': 'PA=F',
  };
  
  // Common ticker symbols (direct ticker to ticker mapping for case-insensitive matching)
  const tickerSymbols: Record<string, string> = {
    'ma': 'MA',
    'aapl': 'AAPL',
    'msft': 'MSFT',
    'googl': 'GOOGL',
    'goog': 'GOOGL', // Google Class A
    'amzn': 'AMZN',
    'tsla': 'TSLA',
    'meta': 'META',
    'nvda': 'NVDA',
    'nflx': 'NFLX',
    'dis': 'DIS',
    'jpm': 'JPM',
    'v': 'V',
    // Commodity tickers
    'si=f': 'SI=F',
    'gc=f': 'GC=F',
    'hg=f': 'HG=F',
    'cl=f': 'CL=F',
    'bz=f': 'BZ=F',
    'ng=f': 'NG=F',
    'pl=f': 'PL=F',
    'pa=f': 'PA=F',
  };
  
  const lowerQuery = query.toLowerCase().trim();
  
  // First, check for commodities (silver, gold, oil, etc.)
  for (const [commodity, ticker] of Object.entries(commodityMap)) {
    if (lowerQuery.includes(commodity)) {
      return ticker;
    }
  }
  
  // Check if the query itself is a ticker symbol (case-insensitive)
  if (tickerSymbols[lowerQuery]) {
    return tickerSymbols[lowerQuery];
  }
  
  // Check for ticker symbols in the query (2-5 letter patterns, case-insensitive)
  const tickerPattern = /\b([A-Za-z]{2,5}(?:=F)?)\b/g;
  const matches = query.matchAll(tickerPattern);
  for (const match of matches) {
    const matchLower = match[1].toLowerCase();
    // Check if it's a known ticker symbol
    if (tickerSymbols[matchLower]) {
      return tickerSymbols[matchLower];
    }
    // Also check if it looks like a valid ticker (2-5 uppercase letters, or with =F for futures)
    if (match[1].length >= 2 && match[1].length <= 7) {
      // Try to validate it's a real ticker by checking if it's all uppercase or all lowercase
      // If it's a standalone word that looks like a ticker, return it
      const word = match[1];
      if (word === word.toUpperCase() || word === word.toLowerCase()) {
        return word.toUpperCase();
      }
    }
  }
  
  // Then check for company names in the query
  for (const [company, ticker] of Object.entries(tickerMap)) {
    if (lowerQuery.includes(company)) {
      return ticker;
    }
  }
  
  return null;
}

/**
 * Get real stock data from Yahoo Finance (free, no API key required)
 */
async function getStockData(ticker: string, originalQuery: string): Promise<string> {
  try {
    // Clean and validate ticker
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker || cleanTicker.length < 1) {
      throw new Error('Invalid ticker symbol');
    }
    
    // Use Yahoo Finance API (free, no key required)
    // Use 5d range for most recent data, with current timestamp to force latest data
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const cacheBuster = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?interval=1d&range=5d&period2=${currentTimestamp}&_=${cacheBuster}`;
    
    // Fetch with no-cache headers to ensure fresh data
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }
    
    const data = await response.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            previousClose?: number;
            currency?: string;
            symbol?: string;
            longName?: string;
            regularMarketTime?: number;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: number[];
              open?: number[];
              high?: number[];
              low?: number[];
              volume?: number[];
            }>;
          };
        }>;
      };
    };
    
    const result = data.chart?.result?.[0];
    if (!result || !result.meta) {
      throw new Error('No stock data found');
    }
    
    const meta = result.meta;
    // Prioritize regularMarketPrice (current/live price) over previousClose
    // Also check if there's a more recent price in the timestamp data
    let currentPrice = meta.regularMarketPrice;
    if (!currentPrice && result.timestamp && result.indicators?.quote?.[0]?.close) {
      // Get the most recent close price from historical data
      const closes = result.indicators.quote[0].close;
      const timestamps = result.timestamp;
      if (closes.length > 0 && timestamps.length > 0) {
        // Find the most recent non-null close price
        for (let i = closes.length - 1; i >= 0; i--) {
          if (closes[i] != null && closes[i] !== undefined) {
            currentPrice = closes[i];
            break;
          }
        }
      }
    }
    // Fallback to previousClose if still no price
    if (!currentPrice) {
      currentPrice = meta.previousClose;
    }
    const previousClose = meta.previousClose;
    const change = currentPrice && previousClose ? currentPrice - previousClose : 0;
    const changePercent = previousClose ? ((change / previousClose) * 100).toFixed(2) : '0.00';
    
    // Determine asset type for better labeling
    const isCommodity = ticker.includes('=F') || ticker.includes('-USD');
    const assetType = isCommodity ? 'Commodity' : 'Stock';
    
    let stockInfo = `📊 YAHOO FINANCE - REAL-TIME ${assetType} DATA\n`;
    stockInfo += `Asset: ${meta.longName || meta.symbol || ticker} (${meta.symbol || ticker})\n\n`;
    stockInfo += `⚠️ SOURCE: Yahoo Finance API - This is REAL market data, NOT hypothetical or simulated data.\n\n`;
    stockInfo += `💰 CURRENT PRICE (LIVE): ${currentPrice?.toFixed(2) || 'N/A'} ${meta.currency || 'USD'}\n`;
    if (previousClose) {
      stockInfo += `📊 Previous Close: ${previousClose.toFixed(2)} ${meta.currency || 'USD'}\n`;
      stockInfo += `📈 Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent}%)\n`;
    }
    stockInfo += `\n⚠️ This is the MOST RECENT price available from Yahoo Finance.\n`;
    
    // Check if query mentions a specific year
    const yearMatch = originalQuery.match(/\b(202[3-9]|20[3-9]\d)\b/);
    const requestedYear = yearMatch ? parseInt(yearMatch[1]) : null;
    const currentYear = new Date().getFullYear();
    
    // Add historical data if available
    if (result.timestamp && result.indicators?.quote?.[0]?.close) {
      const timestamps = result.timestamp;
      const closes = result.indicators.quote[0].close;
      const volumes = result.indicators.quote[0].volume;
      
      if (timestamps.length > 0 && closes.length > 0) {
        // Filter to only show RECENT data (last 30 days) - prioritize current data
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const filteredData: Array<{ date: Date; price: number; volume?: number; timestamp: number }> = [];
        
        for (let i = 0; i < timestamps.length; i++) {
          const timestamp = timestamps[i] * 1000;
          const date = new Date(timestamp);
          
          // Only include data from the last 30 days to ensure freshness
          if (timestamp >= thirtyDaysAgo) {
            filteredData.push({
              date,
              price: closes[i],
              volume: volumes?.[i],
              timestamp
            });
          }
        }
        
        // Sort by timestamp (most recent first)
        filteredData.sort((a, b) => b.timestamp - a.timestamp);
        
        if (filteredData.length > 0) {
          stockInfo += `\n📈 RECENT Price History (Last 30 Days - Most Recent First):\n`;
          // Get last 15 most recent data points
          const recentCount = Math.min(15, filteredData.length);
          
          for (let i = 0; i < recentCount; i++) {
            const { date, price, volume } = filteredData[i];
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const isToday = date.toDateString() === new Date().toDateString();
            const dayLabel = isToday ? ' (TODAY)' : '';
            stockInfo += `${dateStr}${dayLabel}: $${price?.toFixed(2) || 'N/A'}`;
            if (volume) {
              stockInfo += ` (Volume: ${volume.toLocaleString()})`;
            }
            stockInfo += `\n`;
          }
        } else {
          // If no recent data, show the most recent available data point
          const lastIndex = timestamps.length - 1;
          if (lastIndex >= 0) {
            const lastTimestamp = timestamps[lastIndex] * 1000;
            const lastDate = new Date(lastTimestamp);
            const lastPrice = closes[lastIndex];
            stockInfo += `\n📈 Most Recent Price: ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: $${lastPrice?.toFixed(2) || 'N/A'}\n`;
          }
        }
        
        // Warn if user asked for future year data
        if (requestedYear && requestedYear > currentYear) {
          stockInfo += `\n⚠️ IMPORTANT: You requested data for ${requestedYear}, but this is in the future. `;
          stockInfo += `The data shown above is the most recent available data (as of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}). `;
          stockInfo += `For ${requestedYear} projections or forecasts, you would need analyst estimates or forward-looking data, which is not available in this historical data. `;
          stockInfo += `Please use the CURRENT PRICE and RECENT HISTORY shown above, not historical data from 2022 or earlier years.`;
        } else if (requestedYear && requestedYear < currentYear - 1) {
          stockInfo += `\n⚠️ NOTE: You requested data for ${requestedYear}, but only recent data (last 6 months) is shown above. `;
          stockInfo += `For historical data from ${requestedYear}, you would need to query a different date range.`;
        }
      }
    }
    
    const dataTimestamp = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date();
    const now = new Date();
    const hoursSinceUpdate = Math.floor((now.getTime() - dataTimestamp.getTime()) / (1000 * 60 * 60));
    
    stockInfo += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    stockInfo += `📊 SOURCE: Yahoo Finance API (Real-time market data)\n`;
    stockInfo += `🕐 Data Last Updated: ${dataTimestamp.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}\n`;
    stockInfo += `⏰ Current Time: ${now.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}\n`;
    if (hoursSinceUpdate > 0) {
      stockInfo += `⏱️ Data Age: ${hoursSinceUpdate} hour(s) ago\n`;
    } else {
      stockInfo += `✅ Data is CURRENT (updated within the last hour)\n`;
    }
    stockInfo += `Note: Market data is delayed by 15-20 minutes for regulatory compliance.\n`;
    stockInfo += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    stockInfo += `⚠️ CRITICAL INSTRUCTION FOR AI AGENTS:\n`;
    stockInfo += `This data is from Yahoo Finance API - it is REAL and CURRENT market data.\n`;
    stockInfo += `You MUST use ONLY the exact prices, dates, and values shown above.\n`;
    stockInfo += `Do NOT generate hypothetical, simulated, or fictional data.\n`;
    stockInfo += `Do NOT make up prices or dates.\n`;
    stockInfo += `All data shown is REAL and CURRENT from Yahoo Finance.\n`;
    stockInfo += `The "Current Price" shown above is the MOST RECENT available price.\n`;
    
    return stockInfo;
  } catch (error: any) {
    console.error('[Search Tool] Stock data fetch error for ticker', ticker, ':', error);
    // Re-throw the error so the caller can handle it (e.g., try another ticker or fall back to search)
    throw error;
  }
}

