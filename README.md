# MCP Agents Groq Framework

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)

A comprehensive Node.js framework for creating AI MCP (Model Context Protocol) servers, managing agents, orchestrating workflows, and providing a web-based UI for workflow generation. Built with Groq for fast LLM inference.

[Features](#features) • [Installation](#installation) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Examples](#examples)

</div>

---

## Features

- 🤖 **AI Agents**: Create customizable agents powered by Groq's fast LLM inference
- 🔌 **MCP Servers**: Build MCP-compliant servers with tools and resources
- 🎯 **Orchestration**: Coordinate multiple agents with sequential, parallel, or custom workflows
- 🎨 **Web UI**: Visual workflow builder with modern Tailwind CSS interface
- 🛡️ **Governance & Guardrails**: Input validation, output filtering, rate limiting, content moderation, and safety checks
- 💾 **Persistence**: Save and load configurations automatically
- 🔧 **Fully Customizable**: Extensible framework for your specific needs
- 🌐 **HTTP Access**: Access MCP servers over HTTP REST API

## Installation

```bash
npm install mcp-agents-groq
```

Or using yarn:

```bash
yarn add mcp-agents-groq
```

## Prerequisites

- Node.js 18.0.0 or higher
- A Groq API key ([Get one here](https://console.groq.com/))

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Set up environment variables:**

Create a `.env` file in the root directory:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

3. **Build the project:**

```bash
npm run build
```

## Quick Start

### Basic Example

```typescript
import dotenv from 'dotenv';
import { MCPAgentsFramework } from 'mcp-agents-groq';

dotenv.config();

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create an agent
const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  systemPrompt: 'You are a helpful assistant.',
  model: 'llama-3.3-70b-versatile',
});

// Process a message
const response = await agent.process('What is artificial intelligence?');
console.log(response.content);
```

### Starting the UI Server

```typescript
const uiServer = framework.startUI({ port: 3001 });
await uiServer.start();

console.log('UI available at http://localhost:3001');
```

Visit `http://localhost:3001` to use the visual workflow builder.

### Creating a Workflow

```typescript
// Create multiple agents
const agent1 = framework.createAgent({
  id: 'researcher',
  name: 'Research Agent',
  systemPrompt: 'You are a research assistant.',
});

const agent2 = framework.createAgent({
  id: 'writer',
  name: 'Writing Agent',
  systemPrompt: 'You are a professional writer.',
});

// Create an orchestrator
const orchestrator = framework.createOrchestrator('my-workflow', {
  strategy: 'sequential',
  agents: ['researcher', 'writer'],
});

// Execute the workflow
const result = await orchestrator.execute('Research and write about quantum computing');
console.log(result);
```

## Documentation

### Core Concepts

#### Agents

Agents are AI-powered assistants that can process messages and use tools. Each agent has:

- **ID**: Unique identifier
- **Name**: Display name
- **System Prompt**: Instructions for the agent's behavior
- **Model**: Groq model to use (default: `llama-3.3-70b-versatile`)
- **Tools**: Functions the agent can call
- **Configuration**: Temperature, max tokens, etc.

#### MCP Servers

MCP (Model Context Protocol) servers expose agents and workflows as tools and resources that can be accessed by MCP clients.

#### Orchestrators

Orchestrators coordinate multiple agents using different strategies:

- **Sequential**: Agents execute one after another
- **Parallel**: All agents execute simultaneously
- **Workflow**: Custom workflow with conditions and branching

### API Reference

#### Framework

```typescript
class MCPAgentsFramework {
  constructor(apiKey: string, config?: FrameworkConfig);
  createAgent(config: AgentConfig, governance?: GovernanceConfig): Agent;
  createOrchestrator(id: string, config: OrchestrationConfig): Orchestrator;
  createMCPServer(id: string, config: MCPServerConfig): MCPServerFramework;
  startUI(config?: UIConfig): UIServer;
}
```

#### Agent

```typescript
class Agent {
  process(message: string, context?: Record<string, any>): Promise<AgentResponse>;
  clearHistory(): void;
  getId(): string;
  getName(): string;
  getConfig(): AgentConfig;
  getHistory(): Message[];
}
```

#### Orchestrator

```typescript
class Orchestrator {
  execute(input: string, context?: Record<string, any>): Promise<OrchestrationResult>;
  registerAgents(agents: Agent[]): void;
  getAgents(): Agent[];
  getConfig(): OrchestrationConfig;
}
```

## Examples

The framework includes several example files:

### Basic Example

```bash
npm run example
```

Starts the UI server and demonstrates basic agent creation and usage.

### Workflow Example

```bash
npm run example:workflow
```

Demonstrates creating and executing workflows with multiple agents.

### Governance Example

```bash
npm run example:governance
```

Shows how to use governance features like rate limiting, input validation, and content moderation.

### HTTP MCP Server

```bash
npm run http:mcp
```

Demonstrates accessing MCP servers over HTTP.

## Web UI

The framework includes a comprehensive web UI for managing agents, workflows, and MCP servers. The interface is built with modern Tailwind CSS and Alpine.js for a responsive, professional experience.

### Features

#### Agent Management Tab
- **Create Agents**: Build new AI agents with custom system prompts, models, and configurations
- **Edit Agents**: Update agent settings via dropdown interface
- **Delete Agents**: Remove agents from the system
- **Agent Configuration**: Set model (llama-3.3-70b-versatile, groq/compound, groq/compound-mini), temperature, and max tokens
- **View Agent Details**: See agent ID, name, description, and model information

#### MCP Servers Tab
- **Create MCP Servers**: Set up new MCP-compliant servers
- **Assign Agents**: Link agents to MCP servers for tool exposure
- **Assign Workflows**: Connect workflows to MCP servers
- **View Assignments**: See which agents and workflows are assigned to each server
- **Delete Servers**: Remove MCP servers from the system

#### Workflows Tab
- **Visual Workflow Builder**: Drag and drop agents onto the canvas to create workflows
- **Workflow Strategies**: Choose from:
  - **Sequential**: Agents execute one after another
  - **Parallel**: All agents execute simultaneously
  - **Custom Workflow**: Define complex flows with conditions and branching
- **Node Connections**: Connect workflow nodes by clicking output (→) and input (←) connection points
- **Workflow Execution**: Run workflows with custom input and view step-by-step results
- **Save Workflows**: Persist workflows with custom names
- **Clear Canvas**: Reset the workflow builder

#### Configuration Management
- **Save Config**: Persist all agents, MCP servers, and workflows to local storage
- **Load Config**: Restore previously saved configurations

### Accessing the UI

1. **Start the UI server:**
   ```typescript
   const uiServer = framework.startUI({ port: 3001 });
   await uiServer.start();
   ```

2. **Open in browser:**
   Navigate to `http://localhost:3001`

3. **Navigate tabs:**
   - Click **Agents** to manage AI agents
   - Click **MCP Servers** to manage MCP servers
   - Click **Workflows** to build and execute workflows

### Using the Workflow Builder

1. **Add Agents to Workflow:**
   - Drag agents from the left sidebar onto the canvas
   - Or click on an agent to add it to the workflow

2. **Connect Nodes:**
   - Click the **→** (output) connection point on a node
   - Click the **←** (input) connection point on another node
   - A blue arrow line will connect them

3. **Configure Workflow:**
   - Enter a workflow name
   - Select a strategy (Sequential, Parallel, or Custom Workflow)
   - Add optional conditions to nodes

4. **Execute:**
   - Click **Execute** button
   - Enter input when prompted
   - View results below the canvas

5. **Save:**
   - Enter a workflow name
   - Click **Save Workflow** to persist it

## REST API

The UI server exposes a REST API for programmatic access:

### Agents

- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create a new agent
- `PUT /api/agents/:id` - Update an agent
- `DELETE /api/agents/:id` - Delete an agent
- `POST /api/agents/:id/process` - Process a message with an agent
- `POST /api/agents/:id/clear` - Clear agent history

### Orchestrators & Workflows

- `GET /api/orchestrators` - List all orchestrators
- `POST /api/orchestrators` - Create an orchestrator
- `POST /api/orchestrators/:id/execute` - Execute an orchestrator
- `GET /api/workflows` - List all workflows
- `POST /api/workflows` - Create a workflow
- `PUT /api/workflows/:id` - Update a workflow
- `DELETE /api/workflows/:id` - Delete a workflow

### MCP Servers

- `GET /api/mcp-servers` - List all MCP servers
- `POST /api/mcp-servers` - Create an MCP server
- `GET /api/mcp-servers/:id` - Get MCP server details
- `DELETE /api/mcp-servers/:id` - Delete an MCP server
- `POST /api/mcp-servers/:id/assign-agents` - Assign agents to a server
- `POST /api/mcp-servers/:id/assign-workflows` - Assign workflows to a server
- `GET /api/mcp-servers/:id/assigned` - Get assigned agents and workflows

### MCP Server HTTP Access

- `GET /api/mcp-servers/:id/tools` - List all tools for a server
- `POST /api/mcp-servers/:id/tools/call` - Call a tool
- `GET /api/mcp-servers/:id/resources` - List all resources
- `GET /api/mcp-servers/:id/resources/read?uri=<uri>` - Read a resource

### Configuration

- `GET /api/config` - Get current configuration
- `POST /api/config/save` - Save configuration
- `POST /api/config/load` - Load configuration

### Governance

- `GET /api/governance/stats/:agentId` - Get usage statistics for an agent
- `GET /api/governance/config` - Get governance configuration
- `POST /api/governance/config` - Update governance configuration
- `POST /api/governance/reset/:agentId` - Reset usage statistics

## Governance & Guardrails

The framework includes comprehensive governance features:

### Input Validation

- Length limits
- Pattern matching
- Content sanitization

### Output Filtering

- Content moderation
- Keyword blocking
- Length limits

### Rate Limiting

- Per-agent request limits
- Time window configuration
- Automatic throttling

### Usage Tracking

- Request counts
- Token usage
- Daily/hourly limits

### Safety Checks

- Harmful content detection
- Automatic blocking
- Audit logging

See the `examples/governance-example.ts` file in the repository for a complete example.

## Development

### Building

```bash
# Build TypeScript and CSS
npm run build

# Build CSS only
npm run build:css
```

### Development Mode

```bash
# Watch mode with auto-reload
npm run dev
```

### Running Examples

```bash
# Basic example
npm run example

# Workflow example
npm run example:workflow

# Governance example
npm run example:governance

# HTTP MCP server
npm run http:mcp
```

## Project Structure

```
mcp-agents-groq/
├── src/
│   ├── core/
│   │   ├── Agent.ts           # Agent implementation
│   │   ├── GroqClient.ts      # Groq API client
│   │   ├── MCPServer.ts       # MCP server framework
│   │   ├── Orchestrator.ts    # Agent orchestration
│   │   ├── Governance.ts       # Governance & guardrails
│   │   └── Persistence.ts     # Configuration persistence
│   ├── ui/
│   │   └── UIServer.ts        # Web UI server
│   ├── tools/
│   │   ├── index.ts           # Tool exports
│   │   └── search.ts          # Search tool implementations
│   ├── types/
│   │   └── index.ts           # TypeScript type definitions
│   └── index.ts               # Main exports
├── examples/                  # Example files
├── docs/                      # Documentation
├── public/                    # Web UI static files
│   ├── index.html            # Main UI page
│   └── styles.css            # Tailwind CSS source
└── package.json
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'MAG-XXX: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

## Acknowledgments

- Built with [Groq](https://groq.com/) for fast LLM inference
- Uses [Model Context Protocol](https://modelcontextprotocol.io/) for agent communication
- UI built with [Tailwind CSS](https://tailwindcss.com/) and [Alpine.js](https://alpinejs.dev/)

---

<div align="center">

Made with ❤️ for the AI community

</div>
