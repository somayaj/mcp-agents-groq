import dotenv from 'dotenv';
import { MCPAgentsFramework } from '../src/index.js';
import { z } from 'zod';

dotenv.config();

/**
 * Test client for MCP Server
 * 
 * This example demonstrates how to:
 * 1. Create an MCP server with agents and workflows
 * 2. Test listing available tools
 * 3. Test calling agent tools
 * 4. Test calling workflow tools
 * 5. Test listing and reading resources
 */

async function testMCPServer() {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found in environment variables');
  }

  console.log('🚀 Setting up MCP Server...\n');

  // Initialize framework
  const framework = new MCPAgentsFramework(apiKey, {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
  });

  // Create test agents
  const agent1 = framework.createAgent({
    id: 'test-agent-1',
    name: 'Research Agent',
    description: 'An agent that helps with research tasks',
    systemPrompt: 'You are a helpful research assistant. Provide concise and accurate information.',
    model: 'llama-3.3-70b-versatile',
  });

  const agent2 = framework.createAgent({
    id: 'test-agent-2',
    name: 'Writing Agent',
    description: 'An agent that helps with writing tasks',
    systemPrompt: 'You are a professional writer. Create well-structured and engaging content.',
    model: 'llama-3.3-70b-versatile',
  });

  // Create an orchestrator/workflow
  const orchestrator = framework.createOrchestrator('test-workflow-1', {
    strategy: 'sequential',
    agents: ['test-agent-1', 'test-agent-2'],
  });

  // Create MCP server with custom tools
  const mcpServer = framework.createMCPServer('test-server', {
    name: 'Test MCP Server',
    version: '1.0.0',
    description: 'A test MCP server for demonstration',
    tools: [
      {
        name: 'greet',
        description: 'Greet someone with a personalized message',
        inputSchema: z.object({
          name: z.string().describe('The name of the person to greet'),
        }),
        handler: async (params) => {
          return `Hello, ${params.name}! Welcome to the MCP test server.`;
        },
      },
      {
        name: 'calculate',
        description: 'Perform a simple calculation',
        inputSchema: z.object({
          expression: z.string().describe('A mathematical expression to evaluate'),
        }),
        handler: async (params) => {
          try {
            // Simple eval for demo - in production, use a proper expression parser
            const result = eval(params.expression);
            return `Result: ${result}`;
          } catch (error: any) {
            return `Error: ${error.message}`;
          }
        },
      },
    ],
  });

  // Assign agents and workflows to the MCP server
  mcpServer.assignAgent(agent1);
  mcpServer.assignAgent(agent2);
  mcpServer.assignOrchestrator('test-workflow-1', orchestrator);

  console.log('✅ MCP Server created with:');
  console.log(`   - 2 agents (test-agent-1, test-agent-2)`);
  console.log(`   - 1 workflow (test-workflow-1)`);
  console.log(`   - 2 custom tools (greet, calculate)\n`);

  // Access internal server methods for testing
  const serverInternal = mcpServer as any;

  console.log('📋 Testing MCP Server Functionality...\n');

  // Test 1: List Tools
  console.log('1️⃣  Testing: List Tools');
  try {
    const tools = Array.from(serverInternal.tools.values());
    console.log(`   ✅ Found ${tools.length} tools:`);
    tools.forEach((tool: any) => {
      console.log(`      - ${tool.name}: ${tool.description}`);
    });
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error listing tools: ${error.message}\n`);
  }

  // Test 2: Call Custom Tool (greet)
  console.log('2️⃣  Testing: Call Custom Tool (greet)');
  try {
    const tool = serverInternal.tools.get('greet');
    if (tool && tool.handler) {
      const result = await tool.handler({ name: 'Alice' });
      console.log(`   ✅ Result: ${result}`);
    } else {
      console.log('   ⚠️  Tool not found');
    }
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error calling tool: ${error.message}\n`);
  }

  // Test 3: Call Custom Tool (calculate)
  console.log('3️⃣  Testing: Call Custom Tool (calculate)');
  try {
    const tool = serverInternal.tools.get('calculate');
    if (tool && tool.handler) {
      const result = await tool.handler({ expression: '2 + 2 * 3' });
      console.log(`   ✅ Result: ${result}`);
    } else {
      console.log('   ⚠️  Tool not found');
    }
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error calling tool: ${error.message}\n`);
  }

  // Test 4: Call Agent Tool
  console.log('4️⃣  Testing: Call Agent Tool (agent_test-agent-1)');
  try {
    const tool = serverInternal.tools.get('agent_test-agent-1');
    if (tool && tool.handler) {
      console.log('   ⏳ Calling agent (this may take a moment)...');
      const result = await tool.handler({ 
        message: 'What is artificial intelligence in one sentence?' 
      });
      if (result && result.content) {
        console.log(`   ✅ Agent Response: ${result.content.substring(0, 200)}...`);
      } else {
        console.log(`   ✅ Agent Response: ${JSON.stringify(result).substring(0, 200)}...`);
      }
    } else {
      console.log('   ⚠️  Agent tool not found');
    }
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error calling agent tool: ${error.message}\n`);
  }

  // Test 5: List Resources
  console.log('5️⃣  Testing: List Resources');
  try {
    const resources = Array.from(serverInternal.resources.values());
    console.log(`   ✅ Found ${resources.length} resources:`);
    resources.forEach((resource: any) => {
      console.log(`      - ${resource.uri}: ${resource.name}`);
    });
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error listing resources: ${error.message}\n`);
  }

  // Test 6: Read Resource (agents list) - using direct access
  console.log('6️⃣  Testing: Read Resource (mcp://agents/list)');
  try {
    const agents = mcpServer.getAssignedAgents();
    const agentsList = agents.map(agent => ({
      id: agent.getId(),
      name: agent.getName(),
      description: agent.getConfig().description,
    }));
    console.log(`   ✅ Agents List:`);
    console.log(JSON.stringify(agentsList, null, 6));
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error reading resource: ${error.message}\n`);
  }

  // Test 7: Read Resource (workflows list)
  console.log('7️⃣  Testing: Read Resource (mcp://workflows/list)');
  try {
    const workflows = mcpServer.getAssignedWorkflows();
    const workflowsList = workflows.map(id => ({ id }));
    console.log(`   ✅ Workflows List:`);
    console.log(JSON.stringify(workflowsList, null, 6));
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error reading resource: ${error.message}\n`);
  }

  // Test 8: Call Workflow Tool
  console.log('8️⃣  Testing: Call Workflow Tool (workflow_test-workflow-1)');
  try {
    const tool = (mcpServer as any).tools.get('workflow_test-workflow-1');
    if (tool && tool.handler) {
      console.log('   ⏳ Executing workflow (this may take a moment)...');
      const result = await tool.handler({
        input: 'Explain what AI is in one sentence',
        context: {},
      });
      
      if (result && result.result) {
        console.log(`   ✅ Workflow executed successfully!`);
        console.log(`   ✅ Steps: ${result.steps?.length || 0}`);
        console.log(`   ✅ Final Result: ${result.result.substring(0, 150)}...`);
      } else {
        console.log(`   ✅ Workflow Result: ${JSON.stringify(result).substring(0, 200)}...`);
      }
    } else {
      console.log('   ⚠️  Workflow tool not found');
    }
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error calling workflow tool: ${error.message}\n`);
  }

  // Test 9: Verify assigned agents and workflows
  console.log('9️⃣  Testing: Get Assigned Agents and Workflows');
  try {
    const assignedAgents = mcpServer.getAssignedAgents();
    const assignedWorkflows = mcpServer.getAssignedWorkflows();
    
    console.log(`   ✅ Assigned Agents: ${assignedAgents.length}`);
    assignedAgents.forEach(agent => {
      console.log(`      - ${agent.getId()}: ${agent.getName()}`);
    });
    
    console.log(`   ✅ Assigned Workflows: ${assignedWorkflows.length}`);
    assignedWorkflows.forEach(workflowId => {
      console.log(`      - ${workflowId}`);
    });
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('✅ All tests completed!\n');
  console.log('💡 Tip: To test with a real MCP client (like Claude Desktop),');
  console.log('   you would need to start the server with stdio transport:');
  console.log('   await mcpServer.start();\n');
}

// Main execution
async function main() {
  try {
    await testMCPServer();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);

