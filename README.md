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

## Quick Start

### Complete Application Example

Here's a complete example of building an application with `mcp-agents-groq`:

```typescript
import dotenv from 'dotenv';
import { MCPAgentsFramework } from 'mcp-agents-groq';

// Load environment variables
dotenv.config();

// Initialize the framework with your Groq API key
const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

async function main() {
  // 1. Create specialized agents
  const researcher = framework.createAgent({
    id: 'researcher',
    name: 'Research Agent',
    systemPrompt: 'You are an expert researcher. Analyze topics thoroughly and provide detailed information.',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 2000,
  });

  const writer = framework.createAgent({
    id: 'writer',
    name: 'Writing Agent',
    systemPrompt: 'You are a professional writer. Create clear, engaging content based on research.',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.8,
  });

  const editor = framework.createAgent({
    id: 'editor',
    name: 'Editor Agent',
    systemPrompt: 'You are an editor. Review and improve written content for clarity and style.',
    model: 'llama-3.3-70b-versatile',
  });

  // 2. Create a sequential workflow
  const workflow = framework.createOrchestrator('content-pipeline', {
    strategy: 'sequential',
    agents: ['researcher', 'writer', 'editor'],
  });

  // 3. Execute the workflow
  console.log('Executing content pipeline...');
  const result = await workflow.execute(
    'Create a comprehensive article about artificial intelligence in healthcare'
  );

  console.log('Final result:', result.result);
  console.log('Steps completed:', result.steps.length);

  // 4. Start the Web UI for visual workflow management
  const uiServer = framework.startUI({ port: 3001 });
  await uiServer.start();
  console.log('Web UI available at http://localhost:3001');
  
  // The UI allows you to:
  // - Create and manage agents visually
  // - Build workflows with drag-and-drop
  // - Execute workflows and view results
  // - Manage MCP servers
}

main().catch(console.error);
```

### Simple Agent Usage

```typescript
import { MCPAgentsFramework } from 'mcp-agents-groq';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create a single agent
const agent = framework.createAgent({
  id: 'assistant',
  name: 'AI Assistant',
  systemPrompt: 'You are a helpful AI assistant.',
  model: 'llama-3.3-70b-versatile',
});

// Process messages
const response = await agent.process('What is machine learning?');
console.log(response.content);

// Continue conversation
const followUp = await agent.process('Can you explain neural networks?');
console.log(followUp.content);
```

### Agent with Search Tool (Real-Time Financial Data)

Agents can access real-time financial data using the built-in search tool:

```typescript
import { MCPAgentsFramework, createSearchTool } from 'mcp-agents-groq';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create an agent with search capability
const financialAnalyst = framework.createAgent({
  id: 'analyst',
  name: 'Financial Analyst',
  systemPrompt: 'You are a financial analyst. Use the search tool to get real-time market data.',
  model: 'llama-3.3-70b-versatile',
  tools: [
    createSearchTool(), // Real-time data from Yahoo Finance
  ],
});

// Process financial queries - tool usage is automatically enforced
const response = await financialAnalyst.process('What is the current stock price of Apple (AAPL)?');

// The agent will automatically:
// 1. Detect this is a financial query
// 2. Call the search tool to fetch real-time data from Yahoo Finance
// 3. Use ONLY the real data returned - no hypothetical data
// 4. If data cannot be fetched, return an error instead of generating fake data
console.log(response.content);
```

**Key Features:**
- **Automatic Tool Enforcement**: Financial queries automatically trigger the search tool
- **Real-Time Data**: Fetches current market data from Yahoo Finance API
- **No Hypothetical Data**: Agents will error out if real data cannot be fetched, preventing inaccurate responses
- **Smart Ticker Detection**: Automatically detects stock tickers, company names, and commodities
- **Supported Assets**: Stocks, commodities (gold, silver, oil), cryptocurrencies, and more

**Supported Query Types:**
- Stock prices: "AAPL stock price", "Apple stock analysis"
- Commodities: "Silver price", "Gold futures", "Oil prices"
- Cryptocurrencies: "Bitcoin price", "BTC-USD"
- Market analysis: "Netflix stock analysis for 2025"

### Agent with Graph/Chart Visualization

Agents can create graphs and charts from data using the built-in graph tool:

```typescript
import { MCPAgentsFramework, createGraphTool } from 'mcp-agents-groq';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create an agent with graph visualization capability
const dataAnalyst = framework.createAgent({
  id: 'analyst',
  name: 'Data Analyst',
  systemPrompt: 'You are a data analyst. When you receive data, create visualizations using the create_graph tool.',
  model: 'llama-3.3-70b-versatile',
  tools: [
    createGraphTool({
      outputFormat: 'html', // Options: 'html', 'svg', 'base64', 'url'
      chartLibrary: 'chartjs', // Options: 'chartjs', 'd3', 'plotly'
    }),
  ],
});

// Process data and create a chart
const response = await dataAnalyst.process(
  'Create a bar chart for this sales data: Q1: 45000, Q2: 52000, Q3: 48000, Q4: 61000'
);

// The agent will use the graph tool and return chart HTML
console.log(response.content);
// Response includes chart HTML that can be saved or displayed in a browser
```

**Supported Chart Types:**
- `line` - Line charts
- `bar` - Bar charts
- `pie` - Pie charts
- `scatter` - Scatter plots
- `area` - Area charts
- `histogram` - Histograms

**Output Formats:**
- `html` - Interactive HTML with Chart.js (default)
- `svg` - Scalable Vector Graphics
- `base64` - Base64 encoded image (requires additional setup)
- `url` - URL to stored chart (requires storage configuration)

### Starting the Web UI

The Web UI provides a visual interface for managing your agents and workflows:

```typescript
import { MCPAgentsFramework } from 'mcp-agents-groq';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Start the UI server
const uiServer = framework.startUI({ 
  port: 3001,
  // Optional: enable persistence
  persistence: {
    enabled: true,
    filePath: './config.json'
  }
});

await uiServer.start();
console.log('Web UI available at http://localhost:3001');
```

Visit `http://localhost:3001` to:
- Create and configure agents
- Build workflows visually
- Execute workflows and view results
- Manage MCP servers
- Save and load configurations

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

## Real-World Use Cases

### Content Generation Pipeline

Create a multi-agent system for content creation:

```typescript
const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Research agent
const researcher = framework.createAgent({
  id: 'researcher',
  systemPrompt: 'Research topics and gather information',
});

// Writer agent
const writer = framework.createAgent({
  id: 'writer',
  systemPrompt: 'Write engaging content based on research',
});

// SEO agent
const seoAgent = framework.createAgent({
  id: 'seo',
  systemPrompt: 'Optimize content for search engines',
});

// Create workflow
const contentPipeline = framework.createOrchestrator('content', {
  strategy: 'sequential',
  agents: ['researcher', 'writer', 'seo'],
});

// Generate content
const article = await contentPipeline.execute('Write about sustainable energy');
```

### Customer Support System

Build a customer support system with multiple specialized agents:

```typescript
const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create specialized support agents
const technical = framework.createAgent({
  id: 'technical',
  systemPrompt: 'Help with technical issues',
});

const billing = framework.createAgent({
  id: 'billing',
  systemPrompt: 'Assist with billing questions',
});

const general = framework.createAgent({
  id: 'general',
  systemPrompt: 'Handle general inquiries',
});

// Create MCP server to expose agents as tools
const supportServer = framework.createMCPServer('support', {
  name: 'Customer Support Server',
  assignedAgents: ['technical', 'billing', 'general'],
});

// Agents are now accessible via MCP protocol
```

### Data Analysis Workflow

Create a parallel processing workflow for data analysis:

```typescript
const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create analysis agents
const dataAnalyst = framework.createAgent({
  id: 'analyst',
  systemPrompt: 'Analyze data and extract insights',
});

const visualizer = framework.createAgent({
  id: 'visualizer',
  systemPrompt: 'Create data visualizations',
});

const reporter = framework.createAgent({
  id: 'reporter',
  systemPrompt: 'Generate reports from analysis',
});

// Parallel workflow
const analysis = framework.createOrchestrator('analysis', {
  strategy: 'parallel',
  agents: ['analyst', 'visualizer', 'reporter'],
});

// Process data in parallel
const results = await analysis.execute('Analyze sales data for Q4');
```

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

If you're contributing to the `mcp-agents-groq` package itself, you can clone the repository and run the examples:

```bash
# Clone the repository
git clone https://github.com/somayaj/mcp-agents-groq.git
cd mcp-agents-groq

# Install dependencies
npm install

# Build the project
npm run build

# Run examples (only available in the repository)
npm run example              # Basic agent example
npm run example:workflow     # Workflow orchestration example
npm run example:governance   # Governance features example
npm run http:mcp             # HTTP MCP server example
```

For end users who installed the package via npm, see the [Quick Start](#quick-start) section above for usage examples.

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
│   │   ├── search.ts           # Search tool (real-time financial data)
│   │   └── graph.ts            # Graph/chart visualization tool
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

## How is this different from LangChain?

`mcp-agents-groq` and LangChain serve different purposes and use cases:

### Core Philosophy

**mcp-agents-groq:**
- **Specialized framework** for MCP (Model Context Protocol) servers
- **Groq-optimized** for fast inference
- **Opinionated** with built-in patterns and UI
- Focuses on **agent orchestration** and **workflow management**

**LangChain:**
- **General-purpose** LLM framework
- **Multi-provider** support (OpenAI, Anthropic, Google, etc.)
- **Modular and composable** building blocks
- Broader ecosystem with many integrations

### Key Differences

| Feature | mcp-agents-groq | LangChain |
|---------|------------------|-----------|
| **Focus** | MCP servers, Groq, workflows | General LLM framework |
| **Complexity** | Lower - opinionated patterns | Higher - more flexible |
| **Built-in UI** | ✅ Visual workflow builder | ❌ No built-in UI |
| **MCP Support** | ✅ Native MCP server framework | ❌ No MCP support |
| **LLM Providers** | Groq only (optimized for speed) | 50+ providers |
| **Orchestration** | Built-in (sequential, parallel, custom) | You build it |
| **Governance** | ✅ Built-in (rate limiting, moderation) | External tools needed |
| **Persistence** | ✅ Built-in config save/load | External tools needed |
| **Best For** | MCP servers, fast prototyping, visual workflows | Complex, multi-provider apps |

### When to Use mcp-agents-groq

✅ **Choose mcp-agents-groq if you:**
- Need to build MCP-compliant servers
- Want fast inference with Groq
- Prefer visual workflow management
- Need built-in governance and guardrails
- Want to quickly prototype multi-agent systems
- Need a ready-made web UI

### When to Use LangChain

✅ **Choose LangChain if you:**
- Need support for multiple LLM providers
- Want maximum flexibility and control
- Need to integrate with many external tools/services
- Are building complex, custom agent architectures
- Need fine-grained control over agent behavior
- Are doing research and experimentation

### Code Comparison

**mcp-agents-groq (simpler, opinionated):**
```typescript
// Create agents and workflow in ~10 lines
const framework = new MCPAgentsFramework(apiKey);
const researcher = framework.createAgent({
  id: 'researcher',
  systemPrompt: 'You are a research assistant.'
});
const writer = framework.createAgent({
  id: 'writer',
  systemPrompt: 'You are a professional writer.'
});
const workflow = framework.createOrchestrator('pipeline', {
  strategy: 'sequential',
  agents: ['researcher', 'writer']
});
const result = await workflow.execute('Write about AI');
```

**LangChain (more flexible, more setup):**
```typescript
// Requires more setup, more control
const tools = [searchTool, calculatorTool];
const agent = createOpenAIFunctionsAgent({
  llm,
  tools,
  prompt: ChatPromptTemplate.fromMessages([...])
});
const executor = new AgentExecutor({ agent, tools });
const result = await executor.invoke({ input: 'Write about AI' });
```

### Summary

`mcp-agents-groq` is a **specialized framework** for building MCP servers and Groq-optimized workflows with a built-in visual UI. It's designed for speed, simplicity, and MCP compliance.

LangChain is a **general-purpose framework** with broad provider support and maximum flexibility. It's designed for complex, multi-provider applications where you need fine-grained control.

**They can complement each other** - use `mcp-agents-groq` for MCP servers and visual workflows, and LangChain for complex multi-provider applications.

## Acknowledgments

- Built with [Groq](https://groq.com/) for fast LLM inference
- Uses [Model Context Protocol](https://modelcontextprotocol.io/) for agent communication
- UI built with [Tailwind CSS](https://tailwindcss.com/) and [Alpine.js](https://alpinejs.dev/)

---
