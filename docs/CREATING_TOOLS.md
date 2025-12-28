# Creating Custom Tools for MCP Agents

This guide explains how to create custom tools that can be used by agents in the MCP Agents Groq framework.

## Tool Structure

A tool is an object that implements the `AgentTool` interface:

```typescript
interface AgentTool {
  name: string;                    // Unique tool identifier
  description: string;              // Description for the LLM to understand when to use this tool
  parameters: z.ZodSchema;          // Zod schema defining the tool's parameters
  handler: (params: any, context?: AgentContext) => Promise<any>;  // Function that executes the tool
}
```

## Basic Tool Template

Here's a minimal template for creating a tool:

```typescript
import { z } from 'zod';
import { AgentTool } from '../types/index.js';

export function createMyTool(options?: {
  // Your tool options here
}): AgentTool {
  return {
    name: 'my_tool',
    description: 'A clear description of what this tool does and when to use it.',
    parameters: z.object({
      // Define your parameters using Zod
      input: z.string().describe('Description of the input parameter'),
    }),
    handler: async (params: { input: string }) => {
      // Your tool logic here
      try {
        // Do something with params.input
        const result = await doSomething(params.input);
        return {
          success: true,
          result: result,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}
```

## Example: Creating a Calculator Tool

```typescript
import { z } from 'zod';
import { AgentTool } from '../types/index.js';

export function createCalculatorTool(): AgentTool {
  return {
    name: 'calculator',
    description: 'Perform mathematical calculations. Use this tool to add, subtract, multiply, or divide numbers.',
    parameters: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The mathematical operation to perform'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    handler: async (params: { operation: string; a: number; b: number }) => {
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
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}
```

## Example: Creating an API Tool

```typescript
import { z } from 'zod';
import { AgentTool } from '../types/index.js';

export function createAPITool(options?: {
  apiKey?: string;
  baseUrl?: string;
}): AgentTool {
  const apiKey = options?.apiKey || process.env.API_KEY;
  const baseUrl = options?.baseUrl || 'https://api.example.com';
  
  return {
    name: 'api_call',
    description: 'Make API calls to external services. Use this tool to fetch data from APIs.',
    parameters: z.object({
      endpoint: z.string().describe('API endpoint path (e.g., "/users/123")'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.record(z.any()).optional().describe('Request body for POST/PUT requests'),
    }),
    handler: async (params: { endpoint: string; method: string; body?: any }) => {
      try {
        const url = `${baseUrl}${params.endpoint}`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const response = await fetch(url, {
          method: params.method,
          headers,
          body: params.body ? JSON.stringify(params.body) : undefined,
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
          success: true,
          data: data,
          status: response.status,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}
```

## Example: Creating a File System Tool

```typescript
import { z } from 'zod';
import { AgentTool } from '../types/index.js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';

export function createFileSystemTool(options?: {
  allowedPaths?: string[];  // Restrict file operations to specific paths
}): AgentTool {
  const allowedPaths = options?.allowedPaths || [];
  
  function isPathAllowed(path: string): boolean {
    if (allowedPaths.length === 0) return true;
    return allowedPaths.some(allowed => path.startsWith(allowed));
  }
  
  return {
    name: 'file_system',
    description: 'Read, write, and list files. Use this tool to interact with the file system.',
    parameters: z.object({
      operation: z.enum(['read', 'write', 'list']).describe('File operation to perform'),
      path: z.string().describe('File or directory path'),
      content: z.string().optional().describe('Content to write (required for write operation)'),
    }),
    handler: async (params: { operation: string; path: string; content?: string }) => {
      try {
        // Security check
        if (!isPathAllowed(params.path)) {
          return {
            success: false,
            error: `Path ${params.path} is not allowed`,
          };
        }
        
        switch (params.operation) {
          case 'read':
            if (!existsSync(params.path)) {
              return {
                success: false,
                error: `File not found: ${params.path}`,
              };
            }
            const content = await readFile(params.path, 'utf-8');
            return {
              success: true,
              content: content,
            };
            
          case 'write':
            if (!params.content) {
              return {
                success: false,
                error: 'Content is required for write operation',
              };
            }
            await writeFile(params.path, params.content, 'utf-8');
            return {
              success: true,
              message: `File written successfully: ${params.path}`,
            };
            
          case 'list':
            const files = await readdir(params.path);
            return {
              success: true,
              files: files,
            };
            
          default:
            return {
              success: false,
              error: `Unknown operation: ${params.operation}`,
            };
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}
```

## Using Your Custom Tool

### 1. Export from tools/index.ts

Add your tool to the exports in `src/tools/index.ts`:

```typescript
export { createMyTool } from './myTool.js';
```

### 2. Use with an Agent

```typescript
import { MCPAgentsFramework } from './src/index.js';
import { createMyTool } from './src/tools/index.js';

const framework = new MCPAgentsFramework(apiKey);

const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  tools: [
    createMyTool({ /* options */ }),
  ],
});
```

### 3. Use in the UI

The UI will automatically detect tools registered with agents. You can select them when creating or editing agents.

## Best Practices

### 1. Clear Descriptions
- Write clear, descriptive tool names and descriptions
- The LLM uses the description to decide when to call your tool
- Include examples in the description when helpful

### 2. Parameter Validation
- Use Zod schemas to validate all inputs
- Provide `.describe()` for each parameter to help the LLM understand them
- Use appropriate Zod types (z.string(), z.number(), z.enum(), etc.)

### 3. Error Handling
- Always wrap tool logic in try-catch blocks
- Return consistent error format: `{ success: false, error: string }`
- Log errors for debugging: `console.error('[ToolName] Error:', error)`

### 4. Return Values
- Return consistent success format: `{ success: true, ...data }`
- Include relevant data in the response
- Keep responses concise but informative

### 5. Async Operations
- Use `async/await` for asynchronous operations
- The handler must return a Promise

### 6. Logging
- Add console.log statements for debugging
- Log important operations and results
- Use consistent log prefixes: `[ToolName]`

### 7. Security
- Validate and sanitize all inputs
- Restrict file system access to safe paths
- Don't expose sensitive information in responses
- Validate API keys and permissions

## Advanced: Tools with Context

Tools can access the agent context if needed:

```typescript
handler: async (params: any, context?: AgentContext) => {
  if (context) {
    console.log(`Tool called by agent: ${context.agentId}`);
    // Use context.agentId, context.sessionId, context.metadata
  }
  // ... tool logic
}
```

## Advanced: Tools that Return Special Data

Some tools (like the graph tool) return special data that gets stored in metadata:

```typescript
handler: async (params: any) => {
  // ... generate chart or other special content
  
  return {
    success: true,
    chart: chartHTML,  // Special content
    format: 'html',
    message: 'Chart created successfully',
  };
}
```

The agent framework will automatically detect and store special content in response metadata.

## Testing Your Tool

Create a test file to verify your tool works:

```typescript
import { createMyTool } from './src/tools/myTool.js';

async function test() {
  const tool = createMyTool();
  
  // Test the handler directly
  const result = await tool.handler({
    input: 'test value',
  });
  
  console.log('Tool result:', result);
}

test();
```

## Examples in the Codebase

- **Search Tool**: `src/tools/search.ts` - Simple tool with custom function
- **Graph Tool**: `src/tools/graph.ts` - Complex tool with special return format
- **Graph Tool (MCP)**: `src/tools/graph.ts` - Shows MCP tool integration

## Next Steps

1. Create your tool file in `src/tools/`
2. Export it from `src/tools/index.ts`
3. Test it with an agent
4. Use it in your workflows!

