import { z } from 'zod';

export interface MCPServerConfig {
  name: string;
  version?: string;
  description?: string;
  tools?: MCPTool[];
  resources?: MCPResource[];
  handlers?: MCPHandlers;
  assignedAgents?: string[]; // Agent IDs assigned to this MCP server
  assignedWorkflows?: string[]; // Workflow/Orchestrator IDs assigned to this MCP server
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (params: any) => Promise<any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPHandlers {
  onRequest?: (request: any) => Promise<any>;
  onNotification?: (notification: any) => Promise<void>;
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: AgentTool[];
  mcpServers?: string[]; // IDs of MCP servers to connect to
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  handler: (params: any, context?: AgentContext) => Promise<any>;
}

export interface AgentContext {
  agentId: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
  metadata?: Record<string, any>;
}

export interface OrchestrationConfig {
  strategy?: 'sequential' | 'parallel' | 'workflow';
  agents: string[]; // Agent IDs
  workflow?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  condition?: (context: any) => boolean;
  next?: string[]; // IDs of next steps
}

export interface UIConfig {
  port?: number;
  theme?: 'light' | 'dark';
  customRoutes?: Array<{
    path: string;
    handler: (req: any, res: any) => void;
  }>;
}

export interface GovernanceConfig {
  // Input validation
  maxInputLength?: number;
  allowedPatterns?: RegExp[];
  blockedPatterns?: RegExp[];
  requireInputValidation?: boolean;

  // Output filtering
  maxOutputLength?: number;
  contentModeration?: boolean;
  blockedKeywords?: string[];
  allowedDomains?: string[];

  // Rate limiting
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };

  // Usage tracking
  maxTokensPerRequest?: number;
  maxRequestsPerDay?: number;
  maxRequestsPerHour?: number;

  // Safety checks
  enableSafetyChecks?: boolean;
  safetyPrompt?: string;
  blockHarmfulContent?: boolean;

  // Audit logging
  enableAuditLog?: boolean;
  auditLogPath?: string;
}

