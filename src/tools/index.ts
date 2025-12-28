/**
 * Common tools for agents
 * 
 * This module provides pre-built tools that can be used with agents.
 * Import and use these tools when creating agents programmatically.
 */

export { createSearchTool, wikipediaSearch, duckDuckGoSearch } from './search.js';
export { createGraphTool } from './graph.js';
export type { ChartType, DataPoint, ChartConfig } from './graph.js';

