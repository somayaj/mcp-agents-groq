import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import { MCPAgentsFramework } from '../src/index.js';
import { MCPServerFramework } from '../src/core/MCPServer.js';
import { z } from 'zod';

dotenv.config();

/**
 * HTTP-based MCP Server Example
 * 
 * This example demonstrates how to create an MCP server accessible over HTTP
 * using Server-Sent Events (SSE) for streaming responses.
 * 
 * The server exposes MCP endpoints that can be accessed via HTTP:
 * - GET /mcp/sse - SSE endpoint for MCP protocol
 * - GET /mcp/tools - List available tools
 * - POST /mcp/tools/call - Call a tool
 * - GET /mcp/resources - List available resources
 * - GET /mcp/resources/read - Read a resource
 */

class HTTPMCPServer {
  private app: Express;
  private port: number;
  private mcpServer: MCPServerFramework;
  private framework: MCPAgentsFramework;

  constructor(port: number = 3002) {
    this.app = express();
    this.port = port;
    this.app.use(express.json());

    // Initialize framework
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not found in environment variables');
    }

    this.framework = new MCPAgentsFramework(apiKey, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'MCP HTTP Server' });
    });

    // MCP Protocol endpoints
    this.app.get('/mcp/tools', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServer.getServer();
        const serverInternal = server as any;
        
        // Access the tools/list handler
        const handler = serverInternal._requestHandlers?.get('tools/list');
        if (handler) {
          const response = await handler({ params: {} });
          res.json(response);
        } else {
          // Fallback: get tools directly
          // Fallback: get tools directly and convert schema
          const tools = Array.from((this.mcpServer as any).tools.values());
          const serverInternal = this.mcpServer as any;
          const zodToJsonSchema = serverInternal.zodToJsonSchema?.bind(serverInternal) || 
            ((schema: any) => ({ type: 'object', properties: {} }));
          
          res.json({
            tools: tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: zodToJsonSchema(tool.inputSchema),
            })),
          });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/mcp/tools/call', async (req: Request, res: Response) => {
      try {
        const { name, arguments: args } = req.body;
        
        if (!name) {
          return res.status(400).json({ error: 'Tool name is required' });
        }

        const server = this.mcpServer.getServer();
        const serverInternal = server as any;
        
        // Access the tools/call handler
        const handler = serverInternal._requestHandlers?.get('tools/call');
        if (handler) {
          const response = await handler({
            params: {
              name,
              arguments: args || {},
            },
          });
          res.json(response);
        } else {
          // Fallback: call tool directly
          const tool = (this.mcpServer as any).tools.get(name);
          if (!tool || !tool.handler) {
            return res.status(404).json({ error: `Tool ${name} not found` });
          }

          const result = await tool.handler(args || {});
          res.json({
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result),
              },
            ],
          });
        }
      } catch (error: any) {
        res.status(500).json({
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        });
      }
    });

    this.app.get('/mcp/resources', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServer.getServer();
        const serverInternal = server as any;
        
        const handler = serverInternal._requestHandlers?.get('resources/list');
        if (handler) {
          const response = await handler({ params: {} });
          res.json(response);
        } else {
          // Fallback: get resources directly
          const resources = Array.from((this.mcpServer as any).resources.values());
          res.json({
            resources: resources.map(resource => ({
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            })),
          });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/mcp/resources/read', async (req: Request, res: Response) => {
      try {
        const { uri } = req.query;
        
        if (!uri || typeof uri !== 'string') {
          return res.status(400).json({ error: 'Resource URI is required' });
        }

        const server = this.mcpServer.getServer();
        const serverInternal = server as any;
        
        const handler = serverInternal._requestHandlers?.get('resources/read');
        if (handler) {
          const response = await handler({
            params: { uri },
          });
          res.json(response);
        } else {
          res.status(404).json({ error: 'Resource handler not found' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // SSE endpoint for streaming MCP protocol (optional, for full MCP client support)
    this.app.get('/mcp/sse', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial connection message
      res.write('data: {"type":"connection","status":"connected"}\n\n');

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
      });
    });
  }

  async initializeMCPServer(): Promise<void> {
    // Create test agents
    const agent1 = this.framework.createAgent({
      id: 'http-agent-1',
      name: 'Research Agent',
      description: 'An agent that helps with research tasks',
      systemPrompt: 'You are a helpful research assistant. Provide concise and accurate information.',
      model: 'llama-3.3-70b-versatile',
    });

    const agent2 = this.framework.createAgent({
      id: 'http-agent-2',
      name: 'Writing Agent',
      description: 'An agent that helps with writing tasks',
      systemPrompt: 'You are a professional writer. Create well-structured and engaging content.',
      model: 'llama-3.3-70b-versatile',
    });

    // Create an orchestrator/workflow
    const orchestrator = this.framework.createOrchestrator('http-workflow-1', {
      strategy: 'sequential',
      agents: ['http-agent-1', 'http-agent-2'],
    });

    // Create MCP server with custom tools
    this.mcpServer = this.framework.createMCPServer('http-server', {
      name: 'HTTP MCP Server',
      version: '1.0.0',
      description: 'An MCP server accessible over HTTP',
      tools: [
        {
          name: 'greet',
          description: 'Greet someone with a personalized message',
          inputSchema: z.object({
            name: z.string().describe('The name of the person to greet'),
          }),
          handler: async (params) => {
            return `Hello, ${params.name}! Welcome to the HTTP MCP server.`;
          },
        },
        {
          name: 'calculate',
          description: 'Perform a simple calculation',
          inputSchema: z.object({
            expression: z.string().describe('A mathematical expression to evaluate'),
          }),
          handler: async (params) => {
            try {
              const result = eval(params.expression);
              return `Result: ${result}`;
            } catch (error: any) {
              return `Error: ${error.message}`;
            }
          },
        },
      ],
    });

    // Assign agents and workflows
    this.mcpServer.assignAgent(agent1);
    this.mcpServer.assignAgent(agent2);
    this.mcpServer.assignOrchestrator('http-workflow-1', orchestrator);

    console.log('✅ MCP Server initialized with:');
    console.log(`   - 2 agents (http-agent-1, http-agent-2)`);
    console.log(`   - 1 workflow (http-workflow-1)`);
    console.log(`   - 2 custom tools (greet, calculate)`);
  }

  async start(): Promise<void> {
    await this.initializeMCPServer();

    this.app.listen(this.port, () => {
      console.log(`\n🚀 HTTP MCP Server running on http://localhost:${this.port}`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   GET  /mcp/tools - List all available tools`);
      console.log(`   POST /mcp/tools/call - Call a tool`);
      console.log(`   GET  /mcp/resources - List all available resources`);
      console.log(`   GET  /mcp/resources/read?uri=<uri> - Read a resource`);
      console.log(`   GET  /mcp/sse - SSE endpoint for streaming`);
      console.log(`\n💡 Example usage:`);
      console.log(`   curl http://localhost:${this.port}/mcp/tools`);
      console.log(`   curl -X POST http://localhost:${this.port}/mcp/tools/call \\`);
      console.log(`        -H "Content-Type: application/json" \\`);
      console.log(`        -d '{"name":"greet","arguments":{"name":"Alice"}}'`);
      console.log(`\n`);
    });
  }
}

// Main execution
async function main() {
  const port = parseInt(process.env.MCP_HTTP_PORT || '3002', 10);
  const server = new HTTPMCPServer(port);
  await server.start();
}

main().catch(console.error);

