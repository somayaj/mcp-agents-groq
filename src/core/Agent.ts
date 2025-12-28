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
      this.messageHistory.push({
        role: 'system',
        content: config.systemPrompt,
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
  }

  async process(
    message: string,
    context?: AgentContext
  ): Promise<AgentResponse> {
    // Add user message to history
    this.messageHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Prepare tools for Groq - only include tools with valid handlers
    const validTools = Array.from(this.tools.values()).filter(tool => 
      tool.handler && typeof tool.handler === 'function'
    );
    
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
      response = await this.groqClient.chat(
        historyToUse,
        {
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          tools: groqTools,
          toolChoice: groqTools && groqTools.length > 0 ? 'auto' : 'none', // Explicitly set to 'none' if no tools
        }
      );
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

    // Handle tool calls - only if tools are available
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults: string[] = [];
      let hasValidTools = false;

      for (const toolCall of response.toolCalls) {
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
          toolResults.push(
            `Tool ${toolCall.name} result: ${JSON.stringify(result)}`
          );
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

    return {
      ...response,
      content: finalContent,
    };
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

