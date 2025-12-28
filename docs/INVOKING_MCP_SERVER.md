# How to Invoke MCP Server

This guide explains how to invoke/call tools on your MCP server via HTTP.

## Overview

Once you've created an MCP server via the UI and assigned agents/workflows, you can invoke it using HTTP endpoints. The server exposes tools that can be called programmatically.

## Step-by-Step Guide

### 1. Create and Setup MCP Server

1. Start the UI server: `npm run example`
2. Open `http://localhost:3001`
3. Create agents in the "Agents" tab
4. Create workflows in the "Workflows" tab (optional)
5. Go to "MCP Servers" tab
6. Create an MCP server (e.g., `server-1`)
7. Click "Assign" and select agents/workflows to assign

### 2. List Available Tools

First, see what tools are available on your server:

```bash
curl http://localhost:3001/api/mcp-servers/server-1/tools
```

**Response:**
```json
{
  "tools": [
    {
      "name": "agent_agent-1",
      "description": "Execute agent: Research Agent. An agent that helps with research tasks",
      "inputSchema": {
        "type": "object",
        "properties": {
          "message": {
            "type": "string"
          }
        },
        "required": ["message"]
      }
    },
    {
      "name": "workflow_workflow-1",
      "description": "Execute workflow: workflow-1",
      "inputSchema": {
        "type": "object",
        "properties": {
          "input": {
            "type": "string"
          },
          "context": {
            "type": "object"
          }
        },
        "required": ["input"]
      }
    }
  ]
}
```

### 3. Call a Tool

#### Call an Agent Tool

Agent tools are named `agent_<agent-id>`. They accept a `message` parameter.

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent_agent-1",
    "arguments": {
      "message": "What is artificial intelligence?"
    }
  }'
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"content\":\"Artificial intelligence (AI) is...\",\"metadata\":{}}"
    }
  ]
}
```

#### Call a Workflow Tool

Workflow tools are named `workflow_<workflow-id>`. They accept `input` and optional `context`.

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_workflow-1",
    "arguments": {
      "input": "Explain what AI is",
      "context": {}
    }
  }'
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"result\":\"...\",\"steps\":[...]}"
    }
  ]
}
```

### 4. Access Resources

#### List Resources

```bash
curl http://localhost:3001/api/mcp-servers/server-1/resources
```

**Response:**
```json
{
  "resources": [
    {
      "uri": "mcp://agents/list",
      "name": "Available Agents",
      "description": "List of all agents assigned to this MCP server",
      "mimeType": "application/json"
    },
    {
      "uri": "mcp://workflows/list",
      "name": "Available Workflows",
      "description": "List of all workflows assigned to this MCP server",
      "mimeType": "application/json"
    }
  ]
}
```

#### Read a Resource

```bash
# Read agents list
curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://agents/list"

# Read workflows list
curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://workflows/list"
```

**Response:**
```json
{
  "contents": [
    {
      "uri": "mcp://agents/list",
      "mimeType": "application/json",
      "text": "[{\"id\":\"agent-1\",\"name\":\"Research Agent\",\"description\":\"...\"}]"
    }
  ]
}
```

## Using with Different Languages

### JavaScript/TypeScript

```javascript
async function callMCPTool(serverId, toolName, args) {
  const response = await fetch(`http://localhost:3001/api/mcp-servers/${serverId}/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: toolName,
      arguments: args,
    }),
  });
  return await response.json();
}

// Call an agent
const result = await callMCPTool('server-1', 'agent_agent-1', {
  message: 'What is AI?',
});

console.log(result.content[0].text);
```

### Python

```python
import requests

def call_mcp_tool(server_id, tool_name, args):
    url = f"http://localhost:3001/api/mcp-servers/{server_id}/tools/call"
    response = requests.post(url, json={
        "name": tool_name,
        "arguments": args,
    })
    return response.json()

# Call an agent
result = call_mcp_tool('server-1', 'agent_agent-1', {
    'message': 'What is AI?'
})

print(result['content'][0]['text'])
```

### cURL Examples

```bash
# List all tools
curl http://localhost:3001/api/mcp-servers/server-1/tools

# Call agent tool
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"agent_agent-1","arguments":{"message":"Hello"}}'

# Call workflow tool
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"workflow_workflow-1","arguments":{"input":"Process this"}}'

# List resources
curl http://localhost:3001/api/mcp-servers/server-1/resources

# Read resource
curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://agents/list"
```

## Tool Naming Convention

- **Agent Tools**: `agent_<agent-id>`
  - Example: `agent_agent-1`, `agent_research-agent`
  - Parameters: `{ "message": "string" }`

- **Workflow Tools**: `workflow_<workflow-id>`
  - Example: `workflow_workflow-1`, `workflow_my-workflow`
  - Parameters: `{ "input": "string", "context": {} }`

- **Custom Tools**: Defined when creating the MCP server
  - Example: `greet`, `calculate`
  - Parameters: Defined by the tool's `inputSchema`

## Error Handling

If a tool call fails, you'll receive an error response:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Tool agent_agent-1 not found"
    }
  ],
  "isError": true
}
```

Common errors:
- `404`: MCP Server not found
- `400`: Missing required parameters
- `500`: Server error or tool execution error

## Complete Example Workflow

```bash
# 1. List available tools
curl http://localhost:3001/api/mcp-servers/server-1/tools

# 2. Call an agent tool
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent_agent-1",
    "arguments": {
      "message": "What is machine learning?"
    }
  }'

# 3. Check assigned agents
curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://agents/list"

# 4. Call a workflow
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_workflow-1",
    "arguments": {
      "input": "Explain machine learning",
      "context": {}
    }
  }'
```

## Tips

1. **Always list tools first** to see what's available
2. **Use the exact tool name** as shown in the tools list
3. **Check assigned agents/workflows** using resources before calling
4. **Handle errors gracefully** - check for `isError` in responses
5. **Agent calls may take time** - be patient for LLM responses

## See Also

- [HTTP MCP Server Guide](./HTTP_MCP_SERVER.md)
- [README](../README.md)
- [Workflow Guide](./WORKFLOW_GUIDE.md)

