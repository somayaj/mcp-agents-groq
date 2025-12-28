# Troubleshooting Guide

## Tool Handler Errors

### Error: "tool.handler is not a function"

This error occurs when an agent tries to use a tool, but the tool's handler function is missing or invalid.

#### Causes:
1. **Tools created from UI**: Tools created through the web UI don't have handlers because functions can't be serialized/deserialized
2. **Tools loaded from saved configuration**: When agents are loaded from saved configs, tool handlers are lost
3. **Invalid tool registration**: Tool was registered without a proper handler function

#### Solutions:

**Option 1: Create agents programmatically with tools**
```typescript
import { MCPAgentsFramework } from './src/index.js';
import { z } from 'zod';

const framework = new MCPAgentsFramework(apiKey);

const agent = framework.createAgent({
  id: 'my-agent',
  name: 'My Agent',
  tools: [
    {
      name: 'search',
      description: 'Search for information',
      parameters: z.object({
        query: z.string(),
      }),
      handler: async (params) => {
        // Your tool logic here
        return `Results for: ${params.query}`;
      },
    },
  ],
});
```

**Option 2: Add tools after agent creation**
```typescript
import { z } from 'zod';

const agent = framework.getAgent('my-agent');
if (agent) {
  agent.registerTool({
    name: 'calculate',
    description: 'Perform calculations',
    parameters: z.object({
      expression: z.string(),
    }),
    handler: async (params) => {
      return eval(params.expression);
    },
  });
}
```

**Option 3: Use agents without tools**
- Agents created from the UI work fine without tools
- They can still process messages and respond
- Tools are optional - agents can function without them

#### Validation:

The framework now validates tools when they're registered:
- Tool must have a `name` and `description`
- Tool must have a `handler` function
- Tool must have a `parameters` schema (Zod schema)

#### Best Practices:

1. **For UI-created agents**: Don't add tools through the UI. Create agents programmatically if you need tools.

2. **For production**: Create agents with tools programmatically in your application code, not through the UI.

3. **For testing**: Use the UI to create simple agents without tools, then add tools programmatically if needed.

## Common Issues

### Agents created from UI don't have tools
- **Expected behavior**: Tools are removed when creating agents from UI because handlers can't be serialized
- **Solution**: Create agents programmatically if you need tools

### Tools lost when loading saved configuration
- **Expected behavior**: Tool handlers are functions and can't be saved/loaded
- **Solution**: Re-register tools programmatically after loading configuration

### "Tool not found" errors
- **Check**: Verify the tool name matches exactly (case-sensitive)
- **Check**: Ensure the tool is registered before the agent tries to use it
- **Check**: Verify the agent has access to the tool

## Debugging

Enable debug logging:
```typescript
// Check if tool exists
const agent = framework.getAgent('agent-id');
if (agent) {
  const tools = agent.getConfig().tools;
  console.log('Agent tools:', tools);
}
```

Check tool registration:
```typescript
// The framework validates tools on registration
// Invalid tools will throw errors with clear messages
```

