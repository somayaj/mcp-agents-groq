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
  const framework = new MCPAgentsFramework(apiKey, {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
  });

  // Create a simple agent
  const agent1 = framework.createAgent({
    id: 'agent-1',
    name: 'Research Agent',
    description: 'An agent that helps with research tasks',
    systemPrompt: 'You are a helpful research assistant. Provide detailed and accurate information.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      {
        name: 'search',
        description: 'Search for information on a topic',
        parameters: z.object({
          query: z.string().describe('The search query'),
        }),
        handler: async (params) => {
          // Simulated search
          return `Search results for: ${params.query}`;
        },
      },
    ],
  });

  // Create another agent
  const agent2 = framework.createAgent({
    id: 'agent-2',
    name: 'Writing Agent',
    description: 'An agent that helps with writing tasks',
    systemPrompt: 'You are a professional writer. Create well-structured and engaging content.',
  });

  // Create an orchestrator
  const orchestrator = framework.createOrchestrator('orchestrator-1', {
    strategy: 'sequential',
    agents: ['agent-1', 'agent-2'],
  });

  // Start UI server
  const uiServer = framework.startUI({ port: 3001 });
  await uiServer.start();

  console.log('Framework initialized!');
  console.log('UI available at http://localhost:3001');
  console.log('\nTry interacting with agents:');
  console.log('- Visit http://localhost:3001 to use the workflow builder');
  console.log('- Use the API endpoints to interact programmatically');

  // Example: Process a message
  console.log('\n--- Example Agent Interaction ---');
  const response = await agent1.process('What is artificial intelligence?');
  console.log('Agent Response:', response.content);
}

main().catch(console.error);

