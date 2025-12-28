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
  const searchFunction = options?.searchFunction || defaultSearchFunction;

  return {
    name: 'search',
    description: 'Search for information on a topic. Use this tool to find relevant information about a query.',
    parameters: z.object({
      query: z.string().describe('The search query to look up information about'),
    }),
    handler: async (params: { query: string }) => {
      try {
        const results = await searchFunction(params.query);
        return results;
      } catch (error: any) {
        return `Search error: ${error.message}`;
      }
    },
  };
}

/**
 * Default search function - simulates a search
 * Replace this with actual search implementation (e.g., Google Search API, DuckDuckGo, etc.)
 */
async function defaultSearchFunction(query: string): Promise<string> {
  // Simulated search - replace with actual search implementation
  // Example implementations:
  // - Google Custom Search API
  // - DuckDuckGo API
  // - SerpAPI
  // - Wikipedia API
  // - Your own search backend
  
  return `Search results for "${query}":\n\n` +
    `1. Information about ${query}\n` +
    `2. Related topics and resources\n` +
    `3. Additional context and details\n\n` +
    `Note: This is a simulated search. Replace the defaultSearchFunction with an actual search implementation.`;
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
    
    const data = await response.json();
    return `Wikipedia results for "${query}":\n\n${data.extract || data.description || 'No summary available'}`;
  } catch (error: any) {
    return `Wikipedia search error: ${error.message}`;
  }
}

/**
 * Example: DuckDuckGo search implementation (using DuckDuckGo Instant Answer API)
 */
export async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.AbstractText) {
      return `DuckDuckGo results for "${query}":\n\n${data.AbstractText}\n\nSource: ${data.AbstractURL || 'N/A'}`;
    } else if (data.Answer) {
      return `DuckDuckGo answer for "${query}":\n\n${data.Answer}`;
    } else {
      return `No direct answer found for "${query}". Try rephrasing your query.`;
    }
  } catch (error: any) {
    return `DuckDuckGo search error: ${error.message}`;
  }
}

