// Main exports
export { GroqClient } from './core/GroqClient.js';
export { MCPServerFramework } from './core/MCPServer.js';
export { Agent } from './core/Agent.js';
export { Orchestrator } from './core/Orchestrator.js';
export { UIServer } from './ui/UIServer.js';
export { PersistenceService } from './core/Persistence.js';
export { GovernanceService } from './core/Governance.js';

// Types
export * from './types/index.js';

// Tools
export * from './tools/index.js';

// Framework class for easy setup
import { GroqClient } from './core/GroqClient.js';
import { Agent, AgentConfig } from './core/Agent.js';
import { Orchestrator, OrchestrationConfig } from './core/Orchestrator.js';
import { MCPServerFramework, MCPServerConfig } from './core/MCPServer.js';
import { UIServer, UIConfig } from './ui/UIServer.js';
import { GovernanceService, GovernanceConfig } from './core/Governance.js';

export class MCPAgentsFramework {
  private groqClient: GroqClient;
  private agents: Map<string, Agent> = new Map();
  private orchestrators: Map<string, Orchestrator> = new Map();
  private mcpServers: Map<string, MCPServerFramework> = new Map();
  private uiServer?: UIServer;
  private governance?: GovernanceService;
  private defaultGovernanceConfig?: GovernanceConfig;

  constructor(groqApiKey: string, groqConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    governance?: GovernanceConfig;
  }) {
    this.groqClient = new GroqClient(groqApiKey, groqConfig);
    this.defaultGovernanceConfig = groqConfig?.governance;
    
    if (this.defaultGovernanceConfig) {
      this.governance = new GovernanceService(this.defaultGovernanceConfig);
    }
  }

  createAgent(config: AgentConfig, governanceConfig?: GovernanceConfig): Agent {
    // Use agent-specific governance config, or fall back to framework default
    const agentGovernance = governanceConfig || this.defaultGovernanceConfig;
    const agent = new Agent(config, this.groqClient, agentGovernance);
    this.agents.set(config.id, agent);
    
    if (this.uiServer) {
      this.uiServer.registerAgent(agent);
    }
    
    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  createOrchestrator(id: string, config: OrchestrationConfig): Orchestrator {
    // Register agents with orchestrator
    const agents = config.agents
      .map(agentId => this.agents.get(agentId))
      .filter((agent): agent is Agent => agent !== undefined);

    if (agents.length === 0) {
      throw new Error('No valid agents found for orchestrator');
    }

    const orchestrator = new Orchestrator(config);
    orchestrator.registerAgents(agents);
    this.orchestrators.set(id, orchestrator);

    if (this.uiServer) {
      this.uiServer.registerOrchestrator(id, orchestrator);
    }

    return orchestrator;
  }

  createMCPServer(id: string, config: MCPServerConfig): MCPServerFramework {
    const server = new MCPServerFramework(config);
    this.mcpServers.set(id, server);

    if (this.uiServer) {
      this.uiServer.registerMCPServer(id, server);
    }

    return server;
  }

  startUI(config?: UIConfig): UIServer {
    if (this.uiServer) {
      return this.uiServer;
    }

    this.uiServer = new UIServer(config, this);
    
    // Register all existing agents, orchestrators, and servers
    this.agents.forEach(agent => {
      this.uiServer!.registerAgent(agent);
    });

    this.orchestrators.forEach((orchestrator, id) => {
      this.uiServer!.registerOrchestrator(id, orchestrator);
    });

    this.mcpServers.forEach((server, id) => {
      this.uiServer!.registerMCPServer(id, server);
    });

    return this.uiServer;
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getOrchestrators(): Orchestrator[] {
    return Array.from(this.orchestrators.values());
  }

  getMCPServers(): MCPServerFramework[] {
    return Array.from(this.mcpServers.values());
  }

  /**
   * Get or create governance service
   */
  getGovernance(): GovernanceService | undefined {
    return this.governance;
  }

  /**
   * Set default governance configuration
   */
  setGovernance(config: GovernanceConfig): void {
    this.defaultGovernanceConfig = config;
    this.governance = new GovernanceService(config);
  }
}

