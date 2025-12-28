# Example: Adding Calculator Tool to the Web UI

This guide shows step-by-step how to add the calculator tool (already defined in `src/tools/example.ts`) to the web UI.

## Step 1: Export the Calculator Tool

First, make sure the calculator tool is exported from `src/tools/index.ts`:

```typescript
// src/tools/index.ts
export { createCalculatorTool } from './example.js';
```

## Step 2: Import in UIServer

Add the import in `src/ui/UIServer.ts`:

```typescript
// src/ui/UIServer.ts (line 9)
import { createSearchTool, createGraphTool, createCalculatorTool } from '../tools/index.js';
```

## Step 3: Add to Tools List Endpoint

Update the `/api/tools` endpoint to include the calculator:

```typescript
// src/ui/UIServer.ts (around line 75)
this.app.get('/api/tools', (req: Request, res: Response) => {
  res.json([
    {
      id: 'search',
      name: 'Search',
      description: 'Search for information on a topic using web search',
      type: 'search',
    },
    {
      id: 'create_graph',
      name: 'Create Graph',
      description: 'Create charts and graphs from data (line, bar, pie, scatter, area, histogram)',
      type: 'graph',
    },
    {
      id: 'calculator',  // Must match the tool name
      name: 'Calculator',
      description: 'Perform basic mathematical calculations (add, subtract, multiply, divide)',
      type: 'calculator',
    },
  ]);
});
```

## Step 4: Add to Agent Creation Logic

Update the agent creation endpoint to handle the calculator tool:

```typescript
// src/ui/UIServer.ts (around line 121)
(req.body as any).selectedTools.forEach((toolId: string) => {
  if (toolId === 'search') {
    selectedTools.push(createSearchTool());
  } else if (toolId === 'create_graph') {
    selectedTools.push(createGraphTool({ outputFormat: 'html' }));
  } else if (toolId === 'calculator') {
    selectedTools.push(createCalculatorTool());
  }
});
```

## Step 5: Add to Agent Update Logic

Update the agent update endpoint to handle the calculator tool:

```typescript
// src/ui/UIServer.ts (around line 182)
(req.body as any).selectedTools.forEach((toolId: string) => {
  if (toolId === 'search') {
    console.log(`[UI] Adding search tool to agent ${req.params.id}`);
    agent.registerTool(createSearchTool());
  } else if (toolId === 'create_graph') {
    console.log(`[UI] Adding create_graph tool to agent ${req.params.id}`);
    agent.registerTool(createGraphTool({ outputFormat: 'html' }));
  } else if (toolId === 'calculator') {
    console.log(`[UI] Adding calculator tool to agent ${req.params.id}`);
    agent.registerTool(createCalculatorTool());
  }
});
```

## Step 6: Update Load Configuration Logic

Update the configuration loading logic to restore calculator tools:

```typescript
// src/ui/UIServer.ts (around line 1236)
selectedTools.forEach((toolId: string) => {
  if (toolId === 'search') {
    agent.registerTool(createSearchTool());
  } else if (toolId === 'create_graph') {
    agent.registerTool(createGraphTool({ outputFormat: 'html' }));
  } else if (toolId === 'calculator') {
    agent.registerTool(createCalculatorTool());
  }
});
```

## Result

After these changes:
1. The calculator tool will appear in the tools list when creating/editing agents
2. Users can select it via checkbox
3. The tool will be registered with the agent
4. The agent can use the calculator tool in conversations

## Testing

1. Start the server
2. Open the web UI
3. Create a new agent
4. You should see "Calculator" in the tools list
5. Select it and create the agent
6. Test by asking the agent: "Calculate 15 + 27"

## Complete Code Snippets

Here are the complete sections you need to modify:

### Import Statement
```typescript
import { createSearchTool, createGraphTool, createCalculatorTool } from '../tools/index.js';
```

### Tools List Endpoint
```typescript
this.app.get('/api/tools', (req: Request, res: Response) => {
  res.json([
    { id: 'search', name: 'Search', description: 'Search for information on a topic using web search', type: 'search' },
    { id: 'create_graph', name: 'Create Graph', description: 'Create charts and graphs from data', type: 'graph' },
    { id: 'calculator', name: 'Calculator', description: 'Perform basic mathematical calculations', type: 'calculator' },
  ]);
});
```

### Agent Creation (3 places)
```typescript
// In POST /api/agents
if (toolId === 'calculator') {
  selectedTools.push(createCalculatorTool());
}

// In PUT /api/agents/:id
if (toolId === 'calculator') {
  agent.registerTool(createCalculatorTool());
}

// In loadSavedConfiguration
if (toolId === 'calculator') {
  agent.registerTool(createCalculatorTool());
}
```

That's it! The calculator tool is now available in the web UI.

