# How to Run Workflows

## Quick Start

### 1. Start the Server

```bash
npm run example
```

This starts the server with the UI at `http://localhost:3001`

### 2. Using the Web UI

#### Step 1: Create Agents
1. Open `http://localhost:3001`
2. Click the **"Agents"** tab
3. Fill in the form:
   - **Agent ID**: e.g., `researcher`
   - **Name**: e.g., `Research Agent`
   - **System Prompt**: e.g., `You are a research assistant`
   - **Model**: Choose from dropdown (default: llama-3.3-70b-versatile)
4. Click **"Create Agent"**
5. Repeat for additional agents

#### Step 2: Build Workflow
1. Click the **"Workflows"** tab
2. **Drag agents** from the left panel onto the canvas
3. **Connect nodes**:
   - Click the **→** (right arrow) on the first node
   - Click the **←** (left arrow) on the second node
   - A blue line with arrow will appear
4. **Choose strategy**:
   - **Sequential**: Agents run one after another
   - **Parallel**: All agents run simultaneously
   - **Custom Workflow**: Define complex flows with conditions

#### Step 3: Execute Workflow
1. Enter a **Workflow Name** (optional)
2. Click **"Execute"** button
3. Enter your **input** when prompted
4. View **results** below the canvas

### 3. Using the API

#### Execute via REST API

```bash
# Get available agents
curl http://localhost:3001/api/agents

# Execute a workflow
curl -X POST http://localhost:3001/api/orchestrators/default/execute \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Research and analyze quantum computing",
    "strategy": "sequential",
    "agents": ["agent-1", "agent-2"]
  }'
```

### 4. Programmatic Execution

```typescript
import { MCPAgentsFramework } from './src/index.js';

const framework = new MCPAgentsFramework(apiKey);

// Create agents
const agent1 = framework.createAgent({
  id: 'agent-1',
  name: 'Agent 1',
  systemPrompt: 'You are a helpful assistant',
});

const agent2 = framework.createAgent({
  id: 'agent-2',
  name: 'Agent 2',
  systemPrompt: 'You are a writer',
});

// Create orchestrator
const orchestrator = framework.createOrchestrator('my-workflow', {
  strategy: 'sequential',
  agents: ['agent-1', 'agent-2'],
});

// Execute
const result = await orchestrator.execute('Your input here');
console.log(result.result);
```

## Workflow Strategies

### Sequential
Agents execute one after another, passing results forward:
```
Agent 1 → Agent 2 → Agent 3
```

### Parallel
All agents execute simultaneously:
```
Agent 1 ┐
Agent 2 ├→ Combined Results
Agent 3 ┘
```

### Custom Workflow
Define complex flows with conditions and branching:
```
Start → Agent 1 → [Condition] → Agent 2 or Agent 3
```

## Example Workflow

**Research → Analysis → Writing**

1. **Research Agent**: Gathers information
2. **Analysis Agent**: Analyzes the information
3. **Writing Agent**: Creates content based on analysis

**Input**: "Research and write about artificial intelligence"

**Output**: Final written content after research and analysis

## Troubleshooting

### Workflow won't execute
- Make sure agents are created first
- Verify agents are connected in the workflow
- Check that agent IDs match

### No results shown
- Check browser console for errors
- Verify the server is running
- Ensure agents are properly configured

### Tools not working
- Tools must be added programmatically (not from UI)
- See `TROUBLESHOOTING.md` for details

## Tips

1. **Start simple**: Create 2-3 agents and test with sequential workflow
2. **Use descriptive names**: Makes workflows easier to understand
3. **Save workflows**: Use "Save Config" to persist your setup
4. **Test incrementally**: Test each agent individually before building workflows

