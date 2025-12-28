import express, { Express, Request, Response } from 'express';
import { Agent } from '../core/Agent.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { MCPServerFramework } from '../core/MCPServer.js';
import { MCPAgentsFramework } from '../index.js';
import { UIConfig, AgentConfig, MCPServerConfig, GovernanceConfig, OrchestrationConfig } from '../types/index.js';
import { PersistenceService, SavedConfiguration } from '../core/Persistence.js';
import { GovernanceService } from '../core/Governance.js';
import { createSearchTool, createGraphTool } from '../tools/index.js';
import { z } from 'zod';
import { CustomToolDefinition } from '../core/Persistence.js';
import { AgentTool } from '../types/index.js';

export class UIServer {
  private app: Express;
  private port: number;
  private agents: Map<string, Agent> = new Map();
  private orchestrators: Map<string, Orchestrator> = new Map();
  private workflowNames: Map<string, string> = new Map(); // Store workflow names separately
  private mcpServers: Map<string, MCPServerFramework> = new Map();
  private framework?: MCPAgentsFramework;
  private persistence: PersistenceService;
  private customTools: Map<string, CustomToolDefinition> = new Map();

  constructor(config?: UIConfig, framework?: MCPAgentsFramework) {
    this.app = express();
    this.port = config?.port || 3001;
    this.framework = framework;
    this.persistence = new PersistenceService();

    this.app.use(express.json());
    
    // Add request logging middleware
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        console.log(`[HTTP] ${req.method} ${req.path}`);
      }
      next();
    });
    
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

    // Available tools endpoint (includes predefined and custom tools)
    this.app.get('/api/tools', (req: Request, res: Response) => {
      const predefinedTools = [
        {
          id: 'search',
          name: 'Search',
          description: 'Search for information on a topic using web search',
          type: 'search',
          isCustom: false,
        },
        {
          id: 'create_graph',
          name: 'Create Graph',
          description: 'Create charts and graphs from data (line, bar, pie, scatter, area, histogram)',
          type: 'graph',
          isCustom: false,
        },
      ];
      
      const customTools = Array.from(this.customTools.values()).map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        type: tool.handlerType,
        isCustom: true,
        handlerType: tool.handlerType,
      }));
      
      res.json([...predefinedTools, ...customTools]);
    });
    
    // Custom tools management endpoints
    this.app.get('/api/custom-tools', (req: Request, res: Response) => {
      const tools = Array.from(this.customTools.values());
      res.json(tools);
    });
    
    this.app.post('/api/custom-tools', async (req: Request, res: Response) => {
      try {
        const tool: CustomToolDefinition = req.body;
        
        if (!tool.id || !tool.name || !tool.description) {
          return res.status(400).json({ error: 'Missing required fields: id, name, description' });
        }
        
        if (this.customTools.has(tool.id)) {
          return res.status(400).json({ error: `Tool with id "${tool.id}" already exists` });
        }
        
        // Validate handler type
        if (!['api', 'calculation', 'text', 'custom'].includes(tool.handlerType)) {
          return res.status(400).json({ error: 'Invalid handlerType. Must be: api, calculation, text, or custom' });
        }
        
        this.customTools.set(tool.id, tool);
        
        // Save to persistence
        await this.saveCustomTools();
        
        res.json(tool);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.put('/api/custom-tools/:id', async (req: Request, res: Response) => {
      try {
        const toolId = req.params.id;
        const tool: CustomToolDefinition = req.body;
        
        if (!this.customTools.has(toolId)) {
          return res.status(404).json({ error: 'Tool not found' });
        }
        
        if (tool.id !== toolId) {
          return res.status(400).json({ error: 'Tool ID mismatch' });
        }
        
        this.customTools.set(toolId, tool);
        
        // Save to persistence
        await this.saveCustomTools();
        
        res.json(tool);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.delete('/api/custom-tools/:id', async (req: Request, res: Response) => {
      try {
        const toolId = req.params.id;
        
        if (!this.customTools.has(toolId)) {
          return res.status(404).json({ error: 'Tool not found' });
        }
        
        this.customTools.delete(toolId);
        
        // Save to persistence
        await this.saveCustomTools();
        
        res.json({ success: true, message: 'Tool deleted' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Helper method to create tool from definition
    this.app.post('/api/custom-tools/:id/create-handler', async (req: Request, res: Response) => {
      try {
        const toolId = req.params.id;
        const tool = this.customTools.get(toolId);
        
        if (!tool) {
          return res.status(404).json({ error: 'Tool not found' });
        }
        
        // Create a tool handler based on the tool definition
        const agentTool = this.createToolFromDefinition(tool);
        
        res.json({
          success: true,
          tool: {
            name: agentTool.name,
            description: agentTool.description,
            // Note: handler and parameters can't be serialized, so we return metadata only
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
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

        // Handle tool selection from UI (tools are sent as array of tool IDs/types)
        const selectedTools: any[] = [];
        if ((req.body as any).selectedTools && Array.isArray((req.body as any).selectedTools)) {
          console.log(`[UI] Creating agent ${config.id} with tools:`, (req.body as any).selectedTools);
          (req.body as any).selectedTools.forEach((toolId: string) => {
            const tool = this.getToolHandler(toolId);
            if (tool) {
              selectedTools.push(tool);
            } else {
              console.warn(`[UI] Tool ${toolId} not found, skipping`);
            }
          });
          console.log(`[UI] Created ${selectedTools.length} tools for agent ${config.id}`);
        }
        
        // Remove tools from config (they're handled separately)
          delete config.tools;
        
        // Create agent with selected tools
        const agentConfig: AgentConfig = {
          ...config,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
        };

        const agent = this.framework.createAgent(agentConfig);
        this.agents.set(config.id, agent);
        console.log(`[UI] Agent ${config.id} created with tools:`, agent.getToolNames());

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

        // Handle tool selection from UI
        if ((req.body as any).selectedTools && Array.isArray((req.body as any).selectedTools)) {
          console.log(`[UI] Updating agent ${req.params.id} with tools:`, (req.body as any).selectedTools);
          // Clear existing tools
          const existingToolNames = agent.getToolNames();
          console.log(`[UI] Clearing existing tools:`, existingToolNames);
          existingToolNames.forEach(toolName => {
            agent.unregisterTool(toolName);
          });
          
          // Add selected tools
          (req.body as any).selectedTools.forEach((toolId: string) => {
            if (toolId === 'search') {
              console.log(`[UI] Adding search tool to agent ${req.params.id}`);
              agent.registerTool(createSearchTool());
            } else if (toolId === 'create_graph') {
              console.log(`[UI] Adding create_graph tool to agent ${req.params.id}`);
              agent.registerTool(createGraphTool({ outputFormat: 'html' }));
            }
          });
          console.log(`[UI] Agent ${req.params.id} now has tools:`, agent.getToolNames());
        }

        // Remove tools from updates (they're handled separately)
          delete updates.tools;

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
        // Return all orchestrators that have a name stored (saved workflows)
        // OR all orchestrators with workflow strategy or workflow property
        const workflows = Array.from(this.orchestrators.entries())
          .filter(([id, orch]) => {
            // Include if it has a stored name (was saved via UI)
            if (this.workflowNames.has(id)) {
              return true;
            }
            // Also include if it's a workflow-type orchestrator
            const config = orch.getConfig();
            return config.strategy === 'workflow' || config.workflow;
          })
          .map(([id, orch]) => {
            const config = orch.getConfig();
            return {
              id,
              name: this.workflowNames.get(id) || id, // Use stored name or fallback to ID
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
          .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);

        if (agentInstances.length === 0) {
          return res.status(400).json({ error: 'No valid agents found' });
        }

        orchestrator.registerAgents(agentInstances);
        this.orchestrators.set(id, orchestrator);
        
        // Store workflow name
        this.workflowNames.set(id, name || id);

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
        const updates: Partial<OrchestrationConfig> = {};
        if (strategy !== undefined) updates.strategy = strategy;
        if (agents !== undefined) {
          updates.agents = agents;
          // Re-register agents
          const agentInstances = agents
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);
          orchestrator.registerAgents(agentInstances);
        }
        if (workflow !== undefined) updates.workflow = workflow;
        orchestrator.updateConfig(updates);
        
        // Update workflow name if provided
        if (name !== undefined) {
          this.workflowNames.set(req.params.id, name);
        }

        // Get updated config for response
        const updatedConfig = orchestrator.getConfig();

        // Save configuration
        await this.saveConfiguration();

        res.json({ 
          id: req.params.id,
          name: this.workflowNames.get(req.params.id) || req.params.id,
          strategy: updatedConfig.strategy,
          agents: updatedConfig.agents,
          workflow: updatedConfig.workflow,
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
          this.workflowNames.delete(req.params.id);
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
          .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);

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
            .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);
          
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
            agentsToUse = Array.from(workflowAgentIds) as string[];
          }
          
          // Update orchestrator config
          const currentConfig = orchestrator.getConfig();
          orchestrator.updateConfig({
            agents: agentsToUse,
            workflow: workflow && workflow.length > 0 ? workflow : currentConfig.workflow,
            strategy: strategy || currentConfig.strategy,
          });
          
          // Re-register only the agents that should be used
          const agentInstances = agentsToUse
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);
          
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
          const currentConfig = orchestrator.getConfig();
          orchestrator.updateConfig({ agents: agentsToUse });
          
          // Clear the orchestrator's internal agent map and re-register only the specified agents
          // This ensures no stale agents from previous executions
          orchestrator.registerAgents([]); // Clear first
          
          // Re-register only the agents that should be used
          const agentInstances = agentsToUse
            .map((agentId: string) => this.agents.get(agentId))
            .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);
          
          if (agentInstances.length > 0) {
            orchestrator.registerAgents(agentInstances);
          } else {
            return res.status(400).json({ error: 'No valid agents found. Make sure agents exist.' });
          }
          
          // Also update strategy and workflow if provided
          const configUpdates: Partial<OrchestrationConfig> = {};
          if (strategy) {
            configUpdates.strategy = strategy;
          }
          if (workflow && workflow.length > 0) {
            configUpdates.workflow = workflow;
          }
          if (Object.keys(configUpdates).length > 0) {
            orchestrator.updateConfig(configUpdates);
          }
        } else {
          // If no agents provided but we have a workflow, extract agents from workflow
          if (strategy === 'workflow' && workflow && workflow.length > 0) {
            const workflowAgentIds = new Set(workflow.map((s: any) => s.agentId as string));
            const agentsToUse = Array.from(workflowAgentIds) as string[];
            
            const currentConfig = orchestrator.getConfig();
            orchestrator.updateConfig({ agents: agentsToUse });
            orchestrator.registerAgents([]); // Clear first
            
            const agentInstances = agentsToUse
              .map((agentId: string) => this.agents.get(agentId))
              .filter((agent: Agent | undefined): agent is Agent => agent !== undefined);
            
            if (agentInstances.length > 0) {
              orchestrator.registerAgents(agentInstances);
            }
          }
        }
        
        // Validate workflow configuration if using workflow strategy
        if (orchestrator && req.body.strategy === 'workflow' && req.body.workflow) {
          const workflowAgentIds = new Set((req.body.workflow as Array<{ agentId: string }>).map((s) => s.agentId));
          const registeredAgentIds = new Set(Array.from(orchestrator.getAgents()).map(a => a.getId()));
          const missingAgents = Array.from(workflowAgentIds).filter((id) => !registeredAgentIds.has(id));
          if (missingAgents.length > 0) {
            return res.status(400).json({ 
              error: `Workflow references agents that are not registered: ${missingAgents.join(', ')}. Available agents: ${Array.from(registeredAgentIds).join(', ')}` 
            });
          }
        }
        
        console.log(`[UI] Executing workflow ${req.params.id} with input:`, input.substring(0, 200));
        console.log(`[UI] Workflow strategy: ${req.body.strategy}, agents:`, req.body.agents);
        const result = await orchestrator.execute(input, context || {});
        console.log(`[UI] Workflow execution completed. Steps: ${result.steps.length}, Has metadata:`, !!result.metadata);
        if (result.metadata?.graphs) {
          console.log(`[UI] Found ${result.metadata.graphs.length} graph(s) in result metadata`);
          console.log(`[UI] Graph titles:`, result.metadata.graphs.map((g: any) => g.title || 'Untitled'));
        }
        // Log each step's metadata
        result.steps.forEach((step: any, index: number) => {
          if (step.metadata?.graphs) {
            console.log(`[UI] Step ${index} (${step.agentId}) has ${step.metadata.graphs.length} graph(s)`);
          }
        });
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
      const servers = Array.from(this.mcpServers.entries()).map(([id, server]) => {
        const serverInstance = server.getServer();
        return {
        id,
          name: (serverInstance as any).name || id,
        };
      });
      res.json(servers);
    });

    this.app.get('/api/mcp-servers/:id', (req: Request, res: Response) => {
      const server = this.mcpServers.get(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'MCP Server not found' });
      }
      const serverInstance = server.getServer();
      res.json({ id: req.params.id, name: (serverInstance as any).name || req.params.id });
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
          const tools = Array.from((server as any).tools.values()) as Array<{
            name: string;
            description: string;
            inputSchema: any;
          }>;
          const zodToJsonSchema = (server as any).zodToJsonSchema?.bind(server) || 
            ((schema: any) => ({ type: 'object', properties: {} }));
          
          res.json({
            tools: tools.map((tool: { name: string; description: string; inputSchema: any }) => ({
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
          const resources = Array.from((server as any).resources.values()) as Array<{
            uri: string;
            name: string;
            description: string;
            mimeType: string;
          }>;
          res.json({
            resources: resources.map((resource: { uri: string; name: string; description: string; mimeType: string }) => ({
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
      const serverInstance = server.getServer();
      return { 
        id, 
        config: { 
          name: (serverInstance as any).name || id,
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
          name: this.workflowNames.get(id) || id, // Use stored name or fallback to ID
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

        // Load agents (if they exist in config)
        if (config.agents && Array.isArray(config.agents)) {
          for (const agentConfig of config.agents) {
            try {
              // Remove tools when loading - handlers can't be deserialized
              // CRITICAL: Tools without handlers will cause errors if Groq tries to use them
              const agentConfigCopy = { ...agentConfig };
              
              // Save selectedTools before removing tools
              const selectedTools = (agentConfigCopy as any).selectedTools;
              
              if (agentConfigCopy.tools) {
                const toolNames = agentConfigCopy.tools.map((t: any) => t.name).join(', ');
                console.warn(`Agent ${agentConfig.id}: Removing ${agentConfigCopy.tools.length} tool(s) during load (handlers can't be serialized): ${toolNames}`);
                delete agentConfigCopy.tools;
              }
              // Ensure tools is completely undefined, not just deleted
              agentConfigCopy.tools = undefined;
              const agent = this.framework.createAgent(agentConfigCopy);
              
              // Re-register tools from selectedTools if present
              if (selectedTools && Array.isArray(selectedTools)) {
                console.log(`[UI] Loading agent ${agentConfig.id} with tools from config:`, selectedTools);
                selectedTools.forEach((toolId: string) => {
                  const tool = this.getToolHandler(toolId);
                  if (tool) {
                    agent.registerTool(tool);
                  } else {
                    console.warn(`[UI] Tool ${toolId} not found when loading agent, skipping`);
                  }
                });
              }
              
              this.agents.set(agentConfig.id, agent);
              console.log(`Loaded agent ${agentConfig.id} (${agent.getName()}) - tools: ${agent.hasTools() ? agent.getToolNames().join(', ') : 'none'}`);
            } catch (error) {
              console.error(`Failed to load agent ${agentConfig.id}:`, error);
            }
          }
        } else {
          console.log('[UI] No agents found in config, starting with empty agents list');
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
          // Store workflow name
          if (workflow.name) {
            this.workflowNames.set(workflow.id, workflow.name);
          }
          
          // Check if orchestrator already exists (it should from above)
          if (!this.orchestrators.has(workflow.id)) {
            // Create it if it doesn't exist
            const strategy = (workflow.strategy || 'workflow') as 'sequential' | 'parallel' | 'workflow';
            const orchestrator = this.framework.createOrchestrator(workflow.id, {
              strategy,
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
        console.log(`🚀 UI Server started on http://localhost:${this.port}`);
        console.log(`📊 Available agents: ${this.agents.size}`);
        console.log(`🔄 Available workflows: ${this.orchestrators.size}`);
        console.log(`📝 Logging enabled - you'll see agent execution logs here`);
        resolve();
      });
    });
  }

  getApp(): Express {
    return this.app;
  }
  
  private async saveCustomTools(): Promise<void> {
    try {
      const config = await this.persistence.load() || {
        agents: [],
        mcpServers: [],
        orchestrators: [],
        workflows: [],
        customTools: [],
        timestamp: new Date().toISOString(),
      };
      
      config.customTools = Array.from(this.customTools.values());
      await this.persistence.save(config);
    } catch (error) {
      console.error('Failed to save custom tools:', error);
    }
  }
  
  private createToolFromDefinition(toolDef: CustomToolDefinition): AgentTool {
    // Convert JSON schema back to Zod schema
    const parameters = this.jsonToZod(toolDef.parameters);
    
    // Create handler based on handler type
    let handler: (params: any) => Promise<any>;
    
    switch (toolDef.handlerType) {
      case 'api':
        handler = async (params: any) => {
          try {
            const url = toolDef.handlerConfig?.url || '';
            const method = toolDef.handlerConfig?.method || 'GET';
            const headers = toolDef.handlerConfig?.headers || {};
            
            // Replace placeholders in URL with params
            let finalUrl = url;
            Object.keys(params).forEach(key => {
              finalUrl = finalUrl.replace(`{${key}}`, params[key]);
            });
            
            const response = await fetch(finalUrl, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...headers,
              },
              body: method !== 'GET' ? JSON.stringify(params) : undefined,
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            return {
              success: true,
              data: data,
            };
          } catch (error: any) {
            return {
              success: false,
              error: error.message,
            };
          }
        };
        break;
        
      case 'calculation':
        handler = async (params: any) => {
          try {
            const operation = toolDef.handlerConfig?.operation || 'add';
            const a = params.a || 0;
            const b = params.b || 0;
            
            let result: number;
            switch (operation) {
              case 'add':
                result = a + b;
                break;
              case 'subtract':
                result = a - b;
                break;
              case 'multiply':
                result = a * b;
                break;
              case 'divide':
                if (b === 0) throw new Error('Division by zero');
                result = a / b;
                break;
              default:
                throw new Error(`Unknown operation: ${operation}`);
            }
            
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
        };
        break;
        
      case 'text':
        handler = async (params: any) => {
          try {
            const template = toolDef.handlerConfig?.template || '';
            // Simple template replacement
            let result = template;
            Object.keys(params).forEach(key => {
              result = result.replace(`{${key}}`, String(params[key]));
            });
            
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
        };
        break;
        
      default:
        // Custom handler - return error as we can't execute arbitrary code
        handler = async (params: any) => {
          return {
            success: false,
            error: 'Custom handler type requires programmatic tool creation',
          };
        };
    }
    
    return {
      name: toolDef.id,
      description: toolDef.description,
      parameters: parameters,
      handler: handler,
    };
  }
  
  private getToolHandler(toolId: string): AgentTool | null {
    // Check if it's a predefined tool
    if (toolId === 'search') {
      return createSearchTool();
    } else if (toolId === 'create_graph') {
      return createGraphTool({ outputFormat: 'html' });
    }
    
    // Check if it's a custom tool
    const toolDef = this.customTools.get(toolId);
    if (toolDef) {
      return this.createToolFromDefinition(toolDef);
    }
    
    return null;
  }
  
}

