import { Agent } from './Agent.js';
import {
  OrchestrationConfig,
  WorkflowStep,
  AgentMessage,
  AgentContext,
} from '../types/index.js';

export class Orchestrator {
  private agents: Map<string, Agent> = new Map();
  private config: OrchestrationConfig;
  private workflow: Map<string, WorkflowStep> = new Map();
  private executionContext: Record<string, any> = {};

  constructor(config: OrchestrationConfig) {
    this.config = config;
    this.updateWorkflowMap();
  }

  updateWorkflowMap(): void {
    this.workflow.clear();
    if (this.config.workflow) {
      this.config.workflow.forEach(step => {
        this.workflow.set(step.id, step);
      });
    }
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.getId(), agent);
  }

  registerAgents(agents: Agent[]): void {
    // If empty array, clear all agents
    if (agents.length === 0) {
      this.agents.clear();
      return;
    }
    // Otherwise, register the provided agents
    agents.forEach(agent => this.registerAgent(agent));
  }

  async execute(
    input: string,
    context?: Record<string, any>
  ): Promise<{
    result: string;
    steps: Array<{ agentId: string; response: string; error?: string }>;
  }> {
    this.executionContext = { ...context, input };

    switch (this.config.strategy) {
      case 'sequential':
        return await this.executeSequential(input);
      case 'parallel':
        return await this.executeParallel(input);
      case 'workflow':
        return await this.executeWorkflow(input);
      default:
        return await this.executeSequential(input);
    }
  }

  private async executeSequential(input: string): Promise<{
    result: string;
    steps: Array<{ agentId: string; response: string; error?: string }>;
  }> {
    const steps: Array<{ agentId: string; response: string; error?: string }> = [];
    let currentInput = input;

    // Remove duplicates - only execute each agent once
    const uniqueAgentIds = Array.from(new Set(this.config.agents));

    for (const agentId of uniqueAgentIds) {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const context: AgentContext = {
        agentId,
        metadata: {
          previousSteps: steps,
          executionContext: this.executionContext,
        },
      };

      let response;
      try {
        response = await agent.process(currentInput, context);
        steps.push({
          agentId,
          response: response.content,
          error: response.metadata?.finishReason === 'error' ? 'Agent encountered an error' : undefined,
        });
      } catch (error: any) {
        console.error(`Error in agent ${agentId}:`, error);
        steps.push({
          agentId,
          response: `Error: ${error.message || 'Agent execution failed'}`,
          error: error.message || 'Agent execution failed',
        });
        // Continue with error message as input for next agent
        currentInput = `Error in previous step: ${error.message || 'Agent execution failed'}`;
        continue;
      }

      currentInput = response.content;
    }

    return {
      result: currentInput,
      steps,
    };
  }

  private async executeParallel(input: string): Promise<{
    result: string;
    steps: Array<{ agentId: string; response: string; error?: string }>;
  }> {
    // Remove duplicates - only execute each agent once
    const uniqueAgentIds = Array.from(new Set(this.config.agents));
    
    const promises = uniqueAgentIds.map(async agentId => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const context: AgentContext = {
        agentId,
        metadata: {
          executionContext: this.executionContext,
        },
      };

      let response;
      try {
        response = await agent.process(input, context);
        return {
          agentId,
          response: response.content,
          error: response.metadata?.finishReason === 'error' ? 'Agent encountered an error' : undefined,
        };
      } catch (error: any) {
        console.error(`Error in parallel agent ${agentId}:`, error);
        return {
          agentId,
          response: `Error: ${error.message || 'Agent execution failed'}`,
          error: error.message || 'Agent execution failed',
        };
      }
    });

    const steps = await Promise.all(promises);

    // Combine results
    const combinedResult = steps
      .map(s => `${s.agentId}: ${s.response}`)
      .join('\n\n');

    return {
      result: combinedResult,
      steps,
    };
  }

  private async executeWorkflow(input: string): Promise<{
    result: string;
    steps: Array<{ agentId: string; response: string; error?: string }>;
  }> {
    const steps: Array<{ agentId: string; response: string; error?: string }> = [];
    const visited = new Set<string>();

    if (!this.config.workflow || this.config.workflow.length === 0) {
      throw new Error('Workflow configuration is empty. Please define workflow steps.');
    }

    // Validate all workflow steps have valid agents
    for (const step of this.config.workflow) {
      if (!this.agents.has(step.agentId)) {
        throw new Error(`Workflow step ${step.id} references agent ${step.agentId} which is not registered. Available agents: ${Array.from(this.agents.keys()).join(', ')}`);
      }
    }

    // Find starting step (no dependencies)
    const startSteps = this.config.workflow.filter(
      step => !this.config.workflow?.some(s => s.next?.includes(step.id))
    );

    if (startSteps.length === 0) {
      // If no clear start, use first step
      await this.executeStep(this.config.workflow[0].id, input, steps, visited);
    } else {
      for (const startStep of startSteps) {
        await this.executeStep(startStep.id, input, steps, visited);
      }
    }

    if (steps.length === 0) {
      throw new Error('Workflow execution produced no steps. Check workflow configuration and agent assignments.');
    }

    return {
      result: steps[steps.length - 1]?.response || input,
      steps,
    };
  }

  private async executeStep(
    stepId: string,
    input: string,
    steps: Array<{ agentId: string; response: string; error?: string }>,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(stepId)) {
      return;
    }

    visited.add(stepId);
    const step = this.workflow.get(stepId);
    if (!step) {
      console.warn(`Workflow step ${stepId} not found`);
      return;
    }

    // Check condition if present (only if it's a function)
    if (step.condition && typeof step.condition === 'function') {
      try {
        if (!step.condition(this.executionContext)) {
          return;
        }
      } catch (error: any) {
        console.warn(`Condition check failed for step ${stepId}:`, error.message);
        // Continue execution if condition check fails
      }
    }

    const agent = this.agents.get(step.agentId);
    if (!agent) {
      throw new Error(`Agent ${step.agentId} not found in workflow step ${stepId}. Available agents: ${Array.from(this.agents.keys()).join(', ')}`);
    }

    const context: AgentContext = {
      agentId: step.agentId,
      metadata: {
        stepId,
        executionContext: this.executionContext,
      },
    };

    let response;
    try {
      response = await agent.process(input, context);
      steps.push({
        agentId: step.agentId,
        response: response.content,
        error: response.metadata?.finishReason === 'error' ? 'Agent encountered an error' : undefined,
      });
    } catch (error: any) {
      console.error(`Error in workflow step ${stepId} (agent ${step.agentId}):`, error);
      steps.push({
        agentId: step.agentId,
        response: `Error: ${error.message || 'Agent execution failed'}`,
        error: error.message || 'Agent execution failed',
      });
      // Don't continue to next steps if this step failed
      return;
    }

    // Execute next steps
    if (step.next) {
      for (const nextStepId of step.next) {
        await this.executeStep(nextStepId, response.content, steps, visited);
      }
    }
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getConfig(): OrchestrationConfig {
    // Return a copy of the config with current agent IDs
    return {
      ...this.config,
      agents: Array.from(this.agents.keys()),
      workflow: this.config.workflow ? [...this.config.workflow] : undefined,
    };
  }

  updateContext(key: string, value: any): void {
    this.executionContext[key] = value;
  }

  getContext(): Record<string, any> {
    return { ...this.executionContext };
  }
}

