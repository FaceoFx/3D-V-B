import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const validationResults = pgTable("validation_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardNumber: text("card_number").notNull(),
  expiryMonth: text("expiry_month").notNull(),
  expiryYear: text("expiry_year").notNull(),
  cvv: text("cvv").notNull(),
  binNumber: text("bin_number").notNull(),
  status: text("status").notNull(), // 'passed', 'failed', 'processing'
  response: text("response"),
  gateway: text("gateway"),
  processingTime: integer("processing_time"), // in seconds
  cardInfo: jsonb("card_info"), // BIN lookup data
  fraudScore: integer("fraud_score"), // 0-100 risk score
  riskLevel: text("risk_level"), // 'low', 'medium', 'high'
  apiProvider: text("api_provider"), // which API was used
  validationData: jsonb("validation_data"), // raw API responses
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startTime: timestamp("start_time").defaultNow(),
  totalChecked: integer("total_checked").default(0),
  totalPassed: integer("total_passed").default(0),
  totalFailed: integer("total_failed").default(0),
  avgProcessingTime: integer("avg_processing_time").default(0)
});

// Validation schemas
export const insertValidationResultSchema = createInsertSchema(validationResults).omit({
  id: true,
  createdAt: true
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  startTime: true
});

// Request/Response schemas
export const cardValidationRequestSchema = z.object({
  cardData: z.string().regex(/^\d{13,19}\|\d{1,2}\|\d{4}\|\d{3,4}$/, "Invalid card format. Use: number|month|year|cvv"),
});

export const binValidationRequestSchema = z.object({
  binNumber: z.string().min(3).max(19).regex(/^\d{3,19}$/, "BIN must be 3-19 digits"),
  cardCount: z.number().min(1).max(100, "Maximum 100 cards allowed")
});

export const batchValidationRequestSchema = z.object({
  cards: z.array(z.string()).min(1).max(100)
});

// Types
export type InsertValidationResult = z.infer<typeof insertValidationResultSchema>;
export type ValidationResult = typeof validationResults.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export type CardValidationRequest = z.infer<typeof cardValidationRequestSchema>;
export type BinValidationRequest = z.infer<typeof binValidationRequestSchema>;
export type BatchValidationRequest = z.infer<typeof batchValidationRequestSchema>;

export interface CardInfo {
  bin: string;
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
  flag: string;
  prepaid?: boolean;
  currency?: string;
  website?: string;
  phone?: string;
  apiStats?: any;
}

export interface ValidationResponse {
  id: string;
  status: 'passed' | 'failed' | 'processing';
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  response?: string;
  gateway?: string;
  processingTime?: number;
  cardInfo?: CardInfo;
  fraudScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  apiProvider?: string;
  validationData?: any;
  errorMessage?: string;
  createdAt: Date;
}
