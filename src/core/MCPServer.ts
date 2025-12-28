import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerConfig, MCPTool, MCPResource } from '../types/index.js';
import { Agent } from './Agent.js';
import { Orchestrator } from './Orchestrator.js';
import { z } from 'zod';

export class MCPServerFramework {
  private server: Server;
  private config: MCPServerConfig;
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private agents: Map<string, Agent> = new Map();
  private orchestrators: Map<string, Orchestrator> = new Map();

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: config.name,
        version: config.version || '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.registerTools(config.tools || []);
    this.registerResources(config.resources || []);
    this.setupAgentAndWorkflowTools();
  }

  assignAgent(agent: Agent): void {
    this.agents.set(agent.getId(), agent);
    this.setupAgentAndWorkflowTools();
  }

  assignAgents(agents: Agent[]): void {
    agents.forEach(agent => this.agents.set(agent.getId(), agent));
    this.setupAgentAndWorkflowTools();
  }

  assignOrchestrator(id: string, orchestrator: Orchestrator): void {
    this.orchestrators.set(id, orchestrator);
    this.setupAgentAndWorkflowTools();
  }

  assignOrchestrators(orchestrators: Map<string, Orchestrator>): void {
    orchestrators.forEach((orch, id) => this.orchestrators.set(id, orch));
    this.setupAgentAndWorkflowTools();
  }

  private setupAgentAndWorkflowTools(): void {
    // Add tools for each assigned agent
    this.agents.forEach(agent => {
      const agentTool: MCPTool = {
        name: `agent_${agent.getId()}`,
        description: `Execute agent: ${agent.getName()}. ${agent.getConfig().description || ''}`,
        inputSchema: z.object({
          message: z.string().describe('The message to send to the agent'),
        }),
        handler: async (params) => {
          const response = await agent.process(params.message);
          return {
            content: response.content,
            metadata: response.metadata,
          };
        },
      };
      this.tools.set(agentTool.name, agentTool);
    });

    // Add tools for each assigned workflow/orchestrator
    this.orchestrators.forEach((orchestrator, id) => {
      const workflowTool: MCPTool = {
        name: `workflow_${id}`,
        description: `Execute workflow: ${id}`,
        inputSchema: z.object({
          input: z.string().describe('The input for the workflow'),
          context: z.record(z.any()).optional().describe('Optional context for the workflow'),
        }),
        handler: async (params) => {
          const result = await orchestrator.execute(params.input, params.context);
          return {
            result: result.result,
            steps: result.steps,
          };
        },
      };
      this.tools.set(workflowTool.name, workflowTool);
    });

    // Add resource for listing agents
    const agentsResource: MCPResource = {
      uri: 'mcp://agents/list',
      name: 'Available Agents',
      description: 'List of all agents assigned to this MCP server',
      mimeType: 'application/json',
    };
    this.resources.set(agentsResource.uri, agentsResource);

    // Add resource for listing workflows
    const workflowsResource: MCPResource = {
      uri: 'mcp://workflows/list',
      name: 'Available Workflows',
      description: 'List of all workflows assigned to this MCP server',
      mimeType: 'application/json',
    };
    this.resources.set(workflowsResource.uri, workflowsResource);
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: this.zodToJsonSchema(tool.inputSchema),
        })),
      };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);
      if (!tool) {
        throw new Error(`Tool ${request.params.name} not found`);
      }

      // Validate handler exists and is a function
      if (!tool.handler || typeof tool.handler !== 'function') {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool ${request.params.name} does not have a valid handler function`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(request.params.arguments || {});
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Array.from(this.resources.values()).map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = this.resources.get(request.params.uri);
      if (!resource) {
        throw new Error(`Resource ${request.params.uri} not found`);
      }

      // Handle special resources for agents and workflows
      if (request.params.uri === 'mcp://agents/list') {
        const agentsList = Array.from(this.agents.values()).map(agent => ({
          id: agent.getId(),
          name: agent.getName(),
          description: agent.getConfig().description,
        }));
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: 'application/json',
              text: JSON.stringify(agentsList, null, 2),
            },
          ],
        };
      }

      if (request.params.uri === 'mcp://workflows/list') {
        const workflowsList = Array.from(this.orchestrators.entries()).map(([id, orch]) => ({
          id,
          agents: orch.getAgents().map(a => a.getId()),
        }));
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: 'application/json',
              text: JSON.stringify(workflowsList, null, 2),
            },
          ],
        };
      }

      // Custom handler can be added via config
      if (this.config.handlers?.onRequest) {
        return await this.config.handlers.onRequest(request);
      }

      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType || 'text/plain',
            text: JSON.stringify(resource),
          },
        ],
      };
    });
  }

  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  registerTools(tools: MCPTool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
  }

  registerResources(resources: MCPResource[]): void {
    resources.forEach(resource => this.registerResource(resource));
  }

  async start(transport?: any): Promise<void> {
    const serverTransport = transport || new StdioServerTransport();
    await this.server.connect(serverTransport);
    console.log(`MCP Server "${this.config.name}" started`);
  }

  async stop(): Promise<void> {
    // Cleanup if needed
  }

  private zodToJsonSchema(schema: any): any {
    // Simple conversion - in production, use a proper zod-to-json-schema library
    if (schema._def?.typeName === 'ZodObject') {
      const shape = schema._def.shape();
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodType = value as any;
        if (zodType._def?.typeName === 'ZodString') {
          properties[key] = { type: 'string' };
        } else if (zodType._def?.typeName === 'ZodNumber') {
          properties[key] = { type: 'number' };
        } else if (zodType._def?.typeName === 'ZodBoolean') {
          properties[key] = { type: 'boolean' };
        } else if (zodType._def?.typeName === 'ZodArray') {
          properties[key] = { type: 'array' };
        } else {
          properties[key] = { type: 'string' };
        }

        if (!zodType.isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    return { type: 'object', properties: {} };
  }

  getServer(): Server {
    return this.server;
  }

  getAssignedAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAssignedWorkflows(): string[] {
    return Array.from(this.orchestrators.keys());
  }
}

