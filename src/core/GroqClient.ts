import Groq from 'groq-sdk';
import { AgentMessage, AgentResponse, AgentTool } from '../types/index.js';

export class GroqClient {
  private client: Groq;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor(apiKey: string, config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.client = new Groq({ apiKey });
    this.defaultModel = config?.model || 'llama-3.3-70b-versatile';
    this.defaultTemperature = config?.temperature ?? 0.7;
    this.defaultMaxTokens = config?.maxTokens ?? 4096;
  }

  async chat(
    messages: AgentMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: AgentTool[];
      toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    }
  ): Promise<AgentResponse> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? this.defaultTemperature;
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;

    // Format messages, ensuring valid content
    const formattedMessages = messages
      .filter(msg => msg.content && msg.content.trim().length > 0) // Remove empty messages
      .map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: String(msg.content).trim(), // Ensure content is a string
      }));
    
    // Validate we have at least one message
    if (formattedMessages.length === 0) {
      throw new Error('No valid messages to send to Groq');
    }

    // Build request with validation
    const request: any = {
      model,
      messages: formattedMessages,
      temperature: Math.max(0, Math.min(2, temperature)), // Clamp between 0 and 2
      max_tokens: Math.max(1, Math.min(8192, maxTokens)), // Clamp between 1 and 8192
    };
    
    // Validate model name
    if (!model || typeof model !== 'string') {
      throw new Error('Invalid model name');
    }

      // Add tools if provided and valid
      if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
        try {
          request.tools = options.tools.map(tool => {
            // Validate tool structure
            if (!tool.name || !tool.description) {
              throw new Error(`Tool missing required fields: name or description`);
            }
            
            const schema = this.zodToJsonSchema(tool.parameters);
            
            return {
              type: 'function' as const,
              function: {
                name: String(tool.name).trim(),
                description: String(tool.description).trim(),
                parameters: schema,
              },
            };
          });
          
          // Only add tools if we have valid ones
          if (request.tools.length > 0) {
            request.tool_choice = options.toolChoice || 'auto';
          } else {
            request.tool_choice = 'none';
            delete request.tools;
          }
        } catch (toolError: any) {
          console.warn('Error processing tools, continuing without tools:', toolError.message);
          request.tool_choice = 'none';
          delete request.tools;
        }
      } else {
        // Explicitly set tool_choice to 'none' if no tools
        request.tool_choice = 'none';
        // Ensure tools is not in the request if we have none
        delete request.tools;
      }

    try {
      // Log request for debugging (always log tools info)
      console.log('[GroqClient] Request:', {
        model: request.model,
        messageCount: request.messages.length,
        hasTools: !!request.tools,
        toolCount: request.tools?.length || 0,
        toolNames: request.tools?.map((t: any) => t.function?.name).filter(Boolean) || [],
        toolChoice: request.tool_choice,
      });
      
      const response = await this.client.chat.completions.create(request);
      const message = response.choices[0]?.message;

      if (!message) {
        throw new Error('No response from Groq');
      }

      const result: AgentResponse = {
        content: message.content || '',
        metadata: {
          model: response.model,
          usage: response.usage,
          finishReason: response.choices[0]?.finish_reason,
        },
      };

      // Handle tool calls - only if tools were actually provided
      if (message.tool_calls && message.tool_calls.length > 0 && options?.tools && options.tools.length > 0) {
        result.toolCalls = message.tool_calls
          .filter(tc => tc.function && tc.function.name)
          .map(tc => ({
            name: tc.function!.name!,
            arguments: JSON.parse(tc.function!.arguments || '{}'),
          }));
      } else if (message.tool_calls && message.tool_calls.length > 0) {
        // Groq tried to use tools but we didn't provide any - ignore tool calls
        console.warn('Groq attempted to use tools but none were provided. Ignoring tool calls.');
        result.toolCalls = undefined;
      }

      return result;
    } catch (error: any) {
      // Extract error details
      const errorStatus = error.status || error.statusCode || error.response?.status;
      const errorData = error.response?.data || error.body || error.error || {};
      const errorMessage = error.message || errorData.message || 'Unknown error';
      
      // Log the full error for debugging
      console.error('Groq API Error:', {
        status: errorStatus,
        message: errorMessage,
        errorData: errorData,
      });
      
      // Check if error is about tool usage or 400 error
      const errorMsg = String(errorMessage).toLowerCase();
      const errorBodyStr = JSON.stringify(errorData).toLowerCase();
      const fullErrorText = errorMsg + ' ' + errorBodyStr;
      
      const isToolError = fullErrorText.includes('tool') || 
                         fullErrorText.includes('function') ||
                         fullErrorText.includes('not in request') ||
                         fullErrorText.includes('failed generation') ||
                         fullErrorText.includes('tool use failed') ||
                         fullErrorText.includes('invalid tool') ||
                         fullErrorText.includes('bad request');
      
      const is400Error = errorStatus === 400;
      
      // Handle 400 errors (bad request) - retry without tools
      if (is400Error || isToolError) {
        console.warn('400/Tool error detected, retrying without tools. Original error:', errorMessage);
        
        // Clean messages - remove any that might have tool references
        const cleanMessages = request.messages.map((msg: any) => ({
          role: msg.role,
          content: String(msg.content || '').trim(),
        })).filter((msg: any) => msg.content && msg.content.length > 0);
        
        // Ensure we have at least one message
        if (cleanMessages.length === 0) {
          // Use a simple fallback message
          cleanMessages.push({
            role: 'user' as const,
            content: 'Please respond to the previous message.',
          });
        }
        
        const retryRequest: any = {
          model: request.model,
          messages: cleanMessages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
        };
        // Explicitly don't include tools or tool_choice
        
        try {
          const retryResponse = await this.client.chat.completions.create(retryRequest);
          const retryMessage = retryResponse.choices[0]?.message;
          
          if (retryMessage && retryMessage.content) {
            return {
              content: retryMessage.content,
              metadata: {
                model: retryResponse.model,
                usage: retryResponse.usage,
                finishReason: retryResponse.choices[0]?.finish_reason,
              },
            };
          }
        } catch (retryError: any) {
          // If retry also fails, try with even more minimal request
          console.error('Retry failed, attempting minimal request:', retryError.message);
          
          // Use only the last user message if available
          const lastUserMessage = cleanMessages.filter((m: any) => m.role === 'user').pop() || cleanMessages[cleanMessages.length - 1];
          
          const minimalRequest: any = {
            model: request.model,
            messages: [lastUserMessage],
            temperature: 0.7,
            max_tokens: 1024,
          };
          
          try {
            const minimalResponse = await this.client.chat.completions.create(minimalRequest);
            const minimalMessage = minimalResponse.choices[0]?.message;
            if (minimalMessage && minimalMessage.content) {
              return {
                content: minimalMessage.content,
                metadata: {
                  model: minimalResponse.model,
                  usage: minimalResponse.usage,
                  finishReason: minimalResponse.choices[0]?.finish_reason,
                },
              };
            }
          } catch (minimalError: any) {
            // Last resort - return a generic error message that won't confuse the user
            console.error('All retry attempts failed:', minimalError.message);
            return {
              content: 'I apologize, but I encountered an issue processing your request. Please try rephrasing your question.',
              metadata: {
                model: request.model,
                usage: undefined,
                finishReason: 'error',
              },
            };
          }
        }
      }
      
      // For other errors, throw but with a clean message
      const cleanErrorMessage = errorMessage.includes('400') || errorMessage.includes('bad request')
        ? 'Invalid request format. Please try again.'
        : `API error: ${errorMessage}`;
      
      throw new Error(cleanErrorMessage);
    }
  }

  private zodToJsonSchema(schema: any): any {
    // Improved conversion to handle nested objects, arrays, unions, and enums
    const convertZodType = (zodType: any): any => {
      const typeName = zodType._def?.typeName;
      
      if (typeName === 'ZodString') {
        return { type: 'string' };
      } else if (typeName === 'ZodNumber') {
        return { type: 'number' };
      } else if (typeName === 'ZodBoolean') {
        return { type: 'boolean' };
      } else if (typeName === 'ZodOptional') {
        return convertZodType(zodType._def.innerType);
      } else if (typeName === 'ZodArray') {
        const itemType = zodType._def.type;
        return {
          type: 'array',
          items: convertZodType(itemType),
        };
      } else if (typeName === 'ZodObject') {
        const shape = zodType._def.shape();
        const properties: any = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          const fieldType = value as any;
          properties[key] = convertZodType(fieldType);
          
          if (!fieldType.isOptional && fieldType._def?.typeName !== 'ZodOptional') {
            required.push(key);
          }
        }

        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        };
      } else if (typeName === 'ZodUnion') {
        // For union types, use the first type (usually string | number becomes string)
        const options = zodType._def.options || [];
        if (options.length > 0) {
          // Check if it's string | number, use string as default
          const hasString = options.some((opt: any) => opt._def?.typeName === 'ZodString');
          const hasNumber = options.some((opt: any) => opt._def?.typeName === 'ZodNumber');
          if (hasString && hasNumber) {
            return { type: 'string', description: 'Can be string or number' };
          }
          return convertZodType(options[0]);
        }
        return { type: 'string' };
      } else if (typeName === 'ZodEnum') {
        const values = zodType._def.values || [];
        return {
          type: 'string',
          enum: values,
        };
      }
      
      return { type: 'string' }; // fallback
    };

    if (schema._def?.typeName === 'ZodObject') {
      return convertZodType(schema);
    }

    return { type: 'object', properties: {} };
  }

  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  setDefaultTemperature(temperature: number): void {
    this.defaultTemperature = temperature;
  }

  setDefaultMaxTokens(maxTokens: number): void {
    this.defaultMaxTokens = maxTokens;
  }
}

