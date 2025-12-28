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

  // Create agents
  const researchAgent = framework.createAgent({
    id: 'researcher',
    name: 'Research Agent',
    systemPrompt: 'You are a research assistant. Provide detailed information.',
  });

  const analysisAgent = framework.createAgent({
    id: 'analyst',
    name: 'Analysis Agent',
    systemPrompt: 'You are an analyst. Analyze the information and provide insights.',
  });

  const writerAgent = framework.createAgent({
    id: 'writer',
    name: 'Writing Agent',
    systemPrompt: 'You are a writer. Create well-structured content based on the analysis.',
  });

  // Create a sequential workflow
  const orchestrator = framework.createOrchestrator('my-workflow', {
    strategy: 'sequential',
    agents: ['researcher', 'analyst', 'writer'],
  });

  // Execute the workflow
  console.log('Executing workflow...\n');
  const result = await orchestrator.execute('Research and write about quantum computing');

  console.log('=== Workflow Execution Results ===\n');
  result.steps.forEach((step, index) => {
    console.log(`Step ${index + 1} - ${step.agentId}:`);
    console.log(step.response);
    console.log('---\n');
  });

  console.log('Final Result:');
  console.log(result.result);
}

main().catch(console.error);

