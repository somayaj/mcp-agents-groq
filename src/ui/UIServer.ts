import express, { Express, Request, Response } from 'express';
import { Agent } from '../core/Agent.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { MCPServerFramework } from '../core/MCPServer.js';
import { MCPAgentsFramework } from '../index.js';
import { UIConfig, AgentConfig, MCPServerConfig, GovernanceConfig } from '../types/index.js';
import { PersistenceService, SavedConfiguration } from '../core/Persistence.js';
import { GovernanceService } from '../core/Governance.js';
import { z } from 'zod';

export class UIServer {
  private app: Express;
  private port: number;
  private agents: Map<string, Agent> = new Map();
  private orchestrators: Map<string, Orchestrator> = new Map();
  private mcpServers: Map<string, MCPServerFramework> = new Map();
  private framework?: MCPAgentsFramework;
  private persistence: PersistenceService;

  constructor(config?: UIConfig, framework?: MCPAgentsFramework) {
    this.app = express();
    this.port = config?.port || 3001;
    this.framework = framework;
    this.persistence = new PersistenceService();

    this.app.use(express.json());
    this.setupRoutes(); // API routes must come before static files
    this.setupStaticFiles();

    // Add custom routes if provided
    if (config?.customRoutes) {
      config.customRoutes.forEach(route => {
        this.app.get(route.path, route.handler);
      });
    }

    // Load saved configuration on startup
    this.loadSavedConfiguration();
  }

  private setupStaticFiles(): void {
    // Serve static UI files - using relative path for now
    // In production, use proper path resolution
    this.app.use(express.static('public'));
    
    // Serve index.html for root
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile('index.html', { root: 'public' });
    });

    // Handle favicon request to prevent 404
    this.app.get('/favicon.ico', (req: Request, res: Response) => {
      res.status(204).end();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Agent management
    this.app.get('/api/agents', (req: Request, res: Response) => {
      const agents = Array.from(this.agents.values()).map(agent => ({
        id: agent.getId(),
        name: agent.getName(),
        config: agent.getConfig(),
        history: agent.getHistory(),
        hasTools: agent.hasTools(),
        toolNames: agent.getToolNames(),
      }));
      res.json(agents);
    });

    this.app.post('/api/agents', async (req: Request, res: Response) => {
      try {
        if (!this.framework) {
          return res.status(500).json({ error: 'Framework not initialized' });
        }

        const config: AgentConfig = req.body;
        
        if (!config.id || !config.name) {
          return res.status(400).json({ error: 'Missing required fields: id, name' });
        }

        // Note: Tools with handlers can't be fully serialized/deserialized
        // For now, we'll skip tools when creating from UI
        // Tools should be added programmatically
        if (config.tools) {
          // Validate tools before removing them
          const invalidTools = config.tools.filter((tool: any) => 
            !tool.handler || typeof tool.handler !== 'function'
          );
          if (invalidTools.length > 0) {
            console.warn('Removing tools without handlers:', invalidTools.map((t: any) => t.name));
          }
          delete config.tools; // Remove tools as they can't be serialized
        }
        
        // Ensure tools array is completely removed, not just undefined
        if (config.tools === null || config.tools === undefined) {
          delete config.tools;
        }

        const agent = this.framework.createAgent(config);
        this.agents.set(config.id, agent);

        // Save configuration
        await this.saveConfiguration();

        res.json({
          id: agent.getId(),
          name: agent.getName(),
          config: agent.getConfig(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/agents/:id', async (req: Request, res: Response) => {
      try {
        const agent = this.agents.get(req.params.id);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const updates: Partial<AgentConfig> = req.body;
        
        // Don't allow changing the ID
        if (updates.id && updates.id !== req.params.id) {
          return res.status(400).json({ error: 'Cannot change agent ID' });
        }

        // Remove tools from updates if present (handlers can't be serialized)
        if (updates.tools) {
          delete updates.tools;
        }

        // Update the agent
        agent.updateConfig(updates);

        // Save configuration
        await this.saveConfiguration();

        res.json({
          id: agent.getId(),
          name: agent.getName(),
          config: agent.getConfig(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/agents/:id', (req: Request, res: Response) => {
      const deleted = this.agents.delete(req.params.id);
      if (deleted) {
        this.saveConfiguration();
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }
    });

    this.app.get('/api/agents/:id', (req: Request, res: Response) => {
      const agent = this.agents.get(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({
        id: agent.getId(),
        name: agent.getName(),
        config: agent.getConfig(),
        history: agent.getHistory(),
      });
    });

    this.app.post('/api/agents/:id/process', async (req: Request, res: Response) => {
      const agent = this.agents.get(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      try {
        const { message, context } = req.body;
        const response = await agent.process(message, context);
        res.json(response);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agents/:id/clear', (req: Request, res: Response) => {
      const agent = this.agents.get(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      agent.clearHistory();
      res.json({ success: true });
    });

    this.app.post('/api/agents/:id/tools', async (req: Request, res: Response) => {
      try {
        const agent = this.agents.get(req.params.id);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const { tools } = req.body;
        if (!Array.isArray(tools)) {
          return res.status(400).json({ error: 'Tools must be an array' });
        }

        // Note: Tools with handlers can't be created from JSON
        // This endpoint is for programmatic use or simple tools
        // For complex tools, they should be added programmatically
        res.json({ 
          message: 'Tools cannot be added via API. Use programmatic agent creation with tools.',
          note: 'Tool handlers are functions and cannot be serialized. Create agents programmatically to add tools.'
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Orchestrator management
    this.app.get('/api/orchestrators', (req: Request, res: Response) => {
      const orchestrators = Array.from(this.orchestrators.entries()).map(([id, orch]) => ({
        id,
        agents: orch.getAgents().map(a => a.getId()),
      }));
      res.json(orchestrators);
    });

    // Workflow endpoints
    this.app.get('/api/workflows', (req: Request, res: Response) => {
      try {
        const workflows = Array.from(this.orchestrators.entries())
          .filter(([id, orch]) => orch.getConfig().strategy === 'workflow' || orch.getConfig().workflow)
          .map(([id, orch]) => {
            const config = orch.getConfig();
            return {
              id,
              name: id, // Use ID as name for now
              strategy: config.strategy || 'workflow',
              agents: config.agents || [],
              workflow: config.workflow || [],
            };
          });
        res.json(workflows);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/workflows', async (req: Request, res: Response) => {
      try {
        const { id, name, strategy, agents, workflow } = req.body;
        
        if (!id) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }
        
        if (!agents || agents.length === 0) {
          return res.status(400).json({ error: 'Missing required field: agents' });
        }

        // Create orchestrator config
        const config: any = {
          strategy: strategy || 'workflow',
          agents: agents,
        };

        if (workflow && workflow.length > 0) {
          config.workflow = workflow;
        }

        // Create orchestrator dynamically
        const orchestrator = new Orchestrator(config);
        
        // Register agents with orchestrator
        const agentInstances = agents
          .map((agentId: string) => this.agents.get(agentId))
          .filter((agent): agent is Agent => agent !== undefined);

        if (agentInstances.length === 0) {
          return res.status(400).json({ error: 'No valid agents found' });
        }

        orchestrator.registerAgents(agentInstances);
        this.orchestrators.set(id, orchestrator);

        // Save configuration
        await this.saveConfiguration();

        res.json({ 
          id, 
          name: name || id,
          strategy: config.strategy,
          agents: config.agents,
          workflow: config.workflow,
          message: 'Workflow saved successfully' 
        });
      } catch (error: any) {
        console.error('Error saving workflow:', error);
        res.status(500).json({ error: error.message || 'Failed to save workflow' });
      }
    });

    this.app.put('/api/workflows/:id', async (req: Request, res: Response) => {
      try {
        const orchestrator = this.orchestrators.get(req.params.id);
        if (!orchestrator) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        const { name, strategy, agents, workflow } = req.body;

        // Update orchestrator config
        const config = orchestrator.getConfig();
        if (strategy !== undefined) config.strategy = strategy;
        if (agents !== undefined) {
          config.agents = agents;
          // Re-register agents
          const agentInstances = agents
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent): agent is Agent => agent !== undefined);
          orchestrator.registerAgents(agentInstances);
        }
        if (workflow !== undefined) config.workflow = workflow;

        // Save configuration
        await this.saveConfiguration();

        res.json({ 
          id: req.params.id,
          name: name || req.params.id,
          strategy: config.strategy,
          agents: config.agents,
          workflow: config.workflow,
          message: 'Workflow updated successfully' 
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/workflows/:id', async (req: Request, res: Response) => {
      try {
        const deleted = this.orchestrators.delete(req.params.id);
        if (deleted) {
          await this.saveConfiguration();
          res.json({ success: true });
        } else {
          res.status(404).json({ error: 'Workflow not found' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/orchestrators', async (req: Request, res: Response) => {
      try {
        const { id, strategy, agents, workflow } = req.body;
        
        if (!id || !agents || agents.length === 0) {
          return res.status(400).json({ error: 'Missing required fields: id, agents' });
        }

        // Create orchestrator config
        const config: any = {
          strategy: strategy || 'sequential',
          agents: agents,
        };

        if (workflow && workflow.length > 0) {
          config.workflow = workflow;
        }

        // Create orchestrator dynamically
        const orchestrator = new Orchestrator(config);
        
        // Register agents with orchestrator
        const agentInstances = agents
          .map((agentId: string) => this.agents.get(agentId))
          .filter((agent): agent is Agent => agent !== undefined);

        if (agentInstances.length === 0) {
          return res.status(400).json({ error: 'No valid agents found' });
        }

        orchestrator.registerAgents(agentInstances);
        this.orchestrators.set(id, orchestrator);

        res.json({ id, message: 'Orchestrator created successfully' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/orchestrators/:id/execute', async (req: Request, res: Response) => {
      try {
        let orchestrator = this.orchestrators.get(req.params.id);
        
        // If orchestrator doesn't exist, try to create it on the fly
        if (!orchestrator && req.params.id === 'default') {
          const { strategy, agents, workflow } = req.body;
          if (!agents || agents.length === 0) {
            return res.status(400).json({ error: 'No agents provided' });
          }
          
          // For workflow strategy, only use agents that are actually in the workflow steps
          // For sequential/parallel, use the agents provided
          let agentsToUse = agents;
          if (strategy === 'workflow' && workflow && workflow.length > 0) {
            // Extract unique agent IDs from workflow steps
            const workflowAgentIds = new Set(workflow.map((s: any) => s.agentId));
            agentsToUse = Array.from(workflowAgentIds);
          }
          
          const config: any = {
            strategy: strategy || 'sequential',
            agents: agentsToUse, // Use filtered agents
          };
          if (workflow && workflow.length > 0) {
            config.workflow = workflow;
          }
          
          orchestrator = new Orchestrator(config);
          const agentInstances = agentsToUse
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent): agent is Agent => agent !== undefined);
          
          if (agentInstances.length === 0) {
            return res.status(400).json({ error: 'No valid agents found. Make sure agents exist.' });
          }
          
          orchestrator.registerAgents(agentInstances);
          // Ensure workflow map is updated (should already be done in constructor, but just in case)
          orchestrator.updateWorkflowMap();
          this.orchestrators.set('default', orchestrator);
        }
        
        // If orchestrator exists but we're updating it with new agents/workflow
        if (orchestrator && req.body.strategy) {
          const { strategy, agents, workflow } = req.body;
          
          // For workflow strategy, only use agents that are actually in the workflow steps
          let agentsToUse = agents;
          if (strategy === 'workflow' && workflow && workflow.length > 0) {
            const workflowAgentIds = new Set(workflow.map((s: any) => s.agentId));
            agentsToUse = Array.from(workflowAgentIds);
          }
          
          // Update orchestrator config
          orchestrator.config.agents = agentsToUse;
          if (workflow && workflow.length > 0) {
            orchestrator.config.workflow = workflow;
            // Update the internal workflow map
            orchestrator.updateWorkflowMap();
          }
          orchestrator.config.strategy = strategy || orchestrator.config.strategy;
          
          // Re-register only the agents that should be used
          const agentInstances = agentsToUse
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent): agent is Agent => agent !== undefined);
          
          if (agentInstances.length > 0) {
            orchestrator.registerAgents(agentInstances);
          }
        }

        if (!orchestrator) {
          return res.status(404).json({ error: 'Orchestrator not found' });
        }

        const { input, context, agents, strategy, workflow } = req.body;
        if (!input) {
          return res.status(400).json({ error: 'Input is required' });
        }
        
        // ALWAYS update the orchestrator to use only the agents provided in the request
        // This prevents using agents from saved config that aren't in the current workflow
        if (agents && Array.isArray(agents) && agents.length > 0) {
          // Remove duplicate agent IDs
          let agentsToUse = Array.from(new Set(agents));
          
          // For workflow strategy, only use agents that are actually in the workflow steps
          if (strategy === 'workflow' && workflow && workflow.length > 0) {
            const workflowAgentIds = new Set(workflow.map((s: any) => s.agentId));
            agentsToUse = Array.from(workflowAgentIds);
          }
          
          // CRITICAL: Update orchestrator config BEFORE execution
          // Clear existing agents and re-register only the ones we want
          orchestrator.config.agents = agentsToUse;
          
          // Clear the orchestrator's internal agent map and re-register only the specified agents
          // This ensures no stale agents from previous executions
          orchestrator.registerAgents([]); // Clear first
          
          // Re-register only the agents that should be used
          const agentInstances = agentsToUse
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent): agent is Agent => agent !== undefined);
          
          if (agentInstances.length > 0) {
            orchestrator.registerAgents(agentInstances);
          } else {
            return res.status(400).json({ error: 'No valid agents found. Make sure agents exist.' });
          }
          
          // Also update strategy if provided
          if (strategy) {
            orchestrator.config.strategy = strategy;
          }
          
          // Update workflow if provided
          if (workflow && workflow.length > 0) {
            orchestrator.config.workflow = workflow;
          }
        } else {
          // If no agents provided but we have a workflow, extract agents from workflow
          if (strategy === 'workflow' && workflow && workflow.length > 0) {
            const workflowAgentIds = new Set(workflow.map((s: any) => s.agentId));
            const agentsToUse = Array.from(workflowAgentIds);
            
            orchestrator.config.agents = agentsToUse;
            orchestrator.registerAgents([]); // Clear first
            
            const agentInstances = agentsToUse
              .map((agentId: string) => this.agents.get(agentId))
              .filter((agent): agent is Agent => agent !== undefined);
            
            if (agentInstances.length > 0) {
              orchestrator.registerAgents(agentInstances);
            }
          }
        }
        
        // Validate workflow configuration if using workflow strategy
        if (orchestrator && req.body.strategy === 'workflow' && req.body.workflow) {
          const workflowAgentIds = new Set(req.body.workflow.map((s: any) => s.agentId));
          const registeredAgentIds = new Set(Array.from(orchestrator.getAgents()).map(a => a.getId()));
          const missingAgents = Array.from(workflowAgentIds).filter(id => !registeredAgentIds.has(id));
          if (missingAgents.length > 0) {
            return res.status(400).json({ 
              error: `Workflow references agents that are not registered: ${missingAgents.join(', ')}. Available agents: ${Array.from(registeredAgentIds).join(', ')}` 
            });
          }
        }
        
        const result = await orchestrator.execute(input, context || {});
        res.json(result);
      } catch (error: any) {
        console.error('Orchestrator execution error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
          error: error.message || 'Failed to execute orchestrator',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // MCP Server management
    this.app.get('/api/mcp-servers', (req: Request, res: Response) => {
      const servers = Array.from(this.mcpServers.entries()).map(([id, server]) => ({
        id,
        name: server.getServer().name,
      }));
      res.json(servers);
    });

    this.app.get('/api/mcp-servers/:id', (req: Request, res: Response) => {
      const server = this.mcpServers.get(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'MCP Server not found' });
      }
      res.json({ id: req.params.id, name: server.getServer().name });
    });

    this.app.post('/api/mcp-servers/:id/assign-agents', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const { agentIds } = req.body;
        if (!Array.isArray(agentIds)) {
          return res.status(400).json({ error: 'agentIds must be an array' });
        }

        const agentsToAssign = agentIds
          .map((id: string) => this.agents.get(id))
          .filter((agent): agent is Agent => agent !== undefined);

        server.assignAgents(agentsToAssign);
        await this.saveConfiguration();

        res.json({ success: true, assigned: agentsToAssign.map(a => a.getId()) });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp-servers/:id/assign-workflows', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const { workflowIds } = req.body;
        if (!Array.isArray(workflowIds)) {
          return res.status(400).json({ error: 'workflowIds must be an array' });
        }

        for (const workflowId of workflowIds) {
          const orchestrator = this.orchestrators.get(workflowId);
          if (orchestrator) {
            server.assignOrchestrator(workflowId, orchestrator);
          }
        }

        await this.saveConfiguration();
        res.json({ success: true, assigned: workflowIds });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mcp-servers/:id/assigned', (req: Request, res: Response) => {
      const server = this.mcpServers.get(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'MCP Server not found' });
      }

      res.json({ 
        agents: server.getAssignedAgents().map(a => ({ id: a.getId(), name: a.getName() })),
        workflows: server.getAssignedWorkflows()
      });
    });

    this.app.post('/api/mcp-servers', async (req: Request, res: Response) => {
      try {
        if (!this.framework) {
          return res.status(500).json({ error: 'Framework not initialized' });
        }

        const { id, config } = req.body;
        
        if (!id || !config || !config.name) {
          return res.status(400).json({ error: 'Missing required fields: id, config.name' });
        }

        // Note: MCP server tools with handlers can't be fully serialized
        // Tools should be added programmatically
        if (config.tools) {
          delete config.tools;
        }

        const server = this.framework.createMCPServer(id, config);
        this.mcpServers.set(id, server);

        // Save configuration
        await this.saveConfiguration();

        res.json({ id, message: 'MCP Server created successfully' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/mcp-servers/:id', (req: Request, res: Response) => {
      const deleted = this.mcpServers.delete(req.params.id);
      if (deleted) {
        this.saveConfiguration();
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'MCP Server not found' });
      }
    });

    // HTTP MCP Server endpoints - Access MCP servers over HTTP
    this.app.get('/api/mcp-servers/:id/tools', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const serverInstance = server.getServer();
        const serverInternal = serverInstance as any;
        const handler = serverInternal._requestHandlers?.get('tools/list');
        
        if (handler) {
          // MCP SDK expects a properly formatted request with method
          const response = await handler({ 
            method: 'tools/list',
            params: {} 
          });
          res.json(response);
        } else {
          // Fallback: get tools directly
          const tools = Array.from((server as any).tools.values());
          const zodToJsonSchema = (server as any).zodToJsonSchema?.bind(server) || 
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

    this.app.post('/api/mcp-servers/:id/tools/call', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const { name, arguments: args } = req.body;
        
        if (!name) {
          return res.status(400).json({ error: 'Tool name is required' });
        }

        const serverInstance = server.getServer();
        const serverInternal = serverInstance as any;
        const handler = serverInternal._requestHandlers?.get('tools/call');
        
        if (handler) {
          // MCP SDK expects a properly formatted request with method
          const response = await handler({
            method: 'tools/call',
            params: {
              name,
              arguments: args || {},
            },
          });
          res.json(response);
        } else {
          // Fallback: call tool directly
          const tool = (server as any).tools.get(name);
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

    // Note: More specific route must come before general route
    this.app.get('/api/mcp-servers/:id/resources/read', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const { uri } = req.query;
        
        if (!uri || typeof uri !== 'string') {
          return res.status(400).json({ error: 'Resource URI is required' });
        }

        const serverInstance = server.getServer();
        const serverInternal = serverInstance as any;
        
        // Try to access the handler - the key might be different
        // Check both possible handler storage locations
        let handler = serverInternal._requestHandlers?.get('resources/read') ||
                     serverInternal._requestHandlers?.get('resources.read') ||
                     serverInternal.requestHandlers?.get('resources/read');
        
        if (handler) {
          // MCP SDK expects a properly formatted request with method
          const response = await handler({
            method: 'resources/read',
            params: { uri },
          });
          res.json(response);
        } else {
          // Fallback: call the resource read logic directly
          const serverFramework = server as any;
          const resource = serverFramework.resources?.get(uri);
          
          if (!resource) {
            return res.status(404).json({ error: `Resource ${uri} not found` });
          }

          // Handle special resources
          if (uri === 'mcp://agents/list') {
            const agents = server.getAssignedAgents();
            const agentsList = agents.map(agent => ({
              id: agent.getId(),
              name: agent.getName(),
              description: agent.getConfig().description,
            }));
            return res.json({
              contents: [
                {
                  uri: resource.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(agentsList, null, 2),
                },
              ],
            });
          }

          if (uri === 'mcp://workflows/list') {
            const workflows = server.getAssignedWorkflows();
            const workflowsList = workflows.map(id => ({ id }));
            return res.json({
              contents: [
                {
                  uri: resource.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(workflowsList, null, 2),
                },
              ],
            });
          }

          // Default resource response
          res.json({
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType || 'text/plain',
                text: JSON.stringify(resource),
              },
            ],
          });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mcp-servers/:id/resources', async (req: Request, res: Response) => {
      try {
        const server = this.mcpServers.get(req.params.id);
        if (!server) {
          return res.status(404).json({ error: 'MCP Server not found' });
        }

        const serverInstance = server.getServer();
        const serverInternal = serverInstance as any;
        const handler = serverInternal._requestHandlers?.get('resources/list');
        
        if (handler) {
          // MCP SDK expects a properly formatted request with method
          const response = await handler({ 
            method: 'resources/list',
            params: {} 
          });
          res.json(response);
        } else {
          // Fallback: get resources directly
          const resources = Array.from((server as any).resources.values());
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

    // Persistence endpoints
    this.app.get('/api/config', async (req: Request, res: Response) => {
      try {
        const config = await this.persistence.load();
        res.json(config || { agents: [], mcpServers: [], orchestrators: [], workflows: [] });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/config/save', async (req: Request, res: Response) => {
      try {
        await this.saveConfiguration();
        res.json({ success: true, message: 'Configuration saved' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/config/load', async (req: Request, res: Response) => {
      try {
        await this.loadSavedConfiguration();
        res.json({ success: true, message: 'Configuration loaded' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/config/export', async (req: Request, res: Response) => {
      try {
        const { filePath } = req.body;
        const config = await this.buildConfiguration();
        await this.persistence.exportToFile(filePath || 'exported-config.json', config);
        res.json({ success: true, filePath: filePath || 'exported-config.json' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/config/import', async (req: Request, res: Response) => {
      try {
        const { filePath } = req.body;
        const config = await this.persistence.importFromFile(filePath);
        await this.loadConfiguration(config);
        res.json({ success: true, message: 'Configuration imported' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Governance endpoints
    this.app.get('/api/governance/stats/:agentId', (req: Request, res: Response) => {
      try {
        const agent = this.agents.get(req.params.agentId);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const governance = this.framework?.getGovernance();
        if (!governance) {
          return res.status(404).json({ error: 'Governance not configured' });
        }

        const stats = governance.getUsageStats(req.params.agentId);
        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/governance/config', (req: Request, res: Response) => {
      try {
        const governance = this.framework?.getGovernance();
        if (!governance) {
          return res.status(404).json({ error: 'Governance not configured' });
        }

        const config = governance.getConfig();
        res.json(config);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/governance/config', async (req: Request, res: Response) => {
      try {
        const config: GovernanceConfig = req.body;
        this.framework?.setGovernance(config);
        res.json({ success: true, message: 'Governance configuration updated' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/governance/reset/:agentId', (req: Request, res: Response) => {
      try {
        const governance = this.framework?.getGovernance();
        if (!governance) {
          return res.status(404).json({ error: 'Governance not configured' });
        }

        governance.resetUsageStats(req.params.agentId);
        res.json({ success: true, message: 'Usage stats reset' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // WebSocket support for real-time updates
    this.app.get('/api/ws', (req: Request, res: Response) => {
      // WebSocket implementation can be added here
      res.json({ message: 'WebSocket endpoint - implement with ws library' });
    });
  }

  private jsonToZod(schema: any): z.ZodSchema {
    // Simple conversion from JSON schema to Zod
    if (schema && schema.type === 'object' && schema.properties) {
      const shape: any = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        const prop = value as any;
        if (prop.type === 'string') {
          shape[key] = z.string();
        } else if (prop.type === 'number') {
          shape[key] = z.number();
        } else if (prop.type === 'boolean') {
          shape[key] = z.boolean();
        } else {
          shape[key] = z.any();
        }
        
        if (schema.required && !schema.required.includes(key)) {
          shape[key] = shape[key].optional();
        }
      }
      return z.object(shape);
    }
    return z.any();
  }

  private async saveConfiguration(): Promise<void> {
    try {
      const config = await this.buildConfiguration();
      await this.persistence.save(config);
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  private async buildConfiguration(): Promise<SavedConfiguration> {
    const agents = Array.from(this.agents.values()).map(agent => agent.getConfig());
    const mcpServers = Array.from(this.mcpServers.entries()).map(([id, server]) => {
      // Save assigned agents and workflows
      const assignedAgents = server.getAssignedAgents().map(a => a.getId());
      const assignedWorkflows = server.getAssignedWorkflows();
      return { 
        id, 
        config: { 
          name: server.getServer().name,
          assignedAgents,
          assignedWorkflows,
        } as MCPServerConfig 
      };
    });
    const orchestrators = Array.from(this.orchestrators.entries()).map(([id, orch]) => {
      const config = orch.getConfig();
      return { id, config };
    });

    // Collect workflows (orchestrators with workflow strategy or workflow property)
    const workflows = Array.from(this.orchestrators.entries())
      .filter(([id, orch]) => {
        const config = orch.getConfig();
        return config.strategy === 'workflow' || (config.workflow && config.workflow.length > 0);
      })
      .map(([id, orch]) => {
        const config = orch.getConfig();
        return {
          id,
          name: id, // Use ID as name for now
          strategy: config.strategy || 'workflow',
          agents: config.agents || [],
          workflow: config.workflow || [],
        };
      });

    return {
      agents,
      mcpServers,
      orchestrators,
      workflows,
      timestamp: new Date().toISOString(),
    };
  }

  private async loadSavedConfiguration(): Promise<void> {
    try {
      const config = await this.persistence.load();
      if (config) {
        await this.loadConfiguration(config);
      }
    } catch (error) {
      console.error('Failed to load saved configuration:', error);
    }
  }

  private async loadConfiguration(config: SavedConfiguration): Promise<void> {
    if (!this.framework) return;

        // Load agents
        for (const agentConfig of config.agents) {
          try {
            // Remove tools when loading - handlers can't be deserialized
            // CRITICAL: Tools without handlers will cause errors if Groq tries to use them
            const agentConfigCopy = { ...agentConfig };
            if (agentConfigCopy.tools) {
              const toolNames = agentConfigCopy.tools.map((t: any) => t.name).join(', ');
              console.warn(`Agent ${agentConfig.id}: Removing ${agentConfigCopy.tools.length} tool(s) during load (handlers can't be serialized): ${toolNames}`);
              delete agentConfigCopy.tools;
            }
            // Ensure tools is completely undefined, not just deleted
            agentConfigCopy.tools = undefined;
            const agent = this.framework.createAgent(agentConfigCopy);
            this.agents.set(agentConfig.id, agent);
            console.log(`Loaded agent ${agentConfig.id} (${agent.getName()}) - tools: ${agent.hasTools() ? agent.getToolNames().join(', ') : 'none'}`);
          } catch (error) {
            console.error(`Failed to load agent ${agentConfig.id}:`, error);
          }
        }

    // Load MCP servers (simplified - handlers can't be serialized)
    for (const { id, config: serverConfig } of config.mcpServers) {
      try {
        if (serverConfig.tools) {
          serverConfig.tools = serverConfig.tools.map((tool: any) => ({
            ...tool,
            inputSchema: this.jsonToZod(tool.inputSchema),
          }));
        }
        const server = this.framework.createMCPServer(id, serverConfig);
        this.mcpServers.set(id, server);

        // Assign agents and workflows if they were saved
        if (serverConfig.assignedAgents && serverConfig.assignedAgents.length > 0) {
          const agentsToAssign = serverConfig.assignedAgents
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent): agent is Agent => agent !== undefined);
          server.assignAgents(agentsToAssign);
        }

        if (serverConfig.assignedWorkflows && serverConfig.assignedWorkflows.length > 0) {
          for (const workflowId of serverConfig.assignedWorkflows) {
            const orchestrator = this.orchestrators.get(workflowId);
            if (orchestrator) {
              server.assignOrchestrator(workflowId, orchestrator);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to load MCP server ${id}:`, error);
      }
    }

    // Load orchestrators
    for (const { id, config: orchConfig } of config.orchestrators) {
      try {
        const orchestrator = this.framework.createOrchestrator(id, orchConfig);
        this.orchestrators.set(id, orchestrator);
      } catch (error) {
        console.error(`Failed to load orchestrator ${id}:`, error);
      }
    }

    // Load workflows (they're stored separately but also as orchestrators)
    // Workflows are already loaded as orchestrators above, but we can validate them
    if (config.workflows && config.workflows.length > 0) {
      for (const workflow of config.workflows) {
        try {
          // Check if orchestrator already exists (it should from above)
          if (!this.orchestrators.has(workflow.id)) {
            // Create it if it doesn't exist
            const orchestrator = this.framework.createOrchestrator(workflow.id, {
              strategy: workflow.strategy || 'workflow',
              agents: workflow.agents || [],
              workflow: workflow.workflow || [],
            });
            this.orchestrators.set(workflow.id, orchestrator);
            console.log(`Loaded workflow ${workflow.id} (${workflow.name || workflow.id})`);
          } else {
            console.log(`Workflow ${workflow.id} already loaded as orchestrator`);
          }
        } catch (error) {
          console.error(`Failed to load workflow ${workflow.id}:`, error);
        }
      }
    }
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.getId(), agent);
  }

  registerOrchestrator(id: string, orchestrator: Orchestrator): void {
    this.orchestrators.set(id, orchestrator);
  }

  registerMCPServer(id: string, server: MCPServerFramework): void {
    this.mcpServers.set(id, server);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`UI Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  getApp(): Express {
    return this.app;
  }
}

