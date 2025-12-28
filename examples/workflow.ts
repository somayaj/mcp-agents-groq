import dotenv from 'dotenv';
import { MCPAgentsFramework } from '../src/index.js';
import { z } from 'zod';

dotenv.config();

async function main() {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found in environment variables');
  }

  // Initialize framework
  const framework = new MCPAgentsFramework(apiKey);

  // Create multiple specialized agents
  const researchAgent = framework.createAgent({
    id: 'research-agent',
    name: 'Research Agent',
    description: 'Conducts research and gathers information',
    systemPrompt: 'You are a research assistant. Provide detailed, accurate information based on queries.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      {
        name: 'search',
        description: 'Search for information',
        parameters: z.object({
          query: z.string(),
        }),
        handler: async (params) => {
          // Simulated search
          return `Found information about: ${params.query}`;
        },
      },
    ],
  });

  const analysisAgent = framework.createAgent({
    id: 'analysis-agent',
    name: 'Analysis Agent',
    description: 'Analyzes data and provides insights',
    systemPrompt: 'You are an analytical assistant. Analyze information and provide insights.',
  });

  const writingAgent = framework.createAgent({
    id: 'writing-agent',
    name: 'Writing Agent',
    description: 'Creates written content',
    systemPrompt: 'You are a professional writer. Create well-structured, engaging content.',
  });

  // Create a sequential orchestrator
  const sequentialOrchestrator = framework.createOrchestrator('sequential-workflow', {
    strategy: 'sequential',
    agents: ['research-agent', 'analysis-agent', 'writing-agent'],
  });

  // Create a parallel orchestrator
  const parallelOrchestrator = framework.createOrchestrator('parallel-workflow', {
    strategy: 'parallel',
    agents: ['research-agent', 'analysis-agent'],
  });

  // Create a custom workflow orchestrator
  const customOrchestrator = framework.createOrchestrator('custom-workflow', {
    strategy: 'workflow',
    agents: ['research-agent', 'analysis-agent', 'writing-agent'],
    workflow: [
      {
        id: 'step-1',
        agentId: 'research-agent',
        next: ['step-2'],
      },
      {
        id: 'step-2',
        agentId: 'analysis-agent',
        condition: (context: any) => context.input?.length > 0,
        next: ['step-3'],
      },
      {
        id: 'step-3',
        agentId: 'writing-agent',
      },
    ],
  });

  // Start UI server
  const uiServer = framework.startUI({ port: 3001 });
  await uiServer.start();

  console.log('✅ Framework initialized!');
  console.log('🌐 UI available at http://localhost:3001');
  console.log('\n📋 Available Agents:');
  framework.getAgents().forEach(agent => {
    console.log(`  - ${agent.getName()} (${agent.getId()})`);
  });
  console.log('\n🎯 Available Orchestrators:');
  framework.getOrchestrators().forEach((orch, id) => {
    console.log(`  - ${id}`);
  });
  console.log('\n💡 Try the workflow builder at http://localhost:3001');
  console.log('   You can drag agents to create custom workflows!');

  // Example: Execute sequential workflow
  console.log('\n--- Example: Sequential Workflow ---');
  const result = await sequentialOrchestrator.execute('Research and analyze quantum computing');
  console.log('Result:', result.result);
  console.log('Steps:', result.steps.map(s => `${s.agentId}: ${s.response.substring(0, 50)}...`));
}

main().catch(console.error);

