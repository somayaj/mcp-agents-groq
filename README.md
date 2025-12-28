# MCP Agents Groq Framework

A comprehensive Node.js framework for creating AI MCP (Model Context Protocol) servers, managing agents, orchestrating workflows, and providing a web-based UI for workflow generation. Built with Groq for fast LLM inference.

## Features

- 🤖 **AI Agents**: Create customizable agents powered by Groq
- 🔌 **MCP Servers**: Build MCP-compliant servers with tools and resources
- 🎯 **Orchestration**: Coordinate multiple agents with sequential, parallel, or custom workflows
- 🎨 **Web UI**: Visual workflow builder with Tailwind CSS
- 🛡️ **Governance & Guardrails**: Input validation, output filtering, rate limiting, content moderation, and safety checks
- 🛠️ **Customizable**: Fully extensible framework for your needs

## Installation

```bash
npm install
```

## Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your Groq API key to `.env`:
```
GROQ_API_KEY=your_groq_api_key_here
```

## Quick Start

### Basic Example

```typescript
import { MCPAgentsFramework, createSearchTool } from './src/index.js';
import { z } from 'zod';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create an agent with a search tool
const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  systemPrompt: 'You are a helpful assistant.',
  tools: [
    createSearchTool(), // Use the built-in search tool
    {
      name: 'calculate',
      description: 'Perform calculations',
      parameters: z.object({
        expression: z.string(),
      }),
      handler: async (params) => {
        return eval(params.expression);
      },
    },
  ],
});

// Process a message
const response = await agent.process('What is 2 + 2?');
console.log(response.content);
```

### Starting the UI Server

```typescript
const uiServer = framework.startUI({ port: 3001 });
await uiServer.start();
```

Then visit `http://localhost:3001` to use the workflow builder.

### Creating an Orchestrator

```typescript
const orchestrator = framework.createOrchestrator('my-orchestrator', {
  strategy: 'sequential',
  agents: ['agent-1', 'agent-2'],
});

const result = await orchestrator.execute('Process this task');
```

### Creating an MCP Server

```typescript
import { z } from 'zod';

const mcpServer = framework.createMCPServer('my-server', {
  name: 'My MCP Server',
  version: '1.0.0',
  tools: [
    {
      name: 'greet',
      description: 'Greet someone',
      inputSchema: z.object({
        name: z.string(),
      }),
      handler: async (params) => {
        return `Hello, ${params.name}!`;
      },
    },
  ],
});

await mcpServer.start();
```

### Accessing MCP Servers Over HTTP

MCP servers created via the UI can be accessed over HTTP using REST endpoints:

```bash
# List all tools for a server
curl http://localhost:3001/api/mcp-servers/my-server/tools

# Call a tool (e.g., an agent tool)
curl -X POST http://localhost:3001/api/mcp-servers/my-server/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"agent_agent-1","arguments":{"message":"Hello"}}'

# List resources
curl http://localhost:3001/api/mcp-servers/my-server/resources

# Read a resource
curl "http://localhost:3001/api/mcp-servers/my-server/resources/read?uri=mcp://agents/list"
```

**Available HTTP Endpoints:**
- `GET /api/mcp-servers/:id/tools` - List all tools for a server
- `POST /api/mcp-servers/:id/tools/call` - Call a tool
- `GET /api/mcp-servers/:id/resources` - List all resources
- `GET /api/mcp-servers/:id/resources/read?uri=<uri>` - Read a resource

**See [Invoking MCP Server Guide](docs/INVOKING_MCP_SERVER.md) for detailed examples and usage.**

## Running Examples

```bash
npm run example
```

This will start the basic example with the UI server running on port 3001.

### Using Built-in Tools

The framework includes pre-built tools that you can use:

```typescript
import { MCPAgentsFramework, createSearchTool, wikipediaSearch, duckDuckGoSearch } from './src/index.js';

const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create agent with default search tool (simulated)
const agent1 = framework.createAgent({
  id: 'agent-1',
  name: 'Research Agent',
  tools: [createSearchTool()],
});

// Create agent with Wikipedia search
const agent2 = framework.createAgent({
  id: 'agent-2',
  name: 'Wikipedia Agent',
  tools: [createSearchTool({ searchFunction: wikipediaSearch })],
});

// Create agent with DuckDuckGo search
const agent3 = framework.createAgent({
  id: 'agent-3',
  name: 'DuckDuckGo Agent',
  tools: [createSearchTool({ searchFunction: duckDuckGoSearch })],
});

// Create agent with custom search
const agent4 = framework.createAgent({
  id: 'agent-4',
  name: 'Custom Search Agent',
  tools: [
    createSearchTool({
      searchFunction: async (query: string) => {
        // Your custom search implementation
        return `Custom results for: ${query}`;
      },
    }),
  ],
});
```

See `examples/search-tool-example.ts` for a complete example.

## Workflow Builder UI

The web UI provides:

- **Agent Management**: View and manage all registered agents
- **Visual Workflow Builder**: Drag and drop agents to create workflows
- **Workflow Strategies**: Choose between sequential, parallel, or custom workflows
- **Execution**: Run workflows and view results
- **Save/Load**: Save workflows to browser storage

### Workflow Strategies

1. **Sequential**: Agents execute one after another, passing results forward
2. **Parallel**: All agents execute simultaneously
3. **Custom Workflow**: Define complex workflows with conditions and branching

## API Endpoints

The UI server exposes the following REST API:

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents/:id/process` - Process a message with an agent
- `POST /api/agents/:id/clear` - Clear agent history

### Orchestrators
- `GET /api/orchestrators` - List orchestrators
- `POST /api/orchestrators` - Create an orchestrator
- `POST /api/orchestrators/:id/execute` - Execute an orchestrator

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

## Architecture

```
src/
├── core/
│   ├── GroqClient.ts      # Groq API client wrapper
│   ├── MCPServer.ts       # MCP server framework
│   ├── Agent.ts           # Agent implementation
│   └── Orchestrator.ts    # Agent orchestration
├── ui/
│   └── UIServer.ts        # Web UI server
├── types/
│   └── index.ts           # TypeScript types
└── index.ts               # Main exports
```

## Customization

### Custom Agent Tools

```typescript
const agent = framework.createAgent({
  id: 'custom-agent',
  name: 'Custom Agent',
  tools: [
    {
      name: 'my-tool',
      description: 'My custom tool',
      parameters: z.object({
        param1: z.string(),
        param2: z.number(),
      }),
      handler: async (params, context) => {
        // Your custom logic
        return 'Result';
      },
    },
  ],
});
```

### Custom MCP Server Handlers

```typescript
const mcpServer = framework.createMCPServer('custom-server', {
  name: 'Custom Server',
  handlers: {
    onRequest: async (request) => {
      // Custom request handling
      return { /* response */ };
    },
    onNotification: async (notification) => {
      // Custom notification handling
    },
  },
});
```

### Custom UI Routes

```typescript
const uiServer = framework.startUI({
  port: 3001,
  customRoutes: [
    {
      path: '/custom',
      handler: (req, res) => {
        res.json({ message: 'Custom route' });
      },
    },
  ],
});
```

## Governance & Guardrails

The framework includes comprehensive governance features to ensure safe and controlled agent operations:

### Features

- **Input Validation**: Length limits, pattern matching, sanitization
- **Output Filtering**: Content moderation, keyword blocking, length limits
- **Rate Limiting**: Per-agent request limits with time windows
- **Usage Tracking**: Request counts, token usage, daily/hourly limits
- **Safety Checks**: Harmful content detection and blocking
- **Audit Logging**: Complete audit trail of all operations

### Basic Usage

```typescript
import { MCPAgentsFramework, GovernanceConfig } from './src/index.js';

const governanceConfig: GovernanceConfig = {
  // Input validation
  maxInputLength: 5000,
  blockedPatterns: [/<script/i, /javascript:/i],

  // Output filtering
  maxOutputLength: 20000,
  contentModeration: true,
  blockedKeywords: ['hack', 'exploit', 'malware'],

  // Rate limiting
  rateLimit: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
  },

  // Usage tracking
  maxTokensPerRequest: 10000,
  maxRequestsPerDay: 100,
  maxRequestsPerHour: 20,

  // Safety checks
  enableSafetyChecks: true,
  blockHarmfulContent: true,

  // Audit logging
  enableAuditLog: true,
  auditLogPath: './audit.log',
};

// Initialize framework with governance
const framework = new MCPAgentsFramework(apiKey, {
  governance: governanceConfig,
});

// Create agent (inherits framework governance)
const agent = framework.createAgent({
  id: 'governed-agent',
  name: 'Governed Agent',
  systemPrompt: 'You are a helpful assistant.',
});

// Or create agent with custom governance
const customAgent = framework.createAgent(
  {
    id: 'custom-governed-agent',
    name: 'Custom Governed Agent',
  },
  {
    maxInputLength: 10000, // Custom limit
    rateLimit: { maxRequests: 20, windowMs: 60000 },
  }
);
```

### Governance API Endpoints

The UI server exposes governance endpoints:

```bash
# Get usage statistics for an agent
GET /api/governance/stats/:agentId

# Get current governance configuration
GET /api/governance/config

# Update governance configuration
POST /api/governance/config
Content-Type: application/json
{
  "maxInputLength": 5000,
  "rateLimit": { "maxRequests": 10, "windowMs": 60000 }
}

# Reset usage statistics for an agent
POST /api/governance/reset/:agentId
```

### Example

See `examples/governance-example.ts` for a complete example demonstrating:
- Input validation
- Rate limiting
- Content moderation
- Usage statistics
- Audit logging

Run it with:
```bash
npm run example:governance
```

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Start production build
npm start

# Run governance example
tsx examples/governance-example.ts
```

## License

MIT

