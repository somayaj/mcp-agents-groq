# Creating Tools in the Web UI

## Current State

The web UI currently supports **selecting** from predefined tools when creating agents:
- **Search Tool**: Web search functionality
- **Create Graph Tool**: Chart and graph creation

These tools are hardcoded in the backend and can be selected via checkboxes when creating or editing agents.

## Limitations

**Important**: Tool handlers are JavaScript functions and **cannot be serialized** to JSON. This means:
- Tools created through the UI cannot have custom handler code
- Tool handlers must be predefined in the backend
- Custom tools require backend code changes

## How to Add New Tools to the UI

### Option 1: Add Predefined Tools (Recommended)

To add a new tool that can be selected in the UI:

1. **Create the tool function** in `src/tools/` (see `CREATING_TOOLS.md`)

2. **Export it** from `src/tools/index.ts`:
```typescript
export { createMyTool } from './myTool.js';
```

3. **Import it** in `src/ui/UIServer.ts`:
```typescript
import { createSearchTool, createGraphTool, createMyTool } from '../tools/index.js';
```

4. **Add it to the tools list** endpoint in `src/ui/UIServer.ts`:
```typescript
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
      description: 'Create charts and graphs from data',
      type: 'graph',
    },
    {
      id: 'my_tool',  // Must match tool name
      name: 'My Tool',
      description: 'Description of what my tool does',
      type: 'custom',
    },
  ]);
});
```

5. **Add tool creation logic** in the agent creation endpoint:
```typescript
(req.body as any).selectedTools.forEach((toolId: string) => {
  if (toolId === 'search') {
    selectedTools.push(createSearchTool());
  } else if (toolId === 'create_graph') {
    selectedTools.push(createGraphTool({ outputFormat: 'html' }));
  } else if (toolId === 'my_tool') {
    selectedTools.push(createMyTool({ /* options */ }));
  }
});
```

6. **Add tool update logic** in the agent update endpoint (similar to above)

### Option 2: Create Tools Programmatically

For tools with custom handlers, create them programmatically:

```typescript
import { MCPAgentsFramework } from './src/index.js';
import { createMyTool } from './src/tools/index.js';

const framework = new MCPAgentsFramework(apiKey);

const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  tools: [
    createMyTool({ /* options */ }),
  ],
});

// Then start the UI
const uiServer = framework.startUI({ port: 3001 });
await uiServer.start();
```

The agent will be available in the UI with its tools already registered.

## Future: Custom Tool Builder UI

A future enhancement could include a tool builder UI that:
1. Allows users to define tool parameters using a schema builder
2. Maps tool definitions to predefined handler templates
3. Stores tool configurations (not handlers) in the database
4. Provides templates for common tool types (API calls, calculations, etc.)

This would require:
- A tool template system
- A parameter schema builder UI
- Backend endpoints to save/load tool configurations
- Handler template matching logic

## Example: Adding a Calculator Tool

1. **Create** `src/tools/calculator.ts`:
```typescript
import { z } from 'zod';
import { AgentTool } from '../types/index.js';

export function createCalculatorTool(): AgentTool {
  return {
    name: 'calculator',
    description: 'Perform basic mathematical calculations',
    parameters: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number(),
      b: z.number(),
    }),
    handler: async (params) => {
      // ... calculator logic
    },
  };
}
```

2. **Export** from `src/tools/index.ts`

3. **Add to UI** in `src/ui/UIServer.ts`:
   - Add to `/api/tools` endpoint
   - Add to agent creation/update logic

4. **Use in UI**: The calculator tool will appear as a checkbox option when creating agents!

## Summary

- **Current**: UI supports selecting from predefined tools
- **To add tools**: Modify backend code in `UIServer.ts`
- **Custom handlers**: Must be created programmatically
- **Best practice**: Create reusable tool functions and add them to the UI's tool list

