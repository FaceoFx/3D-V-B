import { type ValidationResult, type InsertValidationResult, type Session, type InsertSession } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Validation Results
  createValidationResult(result: InsertValidationResult): Promise<ValidationResult>;
  getValidationResult(id: string): Promise<ValidationResult | undefined>;
  getValidationResults(limit?: number): Promise<ValidationResult[]>;
  updateValidationResult(id: string, updates: Partial<InsertValidationResult>): Promise<ValidationResult | undefined>;
  clearValidationResults(): Promise<void>;
  
  // Sessions
  createSession(): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  updateSessionStats(id: string, stats: Partial<InsertSession>): Promise<Session | undefined>;
  getCurrentSession(): Promise<Session>;
}

export class MemStorage implements IStorage {
  private validationResults: Map<string, ValidationResult>;
  private sessions: Map<string, Session>;
  private currentSessionId: string | null;

  constructor() {
    this.validationResults = new Map();
    this.sessions = new Map();
    this.currentSessionId = null;
  }

  async createValidationResult(insertResult: InsertValidationResult): Promise<ValidationResult> {
    const id = randomUUID();
    const result: ValidationResult = {
      ...insertResult,
      id,
      createdAt: new Date(),
      response: insertResult.response || null,
      gateway: insertResult.gateway || null,
      processingTime: insertResult.processingTime || null,
      cardInfo: insertResult.cardInfo || null,
      fraudScore: insertResult.fraudScore || null,
      riskLevel: insertResult.riskLevel || null,
      apiProvider: insertResult.apiProvider || null,
      validationData: insertResult.validationData || null,
      errorMessage: insertResult.errorMessage || null
    };
    this.validationResults.set(id, result);
    return result;
  }

  async getValidationResult(id: string): Promise<ValidationResult | undefined> {
    return this.validationResults.get(id);
  }

  async getValidationResults(limit = 50): Promise<ValidationResult[]> {
    const results = Array.from(this.validationResults.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
    return results;
  }

  async updateValidationResult(id: string, updates: Partial<InsertValidationResult>): Promise<ValidationResult | undefined> {
    const existing = this.validationResults.get(id);
    if (!existing) return undefined;

    const updated: ValidationResult = {
      ...existing,
      ...updates
    };
    this.validationResults.set(id, updated);
    return updated;
  }

  async clearValidationResults(): Promise<void> {
    this.validationResults.clear();
  }

  async createSession(): Promise<Session> {
    const id = randomUUID();
    const session: Session = {
      id,
      startTime: new Date(),
      totalChecked: 0,
      totalPassed: 0,
      totalFailed: 0,
      avgProcessingTime: 0
    };
    this.sessions.set(id, session);
    this.currentSessionId = id;
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async updateSessionStats(id: string, stats: Partial<InsertSession>): Promise<Session | undefined> {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;

    const updated: Session = {
      ...existing,
      ...stats
    };
    this.sessions.set(id, updated);
    return updated;
  }

  async getCurrentSession(): Promise<Session> {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) return session;
    }
    
    // Create new session if none exists
    return this.createSession();
  }
}

export const storage = new MemStorage();
