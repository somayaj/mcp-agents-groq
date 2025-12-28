import { z } from 'zod';
import { AgentTool } from '../types/index.js';

/**
 * Example tool template - Replace this with your actual tool implementation
 * 
 * This is a basic template showing the structure of a tool.
 * Copy this file and modify it to create your own custom tool.
 */
export function createExampleTool(options?: {
  // Add your tool-specific options here
  option1?: string;
  option2?: number;
}): AgentTool {
  // Set default values
  const option1 = options?.option1 || 'default';
  const option2 = options?.option2 || 0;

  return {
    name: 'example_tool',
    description: 'A brief description of what this tool does. The LLM will use this to decide when to call this tool. Include examples if helpful.',
    parameters: z.object({
      // Define your tool parameters using Zod
      // Use .describe() to help the LLM understand each parameter
      input: z.string().describe('Description of what this input parameter is for'),
      optionalParam: z.number().optional().describe('An optional parameter'),
    }),
    handler: async (params: {
      input: string;
      optionalParam?: number;
    }) => {
      // Add logging for debugging
      console.log('[exampleTool] Called with params:', params);
      
      try {
        // Your tool logic here
        // This is where you implement what the tool actually does
        
        // Example: Simple processing
        const result = `Processed: ${params.input}`;
        
        // Example: Return success result
        return {
          success: true,
          result: result,
          message: 'Tool executed successfully',
        };
      } catch (error: any) {
        // Always handle errors
        console.error('[exampleTool] Error:', error);
        return {
          success: false,
          error: error.message,
          message: `Tool execution failed: ${error.message}`,
        };
      }
    },
  };
}

/**
 * Example: Calculator tool
 * 
 * This shows a more complete example with multiple operations
 */
export function createCalculatorTool(): AgentTool {
  return {
    name: 'calculator',
    description: 'Perform basic mathematical calculations. Supports addition, subtraction, multiplication, and division.',
    parameters: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The mathematical operation to perform'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    handler: async (params: { operation: string; a: number; b: number }) => {
      console.log('[calculator] Calculating:', params);
      
      try {
        let result: number;
        
        switch (params.operation) {
          case 'add':
            result = params.a + params.b;
            break;
          case 'subtract':
            result = params.a - params.b;
            break;
          case 'multiply':
            result = params.a * params.b;
            break;
          case 'divide':
            if (params.b === 0) {
              return {
                success: false,
                error: 'Division by zero is not allowed',
              };
            }
            result = params.a / params.b;
            break;
          default:
            return {
              success: false,
              error: `Unknown operation: ${params.operation}`,
            };
        }
        
        return {
          success: true,
          result: result,
          expression: `${params.a} ${params.operation} ${params.b} = ${result}`,
        };
      } catch (error: any) {
        console.error('[calculator] Error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}

