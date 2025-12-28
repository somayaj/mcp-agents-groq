import { GroqClient } from './GroqClient.js';
import {
  AgentConfig,
  AgentMessage,
  AgentResponse,
  AgentTool,
  AgentContext,
} from '../types/index.js';
import { GovernanceService, GovernanceConfig } from './Governance.js';

export class Agent {
  private id: string;
  private name: string;
  private description?: string;
  private groqClient: GroqClient;
  private config: AgentConfig;
  private tools: Map<string, AgentTool> = new Map();
  private messageHistory: AgentMessage[] = [];
  private governance?: GovernanceService;

  constructor(config: AgentConfig, groqClient: GroqClient, governanceConfig?: GovernanceConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.config = config;
    this.groqClient = groqClient;
    
    // Initialize governance if config provided
    if (governanceConfig) {
      this.governance = new GovernanceService(governanceConfig);
    }

    // Register tools
    if (config.tools) {
      config.tools.forEach(tool => this.registerTool(tool));
    }

    // Add system prompt if provided
    if (config.systemPrompt) {
      // Enhance system prompt with tool usage instructions if tools are available
      let enhancedPrompt = config.systemPrompt;
      
      if (this.tools.size > 0) {
        const toolNames = Array.from(this.tools.keys());
        const hasSearchTool = toolNames.includes('search');
        
        if (hasSearchTool) {
          enhancedPrompt += `\n\n🚨 CRITICAL INSTRUCTIONS FOR DATA ACCURACY - READ CAREFULLY:
- For ANY financial data, stock prices, commodity prices, market data, or price queries, you MUST use the 'search' tool FIRST.
- The search tool provides REAL-TIME data from Yahoo Finance API.
- NEVER generate hypothetical, simulated, or fictional data.
- NEVER make up prices, dates, revenue numbers, earnings, or any financial metrics.
- ALWAYS call the search tool first for financial/market queries - do NOT respond without calling it.
- Use ONLY the exact data returned by the search tool in your response.
- If the search tool returns real data, you MUST use that exact data - do NOT make up prices, dates, or values.
- If the search tool fails or returns an error, do NOT generate fake data. Instead, report the error and say you cannot provide the data.
- Do NOT say "I can provide you with a general analysis" or "based on historical trends" - use the REAL data from the search tool.
- Do NOT provide specific numbers (prices, revenue, earnings) unless they come directly from the search tool results.
- If you see data from Yahoo Finance in the search results, that is the ONLY data you can use.`;
        }
      }
      
      this.messageHistory.push({
        role: 'system',
        content: enhancedPrompt,
      });
    }
  }

  registerTool(tool: AgentTool): void {
    // Validate tool has required properties
    if (!tool.name || !tool.description) {
      throw new Error('Tool must have name and description');
    }
    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error(`Tool ${tool.name} must have a handler function`);
    }
    if (!tool.parameters) {
      throw new Error(`Tool ${tool.name} must have parameters schema`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[Agent ${this.id}] Registered tool: ${tool.name}`);
  }

  async process(
    message: string,
    context?: AgentContext
  ): Promise<AgentResponse> {
    console.log(`[Agent ${this.id}] Processing message (${message.length} chars):`, message.substring(0, 150));
    console.log(`[Agent ${this.id}] Available tools:`, Array.from(this.tools.keys()));
    
    // Check if this is a financial/stock query and agent has search tool
    const hasSearchTool = this.tools.has('search');
    const financialKeywords = [
      'stock', 'stocks', 'price', 'prices', 'ticker', 'tickers', 'financial', 'market', 
      'commodity', 'commodities', 'silver', 'gold', 'oil', 'bitcoin', 'crypto', 
      'earnings', 'revenue', 'analysis', 'forecast', 'prediction', 'trend', 'chart',
      'share', 'shares', 'nasdaq', 'nyse', 'trading', 'invest', 'investment',
      'moderna', 'netflix', 'apple', 'microsoft', 'google', 'amazon', 'tesla',
      'mastercard', 'visa', 'nvidia', 'meta', 'disney', 'nflx', 'aapl', 'msft',
      'googl', 'amzn', 'tsla', 'nvda', 'ma', 'v', 'mrna', 'dis'
    ];
    const messageLower = message.toLowerCase();
    const isFinancialQuery = hasSearchTool && financialKeywords.some(keyword => messageLower.includes(keyword));
    
    // ENFORCE: If it's a financial query, automatically call the search tool FIRST
    // If it fails, ERROR OUT - do not allow hypothetical data
    if (isFinancialQuery) {
      console.log(`[Agent ${this.id}] 🚨 FINANCIAL QUERY DETECTED - ENFORCING search tool usage`);
      
      const searchTool = this.tools.get('search');
      if (!searchTool || !searchTool.handler) {
        console.error(`[Agent ${this.id}] ❌ Search tool not available for financial query`);
        return {
          content: `❌ Error: This query requires real-time financial data, but the search tool is not available.\n\nPlease ensure the search tool is enabled for this agent, or rephrase your query to not require real-time market data.`,
          metadata: {
            finishReason: 'error',
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        };
      }
      
      try {
        console.log(`[Agent ${this.id}] 🔍 Automatically calling search tool for: "${message}"`);
        const searchResult = await searchTool.handler({ query: message });
        console.log(`[Agent ${this.id}] ✅ Search tool returned data, length: ${searchResult?.length || 0}`);
        
        // Validate that we got actual data (not an error message)
        if (!searchResult || searchResult.trim().length === 0 || 
            searchResult.includes('Unable to fetch') || 
            searchResult.includes('⚠️ Unable to fetch') ||
            searchResult.includes('Error:') && searchResult.includes('No stock data found')) {
          throw new Error('Search tool returned no valid data');
        }
        
        // Add the search result to the message so Groq uses it
        const enhancedMessage = `${message}\n\n[IMPORTANT: Use the following REAL data from Yahoo Finance - do NOT generate hypothetical data]\n\n${searchResult}`;
        
        // Add user message with search results to history
        this.messageHistory.push({
          role: 'user',
          content: enhancedMessage,
          timestamp: new Date(),
        });
        
        // Continue with normal processing, but Groq will now have the real data
      } catch (searchError: any) {
        console.error(`[Agent ${this.id}] ❌ Search tool failed for financial query:`, searchError);
        // ERROR OUT - do not allow processing with hypothetical data
        return {
          content: `❌ Error: Unable to fetch real-time financial data for your query.\n\n` +
                   `Error: ${searchError.message || 'Unknown error'}\n\n` +
                   `⚠️ To prevent inaccurate or hypothetical data, this request has been stopped.\n\n` +
                   `Please try:\n` +
                   `- Rephrasing your query with a specific ticker symbol (e.g., "AAPL stock price")\n` +
                   `- Using a company name instead (e.g., "Apple stock analysis")\n` +
                   `- Checking if the ticker symbol or company name is correct\n` +
                   `- Trying again in a few moments if there was a temporary network issue`,
          metadata: {
            finishReason: 'error',
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        };
      }
    } else {
      // Add user message to history
      this.messageHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
    }

    // Prepare tools for Groq - only include tools with valid handlers
    const validTools = Array.from(this.tools.values()).filter(tool => 
      tool.handler && typeof tool.handler === 'function'
    );
    
    console.log(`[Agent ${this.id}] Available tools in map:`, Array.from(this.tools.keys()));
    console.log(`[Agent ${this.id}] Valid tools (with handlers):`, validTools.map(t => t.name));
    
    const groqTools: AgentTool[] | undefined = validTools.length > 0 ? validTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: async () => '', // Dummy handler - not used by GroqClient
    })) : undefined;

    // Get valid tool names for filtering history
    const validToolNames = new Set(validTools.map(t => t.name));

    // If no valid tools, use a much cleaner history to prevent Groq from trying to use non-existent tools
    // This prevents Groq from trying to use tools mentioned in previous conversations
    let historyToUse = this.messageHistory;
    if (!groqTools || groqTools.length === 0) {
      // Aggressively clean history - remove any messages that might reference tools
      historyToUse = this.messageHistory
        .map(msg => {
          // Keep system messages as-is
          if (msg.role === 'system') {
            return msg;
          }
          
          // For user messages, clean tool references
          if (msg.role === 'user' && msg.content) {
            let cleaned = String(msg.content);
            // Remove tool call patterns
            cleaned = cleaned.replace(/\[Tool: [^\]]+\]/gi, '');
            cleaned = cleaned.replace(/tool_[a-z_]+/gi, '');
            cleaned = cleaned.replace(/called (search|calculate|tool_[a-z_]+)/gi, '');
            cleaned = cleaned.replace(/using (search|calculate|tool_[a-z_]+)/gi, '');
            return { ...msg, content: cleaned.trim() };
          }
          
          // For assistant messages, be very aggressive - remove if it mentions tools
          if (msg.role === 'assistant' && msg.content) {
            const content = String(msg.content).toLowerCase();
            // If message mentions tool calls, tool usage, or specific tool names, skip it
            if (content.includes('tool') || 
                content.includes('search') || 
                content.includes('calculate') ||
                content.includes('function') ||
                content.includes('called') ||
                /tool_[a-z_]+/.test(content)) {
              return null; // Filter this out
            }
            return msg;
          }
          
          return msg;
        })
        .filter((msg): msg is AgentMessage => {
          if (!msg) return false;
          const content = msg.content;
          return Boolean(content) && String(content).trim().length > 0;
        });
      
      // If we filtered out too much, keep at least system + current user message
      if (historyToUse.length === 0 || (historyToUse.length === 1 && historyToUse[0].role === 'system')) {
        const systemMsg = this.messageHistory.find(m => m.role === 'system');
        historyToUse = systemMsg ? [systemMsg, {
          role: 'user' as const,
          content: message,
          timestamp: new Date(),
        }] : [{
          role: 'user' as const,
          content: message,
          timestamp: new Date(),
        }];
      }
    }

    // Get response from Groq
    // If no valid tools, don't send tools parameter at all
    let response: AgentResponse;
    try {
      console.log(`[Agent ${this.id}] Processing message with ${groqTools?.length || 0} tools available`);
      if (groqTools && groqTools.length > 0) {
        console.log(`[Agent ${this.id}] Available tools:`, groqTools.map(t => t.name));
      }
      // For financial queries, force the search tool to be called
      let toolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } = groqTools && groqTools.length > 0 ? 'auto' : 'none';
      if (isFinancialQuery && hasSearchTool && groqTools && groqTools.some(t => t.name === 'search')) {
        console.log(`[Agent ${this.id}] 🔒 FORCING search tool usage via toolChoice`);
        toolChoice = { type: 'function', function: { name: 'search' } };
      }
      
      response = await this.groqClient.chat(
        historyToUse,
        {
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          tools: groqTools,
          toolChoice: toolChoice,
        }
      );
      console.log(`[Agent ${this.id}] Response received, toolCalls:`, response.toolCalls?.length || 0);
    } catch (error: any) {
      // If error is tool-related and we have no tools, retry without tools
      if ((!groqTools || groqTools.length === 0) && error.message && error.message.includes('tool')) {
        console.warn('Tool error detected, retrying without tools:', error.message);
        try {
          response = await this.groqClient.chat(
            historyToUse,
            {
              model: this.config.model,
              temperature: this.config.temperature,
              maxTokens: this.config.maxTokens,
              tools: undefined,
              toolChoice: 'none',
            }
          );
        } catch (retryError: any) {
          // If retry also fails, return a safe fallback response
          console.error('Retry failed:', retryError.message);
          const fallbackResponse: AgentResponse = {
            content: 'I apologize, but I encountered an issue processing your request. Please try rephrasing your question.',
            metadata: {
              model: this.config.model || 'unknown',
              usage: undefined,
              finishReason: 'error',
            },
          };
          
          // Don't add error messages to history - just return the fallback
          return fallbackResponse;
        }
      } else {
        // For other errors, return a safe fallback instead of throwing
        console.error('Agent processing error:', error.message);
        const fallbackResponse: AgentResponse = {
          content: 'I apologize, but I encountered an issue processing your request. Please try again.',
          metadata: {
            model: this.config.model || 'unknown',
            usage: undefined,
            finishReason: 'error',
          },
        };
        
        // Don't add error to history - just return the fallback
        return fallbackResponse;
      }
    }

    // Fallback: If agent has create_graph tool but Groq didn't call it, and message requests visualization
    // This is a workaround for Groq's limited function calling support
    if (!response.toolCalls || response.toolCalls.length === 0) {
      const hasGraphTool = this.tools.has('create_graph');
      const visualizationKeywords = ['chart', 'graph', 'visualize', 'plot', 'bar chart', 'line chart', 'pie chart', 'visualization', 'create a chart', 'show me a graph', 'draw', 'show', 'display'];
      const messageLower = message.toLowerCase();
      const requestsVisualization = visualizationKeywords.some(keyword => messageLower.includes(keyword));
      
      console.log(`[Agent ${this.id}] Checking fallback: hasGraphTool=${hasGraphTool}, requestsVisualization=${requestsVisualization}, message="${message.substring(0, 100)}..."`);
      
      if (hasGraphTool && requestsVisualization) {
        console.log(`[Agent ${this.id}] ✅ Groq didn't call create_graph tool, but visualization requested. Attempting automatic tool call...`);
        
        // Extract data from message - look for patterns like "Q1: 10, Q2: 20" or "x: value, y: value"
        const dataPoints: Array<{ x: string | number; y: number }> = [];
        let chartType: 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'histogram' = 'bar';
        let title = 'Data Visualization';
        
        // Detect chart type from message
        if (messageLower.includes('bar chart') || messageLower.includes('bar graph')) {
          chartType = 'bar';
        } else if (messageLower.includes('line chart') || messageLower.includes('line graph')) {
          chartType = 'line';
        } else if (messageLower.includes('pie chart')) {
          chartType = 'pie';
        } else if (messageLower.includes('scatter')) {
          chartType = 'scatter';
        }
        
        // Extract data patterns: "Q1: 10", "Q1 = 10", "Q1:10", etc.
        // Improved patterns to handle "billion", "million", etc.
        // More flexible patterns to catch various formats
        const dataPatterns = [
          /(Q[1-4]\s*20\d{2})\s*[:=]\s*([0-9.]+)\s*(billion|million|M|B)?/gi,  // "Q4 2023: 8.83 billion" or "Q4 2023 = 8.83 billion"
          /(Q[1-4]\s*20\d{2})\s+([0-9.]+)\s*(billion|million|M|B)?/gi,  // "Q4 2023 8.83 billion"
          /([A-Za-z][A-Za-z0-9\s]{0,30})\s*[:=]\s*([0-9.]+)\s*(billion|million|M|B)?/gi,  // "Revenue: 8.83 billion" or "Revenue = 8.83"
          /([A-Za-z][A-Za-z0-9\s]{0,30})\s+([0-9.]+)\s*(billion|million|M|B)?/gi,  // "Revenue 8.83 billion"
        ];
        
        for (const pattern of dataPatterns) {
          let match;
          const patternCopy = new RegExp(pattern.source, pattern.flags);
          while ((match = patternCopy.exec(message)) !== null) {
            const label = match[1].trim();
            let value = parseFloat(match[2]);
            const unit = match[3]?.toLowerCase();
            
            // Convert to consistent units (billions)
            if (unit === 'million' || unit === 'm') {
              value = value / 1000; // Convert millions to billions
            }
            
            // Filter out invalid data points
            // Only accept reasonable values (not years like 2023, 2024 as y-values)
            // And only accept labels that look like quarters or reasonable labels
            const isValidValue = value > 0 && value < 1000000; // Reasonable range
            const trimmedLabel = label.trim();
            // More lenient label validation - accept quarters, metric names, etc.
            const isValidLabel = trimmedLabel.length > 0 && trimmedLabel.length < 50 && 
                                 !/^\d+$/.test(trimmedLabel); // Don't accept pure numbers as labels
            const isNotYear = value < 1900 || value > 2100; // Don't treat years as values
            
            // Additional check: if label contains "Q" and a year pattern, make sure value isn't the year
            const isQuarterWithYear = /Q[1-4]\s*20\d{2}/.test(trimmedLabel);
            const valueIsYear = value >= 2020 && value <= 2030;
            const shouldReject = isQuarterWithYear && valueIsYear;
            
            if (!isNaN(value) && isValidValue && isValidLabel && isNotYear && !shouldReject) {
              // Avoid duplicates - check both exact match and similar labels
              const isDuplicate = dataPoints.some(dp => {
                const labelMatch = String(dp.x).toLowerCase() === trimmedLabel.toLowerCase();
                const valueMatch = Math.abs(dp.y - value) < 0.01;
                return labelMatch && valueMatch;
              });
              
              if (!isDuplicate) {
                dataPoints.push({ x: trimmedLabel, y: value });
              }
            }
          }
        }
        
        console.log(`[Agent ${this.id}] Data extraction attempt - found ${dataPoints.length} points:`, dataPoints);
        
        // If we found data, use it; otherwise use placeholder
        if (dataPoints.length > 0) {
          console.log(`[Agent ${this.id}] Extracted ${dataPoints.length} data points from message`);
          response.toolCalls = [{
            name: 'create_graph',
            arguments: {
              data: dataPoints,
              chartType: chartType,
              title: title
            }
          }];
        } else {
          console.log(`[Agent ${this.id}] No data extracted, using placeholder data`);
          response.toolCalls = [{
            name: 'create_graph',
            arguments: {
              data: [{ x: 'Sample 1', y: 10 }, { x: 'Sample 2', y: 20 }],
              chartType: chartType,
              title: 'Data Visualization'
            }
          }];
        }
        console.log(`[Agent ${this.id}] 🎯 Auto-generated tool call for create_graph with ${response.toolCalls[0].arguments.data.length} data points:`, JSON.stringify(response.toolCalls[0].arguments, null, 2));
      } else {
        console.log(`[Agent ${this.id}] ⚠️ Fallback conditions not met: hasGraphTool=${hasGraphTool}, requestsVisualization=${requestsVisualization}`);
      }
    }

    // Handle tool calls - only if tools are available
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`[Agent ${this.id}] Processing ${response.toolCalls.length} tool calls:`, response.toolCalls.map(tc => tc.name));
      const toolResults: string[] = [];
      let hasValidTools = false;

      for (const toolCall of response.toolCalls) {
        console.log(`[Agent ${this.id}] Tool call: ${toolCall.name} with args:`, JSON.stringify(toolCall.arguments, null, 2));
        const tool = this.tools.get(toolCall.name);
        
        // Validate tool exists and has a valid handler
        if (!tool) {
          console.warn(`Tool ${toolCall.name} not found in agent ${this.id}`);
          continue;
        }
        
        if (!tool.handler) {
          console.warn(`Tool ${toolCall.name} does not have a handler function`);
          continue;
        }
        
        if (typeof tool.handler !== 'function') {
          console.warn(`Tool ${toolCall.name} handler is not a function (type: ${typeof tool.handler})`);
          continue;
        }
        
        // Tool is valid, execute it
        try {
          const result = await tool.handler(toolCall.arguments, context);
          
          // Special handling for graph tool - preserve chart HTML/SVG
          if (toolCall.name === 'create_graph' && result && typeof result === 'object') {
            const graphResult = result as any;
            console.log(`[Agent ${this.id}] Graph tool result:`, { 
              success: graphResult.success, 
              hasChart: !!graphResult.chart, 
              chartLength: graphResult.chart?.length,
              format: graphResult.format,
              message: graphResult.message 
            });
            
            if (graphResult.success && graphResult.chart) {
              // Validate chart content is not empty and contains actual chart elements
              const chartContent = String(graphResult.chart).trim();
              // Check if chart has meaningful content (canvas, svg, or substantial HTML)
              const hasCanvas = chartContent.includes('<canvas');
              const hasSVG = chartContent.includes('<svg') && chartContent.includes('</svg>');
              const hasScript = chartContent.includes('<script') && chartContent.includes('Chart');
              const hasChartElements = hasCanvas || (hasSVG && chartContent.length > 200);
              const hasMinimalContent = chartContent.length > 200; // At least substantial content
              
              // For HTML charts, must have canvas AND script
              // For SVG charts, must have complete SVG
              const isValidChart = (hasCanvas && hasScript) || (hasSVG && hasMinimalContent);
              
              if (chartContent.length === 0 || !isValidChart) {
                console.warn(`[Agent ${this.id}] ⚠️ Graph tool returned invalid/empty chart (length: ${chartContent.length}, hasCanvas: ${hasCanvas}, hasSVG: ${hasSVG}, hasScript: ${hasScript}), skipping`);
                toolResults.push(
                  `Tool ${toolCall.name} result: Chart generation returned empty or invalid content`
                );
              } else {
                // Store graph in metadata for later retrieval
                if (!response.metadata) {
                  response.metadata = {};
                }
                if (!response.metadata.graphs) {
                  response.metadata.graphs = [];
                }
                const graphData = {
                  chart: chartContent,
                  format: graphResult.format || 'html',
                  title: toolCall.arguments?.title || 'Chart',
                };
                response.metadata.graphs.push(graphData);
                console.log(`[Agent ${this.id}] ✅ Added graph to metadata:`, { 
                  title: graphData.title, 
                  format: graphData.format, 
                  chartLength: graphData.chart.length 
                });
              }
              
              // Add a reference in the tool results instead of the full HTML
              toolResults.push(
                `Tool ${toolCall.name} result: Chart created successfully (${graphResult.format || 'html'}). The chart is available in the response metadata.`
              );
            } else {
              console.warn(`[Agent ${this.id}] ⚠️ Graph tool did not return valid chart:`, graphResult);
              toolResults.push(
                `Tool ${toolCall.name} result: ${graphResult.message || JSON.stringify(result)}`
              );
            }
          } else {
          toolResults.push(
            `Tool ${toolCall.name} result: ${JSON.stringify(result)}`
          );
          }
          hasValidTools = true;
        } catch (error: any) {
          console.error(`Tool ${toolCall.name} execution error:`, error);
          toolResults.push(`Tool ${toolCall.name} error: ${error.message}`);
          hasValidTools = true; // Tool exists, just had an error
        }
      }
      
      // If Groq tried to call tools that don't exist, we need to get a new response
      // without tool calls - use a completely clean history
      if (!hasValidTools && response.toolCalls && response.toolCalls.length > 0) {
        // Groq tried to use tools that aren't available
        // Use a minimal clean history (system + current user message only)
        const attemptedTools = response.toolCalls.map(tc => tc.name).join(', ');
        console.warn(`Groq tried to call non-existent tools: ${attemptedTools}. Retrying with clean history.`);
        
        const cleanHistory: AgentMessage[] = [];
        const systemMsg = this.messageHistory.find(m => m.role === 'system');
        if (systemMsg) {
          cleanHistory.push(systemMsg);
        }
        // Add only the current user message
        cleanHistory.push({
          role: 'user',
          content: message,
          timestamp: new Date(),
        });
        
        try {
          const retryResponse = await this.groqClient.chat(
            cleanHistory,
            {
              model: this.config.model,
              temperature: this.config.temperature,
              maxTokens: this.config.maxTokens,
              tools: undefined,
              toolChoice: 'none',
            }
          );
          
          this.messageHistory.push({
            role: 'assistant',
            content: retryResponse.content,
            timestamp: new Date(),
          });
          
          return retryResponse;
        } catch (retryError: any) {
          // If retry also fails, return a safe fallback
          console.error('Retry failed:', retryError);
          const fallbackResponse: AgentResponse = {
            content: 'I apologize, but I encountered an issue processing your request. Please try rephrasing your question.',
            metadata: {
              model: this.config.model || 'unknown',
              usage: undefined,
              finishReason: 'error',
            },
          };
          
          // Don't add error to history
          return fallbackResponse;
        }
      }

      // Only process tool results if we have valid tools
      if (hasValidTools && toolResults.length > 0) {
        // Add tool results and get final response
        this.messageHistory.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
        });

        this.messageHistory.push({
          role: 'user',
          content: `Tool execution results:\n${toolResults.join('\n')}`,
          timestamp: new Date(),
        });

        // Get final response with tool results
        const finalResponse = await this.groqClient.chat(
          this.messageHistory,
          {
            model: this.config.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          }
        );

        // Preserve graph metadata from the original response
        if (response.metadata?.graphs) {
          if (!finalResponse.metadata) {
            finalResponse.metadata = {};
          }
          finalResponse.metadata.graphs = response.metadata.graphs;
        }

        this.messageHistory.push({
          role: 'assistant',
          content: finalResponse.content,
          timestamp: new Date(),
        });

        return finalResponse;
      }
      // If no valid tools, just continue with the original response
    }

    // Add assistant response to history
    // Governance: Filter output
    let finalContent = response.content;
    if (this.governance) {
      const outputFilter = this.governance.filterOutput(response.content, {
        agentId: this.id,
        userId: context?.sessionId,
      });

      if (!outputFilter.allowed) {
        await this.governance.auditLog('output_filtered', {
          agentId: this.id,
          userId: context?.sessionId,
          input: message,
          output: response.content,
          success: false,
          error: outputFilter.reason,
        });

        finalContent = outputFilter.filteredOutput || 
          'Output was filtered due to content policy violations.';
      } else if (outputFilter.filteredOutput) {
        finalContent = outputFilter.filteredOutput;
      }

      // Check token limits
      if (response.metadata?.usage?.totalTokens) {
        const tokenCheck = this.governance.checkTokenLimit(
          this.id,
          response.metadata.usage.totalTokens
        );
        if (!tokenCheck.allowed) {
          await this.governance.auditLog('token_limit_exceeded', {
            agentId: this.id,
            userId: context?.sessionId,
            input: message,
            success: false,
            error: tokenCheck.reason,
          });
        }
      }

      // Audit successful request
      await this.governance.auditLog('agent_request', {
        agentId: this.id,
        userId: context?.sessionId,
        input: message,
        output: finalContent,
        success: true,
      });
    }

    this.messageHistory.push({
      role: 'assistant',
      content: finalContent,
      timestamp: new Date(),
    });

    // Ensure graphs metadata is preserved in final response
    const finalResponse = {
      ...response,
      content: finalContent,
    };
    
    // Preserve graphs metadata if it exists
    if (response.metadata?.graphs) {
      if (!finalResponse.metadata) {
        finalResponse.metadata = {};
      }
      finalResponse.metadata.graphs = response.metadata.graphs;
    }

    return finalResponse;
  }

  clearHistory(): void {
    this.messageHistory = [];
    if (this.config.systemPrompt) {
      this.messageHistory.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }
  }

  getHistory(): AgentMessage[] {
    return [...this.messageHistory];
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getConfig(): AgentConfig {
    // Return config without tools (since handlers can't be serialized)
    const configCopy = { ...this.config };
    if (configCopy.tools) {
      // Return tool metadata without handlers
      configCopy.tools = configCopy.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        // handler is intentionally omitted
      })) as any;
    }
    return configCopy;
  }

  hasTools(): boolean {
    return this.tools.size > 0;
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    // Update config
    this.config = { ...this.config, ...updates };
    
    // Update instance properties
    if (updates.name !== undefined) {
      this.name = updates.name;
    }
    if (updates.description !== undefined) {
      this.description = updates.description;
    }
    
    // Update system prompt in message history
    if (updates.systemPrompt !== undefined) {
      // Remove old system message
      this.messageHistory = this.messageHistory.filter(msg => msg.role !== 'system');
      
      // Add new system message if provided
      if (updates.systemPrompt) {
        this.messageHistory.unshift({
          role: 'system',
          content: updates.systemPrompt,
        });
      }
    }
    
    // Note: Tools, model, temperature, maxTokens are handled via config
    // Tools should be updated separately using registerTool/unregisterTool
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    this.tools.delete(toolName);
  }
}

