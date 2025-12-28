# How to Run MCP Workflows

This guide explains how to execute workflows via the MCP server over HTTP.

## Overview

When you assign a workflow to an MCP server, it becomes available as a tool named `workflow_<workflow-id>`. You can invoke it just like any other MCP tool.

## Step-by-Step Guide

### 1. Setup Workflow and MCP Server

1. **Create Agents** (in UI → Agents tab)
   - Create the agents you want in your workflow

2. **Create Workflow** (in UI → Workflows tab)
   - Drag agents onto the canvas
   - Connect them (click → on output, then ← on input)
   - Select strategy (Sequential, Parallel, or Custom Workflow)
   - Click "Save Workflow" (optional - saves to browser storage)

3. **Create MCP Server** (in UI → MCP Servers tab)
   - Fill in Server ID, Name, Version, Description
   - Click "Create MCP Server"

4. **Assign Workflow to MCP Server**
   - Click "Assign" button on your MCP server
   - Select the workflow(s) you want to assign
   - Click "Assign"

### 2. List Available Tools

Check what workflow tools are available:

```bash
curl http://localhost:3001/api/mcp-servers/server-1/tools
```

Look for tools with names starting with `workflow_`:

```json
{
  "tools": [
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

### 3. Run the Workflow

#### Basic Workflow Execution

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_workflow-1",
    "arguments": {
      "input": "Explain what artificial intelligence is",
      "context": {}
    }
  }'
```

#### With Context

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_workflow-1",
    "arguments": {
      "input": "Research and write about AI",
      "context": {
        "topic": "artificial intelligence",
        "style": "academic"
      }
    }
  }'
```

### 4. Understanding the Response

The workflow response includes:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"result\":\"Final workflow result...\",\"steps\":[...]}"
    }
  ]
}
```

Parse the JSON to get:
- `result`: The final output from the workflow
- `steps`: Array of individual agent responses

**Example parsed response:**
```json
{
  "result": "Artificial intelligence is...",
  "steps": [
    {
      "agentId": "agent-1",
      "response": "AI is a branch of computer science...",
      "input": "Explain what artificial intelligence is"
    },
    {
      "agentId": "agent-2",
      "response": "Based on the research, here's a comprehensive explanation...",
      "input": "AI is a branch of computer science..."
    }
  ]
}
```

## Workflow Strategies

### Sequential Workflow

Agents execute one after another, passing results forward:

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_sequential-1",
    "arguments": {
      "input": "Research and summarize AI trends"
    }
  }'
```

**Flow:** Agent 1 → Agent 2 → Agent 3

### Parallel Workflow

All agents execute simultaneously:

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_parallel-1",
    "arguments": {
      "input": "Analyze this from multiple perspectives"
    }
  }'
```

**Flow:** All agents run at once, results are combined

### Custom Workflow

Workflows with conditions and branching:

```bash
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_custom-1",
    "arguments": {
      "input": "Process this request",
      "context": {
        "condition": "complex"
      }
    }
  }'
```

## Code Examples

### JavaScript/TypeScript

```javascript
async function runWorkflow(serverId, workflowId, input, context = {}) {
  const response = await fetch(
    `http://localhost:3001/api/mcp-servers/${serverId}/tools/call`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `workflow_${workflowId}`,
        arguments: { input, context },
      }),
    }
  );
  
  const result = await response.json();
  const workflowResult = JSON.parse(result.content[0].text);
  
  return {
    finalResult: workflowResult.result,
    steps: workflowResult.steps,
  };
}

// Usage
const workflow = await runWorkflow('server-1', 'workflow-1', 'Explain AI');
console.log('Final Result:', workflow.finalResult);
console.log('Steps:', workflow.steps);
```

### Python

```python
import requests
import json

def run_workflow(server_id, workflow_id, input_text, context=None):
    url = f"http://localhost:3001/api/mcp-servers/{server_id}/tools/call"
    response = requests.post(url, json={
        "name": f"workflow_{workflow_id}",
        "arguments": {
            "input": input_text,
            "context": context or {}
        }
    })
    
    result = response.json()
    workflow_result = json.loads(result['content'][0]['text'])
    
    return {
        'final_result': workflow_result['result'],
        'steps': workflow_result['steps']
    }

# Usage
workflow = run_workflow('server-1', 'workflow-1', 'Explain AI')
print('Final Result:', workflow['final_result'])
print('Steps:', workflow['steps'])
```

## Complete Example

```bash
# 1. List available workflow tools
curl http://localhost:3001/api/mcp-servers/server-1/tools | grep workflow

# 2. Run a sequential workflow
curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow_research-write",
    "arguments": {
      "input": "Research and write about quantum computing",
      "context": {}
    }
  }'

# 3. Check workflow execution
# The response will include:
# - result: Final combined output
# - steps: Array of each agent's response
```

## Troubleshooting

### Workflow Tool Not Found

If you get `Tool workflow_xxx not found`:

1. **Check if workflow is assigned:**
   ```bash
   curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://workflows/list"
   ```

2. **Verify workflow exists:**
   - Go to UI → Workflows tab
   - Make sure the workflow has agents added
   - Save the workflow if needed

3. **Re-assign the workflow:**
   - Go to UI → MCP Servers tab
   - Click "Assign" on your server
   - Select the workflow again
   - Click "Assign"

### Empty Response

If the workflow returns empty results:

1. **Check agent assignments:**
   ```bash
   curl "http://localhost:3001/api/mcp-servers/server-1/resources/read?uri=mcp://agents/list"
   ```

2. **Verify agents are in the workflow:**
   - Go to UI → Workflows tab
   - Make sure agents are on the canvas
   - Check connections between agents

3. **Test agents individually:**
   ```bash
   curl -X POST http://localhost:3001/api/mcp-servers/server-1/tools/call \
     -H "Content-Type: application/json" \
     -d '{"name":"agent_agent-1","arguments":{"message":"Test"}}'
   ```

## Tips

1. **Workflow naming**: Workflow tools are named `workflow_<workflow-id>`
2. **Input is required**: Always provide the `input` parameter
3. **Context is optional**: Use `context` to pass additional data
4. **Sequential workflows**: Results flow from one agent to the next
5. **Parallel workflows**: All agents process the same input simultaneously
6. **Custom workflows**: Support conditional branching based on context

## See Also

- [Invoking MCP Server Guide](./INVOKING_MCP_SERVER.md)
- [Workflow Guide](./WORKFLOW_GUIDE.md)
- [HTTP MCP Server Guide](./HTTP_MCP_SERVER.md)

