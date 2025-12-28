import { promises as fs } from 'fs';
import { AgentConfig, MCPServerConfig, OrchestrationConfig } from '../types/index.js';

export interface SavedConfiguration {
  agents: AgentConfig[];
  mcpServers: Array<{ id: string; config: MCPServerConfig }>;
  orchestrators: Array<{ id: string; config: OrchestrationConfig }>;
  workflows: Array<{
    id: string;
    name: string;
    strategy: string;
    agents: string[];
    workflow?: any[];
  }>;
  timestamp: string;
}

export class PersistenceService {
  private configPath: string;

  constructor(configPath: string = './config.json') {
    this.configPath = configPath;
  }

  async save(config: SavedConfiguration): Promise<void> {
    try {
      config.timestamp = new Date().toISOString();
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  async load(): Promise<SavedConfiguration | null> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data) as SavedConfiguration;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist yet
      }
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  async exportToFile(filePath: string, config: SavedConfiguration): Promise<void> {
    try {
      config.timestamp = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to export configuration: ${error.message}`);
    }
  }

  async importFromFile(filePath: string): Promise<SavedConfiguration> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as SavedConfiguration;
    } catch (error: any) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }
}

