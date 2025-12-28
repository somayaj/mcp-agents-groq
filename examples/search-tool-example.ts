import dotenv from 'dotenv';
import { MCPAgentsFramework } from '../src/index.js';
import { createSearchTool, wikipediaSearch, duckDuckGoSearch } from '../src/tools/index.js';

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

  // Example 1: Create agent with default search tool (simulated)
  const agentWithDefaultSearch = framework.createAgent({
    id: 'agent-default-search',
    name: 'Research Agent (Default Search)',
    description: 'An agent with a basic search tool',
    systemPrompt: 'You are a research assistant. Use the search tool to find information when needed.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      createSearchTool(), // Uses default simulated search
    ],
  });

  // Example 2: Create agent with Wikipedia search
  const agentWithWikipedia = framework.createAgent({
    id: 'agent-wikipedia',
    name: 'Research Agent (Wikipedia)',
    description: 'An agent with Wikipedia search capability',
    systemPrompt: 'You are a research assistant. Use Wikipedia search to find accurate information.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      createSearchTool({
        searchFunction: wikipediaSearch,
      }),
    ],
  });

  // Example 3: Create agent with DuckDuckGo search
  const agentWithDuckDuckGo = framework.createAgent({
    id: 'agent-duckduckgo',
    name: 'Research Agent (DuckDuckGo)',
    description: 'An agent with DuckDuckGo search capability',
    systemPrompt: 'You are a research assistant. Use DuckDuckGo search to find information.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      createSearchTool({
        searchFunction: duckDuckGoSearch,
      }),
    ],
  });

  // Example 4: Create agent with custom search function
  const agentWithCustomSearch = framework.createAgent({
    id: 'agent-custom-search',
    name: 'Research Agent (Custom)',
    description: 'An agent with a custom search implementation',
    systemPrompt: 'You are a research assistant. Use the search tool to find information.',
    model: 'llama-3.3-70b-versatile',
    tools: [
      createSearchTool({
        searchFunction: async (query: string) => {
          // Your custom search implementation here
          // Example: Call your own search API, database, etc.
          return `Custom search results for: ${query}\n\nThis is a custom search implementation.`;
        },
      }),
    ],
  });

  console.log('✅ Agents created with search tools!');
  console.log('\nAvailable agents:');
  console.log('1. agent-default-search - Uses simulated search');
  console.log('2. agent-wikipedia - Uses Wikipedia API');
  console.log('3. agent-duckduckgo - Uses DuckDuckGo API');
  console.log('4. agent-custom-search - Uses custom search function');

  // Example: Test the search tool
  console.log('\n--- Testing Search Tool ---');
  const response = await agentWithDefaultSearch.process('Search for information about artificial intelligence');
  console.log('Agent Response:', response.content);

  // Start UI server
  const uiServer = framework.startUI({ port: 3001 });
  await uiServer.start();

  console.log('\n🌐 UI available at http://localhost:3001');
  console.log('💡 You can interact with the agents through the UI');
}

main().catch(console.error);

