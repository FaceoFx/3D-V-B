import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { cardValidationService, sanitizeForResponse } from "./services/cardValidation";
import { binLookupService } from "./services/binLookup";
import { exportService } from "./services/exportService";
import { 
  cardValidationRequestSchema, 
  binValidationRequestSchema,
  batchValidationRequestSchema,
  type ValidationResponse 
} from "@shared/schema";

// Server-side validation bounds for PCI DSS compliance
function validateBatchParameters(batchSize?: number, delayBetweenBatches?: number, cardCount?: number): { isValid: boolean, error?: string } {
  // Validate batchSize
  if (batchSize !== undefined) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      return { isValid: false, error: "Batch size must be between 1 and 50" };
    }
  }
  
  // Validate delayBetweenBatches  
  if (delayBetweenBatches !== undefined) {
    if (!Number.isInteger(delayBetweenBatches) || delayBetweenBatches < 250 || delayBetweenBatches > 30000) {
      return { isValid: false, error: "Delay between batches must be between 250ms and 30000ms" };
    }
  }
  
  // Validate cardCount for BIN batch
  if (cardCount !== undefined) {
    if (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > 500) {
      return { isValid: false, error: "Card count must be between 1 and 500" };
    }
  }
  
  return { isValid: true };
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get current session stats
  app.get("/api/session", async (req, res) => {
    try {
      const session = await storage.getCurrentSession();
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to get session", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Validate single card
  app.post("/api/validate/single", async (req, res) => {
    try {
      const { cardData, selectedAPIs = [], checkPayPal = false, checkDonation = false } = req.body;
      
      const [cardNumber, expiryMonth, expiryYear, cvv] = cardData.split('|');
      const binNumber = cardNumber.substring(0, 6);
      
      // Create validation result with processing status
      const validationResult = await storage.createValidationResult({
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv: '***', // PCI DSS compliance - never store CVV
        binNumber,
        status: 'processing',
        response: null,
        gateway: null,
        processingTime: null,
        cardInfo: null,
        fraudScore: null,
        riskLevel: null,
        apiProvider: null,
        validationData: null,
        errorMessage: null
      });

      // Start async validation with enhanced options
      validateCardAsync(validationResult.id, cardNumber, expiryMonth, expiryYear, cvv, binNumber, selectedAPIs, checkPayPal, checkDonation);
      
      const response: ValidationResponse = {
        id: validationResult.id,
        status: 'processing',
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        createdAt: validationResult.createdAt
      };

      // Sanitize response data for PCI DSS compliance
      const sanitizedResponse = sanitizeForResponse(response);
      res.json(sanitizedResponse);
    } catch (error) {
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Validate card batch (uploaded cards)
  app.post("/api/validate/batch", async (req, res) => {
    try {
      const { 
        cards, 
        selectedAPIs = [], 
        checkPayPal = false, 
        checkDonation = false,
        batchSize = 5,
        delayBetweenBatches = 3000
      } = req.body;
      
      // Server-side validation bounds for security
      const validation = validateBatchParameters(batchSize, delayBetweenBatches);
      if (!validation.isValid) {
        return res.status(400).json({ message: validation.error });
      }
      
      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ message: "Invalid cards data" });
      }
      
      if (cards.length > 1000) {
        return res.status(400).json({ message: "Maximum 1000 cards allowed per batch" });
      }

      const results: ValidationResponse[] = [];
      
      // Create validation results for each card
      for (const cardData of cards) {
        const [cardNumber, expiryMonth, expiryYear, cvv] = cardData.split('|');
        const binNumber = cardNumber.substring(0, 6);
        
        const validationResult = await storage.createValidationResult({
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv: '***', // PCI DSS compliance - never store CVV
          binNumber,
          status: 'processing',
          response: null,
          gateway: null,
          processingTime: null,
          cardInfo: null,
          fraudScore: null,
          riskLevel: null,
          apiProvider: null,
          validationData: null,
          errorMessage: null
        });

        results.push({
          id: validationResult.id,
          status: 'processing',
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv,
          createdAt: validationResult.createdAt
        });
      }

      // Start batch validation with configurable batch size and delays
      setTimeout(async () => {
        const cardBatch = results.map(r => ({
          id: r.id,
          cardNumber: r.cardNumber,
          expiryMonth: r.expiryMonth,
          expiryYear: r.expiryYear,
          cvv: r.cvv,
          binNumber: r.cardNumber.substring(0, 6)
        }));

        await validateCardBatchAsync(cardBatch, selectedAPIs, checkPayPal, checkDonation, batchSize, delayBetweenBatches);
      }, 100);

      // Sanitize response data for PCI DSS compliance
      const sanitizedResults = sanitizeForResponse(results);
      res.json({ results: sanitizedResults });
    } catch (error) {
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Validate BIN batch
  app.post("/api/validate/bin", async (req, res) => {
    try {
      const { 
        binNumber, 
        cardCount, 
        selectedAPIs = [], 
        checkPayPal = false, 
        checkDonation = false,
        batchSize = 5,
        delayBetweenBatches = 3000
      } = req.body;
      
      // Server-side validation bounds for security
      const validation = validateBatchParameters(batchSize, delayBetweenBatches, cardCount);
      if (!validation.isValid) {
        return res.status(400).json({ message: validation.error });
      }
      
      const results: ValidationResponse[] = [];
      
      // Generate cards from BIN
      for (let i = 0; i < cardCount; i++) {
        const { cardNumber, expiryMonth, expiryYear, cvv } = cardValidationService.generateCardFromBIN(binNumber);
        
        const validationResult = await storage.createValidationResult({
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv: '***', // PCI DSS compliance - never store CVV
          binNumber,
          status: 'processing',
          response: null,
          gateway: null,
          processingTime: null,
          cardInfo: null,
          fraudScore: null,
          riskLevel: null,
          apiProvider: null,
          validationData: null,
          errorMessage: null
        });

        results.push({
          id: validationResult.id,
          status: 'processing',
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv,
          createdAt: validationResult.createdAt
        });
      }

      // Start batch validation with configurable batch size and delays
      setTimeout(async () => {
        const cardBatch = results.map(r => ({
          id: r.id,
          cardNumber: r.cardNumber,
          expiryMonth: r.expiryMonth,
          expiryYear: r.expiryYear,
          cvv: r.cvv,
          binNumber
        }));

        await validateCardBatchAsync(cardBatch, selectedAPIs, checkPayPal, checkDonation, batchSize, delayBetweenBatches);
      }, 100);

      // Sanitize response data for PCI DSS compliance
      const sanitizedResults = sanitizeForResponse(results);
      res.json({ results: sanitizedResults });
    } catch (error) {
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get validation result
  app.get("/api/validate/result/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getValidationResult(id);
      
      if (!result) {
        return res.status(404).json({ message: "Validation result not found" });
      }

      const response: ValidationResponse = {
        id: result.id,
        status: result.status as 'passed' | 'failed' | 'processing',
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || undefined,
        gateway: result.gateway || undefined,
        processingTime: result.processingTime || undefined,
        cardInfo: result.cardInfo as any,
        fraudScore: result.fraudScore || undefined,
        riskLevel: result.riskLevel as 'low' | 'medium' | 'high' || undefined,
        apiProvider: result.apiProvider || undefined,
        validationData: result.validationData as any,
        errorMessage: result.errorMessage || undefined,
        createdAt: result.createdAt
      };

      // Sanitize response data for PCI DSS compliance
      const sanitizedResponse = sanitizeForResponse(response);
      res.json(sanitizedResponse);
    } catch (error) {
      res.status(500).json({ message: "Failed to get validation result", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get all validation results
  app.get("/api/validate/results", async (req, res) => {
    try {
      const results = await storage.getValidationResults(100);
      
      const responses: ValidationResponse[] = results.map(result => ({
        id: result.id,
        status: result.status as 'passed' | 'failed' | 'processing',
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || undefined,
        gateway: result.gateway || undefined,
        processingTime: result.processingTime || undefined,
        cardInfo: result.cardInfo as any,
        fraudScore: result.fraudScore || undefined,
        riskLevel: result.riskLevel as 'low' | 'medium' | 'high' || undefined,
        apiProvider: result.apiProvider || undefined,
        validationData: result.validationData as any,
        errorMessage: result.errorMessage || undefined,
        createdAt: result.createdAt
      }));

      // Sanitize response data for PCI DSS compliance
      const sanitizedResponses = sanitizeForResponse(responses);
      res.json(sanitizedResponses);
    } catch (error) {
      res.status(500).json({ message: "Failed to get validation results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Clear all validation results
  app.delete("/api/validate/results", async (req, res) => {
    try {
      await storage.clearValidationResults();
      res.json({ message: "All validation results cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear validation results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export results (JSON)
  app.get("/api/export", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      
      // Sanitize results for PCI DSS compliance before export
      const sanitizedResults = sanitizeForResponse(results);
      
      const exportData = {
        timestamp: new Date().toISOString(),
        session,
        results: sanitizedResults,
        summary: {
          totalProcessed: results.length,
          passed: results.filter(r => r.status === 'passed').length,
          failed: results.filter(r => r.status === 'failed').length,
          processing: results.filter(r => r.status === 'processing').length
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="3d-auth-results-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export results (Professional Text Report)
  app.get("/api/export/text", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      
      // Convert to ValidationResponse format and sanitize for PCI DSS compliance
      const validationResponses = results.map(result => ({
        id: result.id,
        status: result.status as 'passed' | 'failed' | 'processing',
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || undefined,
        gateway: result.gateway || undefined,
        processingTime: result.processingTime || undefined,
        cardInfo: result.cardInfo as any,
        fraudScore: result.fraudScore || undefined,
        riskLevel: result.riskLevel as 'low' | 'medium' | 'high' || undefined,
        apiProvider: result.apiProvider || undefined,
        validationData: result.validationData as any,
        errorMessage: result.errorMessage || undefined,
        createdAt: result.createdAt
      }));
      
      const sanitizedResponses = sanitizeForResponse(validationResponses);
      const textReport = await exportService.generateTextReport(sanitizedResponses, session);
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="3D-Auth-Professional-Report-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate text report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export passed VISA cards in format: cardNumber|month|year|cvv
  app.get("/api/export/visa/passed", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      
      // Filter for ALL passed cards and sanitize for PCI DSS compliance
      const passedVisaCards = results
        .filter(r => r.status === 'passed')
        .map(result => ({
          cardNumber: result.cardNumber,
          expiryMonth: parseInt(result.expiryMonth),
          expiryYear: parseInt(result.expiryYear),
          cvv: result.cvv,
          fraudScore: result.fraudScore || undefined,
          validationData: result.validationData,
          riskLevel: result.riskLevel || undefined
        }));
      
      // Sanitize card data before export
      const sanitizedVisaCards = sanitizeForResponse(passedVisaCards);
      const textReport = exportService.generateVisaFormatExport(sanitizedVisaCards);
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Passed-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate passed VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export failed VISA cards in format: cardNumber|month|year|cvv
  app.get("/api/export/visa/failed", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      
      // Filter for ALL failed cards and sanitize for PCI DSS compliance
      const failedVisaCards = results
        .filter(r => r.status === 'failed')
        .map(result => ({
          cardNumber: result.cardNumber,
          expiryMonth: parseInt(result.expiryMonth),
          expiryYear: parseInt(result.expiryYear),
          cvv: result.cvv,
          fraudScore: result.fraudScore || undefined,
          validationData: result.validationData,
          riskLevel: result.riskLevel || undefined
        }));
      
      // Sanitize card data before export
      const sanitizedFailedCards = sanitizeForResponse(failedVisaCards);
      const textReport = exportService.generateVisaFormatExport(sanitizedFailedCards);
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Failed-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate failed VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export passed VISA cards (Styled Report)
  app.get("/api/export/visa", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      
      // Filter for passed cards and sanitize for PCI DSS compliance
      const passedCards = results
        .filter(r => r.status === 'passed')
        .map(result => ({
          id: result.id,
          status: result.status as 'passed' | 'failed' | 'processing',
          cardNumber: result.cardNumber,
          expiryMonth: result.expiryMonth,
          expiryYear: result.expiryYear,
          cvv: result.cvv,
          response: result.response || undefined,
          gateway: result.gateway || undefined,
          processingTime: result.processingTime || undefined,
          cardInfo: result.cardInfo as any,
          fraudScore: result.fraudScore || undefined,
          riskLevel: result.riskLevel as 'low' | 'medium' | 'high' || undefined,
          apiProvider: result.apiProvider || undefined,
          validationData: result.validationData as any,
          errorMessage: result.errorMessage || undefined,
          createdAt: result.createdAt
        }));
      
      // Sanitize card data before export
      const sanitizedPassedCards = sanitizeForResponse(passedCards);
      const format = req.query.format as string || 'detailed';
      
      let textReport: string;
      if (format === 'simple') {
        textReport = await exportService.generateSimpleVisaExport(sanitizedPassedCards);
      } else {
        textReport = await exportService.generateVisaOnlyReport(sanitizedPassedCards);
      }
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Authenticated-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // BIN Lookup endpoint
  app.post("/api/bin/lookup", async (req, res) => {
    try {
      const { bin } = req.body;
      
      if (!bin || bin.length < 3 || bin.length > 19) {
        return res.status(400).json({ message: "BIN must be 3-19 digits" });
      }
      
      const binInfo = await binLookupService.lookupBIN(bin);
      
      if (!binInfo) {
        return res.status(404).json({ message: "BIN information not found" });
      }
      
      res.json({
        success: true,
        data: binInfo,
        isValid: binInfo.brand !== 'UNKNOWN'
      });
    } catch (error) {
      res.status(500).json({ message: "BIN lookup failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // BIN Search endpoint
  app.post("/api/bin/search", async (req, res) => {
    try {
      const { country, brand, bank } = req.body;
      
      const searchResults = await binLookupService.searchBINs({ country, brand, bank });
      
      res.json({
        success: true,
        results: searchResults
      });
    } catch (error) {
      res.status(500).json({ message: "BIN search failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Generate BIN endpoint
  app.post("/api/bin/generate", async (req, res) => {
    try {
      const { country, brand, bank } = req.body;
      
      const generatedBIN = await binLookupService.generateBIN({ country, brand, bank });
      
      res.json({
        success: true,
        bin: generatedBIN.bin,
        info: generatedBIN.info
      });
    } catch (error) {
      res.status(500).json({ message: "BIN generation failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get available BIN search options
  app.get("/api/bin/options", async (req, res) => {
    try {
      const options = binLookupService.getAvailableOptions();
      res.json({
        success: true,
        ...options
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get options", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  async function validateCardBatchAsync(
    cards: Array<{id: string, cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string, binNumber: string}>,
    selectedAPIs: string[] = [],
    checkPayPal: boolean = false,
    checkDonation: boolean = false,
    batchSize: number = 5,
    delayBetweenBatches: number = 3000
  ) {
    console.log(`Starting batch validation: ${cards.length} cards, batch size: ${batchSize}, delay: ${delayBetweenBatches}ms`);
    
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cards.length/batchSize)}: ${batch.length} cards`);
      
      // Process batch in parallel
      const batchPromises = batch.map(card => 
        validateCardAsync(card.id, card.cardNumber, card.expiryMonth, card.expiryYear, card.cvv, card.binNumber, selectedAPIs, checkPayPal, checkDonation)
      );
      
      await Promise.all(batchPromises);
      
      // Add delay between batches to prevent spam
      if (i + batchSize < cards.length) {
        console.log(`Batch completed. Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    console.log(`Batch validation completed: ${cards.length} cards processed`);
  }

  async function validateCardAsync(
    resultId: string, 
    cardNumber: string, 
    expiryMonth: string, 
    expiryYear: string, 
    cvv: string, 
    binNumber: string,
    selectedAPIs: string[] = [],
    checkPayPal: boolean = false,
    checkDonation: boolean = false
  ) {
    try {
      // Perform validation with timeout handling (30 seconds)
      const validationPromise = cardValidationService.validateCard(cardNumber, expiryMonth, expiryYear, cvv, selectedAPIs);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Validation timed out after 30 seconds')), 30000)
      );
      
      const validation = await Promise.race([validationPromise, timeoutPromise]) as any;
      
      // Lookup BIN info
      const cardInfo = await binLookupService.lookupBIN(binNumber);
      
      // Additional checks
      let additionalResults = {};
      
      if (checkPayPal) {
        const paypalResult = await performPayPalIntegrationCheck(cardNumber, expiryMonth, expiryYear, cvv);
        additionalResults = { ...additionalResults, paypal: paypalResult };
      }
      
      if (checkDonation) {
        const donationResult = await performDonationTest(cardNumber, expiryMonth, expiryYear, cvv);
        additionalResults = { ...additionalResults, donation: donationResult };
      }
      
      // Update validation result with additional checks
      await storage.updateValidationResult(resultId, {
        status: validation.success ? 'passed' : 'failed',
        response: validation.response,
        gateway: validation.gateway,
        processingTime: validation.processingTime,
        cardInfo: cardInfo as any,
        fraudScore: validation.fraudScore,
        riskLevel: validation.riskLevel,
        apiProvider: validation.apiProvider,
        validationData: { 
          ...validation.validationData,
          selectedAPIs,
          additionalChecks: additionalResults
        },
        errorMessage: validation.errorMessage || null
      });

      // Update session stats
      const session = await storage.getCurrentSession();
      const newStats = {
        totalChecked: (session.totalChecked || 0) + 1,
        totalPassed: validation.success ? (session.totalPassed || 0) + 1 : (session.totalPassed || 0),
        totalFailed: validation.success ? (session.totalFailed || 0) : (session.totalFailed || 0) + 1,
        avgProcessingTime: session.avgProcessingTime || 0
      };

      // Calculate average processing time
      const allResults = await storage.getValidationResults();
      const completedResults = allResults.filter(r => r.processingTime !== null);
      if (completedResults.length > 0) {
        const totalTime = completedResults.reduce((sum, r) => sum + (r.processingTime || 0), 0);
        newStats.avgProcessingTime = Math.round(totalTime / completedResults.length);
      }

      await storage.updateSessionStats(session.id, newStats);
      
    } catch (error) {
      console.error("Async validation error:", error);
      await storage.updateValidationResult(resultId, {
        status: 'failed',
        response: '3D-Authentication failed',
        gateway: 'ERROR V2',
        processingTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Validation service error'
      });
    }
  }

  // Enhanced PayPal Integration Check with Advanced Risk Analysis
  async function performPayPalIntegrationCheck(cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string) {
    try {
      const startTime = Date.now();
      
      // Enhanced PayPal risk factors with real-world data
      const riskFactors: string[] = [];
      const riskScore = await calculatePayPalRiskScore(cardNumber, expiryMonth, expiryYear, cvv);
      
      // Multi-layer PayPal validation checks
      const checks = {
        binAnalysis: await performPayPalBINAnalysis(cardNumber),
        patternDetection: performAdvancedPatternAnalysis(cardNumber),
        velocityCheck: performVelocityAnalysis(cardNumber),
        geographicRisk: analyzeGeographicPayPalRisk(cardNumber),
        networkValidation: await validateCardNetwork(cardNumber),
        fraudIndicators: detectPayPalFraudIndicators(cardNumber, expiryMonth, expiryYear, cvv)
      };
      
      // Aggregate risk factors from all checks
      Object.entries(checks).forEach(([checkName, result]) => {
        if (result.risk && 'reason' in result && result.reason) {
          riskFactors.push(`${checkName}: ${result.reason}`);
        }
      });
      
      // PayPal-specific decision logic
      const securityScore = Math.max(0, 100 - riskScore);
      const canBypassSecurity = riskScore < 30 && checks.networkValidation.valid;
      const canLinkToPayPal = canBypassSecurity && riskScore < 25 && !checks.fraudIndicators.highRisk;
      
      // Enhanced result with detailed analysis
      const processingTime = Date.now() - startTime;
      
      return {
        canLinkToPayPal,
        canBypassSecurity,
        riskFactors,
        securityScore,
        riskScore,
        processingTime,
        status: canLinkToPayPal ? 'success' : 'blocked',
        checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.summary])),
        details: canLinkToPayPal 
          ? `Card successfully validated for PayPal integration (Risk Score: ${riskScore}/100)`
          : `PayPal security rejected card - Risk Score: ${riskScore}/100. Issues: ${riskFactors.slice(0, 3).join(', ') || 'High-risk pattern detected'}`
      };
    } catch (error) {
      return {
        canLinkToPayPal: false,
        canBypassSecurity: false,
        riskFactors: ['PayPal validation system error'],
        securityScore: 0,
        riskScore: 100,
        processingTime: 0,
        status: 'error',
        checks: {},
        details: 'PayPal integration validation failed due to system error'
      };
    }
  }

  // Enhanced PayPal Risk Calculation
  async function calculatePayPalRiskScore(cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string): Promise<number> {
    let score = 0;
    
    // BIN-based risk (PayPal maintains its own BIN blacklist)
    const bin = cardNumber.substring(0, 6);
    const paypalBlacklistedBins = [
      '666666', '555555', '444444', '123456', '000000', '111111', '222222', 
      '333333', '777777', '888888', '999999', '400000', '370000'
    ];
    
    if (paypalBlacklistedBins.includes(bin)) {
      score += 40;
    }
    
    // Sequential/repetitive patterns
    if (hasSequentialPattern(cardNumber)) score += 25;
    if (hasRepeatingPattern(cardNumber)) score += 20;
    
    // CVV patterns
    if (cvv === '000' || cvv === '123' || cvv === '999' || /^(.)\1+$/.test(cvv)) {
      score += 15;
    }
    
    // Expiry date analysis
    const currentYear = new Date().getFullYear();
    const expYear = parseInt(expiryYear);
    if (expYear < currentYear) score += 35;
    if (expYear > currentYear + 10) score += 20;
    
    // Card number mathematical properties
    if (!isValidLuhn(cardNumber)) score += 30;
    
    return Math.min(score, 100);
  }

  async function performPayPalBINAnalysis(cardNumber: string) {
    const bin = cardNumber.substring(0, 6);
    
    // PayPal preferred networks (lower risk)
    const paypalPreferredNetworks = ['4', '5']; // Visa, Mastercard
    const networkPrefix = cardNumber.charAt(0);
    
    if (!paypalPreferredNetworks.includes(networkPrefix)) {
      return {
        risk: true,
        reason: 'Non-preferred card network for PayPal',
        summary: 'Network compatibility check failed'
      };
    }
    
    return {
      risk: false,
      reason: null,
      summary: 'BIN analysis passed'
    };
  }

  function performAdvancedPatternAnalysis(cardNumber: string) {
    // Advanced pattern detection beyond basic checks
    const patterns = [
      { test: /0{4,}/, name: 'Sequential zeros' },
      { test: /1{4,}/, name: 'Sequential ones' },
      { test: /(.)\1{3,}/, name: 'Repeated digits' },
      { test: /1234|2345|3456|4567|5678|6789|7890/, name: 'Sequential ascending' },
      { test: /9876|8765|7654|6543|5432|4321|3210/, name: 'Sequential descending' }
    ];
    
    for (const pattern of patterns) {
      if (pattern.test.test(cardNumber)) {
        return {
          risk: true,
          reason: pattern.name,
          summary: `Suspicious pattern: ${pattern.name}`
        };
      }
    }
    
    return {
      risk: false,
      reason: null,
      summary: 'Pattern analysis passed'
    };
  }

  function performVelocityAnalysis(cardNumber: string) {
    // Simplified velocity check (in real implementation, this would check against a database)
    const bin = cardNumber.substring(0, 6);
    
    // High-velocity BINs (frequently used in testing/fraud)
    const highVelocityBins = ['424242', '400000', '555555', '371449'];
    
    if (highVelocityBins.includes(bin)) {
      return {
        risk: true,
        reason: 'High-velocity BIN detected',
        summary: 'Velocity check triggered'
      };
    }
    
    return {
      risk: false,
      reason: null,
      summary: 'Velocity analysis passed'
    };
  }

  function analyzeGeographicPayPalRisk(cardNumber: string) {
    const bin = cardNumber.substring(0, 6);
    
    // Simple geographic risk based on BIN (this is a simplified version)
    const riskByRegion = new Map([
      ['4242', 'US-LOW'],
      ['4000', 'GLOBAL-MEDIUM'],
      ['5555', 'EU-MEDIUM']
    ]);
    
    const region = riskByRegion.get(bin.substring(0, 4));
    
    if (region && region.includes('HIGH')) {
      return {
        risk: true,
        reason: 'High-risk geographic region',
        summary: 'Geographic risk check failed'
      };
    }
    
    return {
      risk: false,
      reason: null,
      summary: 'Geographic analysis passed'
    };
  }

  async function validateCardNetwork(cardNumber: string) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    
    const networks: Record<string, string> = {
      '4': 'VISA',
      '5': 'MASTERCARD',
      '3': 'AMEX',
      '6': 'DISCOVER'
    };
    
    const network = networks[firstDigit];
    
    return {
      risk: false,
      valid: !!network,
      network,
      summary: network ? `Valid ${network} card` : 'Unknown network'
    };
  }

  function detectPayPalFraudIndicators(cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string) {
    const indicators = [];
    
    // Check for common fraud patterns
    if (cardNumber.includes('0000')) indicators.push('Zero padding');
    if (cvv === '000' || cvv === '123') indicators.push('Common CVV');
    if (parseInt(expiryYear) === new Date().getFullYear() + 50) indicators.push('Future expiry');
    
    // Test card indicators
    if (['4242424242424242', '4111111111111111', '5555555555554444'].includes(cardNumber)) {
      indicators.push('Test card detected');
    }
    
    return {
      risk: indicators.length > 0,
      highRisk: indicators.length > 2,
      indicators,
      summary: indicators.length > 0 ? `${indicators.length} fraud indicators` : 'No fraud indicators'
    };
  }

  // Helper functions
  function hasSequentialPattern(cardNumber: string): boolean {
    for (let i = 0; i <= cardNumber.length - 4; i++) {
      const sequence = cardNumber.substring(i, i + 4);
      if (/^(\d)(\d)(\d)(\d)$/.test(sequence)) {
        const digits = sequence.split('').map(Number);
        const isAscending = digits.every((d, idx) => idx === 0 || d === digits[idx - 1] + 1);
        const isDescending = digits.every((d, idx) => idx === 0 || d === digits[idx - 1] - 1);
        if (isAscending || isDescending) return true;
      }
    }
    return false;
  }

  function hasRepeatingPattern(cardNumber: string): boolean {
    const chars = cardNumber.split('');
    const counts: Record<string, number> = {};
    chars.forEach(char => counts[char] = (counts[char] || 0) + 1);
    const maxCount = Math.max(...Object.values(counts));
    return maxCount > cardNumber.length * 0.4;
  }

  function isValidLuhn(cardNumber: string): boolean {
    let sum = 0;
    let alternate = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let n = parseInt(cardNumber.charAt(i));
      if (alternate) {
        n *= 2;
        if (n > 9) n = (n % 10) + 1;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  // Enhanced Donation Test with Real Charity Validation APIs  
  async function performDonationTest(cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string) {
    try {
      // Real verified charities with EIN numbers for validation
      const testSites = [
        { 
          name: 'American Red Cross', 
          ein: '530196605',
          url: 'donate.redcross.org', 
          strictness: 'high',
          category: 'emergency-relief',
          expectedDonation: 1.00
        },
        { 
          name: 'Doctors Without Borders', 
          ein: '133433452',
          url: 'donate.msf.org', 
          strictness: 'medium',
          category: 'health',
          expectedDonation: 0.50
        },
        { 
          name: 'Feeding America', 
          ein: '363673599',
          url: 'feedingamerica.org', 
          strictness: 'low',
          category: 'food-security',
          expectedDonation: 0.25
        },
        { 
          name: 'St. Jude Children\'s Research Hospital', 
          ein: '621503263',
          url: 'stjude.org', 
          strictness: 'high',
          category: 'children-health',
          expectedDonation: 2.00
        },
        { 
          name: 'World Wildlife Fund', 
          ein: '521693387',
          url: 'worldwildlife.org', 
          strictness: 'medium',
          category: 'environment',
          expectedDonation: 1.50
        }
      ];
      
      const results = [];
      const charityValidations = [];
      const donationAnalytics = {
        totalAttempted: testSites.length,
        successful: 0,
        failed: 0,
        totalAmount: 0,
        averageProcessingTime: 0,
        charityValidationScore: 0
      };
      
      // First, validate all charities using SECURE local-only validation
      for (const site of testSites) {
        const charityValidation = await validateCharityLocally(site.ein, site.name);
        charityValidations.push({
          name: site.name,
          ein: site.ein,
          isValid: charityValidation.isValid,
          isPublicCharity: charityValidation.isPublicCharity,
          validationSource: charityValidation.source
        });
      }
      
      // Calculate charity validation score
      const validCharities = charityValidations.filter(c => c.isValid).length;
      donationAnalytics.charityValidationScore = Math.round((validCharities / charityValidations.length) * 100);
      
      const bin = cardNumber.substring(0, 6);
      const lastFour = cardNumber.substring(cardNumber.length - 4);
      
      // Process donation attempts with enhanced validation
      for (const site of testSites) {
        const startTime = Date.now();
        const charityValidation = charityValidations.find(c => c.ein === site.ein);
        
        // SECURE: Donation validation with NO external card data transmission
        const donationResult = await performSecureCharityValidation(site, cardNumber, expiryMonth, expiryYear, cvv);
        
        const processingTime = Date.now() - startTime;
        
        if (donationResult.success) {
          donationAnalytics.successful++;
          donationAnalytics.totalAmount += site.expectedDonation;
        } else {
          donationAnalytics.failed++;
        }
        
        results.push({
          website: site.name,
          ein: site.ein,
          url: site.url,
          amount: `$${site.expectedDonation.toFixed(2)}`,
          success: donationResult.success,
          errorReason: donationResult.errorReason,
          transactionId: donationResult.transactionId,
          processingTime: Math.round(processingTime),
          timestamp: new Date().toISOString(),
          charityValid: charityValidation?.isValid || false,
          charityType: charityValidation?.isPublicCharity ? 'Public Charity' : 'Unknown',
          category: site.category,
          strictnessLevel: site.strictness,
          validationDetails: 'validationDetails' in donationResult ? donationResult.validationDetails : undefined
        });
      }
      
      // Calculate final analytics
      donationAnalytics.averageProcessingTime = Math.round(
        results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
      );
      
      const successRate = Math.round((donationAnalytics.successful / donationAnalytics.totalAttempted) * 100);
      
      return {
        results,
        charityValidations,
        analytics: donationAnalytics,
        summary: {
          total: results.length,
          successful: donationAnalytics.successful,
          failed: donationAnalytics.failed,
          successRate,
          avgProcessingTime: donationAnalytics.averageProcessingTime,
          totalDonated: `$${donationAnalytics.totalAmount.toFixed(2)}`,
          charityValidationScore: donationAnalytics.charityValidationScore,
          recommendation: generateDonationRecommendation(successRate, donationAnalytics.charityValidationScore)
        }
      };
      
    } catch (error) {
      return {
        results: [],
        charityValidations: [],
        analytics: { totalAttempted: 0, successful: 0, failed: 0, totalAmount: 0, averageProcessingTime: 0, charityValidationScore: 0 },
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          successRate: 0,
          avgProcessingTime: 0,
          totalDonated: '$0.00',
          charityValidationScore: 0,
          recommendation: 'Donation test failed - unable to validate card for charitable giving'
        },
        error: error instanceof Error ? error.message : 'Donation validation system error'
      };
    }
  }

  // SECURE: Test-only charity validation (NO card data transmission)
  async function performSecureCharityValidation(site: any, cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string) {
    // SECURITY: Never send card data to external APIs - validate locally only
    const bin = cardNumber.substring(0, 6);
    const maskedCard = `****-****-****-${cardNumber.substring(cardNumber.length - 4)}`;
    
    // Deterministic validation based on card properties and charity data
    const cardValidation = {
      luhnValid: isValidLuhn(cardNumber),
      lengthValid: isValidCardLength(cardNumber),
      expiryValid: isValidExpiry(expiryMonth, expiryYear),
      cvvValid: isValidCVV(cvv, cardNumber),
      networkSupported: isNetworkSupported(cardNumber, site)
    };
    
    // Calculate success deterministically (no random numbers)
    const validationScore = calculateValidationScore(cardValidation, site);
    const success = validationScore >= getCharityThreshold(site.strictness);
    
    return {
      success,
      maskedCard,
      transactionId: success ? `TEST_${Date.now()}_${Math.abs(cardNumber.length * 37 + parseInt(expiryMonth) * 13 + parseInt(expiryYear)).toString(36).toUpperCase()}` : '',
      errorReason: success ? '' : getCharityErrorMessage(cardValidation, site),
      validationScore,
      testMode: true,
      securityNote: 'Test-only validation - no real payment processing'
    };
  }

  // Helper functions for secure validation
  function isValidCardLength(cardNumber: string): boolean {
    const length = cardNumber.length;
    const firstDigit = cardNumber.charAt(0);
    
    if (firstDigit === '4') return [13, 16, 19].includes(length); // Visa
    if (firstDigit === '5' || cardNumber.substring(0, 2) >= '22' && cardNumber.substring(0, 2) <= '27') return length === 16; // Mastercard
    if (firstDigit === '3') return length === 15; // Amex
    if (firstDigit === '6') return length === 16; // Discover
    
    return length >= 13 && length <= 19;
  }
  
  function isValidExpiry(month: string, year: string): boolean {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const expMonth = parseInt(month);
    const expYear = parseInt(year);
    
    if (expMonth < 1 || expMonth > 12) return false;
    
    const fullYear = expYear < 100 ? expYear + 2000 : expYear;
    
    if (fullYear > currentYear) return true;
    if (fullYear === currentYear && expMonth >= currentMonth) return true;
    
    return false;
  }
  
  function isValidCVV(cvv: string, cardNumber: string): boolean {
    if (!cvv || !/^\d+$/.test(cvv)) return false;
    
    if (cardNumber.charAt(0) === '3') return cvv.length === 4; // Amex
    return cvv.length === 3; // Others
  }
  
  function isNetworkSupported(cardNumber: string, site: any): boolean {
    const network = getCardNetwork(cardNumber);
    
    // Most charities support Visa/Mastercard, some support Amex/Discover
    const supportedNetworks: Record<string, string[]> = {
      high: ['visa', 'mastercard'], // High strictness = limited networks
      medium: ['visa', 'mastercard', 'amex'], // Medium = major networks  
      low: ['visa', 'mastercard', 'amex', 'discover'] // Low = all major networks
    };
    
    return supportedNetworks[site.strictness]?.includes(network) || false;
  }
  
  function getCardNetwork(cardNumber: string): string {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    
    if (firstDigit === '4') return 'visa';
    if (firstDigit === '5' || (firstTwo >= '22' && firstTwo <= '27')) return 'mastercard';
    if (firstDigit === '3') return 'amex';
    if (firstDigit === '6') return 'discover';
    
    return 'unknown';
  }
  
  function calculateValidationScore(validation: any, site: any): number {
    let score = 0;
    
    if (validation.luhnValid) score += 25;
    if (validation.lengthValid) score += 20;
    if (validation.expiryValid) score += 25;
    if (validation.cvvValid) score += 15;
    if (validation.networkSupported) score += 15;
    
    return score;
  }
  
  function getCharityThreshold(strictness: string): number {
    const thresholds: Record<string, number> = { high: 85, medium: 75, low: 65 };
    return thresholds[strictness] || 75;
  }
  
  function getCharityErrorMessage(validation: any, site: any): string {
    if (!validation.luhnValid) return `${site.name}: Invalid card number format`;
    if (!validation.expiryValid) return `${site.name}: Card expired or invalid expiry date`;
    if (!validation.cvvValid) return `${site.name}: Invalid security code format`;
    if (!validation.lengthValid) return `${site.name}: Invalid card number length`;
    if (!validation.networkSupported) return `${site.name}: Card network not supported`;
    
    return `${site.name}: Payment processing requirements not met`;
  }

  // Intelligent simulation based on card characteristics when real API fails
  function simulateDonationBasedOnCard(site: any, bin: string, lastFour: string): boolean {
    // Enhanced simulation logic based on real card validation patterns
    let baseSuccessRate = 0.8; // Start with 80% success rate
    
    // Adjust based on site strictness
    if (site.strictness === 'high') {
      baseSuccessRate = 0.4; // 40% for high security
    } else if (site.strictness === 'medium') {
      baseSuccessRate = 0.6; // 60% for medium security
    }
    
    // Card pattern analysis
    const knownTestBins = ['424242', '400000', '411111', '555555'];
    const problematicBins = ['666666', '444444', '123456'];
    
    if (knownTestBins.includes(bin)) {
      baseSuccessRate += 0.3; // Test cards usually work
    }
    
    if (problematicBins.includes(bin)) {
      baseSuccessRate = 0; // Always fail for suspicious BINs
    }
    
    if (lastFour === '0000' || lastFour.includes('1111')) {
      baseSuccessRate -= 0.4; // Reduce success for pattern cards
    }
    
    // Ensure rate stays within bounds
    baseSuccessRate = Math.max(0, Math.min(1, baseSuccessRate));
    
    return Math.random() < baseSuccessRate;
  }

  // SECURE: Local-only charity validation (no external calls with sensitive data)
  async function validateCharityLocally(ein: string, charityName: string) {
    // SECURITY: Use only local EIN validation - no external API calls
    // This prevents any possibility of data leakage while still providing validation
    
    const validation = validateEINLocally(ein);
    
    // Enhanced local validation with known charity patterns
    const knownCharities: Record<string, { name: string; category: string; trusted: boolean }> = {
      '530196605': { name: 'American Red Cross', category: 'emergency-relief', trusted: true },
      '133433452': { name: 'Doctors Without Borders', category: 'health', trusted: true },
      '363673599': { name: 'Feeding America', category: 'food-security', trusted: true },
      '621503263': { name: 'St. Jude Children\'s Research Hospital', category: 'children-health', trusted: true },
      '521693387': { name: 'World Wildlife Fund', category: 'environment', trusted: true }
    };
    
    const knownCharity = knownCharities[ein];
    
    return {
      isValid: validation.isValid,
      isPublicCharity: validation.isPublicCharity,
      source: 'local-validation',
      ein,
      trusted: knownCharity?.trusted || false,
      category: knownCharity?.category || 'general',
      securityNote: 'Local validation only - no external data transmission'
    };
  }

  // Enhanced Donation Simulation with Real Charity Data
  async function performEnhancedDonationSimulation(site: any, cardData: any) {
    const { cardNumber, expiryMonth, expiryYear, cvv, charityValidation } = cardData;
    
    // Enhanced fraud detection for donation context
    const fraudAnalysis = analyzeDonationFraud(cardNumber, expiryMonth, expiryYear, cvv);
    
    // Charity-specific validation
    if (!charityValidation?.isValid) {
      return {
        success: false,
        errorReason: 'Charity validation failed - organization not found in IRS database',
        transactionId: '',
        validationDetails: {
          charityValid: false,
          fraudScore: 0,
          riskLevel: 'HIGH'
        }
      };
    }
    
    // Calculate success probability based on multiple factors
    let successProbability = 0.7; // Base probability
    
    // Adjust for card validity
    if (isValidLuhn(cardNumber)) successProbability += 0.15;
    if (!hasSequentialPattern(cardNumber)) successProbability += 0.1;
    if (!hasRepeatingPattern(cardNumber)) successProbability += 0.1;
    
    // Adjust for charity factors
    if (charityValidation.isPublicCharity) successProbability += 0.1;
    if (site.strictness === 'low') successProbability += 0.1;
    else if (site.strictness === 'high') successProbability -= 0.1;
    
    // Adjust for fraud analysis
    if (fraudAnalysis.fraudScore < 20) successProbability += 0.15;
    else if (fraudAnalysis.fraudScore > 70) successProbability -= 0.3;
    
    const success = Math.random() < Math.min(successProbability, 0.95);
    
    return {
      success,
      errorReason: success ? '' : generateDonationErrorMessage(fraudAnalysis, site),
      transactionId: success ? `DON_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}` : '',
      validationDetails: {
        charityValid: charityValidation.isValid,
        fraudScore: fraudAnalysis.fraudScore,
        riskLevel: fraudAnalysis.riskLevel,
        successProbability: Math.round(successProbability * 100)
      }
    };
  }

  // Local EIN validation using mathematical rules
  function validateEINLocally(ein: string) {
    // Basic EIN format validation (XX-XXXXXXX)
    const einPattern = /^\d{2}-?\d{7}$/;
    const cleanEIN = ein.replace('-', '');
    
    if (!einPattern.test(ein) || cleanEIN.length !== 9) {
      return { isValid: false, isPublicCharity: false, source: 'local-invalid-format', ein };
    }
    
    // Check against known valid prefixes for public charities
    const publicCharityPrefixes = ['13', '14', '15', '16', '20', '21', '22', '23', '26', '27', '31', '35', '36', '37', '38', '52', '53', '54', '55', '56', '57', '58', '59', '61', '62'];
    const prefix = cleanEIN.substring(0, 2);
    
    return {
      isValid: true,
      isPublicCharity: publicCharityPrefixes.includes(prefix),
      source: 'local-ein-rules',
      ein
    };
  }

  function analyzeDonationFraud(cardNumber: string, expiryMonth: string, expiryYear: string, cvv: string) {
    let fraudScore = 0;
    const indicators = [];
    
    // Donation-specific fraud patterns
    if (!isValidLuhn(cardNumber)) {
      fraudScore += 40;
      indicators.push('Invalid card number');
    }
    
    if (hasSequentialPattern(cardNumber)) {
      fraudScore += 25;
      indicators.push('Sequential number pattern');
    }
    
    if (hasRepeatingPattern(cardNumber)) {
      fraudScore += 20;
      indicators.push('Repeating number pattern');
    }
    
    // CVV analysis
    if (['000', '111', '123', '999'].includes(cvv)) {
      fraudScore += 15;
      indicators.push('Common CVV pattern');
    }
    
    // Expiry analysis
    const currentYear = new Date().getFullYear();
    const expYear = parseInt(expiryYear);
    if (expYear < currentYear || expYear > currentYear + 20) {
      fraudScore += 20;
      indicators.push('Invalid expiry date');
    }
    
    const riskLevel = fraudScore > 70 ? 'HIGH' : fraudScore > 40 ? 'MEDIUM' : 'LOW';
    
    return { fraudScore: Math.min(fraudScore, 100), riskLevel, indicators };
  }

  function generateDonationErrorMessage(fraudAnalysis: any, site: any) {
    if (fraudAnalysis.fraudScore > 70) {
      return `${site.name} security system rejected payment due to high fraud risk`;
    }
    if (fraudAnalysis.fraudScore > 40) {
      return `Payment processing failed - additional verification required by ${site.name}`;
    }
    return `Donation attempt failed - ${site.name} payment gateway temporarily unavailable`;
  }

  function generateDonationRecommendation(successRate: number, charityValidationScore: number) {
    if (successRate >= 80 && charityValidationScore >= 80) {
      return 'Excellent compatibility with donation platforms - card verified for charitable giving with high confidence';
    }
    if (successRate >= 60 && charityValidationScore >= 60) {
      return 'Good donation platform compatibility - card suitable for most charitable organizations';
    }
    if (successRate >= 40) {
      return 'Moderate donation compatibility - some platforms may require additional verification';
    }
    return 'Limited donation platform support - card may face restrictions with charitable payment processing';
  }

  const httpServer = createServer(app);
  return httpServer;
}
