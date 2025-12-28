# HTTP MCP Server Guide

This guide explains how to create and use an MCP server accessible over HTTP instead of stdio.

## Overview

By default, MCP servers use stdio transport (standard input/output), which is ideal for local CLI tools. However, for web applications or remote access, you may want to expose your MCP server over HTTP.

## Quick Start

### 1. Run the HTTP MCP Server Example

```bash
npm run http:mcp
```

This starts an HTTP server on port 3002 (or the port specified in `MCP_HTTP_PORT` environment variable).

### 2. Test the Server

```bash
# Health check
curl http://localhost:3002/health

# List all tools
curl http://localhost:3002/mcp/tools

# Call a tool
curl -X POST http://localhost:3002/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"greet","arguments":{"name":"Alice"}}'

# List resources
curl http://localhost:3002/mcp/resources

# Read a resource
curl "http://localhost:3002/mcp/resources/read?uri=mcp://agents/list"
```

## Creating Your Own HTTP MCP Server

### Basic Example

```typescript
import express from 'express';
import { MCPAgentsFramework } from './src/index.js';
import { z } from 'zod';

const app = express();
app.use(express.json());

// Initialize framework
const framework = new MCPAgentsFramework(process.env.GROQ_API_KEY!);

// Create agents
const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  systemPrompt: 'You are a helpful assistant.',
});

// Create MCP server
const mcpServer = framework.createMCPServer('my-server', {
  name: 'My HTTP MCP Server',
  version: '1.0.0',
  tools: [
    {
      name: 'my-tool',
      description: 'A custom tool',
      inputSchema: z.object({
        input: z.string(),
      }),
      handler: async (params) => {
        return `Processed: ${params.input}`;
      },
    },
  ],
});

// Assign agent
mcpServer.assignAgent(agent);

// Expose MCP endpoints
app.get('/mcp/tools', async (req, res) => {
  const server = mcpServer.getServer();
  const serverInternal = server as any;
  const handler = serverInternal._requestHandlers?.get('tools/list');
  
  if (handler) {
    const response = await handler({ params: {} });
    res.json(response);
  }
});

app.post('/mcp/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body;
  const server = mcpServer.getServer();
  const serverInternal = server as any;
  const handler = serverInternal._requestHandlers?.get('tools/call');
  
  if (handler) {
    const response = await handler({
      params: { name, arguments: args || {} },
    });
    res.json(response);
  }
});

app.listen(3002, () => {
  console.log('HTTP MCP Server running on http://localhost:3002');
});
```

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "MCP HTTP Server"
}
```

### GET /mcp/tools
List all available tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "greet",
      "description": "Greet someone",
      "inputSchema": { ... }
    }
  ]
}
```

### POST /mcp/tools/call
Call a tool.

**Request Body:**
```json
{
  "name": "greet",
  "arguments": {
    "name": "Alice"
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Hello, Alice!"
    }
  ]
}
```

### GET /mcp/resources
List all available resources.

**Response:**
```json
{
  "resources": [
    {
      "uri": "mcp://agents/list",
      "name": "Available Agents",
      "description": "List of all agents",
      "mimeType": "application/json"
    }
  ]
}
```

### GET /mcp/resources/read?uri=<uri>
Read a resource.

**Query Parameters:**
- `uri` (required): The resource URI

**Response:**
```json
{
  "contents": [
    {
      "uri": "mcp://agents/list",
      "mimeType": "application/json",
      "text": "[{\"id\":\"agent-1\",\"name\":\"My Agent\"}]"
    }
  ]
}
```

## Using with MCP Clients

### Claude Desktop

To use with Claude Desktop, you'll need to configure it to connect via HTTP. This typically requires:

1. A custom transport adapter
2. Or using a proxy that converts HTTP to stdio

### Custom HTTP Client

You can create a custom HTTP client to interact with the server:

```typescript
class MCPHTTPClient {
  constructor(private baseUrl: string) {}

  async listTools() {
    const response = await fetch(`${this.baseUrl}/mcp/tools`);
    return response.json();
  }

  async callTool(name: string, args: any) {
    const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    });
    return response.json();
  }

  async listResources() {
    const response = await fetch(`${this.baseUrl}/mcp/resources`);
    return response.json();
  }

  async readResource(uri: string) {
    const response = await fetch(`${this.baseUrl}/mcp/resources/read?uri=${encodeURIComponent(uri)}`);
    return response.json();
  }
}

// Usage
const client = new MCPHTTPClient('http://localhost:3002');
const tools = await client.listTools();
const result = await client.callTool('greet', { name: 'Alice' });
```

## Security Considerations

When exposing an MCP server over HTTP:

1. **Authentication**: Add authentication middleware
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **CORS**: Configure CORS appropriately for your use case
4. **HTTPS**: Use HTTPS in production
5. **Input Validation**: Validate all inputs before processing

### Example with Authentication

```typescript
import express from 'express';

const app = express();

// Simple API key authentication
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ... rest of your MCP endpoints
```

## Environment Variables

- `GROQ_API_KEY`: Your Groq API key (required)
- `MCP_HTTP_PORT`: Port for HTTP server (default: 3002)

## See Also

- [Basic Example](../examples/basic.ts)
- [HTTP MCP Server Example](../examples/http-mcp-server.ts)
- [Test MCP Client](../examples/test-mcp-client.ts)

