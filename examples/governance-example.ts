import dotenv from 'dotenv';
import { MCPAgentsFramework, GovernanceConfig } from '../src/index.js';

dotenv.config();

/**
 * Governance and Guardrails Example
 * 
 * This example demonstrates how to use governance features:
 * - Input validation
 * - Output filtering
 * - Rate limiting
 * - Content moderation
 * - Usage tracking
 * - Safety checks
 */

async function main() {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found in environment variables');
  }

  // Define governance configuration
  const governanceConfig: GovernanceConfig = {
    // Input validation
    maxInputLength: 5000,
    blockedPatterns: [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
    ],

    // Output filtering
    maxOutputLength: 20000,
    contentModeration: true,
    blockedKeywords: [
      'hack', 'exploit', 'malware', 'virus',
      'illegal', 'unauthorized', 'breach',
    ],

    // Rate limiting
    rateLimit: {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
    },

    // Usage tracking
    maxTokensPerRequest: 10000,
    maxRequestsPerDay: 100,
    maxRequestsPerHour: 20,

    // Safety checks
    enableSafetyChecks: true,
    blockHarmfulContent: true,

    // Audit logging
    enableAuditLog: true,
    auditLogPath: './audit.log',
  };

  // Initialize framework with governance
  const framework = new MCPAgentsFramework(apiKey, {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    governance: governanceConfig,
  });

  // Create agent with governance enabled
  const agent = framework.createAgent({
    id: 'governed-agent',
    name: 'Governed Agent',
    description: 'An agent with governance and guardrails',
    systemPrompt: 'You are a helpful assistant. Provide accurate and safe information.',
    model: 'llama-3.3-70b-versatile',
  });

  console.log('✅ Agent created with governance enabled\n');

  // Test 1: Normal request (should work)
  console.log('1️⃣  Testing: Normal Request');
  try {
    const response = await agent.process('What is artificial intelligence?');
    console.log('✅ Request allowed');
    console.log(`Response: ${response.content.substring(0, 100)}...\n`);
  } catch (error: any) {
    console.error('❌ Error:', error.message, '\n');
  }

  // Test 2: Input validation (long input)
  console.log('2️⃣  Testing: Input Length Validation');
  try {
    const longInput = 'A'.repeat(6000); // Exceeds 5000 char limit
    const response = await agent.process(longInput);
    console.log('Response:', response.content, '\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message, '\n');
  }

  // Test 3: Rate limiting
  console.log('3️⃣  Testing: Rate Limiting');
  try {
    for (let i = 0; i < 12; i++) {
      const response = await agent.process(`Request ${i + 1}`);
      if (response.metadata?.governance?.rejected) {
        console.log(`❌ Request ${i + 1} rejected: ${response.metadata.governance.reason}`);
        break;
      } else {
        console.log(`✅ Request ${i + 1} allowed`);
      }
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ Error:', error.message, '\n');
  }

  // Test 4: Usage statistics
  console.log('4️⃣  Testing: Usage Statistics');
  const governance = framework.getGovernance();
  if (governance) {
    const stats = governance.getUsageStats('governed-agent');
    console.log('Usage Stats:');
    console.log(`  - Total Requests: ${stats.requestCount}`);
    console.log(`  - Requests Today: ${stats.requestsToday}`);
    console.log(`  - Requests This Hour: ${stats.requestsThisHour}`);
    console.log(`  - Last Request: ${stats.lastRequestTime}`);
    console.log('');
  }

  // Test 5: Content moderation
  console.log('5️⃣  Testing: Content Moderation');
  try {
    // This should be filtered if it contains blocked keywords
    const response = await agent.process('Tell me about hacking techniques');
    if (response.metadata?.governance?.rejected) {
      console.log('✅ Content filtered:', response.metadata.governance.reason);
    } else {
      console.log('Response received (may be filtered in output)');
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ Error:', error.message, '\n');
  }

  console.log('✅ Governance tests completed!');
  console.log('📋 Check audit.log for audit trail\n');
}

main().catch(console.error);

