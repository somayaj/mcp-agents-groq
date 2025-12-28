import dotenv from 'dotenv';
import { MCPAgentsFramework } from './index.js';

dotenv.config();

async function main() {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY not found in environment variables');
    console.error('Please set GROQ_API_KEY in your .env file or environment');
    process.exit(1);
  }

  console.log('🚀 Starting MCP Agents Groq Server...');
  
  // Initialize framework
  const framework = new MCPAgentsFramework(apiKey, {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
  });

  // Start UI server (it will load saved config automatically)
  const uiServer = framework.startUI({ port: 3001 });
  await uiServer.start();

  console.log('✅ Server is ready!');
  console.log('📊 Open http://localhost:3001 in your browser');
  console.log('📝 All agent execution logs will appear here');
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

