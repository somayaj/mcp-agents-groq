import { AgentMessage, AgentResponse } from '../types/index.js';

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

export interface GovernanceResult {
  allowed: boolean;
  reason?: string;
  sanitizedInput?: string;
  filteredOutput?: string;
  metadata?: Record<string, any>;
}

export interface UsageStats {
  requestCount: number;
  tokenCount: number;
  lastRequestTime: Date;
  requestsToday: number;
  requestsThisHour: number;
}

export class GovernanceService {
  private config: GovernanceConfig;
  private usageStats: Map<string, UsageStats> = new Map();
  private rateLimitTracker: Map<string, Array<number>> = new Map();

  constructor(config: GovernanceConfig = {}) {
    this.config = {
      maxInputLength: config.maxInputLength ?? 10000,
      maxOutputLength: config.maxOutputLength ?? 50000,
      contentModeration: config.contentModeration ?? true,
      enableSafetyChecks: config.enableSafetyChecks ?? true,
      blockHarmfulContent: config.blockHarmfulContent ?? true,
      enableAuditLog: config.enableAuditLog ?? false,
      blockedKeywords: config.blockedKeywords ?? [
        'hack', 'exploit', 'malware', 'virus', 'phishing',
        'illegal', 'unauthorized', 'breach', 'attack'
      ],
      ...config,
    };
  }

  /**
   * Validate input before processing
   */
  validateInput(input: string, context?: { agentId?: string; userId?: string }): GovernanceResult {
    const agentId = context?.agentId || 'unknown';
    const stats = this.getUsageStats(agentId);

    // Check length
    if (input.length > (this.config.maxInputLength || 10000)) {
      return {
        allowed: false,
        reason: `Input exceeds maximum length of ${this.config.maxInputLength} characters`,
      };
    }

    // Check for empty input
    if (!input || input.trim().length === 0) {
      return {
        allowed: false,
        reason: 'Input cannot be empty',
      };
    }

    // Check blocked patterns
    if (this.config.blockedPatterns) {
      for (const pattern of this.config.blockedPatterns) {
        if (pattern.test(input)) {
          return {
            allowed: false,
            reason: 'Input contains blocked pattern',
          };
        }
      }
    }

    // Check allowed patterns (if specified)
    if (this.config.allowedPatterns && this.config.allowedPatterns.length > 0) {
      const matches = this.config.allowedPatterns.some(pattern => pattern.test(input));
      if (!matches) {
        return {
          allowed: false,
          reason: 'Input does not match allowed patterns',
        };
      }
    }

    // Check rate limiting
    if (this.config.rateLimit) {
      const rateLimitResult = this.checkRateLimit(agentId);
      if (!rateLimitResult.allowed) {
        return rateLimitResult;
      }
    }

    // Sanitize input
    let sanitizedInput = input.trim();
    
    // Remove potentially dangerous characters/patterns
    sanitizedInput = sanitizedInput
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/data:text\/html/gi, ''); // Remove data URIs

    // Update usage stats
    stats.requestCount++;
    stats.lastRequestTime = new Date();
    this.updateHourlyDailyCounts(agentId);

    return {
      allowed: true,
      sanitizedInput,
      metadata: {
        originalLength: input.length,
        sanitizedLength: sanitizedInput.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Filter and validate output
   */
  filterOutput(output: string, context?: { agentId?: string; userId?: string }): GovernanceResult {
    const agentId = context?.agentId || 'unknown';

    // Check length
    if (output.length > (this.config.maxOutputLength || 50000)) {
      return {
        allowed: false,
        reason: `Output exceeds maximum length of ${this.config.maxOutputLength} characters`,
        filteredOutput: output.substring(0, this.config.maxOutputLength) + '... [truncated]',
      };
    }

    // Content moderation
    if (this.config.contentModeration) {
      const moderationResult = this.moderateContent(output);
      if (!moderationResult.allowed) {
        return moderationResult;
      }
    }

    // Safety checks
    if (this.config.enableSafetyChecks && this.config.blockHarmfulContent) {
      const safetyResult = this.checkSafety(output);
      if (!safetyResult.allowed) {
        return safetyResult;
      }
    }

    return {
      allowed: true,
      filteredOutput: output,
      metadata: {
        length: output.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(agentId: string): GovernanceResult {
    if (!this.config.rateLimit) {
      return { allowed: true };
    }

    const now = Date.now();
    const windowMs = this.config.rateLimit.windowMs;
    const maxRequests = this.config.rateLimit.maxRequests;

    // Get or create rate limit tracker
    if (!this.rateLimitTracker.has(agentId)) {
      this.rateLimitTracker.set(agentId, []);
    }

    const requests = this.rateLimitTracker.get(agentId)!;
    
    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${maxRequests} requests per ${windowMs}ms`,
        metadata: {
          recentRequests: recentRequests.length,
          maxRequests,
          windowMs,
        },
      };
    }

    // Add current request
    recentRequests.push(now);
    this.rateLimitTracker.set(agentId, recentRequests);

    return { allowed: true };
  }

  /**
   * Moderate content for inappropriate material
   */
  private moderateContent(content: string): GovernanceResult {
    if (!this.config.blockedKeywords || this.config.blockedKeywords.length === 0) {
      return { allowed: true };
    }

    const lowerContent = content.toLowerCase();
    const foundKeywords: string[] = [];

    for (const keyword of this.config.blockedKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
      }
    }

    if (foundKeywords.length > 0) {
      return {
        allowed: false,
        reason: `Content contains blocked keywords: ${foundKeywords.join(', ')}`,
        metadata: {
          foundKeywords,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Safety checks for harmful content
   */
  private checkSafety(content: string): GovernanceResult {
    // Check for potentially harmful patterns
    const harmfulPatterns = [
      /how to (hack|exploit|break into|steal)/i,
      /illegal (activity|action|method)/i,
      /unauthorized (access|entry)/i,
      /bypass (security|authentication)/i,
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(content)) {
        return {
          allowed: false,
          reason: 'Content contains potentially harmful instructions',
          metadata: {
            pattern: pattern.toString(),
          },
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check token limits
   */
  checkTokenLimit(agentId: string, tokenCount: number): GovernanceResult {
    if (this.config.maxTokensPerRequest && tokenCount > this.config.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Token count ${tokenCount} exceeds maximum of ${this.config.maxTokensPerRequest}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check daily/hourly request limits
   */
  checkRequestLimits(agentId: string): GovernanceResult {
    const stats = this.getUsageStats(agentId);

    if (this.config.maxRequestsPerDay && stats.requestsToday >= this.config.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: `Daily request limit of ${this.config.maxRequestsPerDay} exceeded`,
      };
    }

    if (this.config.maxRequestsPerHour && stats.requestsThisHour >= this.config.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: `Hourly request limit of ${this.config.maxRequestsPerHour} exceeded`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get usage statistics
   */
  getUsageStats(agentId: string): UsageStats {
    if (!this.usageStats.has(agentId)) {
      this.usageStats.set(agentId, {
        requestCount: 0,
        tokenCount: 0,
        lastRequestTime: new Date(),
        requestsToday: 0,
        requestsThisHour: 0,
      });
    }
    return this.usageStats.get(agentId)!;
  }

  /**
   * Update hourly and daily counts
   */
  private updateHourlyDailyCounts(agentId: string): void {
    const stats = this.getUsageStats(agentId);
    const now = new Date();
    const lastRequest = stats.lastRequestTime;

    // Reset daily count if it's a new day
    if (now.toDateString() !== lastRequest.toDateString()) {
      stats.requestsToday = 1;
    } else {
      stats.requestsToday++;
    }

    // Reset hourly count if it's a new hour
    if (now.getHours() !== lastRequest.getHours() || 
        now.toDateString() !== lastRequest.toDateString()) {
      stats.requestsThisHour = 1;
    } else {
      stats.requestsThisHour++;
    }
  }

  /**
   * Audit log entry
   */
  async auditLog(
    action: string,
    details: {
      agentId?: string;
      userId?: string;
      input?: string;
      output?: string;
      success: boolean;
      error?: string;
    }
  ): Promise<void> {
    if (!this.config.enableAuditLog) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };

    // In production, write to file or logging service
    if (this.config.auditLogPath) {
      const fs = await import('fs/promises');
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.config.auditLogPath, logLine, 'utf-8').catch(err => {
        console.error('Failed to write audit log:', err);
      });
    } else {
      // Default: console log
      console.log('[AUDIT]', logEntry);
    }
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(agentId?: string): void {
    if (agentId) {
      this.usageStats.delete(agentId);
      this.rateLimitTracker.delete(agentId);
    } else {
      this.usageStats.clear();
      this.rateLimitTracker.clear();
    }
  }

  /**
   * Get governance configuration
   */
  getConfig(): GovernanceConfig {
    return { ...this.config };
  }

  /**
   * Update governance configuration
   */
  updateConfig(updates: Partial<GovernanceConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

