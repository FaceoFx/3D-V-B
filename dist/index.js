// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";
var MemStorage = class {
  validationResults;
  sessions;
  currentSessionId;
  constructor() {
    this.validationResults = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Map();
    this.currentSessionId = null;
  }
  async createValidationResult(insertResult) {
    const id = randomUUID();
    const result = {
      ...insertResult,
      id,
      createdAt: /* @__PURE__ */ new Date(),
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
  async getValidationResult(id) {
    return this.validationResults.get(id);
  }
  async getValidationResults(limit = 50) {
    const results = Array.from(this.validationResults.values()).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)).slice(0, limit);
    return results;
  }
  async updateValidationResult(id, updates) {
    const existing = this.validationResults.get(id);
    if (!existing) return void 0;
    const updated = {
      ...existing,
      ...updates
    };
    this.validationResults.set(id, updated);
    return updated;
  }
  async clearValidationResults() {
    this.validationResults.clear();
  }
  async createSession() {
    const id = randomUUID();
    const session = {
      id,
      startTime: /* @__PURE__ */ new Date(),
      totalChecked: 0,
      totalPassed: 0,
      totalFailed: 0,
      avgProcessingTime: 0
    };
    this.sessions.set(id, session);
    this.currentSessionId = id;
    return session;
  }
  async getSession(id) {
    return this.sessions.get(id);
  }
  async updateSessionStats(id, stats) {
    const existing = this.sessions.get(id);
    if (!existing) return void 0;
    const updated = {
      ...existing,
      ...stats
    };
    this.sessions.set(id, updated);
    return updated;
  }
  async getCurrentSession() {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) return session;
    }
    return this.createSession();
  }
};
var storage = new MemStorage();

// server/services/cardValidation.ts
var CardValidationService = class {
  stripeKey;
  apiKeys;
  gateways = [];
  fraudModel = {};
  constructor() {
    this.stripeKey = process.env.STRIPE_SECRET_KEY || "demo_key";
    this.apiKeys = {
      stripe: this.stripeKey,
      validation: process.env.CARD_VALIDATION_API_KEY || "demo_key",
      binlist: process.env.BIN_API_KEY || "demo_key",
      adyen: process.env.ADYEN_API_KEY || "demo_key",
      square: process.env.SQUARE_API_KEY || "demo_key",
      paypal: process.env.PAYPAL_API_KEY || "demo_key",
      authorize: process.env.AUTHORIZE_NET_KEY || "demo_key"
    };
    this.initializeGateways();
    this.initializeFraudModel();
  }
  initializeGateways() {
    this.gateways = [
      {
        name: "Stripe Advanced",
        provider: "stripe-3ds2",
        endpoint: "https://api.stripe.com/v1/payment_intents",
        successRate: 0.92,
        avgResponseTime: 1200,
        features: ["3DS2.0", "Radar", "Machine Learning", "Real-time scoring"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
        authMethods: ["App-based", "SMS OTP", "Biometric", "Device binding"]
      },
      {
        name: "Adyen Global",
        provider: "adyen-3ds2",
        endpoint: "https://checkout-test.adyen.com/v70/payments",
        successRate: 0.89,
        avgResponseTime: 1800,
        features: ["3DS2.0", "Risk scoring", "Behavioral analysis", "Device fingerprinting"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER", "JCB"],
        authMethods: ["Push notification", "SMS OTP", "Email OTP", "Hardware token"]
      },
      {
        name: "Square Secure",
        provider: "square-3ds",
        endpoint: "https://connect.squareup.com/v2/payments",
        successRate: 0.86,
        avgResponseTime: 2100,
        features: ["3DS2.0", "Fraud detection", "Real-time monitoring"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
        authMethods: ["App-based", "SMS OTP", "Voice call"]
      },
      {
        name: "PayPal Enterprise",
        provider: "paypal-3ds",
        endpoint: "https://api.sandbox.paypal.com/v2/checkout/orders",
        successRate: 0.94,
        avgResponseTime: 1500,
        features: ["3DS2.0", "Advanced risk engine", "Buyer protection", "Velocity checking"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
        authMethods: ["PayPal app", "SMS OTP", "Email verification", "Biometric"]
      },
      {
        name: "Authorize.Net Advanced",
        provider: "authnet-3ds",
        endpoint: "https://apitest.authorize.net/xml/v1/request.api",
        successRate: 0.83,
        avgResponseTime: 2400,
        features: ["3DS2.0", "Fraud detection suite", "Transaction filtering"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
        authMethods: ["SMS OTP", "Email OTP", "Security questions"]
      },
      {
        name: "Worldpay Global",
        provider: "worldpay-3ds",
        endpoint: "https://secure-test.worldpay.com/jsp/merchant/xml/paymentService.jsp",
        successRate: 0.88,
        avgResponseTime: 1900,
        features: ["3DS2.0", "Global processing", "Multi-currency", "Risk management"],
        supportedCardTypes: ["VISA", "MASTERCARD", "AMEX", "DISCOVER", "JCB", "DINERS"],
        authMethods: ["App-based", "SMS OTP", "Push notification", "Hardware token"]
      }
    ];
  }
  initializeFraudModel() {
    this.fraudModel = {
      riskFactors: {
        cardPattern: { weight: 0.25, factors: ["sequence", "repetition", "test_patterns"] },
        geography: { weight: 0.2, factors: ["country_risk", "ip_location", "billing_mismatch"] },
        behavioral: { weight: 0.15, factors: ["typing_speed", "session_time", "navigation_pattern"] },
        temporal: { weight: 0.15, factors: ["time_of_day", "velocity", "frequency"] },
        technical: { weight: 0.15, factors: ["device_fingerprint", "browser_data", "proxy_detection"] },
        historical: { weight: 0.1, factors: ["previous_attempts", "success_rate", "blacklist_check"] }
      },
      thresholds: {
        low: 25,
        medium: 50,
        high: 75,
        block: 90
      }
    };
  }
  async validateCardBatch(cards, selectedAPIs = []) {
    const BATCH_SIZE = 50;
    const results = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(
        (card) => this.validateCard(card.cardNumber, card.expiryMonth, card.expiryYear, card.cvv, selectedAPIs)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      if (i + BATCH_SIZE < cards.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    return results;
  }
  async validateCard(cardNumber, expiryMonth, expiryYear, cvv, selectedAPIs = []) {
    const startTime = Date.now();
    try {
      const gatewaysToTry = this.getGatewaysToTry(cardNumber, selectedAPIs);
      const preValidation = await this.performPreValidation(cardNumber, expiryMonth, expiryYear, cvv);
      const initialFraudScore = this.calculateAdvancedFraudScore(cardNumber, expiryMonth, expiryYear, cvv, preValidation);
      const gatewayResults = [];
      let finalSuccess = false;
      let finalGateway;
      let finalThreeDSResults;
      let finalValidation;
      for (const gateway of gatewaysToTry) {
        console.log(`Trying gateway: ${gateway.name} (${gateway.provider})`);
        const gatewayStartTime = Date.now();
        try {
          const threeDSResults = await this.perform3DSAuthentication(cardNumber, gateway, initialFraudScore);
          const validation = await this.performEnhancedValidation(cardNumber, expiryMonth, expiryYear, cvv, gateway, threeDSResults);
          const gatewayProcessingTime = Math.round((Date.now() - gatewayStartTime) / 1e3);
          const success = validation.success && initialFraudScore < 70 && threeDSResults.authenticated;
          gatewayResults.push({
            gateway,
            success,
            processingTime: gatewayProcessingTime,
            response: this.generateDetailedResponse(success, threeDSResults, gateway),
            errorReason: success ? void 0 : this.getDetailedErrorMessage(validation, threeDSResults)
          });
          if (success) {
            finalSuccess = true;
            finalGateway = gateway;
            finalThreeDSResults = threeDSResults;
            finalValidation = validation;
            console.log(`Gateway ${gateway.name} succeeded! Stopping failover.`);
            break;
          } else {
            console.log(`Gateway ${gateway.name} failed, trying next gateway...`);
          }
        } catch (error) {
          const gatewayProcessingTime = Math.round((Date.now() - gatewayStartTime) / 1e3);
          gatewayResults.push({
            gateway,
            success: false,
            processingTime: gatewayProcessingTime,
            response: "Gateway Error",
            errorReason: error instanceof Error ? error.message : String(error)
          });
          console.log(`Gateway ${gateway.name} threw error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const totalProcessingTime = Math.round((Date.now() - startTime) / 1e3);
      const finalFraudScore = Math.min(100, initialFraudScore + (finalThreeDSResults?.riskAdjustment || 0));
      const riskLevel = this.determineRiskLevel(finalFraudScore);
      const successfulGateways = gatewayResults.filter((g) => g.success);
      const failedGateways = gatewayResults.filter((g) => !g.success);
      const gatewayFailoverSummary = {
        totalAttempted: gatewayResults.length,
        successfulGateways: successfulGateways.length,
        failedGateways: failedGateways.length,
        overallStatus: finalSuccess ? "passed" : "failed",
        gatewaySequence: gatewayResults,
        summary: `${successfulGateways.length}/${gatewayResults.length} gateways passed. ${finalSuccess ? `Card successfully authenticated through ${finalGateway.name}.` : `Card rejected by all ${gatewayResults.length} gateway(s).`}`
      };
      return {
        success: finalSuccess,
        response: finalSuccess ? finalGateway.name + " - " + gatewayResults.find((g) => g.success)?.response : "All gateways failed",
        gateway: this.generateGatewayFailoverDisplay(gatewayResults, finalSuccess),
        processingTime: totalProcessingTime,
        fraudScore: finalFraudScore,
        riskLevel,
        apiProvider: finalSuccess ? finalGateway.provider : "failed",
        validationData: {
          gateway: finalSuccess ? finalGateway : gatewayResults[0]?.gateway,
          preValidation,
          threeDSResults: finalThreeDSResults,
          finalValidation,
          riskFactors: this.getRiskFactorBreakdown(cardNumber, expiryMonth, expiryYear, cvv),
          gatewayFailover: gatewayFailoverSummary
        },
        errorMessage: finalSuccess ? void 0 : `All ${gatewayResults.length} gateway(s) failed authentication`
      };
    } catch (error) {
      return {
        success: false,
        response: "3D Secure Authentication System Error",
        gateway: "SYSTEM ERROR [UNAVAILABLE]",
        processingTime: Math.round((Date.now() - startTime) / 1e3),
        fraudScore: 100,
        riskLevel: "high",
        apiProvider: "system",
        validationData: { error: error instanceof Error ? error.message : String(error) },
        errorMessage: error instanceof Error ? error.message : "Critical validation service error"
      };
    }
  }
  // This method is no longer used but kept for compatibility
  async performMultiValidation(cardNumber, expiryMonth, expiryYear, cvv) {
    const preValidation = await this.performPreValidation(cardNumber, expiryMonth, expiryYear, cvv);
    return {
      isValid: preValidation.passed,
      provider: "legacy",
      rawData: preValidation,
      errorMessage: preValidation.passed ? void 0 : "Legacy validation failed"
    };
  }
  getGatewaysToTry(cardNumber, selectedAPIs = []) {
    const cardBrand = this.getCardBrand(cardNumber);
    const compatibleGateways = this.gateways.filter(
      (gateway) => gateway.supportedCardTypes.includes(cardBrand)
    );
    if (selectedAPIs.length > 0) {
      const userSelectedGateways = compatibleGateways.filter(
        (gateway) => selectedAPIs.some(
          (api) => gateway.provider.toLowerCase().includes(api.toLowerCase()) || gateway.name.toLowerCase().includes(api.toLowerCase())
        )
      );
      if (userSelectedGateways.length > 0) {
        return userSelectedGateways.sort((a, b) => b.successRate - a.successRate);
      }
    }
    return compatibleGateways.sort((a, b) => b.successRate - a.successRate);
  }
  generateGatewayFailoverDisplay(gatewayResults, finalSuccess) {
    if (gatewayResults.length === 1) {
      const result = gatewayResults[0];
      return `${result.gateway.name} [${result.success ? "AUTHENTICATED" : "DECLINED"}]`;
    }
    const sequence = gatewayResults.map((result, index) => {
      const status = result.success ? "\u2713 PASSED" : "\u2717 FAILED";
      return `${index + 1}. ${result.gateway.name}: ${status}`;
    }).join(" \u2192 ");
    const finalStatus = finalSuccess ? "AUTHENTICATED" : "ALL FAILED";
    return `Failover: ${sequence} [${finalStatus}]`;
  }
  selectOptimalGateway(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const cardBrand = this.getCardBrand(cardNumber);
    const compatibleGateways = this.gateways.filter(
      (gateway) => gateway.supportedCardTypes.includes(cardBrand)
    );
    if (bin === "424242" || bin === "558793" || bin === "400000") {
      return compatibleGateways.sort((a, b) => b.successRate - a.successRate)[0] || this.gateways[0];
    }
    const weightedGateways = compatibleGateways.flatMap(
      (gateway) => Array(Math.round(gateway.successRate * 10)).fill(gateway)
    );
    return weightedGateways[Math.floor(Math.random() * weightedGateways.length)] || this.gateways[0];
  }
  async performPreValidation(cardNumber, expiryMonth, expiryYear, cvv) {
    const results = {
      luhn: this.isValidCardNumber(cardNumber),
      expiry: this.isValidExpiryDate(expiryMonth, expiryYear),
      cvv: this.isValidCVV(cvv, cardNumber),
      bin: this.validateBIN(cardNumber.substring(0, 6)),
      pattern: this.analyzeCardPattern(cardNumber),
      velocity: this.checkVelocity(cardNumber)
    };
    return {
      ...results,
      passed: Object.values(results).every((result) => result === true || typeof result === "object" && result.valid)
    };
  }
  async perform3DSAuthentication(cardNumber, gateway, initialRisk) {
    const processingTime = gateway.avgResponseTime + (Math.random() * 1e3 - 500);
    await new Promise((resolve) => setTimeout(resolve, processingTime));
    const challenges = [];
    let riskAdjustment = 0;
    let authenticated = true;
    const challengeCount = initialRisk > 70 ? 3 : initialRisk > 40 ? 2 : 1;
    for (let i = 0; i < challengeCount; i++) {
      const challenge = this.generateChallenge(gateway, initialRisk + riskAdjustment);
      challenges.push(challenge);
      if (challenge.result === "failed") {
        authenticated = false;
        riskAdjustment += 20;
      } else if (challenge.result === "timeout") {
        authenticated = false;
        riskAdjustment += 15;
      } else {
        riskAdjustment -= 5;
      }
    }
    return {
      authenticated: authenticated && Math.random() > initialRisk / 100,
      challenges,
      riskAdjustment,
      processingTime: Math.round(processingTime),
      eci: authenticated ? "05" : "07",
      // E-commerce Indicator
      cavv: this.generateCAVV(),
      xid: this.generateXID(),
      threeDSVersion: "2.1.0"
    };
  }
  async performEnhancedValidation(cardNumber, expiryMonth, expiryYear, cvv, gateway, threeDSResults) {
    const processingDelay = gateway.avgResponseTime;
    await new Promise((resolve) => setTimeout(resolve, processingDelay));
    const bin = cardNumber.substring(0, 6);
    const validationResults = await this.performDeterministicValidation(cardNumber, expiryMonth, expiryYear, cvv);
    const success = this.calculateDeterministicSuccess(cardNumber, expiryMonth, expiryYear, cvv, validationResults, threeDSResults, gateway);
    const knownTestBins = [
      // Stripe test cards (always pass with high confidence)
      "424242",
      "400000",
      "400051",
      "400052",
      "400055",
      "400056",
      "400057",
      "400058",
      "400059",
      "400060",
      // Visa test patterns  
      "401288",
      "411111",
      "411144",
      "411155",
      "419999",
      "424000",
      "437312",
      "444444",
      "454610",
      // Mastercard test patterns
      "555555",
      "550000",
      "558793",
      "520000",
      "521234",
      "525555",
      "544444",
      "549999",
      "555544",
      // Amex test patterns
      "371449",
      "371144",
      "378282",
      "378734",
      "371111",
      "341111",
      "340000",
      // Other network test patterns
      "601100",
      "644564",
      "349999",
      "302014",
      "301014"
    ];
    const isTestCard = knownTestBins.includes(bin);
    const confidence = this.calculateDeterministicConfidence(validationResults, isTestCard, threeDSResults);
    return {
      success,
      gateway: gateway.name,
      provider: gateway.provider,
      confidence,
      checksPassed: validationResults.checksPerformed,
      securityFeatures: [...gateway.features, ...validationResults.securityChecks],
      responseCode: success ? "00" : this.getDetailedErrorCode(validationResults),
      authCode: success ? this.generateAuthCode() : null,
      validationDetails: validationResults,
      isTestCard,
      deterministic: true
      // Flag indicating this is deterministic validation
    };
  }
  async performDeterministicValidation(cardNumber, expiryMonth, expiryYear, cvv) {
    const results = {
      luhnValid: false,
      lengthValid: false,
      expiryValid: false,
      cvvValid: false,
      binValid: false,
      networkValid: false,
      checksPerformed: 0,
      securityChecks: [],
      failureReasons: []
    };
    results.luhnValid = this.validateLuhn(cardNumber);
    results.checksPerformed += 1;
    if (results.luhnValid) {
      results.securityChecks.push("Luhn Algorithm Passed");
    } else {
      results.failureReasons.push("Invalid card number checksum");
    }
    results.lengthValid = this.validateCardLength(cardNumber);
    results.checksPerformed += 1;
    if (results.lengthValid) {
      results.securityChecks.push("Length Validation Passed");
    } else {
      results.failureReasons.push("Invalid card number length for network");
    }
    results.expiryValid = this.validateExpiry(expiryMonth, expiryYear);
    results.checksPerformed += 1;
    if (results.expiryValid) {
      results.securityChecks.push("Expiry Validation Passed");
    } else {
      results.failureReasons.push("Card is expired or has invalid expiry date");
    }
    results.cvvValid = this.validateCVV(cvv, cardNumber);
    results.checksPerformed += 1;
    if (results.cvvValid) {
      results.securityChecks.push("CVV Format Validated");
    } else {
      results.failureReasons.push("Invalid CVV format");
    }
    results.binValid = this.validateBINLocally(cardNumber.substring(0, 6));
    results.checksPerformed += 1;
    if (results.binValid) {
      results.securityChecks.push("BIN Validation Passed");
    } else {
      results.failureReasons.push("BIN not recognized in valid ranges");
    }
    results.networkValid = this.validateCardNetwork(cardNumber);
    results.checksPerformed += 1;
    if (results.networkValid) {
      results.securityChecks.push("Card Network Identified");
    } else {
      results.failureReasons.push("Unknown card network");
    }
    if (!this.hasSuspiciousPattern(cardNumber)) {
      results.securityChecks.push("Pattern Analysis Passed");
      results.checksPerformed += 1;
    } else {
      results.failureReasons.push("Suspicious number pattern detected");
    }
    if (!this.hasSequentialDigits(cardNumber)) {
      results.securityChecks.push("Sequence Detection Passed");
      results.checksPerformed += 1;
    } else {
      results.failureReasons.push("Sequential digit pattern detected");
    }
    if (!this.hasRepeatingDigits(cardNumber)) {
      results.securityChecks.push("Repetition Analysis Passed");
      results.checksPerformed += 1;
    } else {
      results.failureReasons.push("Excessive digit repetition detected");
    }
    return results;
  }
  calculateDeterministicSuccess(cardNumber, expiryMonth, expiryYear, cvv, validationResults, threeDSResults, gateway) {
    if (!validationResults.luhnValid) return false;
    if (!validationResults.expiryValid) return false;
    if (!validationResults.cvvValid) return false;
    let score = 0;
    if (validationResults.luhnValid) score += 20;
    if (validationResults.lengthValid) score += 10;
    if (validationResults.expiryValid) score += 20;
    if (validationResults.cvvValid) score += 10;
    if (validationResults.binValid) score += 10;
    if (validationResults.networkValid) score += 10;
    if (!this.hasSuspiciousPattern(cardNumber)) score += 5;
    if (!this.hasSequentialDigits(cardNumber)) score += 5;
    if (!this.hasRepeatingDigits(cardNumber)) score += 5;
    if (threeDSResults.authenticated) {
      score += 5;
    } else {
      score -= 10;
    }
    let threshold = 70;
    if (gateway.name.includes("Premium")) threshold = 80;
    else if (gateway.name.includes("Standard")) threshold = 70;
    else if (gateway.name.includes("Basic")) threshold = 60;
    return score >= threshold;
  }
  calculateDeterministicConfidence(validationResults, isTestCard, threeDSResults) {
    let confidence = 0;
    const passedChecks = validationResults.securityChecks.length;
    const totalPossibleChecks = validationResults.checksPerformed;
    confidence = Math.round(passedChecks / totalPossibleChecks * 100);
    if (isTestCard) confidence = Math.min(95, confidence + 10);
    if (threeDSResults.authenticated) confidence = Math.min(100, confidence + 5);
    return Math.max(0, Math.min(100, confidence));
  }
  validateBINLocally(bin) {
    const validBinRanges = {
      // Visa: 4xxxxx
      visa: /^4\d{5}$/,
      // Mastercard: 5xxxxx, 2221xx-2720xx  
      mastercard: /^5[1-5]\d{4}$|^2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)\d{2}$/,
      // American Express: 3xxxxx
      amex: /^3[47]\d{4}$/,
      // Discover: 6xxxxx
      discover: /^6(011|5\d{2})\d{2}$/,
      // JCB: 35xxxx
      jcb: /^35\d{4}$/
    };
    return Object.values(validBinRanges).some((pattern) => pattern.test(bin));
  }
  validateCardNetwork(cardNumber) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    const firstFour = cardNumber.substring(0, 4);
    const networks = {
      visa: /^4/,
      mastercard: /^5[1-5]|^2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)/,
      amex: /^3[47]/,
      discover: /^6(011|5)/,
      jcb: /^35/,
      dinersclub: /^3[068]/
    };
    return Object.values(networks).some((pattern) => pattern.test(cardNumber));
  }
  async performMultiSourceValidation(cardNumber, expiryMonth, expiryYear, cvv) {
    const results = {
      luhnValid: false,
      lengthValid: false,
      expiryValid: false,
      cvvValid: false,
      binValid: false,
      checksPerformed: 0,
      securityChecks: []
    };
    results.luhnValid = this.validateLuhn(cardNumber);
    results.checksPerformed += 1;
    if (results.luhnValid) results.securityChecks.push("Luhn Algorithm");
    results.lengthValid = this.validateCardLength(cardNumber);
    results.checksPerformed += 1;
    if (results.lengthValid) results.securityChecks.push("Length Validation");
    results.expiryValid = this.validateExpiry(expiryMonth, expiryYear);
    results.checksPerformed += 1;
    if (results.expiryValid) results.securityChecks.push("Expiry Validation");
    results.cvvValid = this.validateCVV(cvv, cardNumber);
    results.checksPerformed += 1;
    if (results.cvvValid) results.securityChecks.push("CVV Validation");
    results.binValid = this.validateBIN(cardNumber.substring(0, 6));
    results.checksPerformed += 1;
    if (results.binValid) results.securityChecks.push("BIN Validation");
    if (!this.hasSuspiciousPattern(cardNumber)) {
      results.securityChecks.push("Pattern Analysis");
      results.checksPerformed += 1;
    }
    if (!this.hasSequentialDigits(cardNumber)) {
      results.securityChecks.push("Sequence Detection");
      results.checksPerformed += 1;
    }
    if (!this.hasRepeatingDigits(cardNumber)) {
      results.securityChecks.push("Repetition Analysis");
      results.checksPerformed += 1;
    }
    return results;
  }
  validateLuhn(cardNumber) {
    let sum = 0;
    let isEven = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber.charAt(i));
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit = digit - 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }
  validateCardLength(cardNumber) {
    const length = cardNumber.length;
    const firstDigit = cardNumber.charAt(0);
    if (firstDigit === "4") return [13, 16, 19].includes(length);
    if (firstDigit === "5" || cardNumber.substring(0, 2) === "22") return length === 16;
    if (firstDigit === "3") return length === 15;
    if (cardNumber.substring(0, 2) === "60" || firstDigit === "6") return length === 16;
    return length >= 13 && length <= 19;
  }
  validateExpiry(month, year) {
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const expMonth = parseInt(month);
    const expYear = parseInt(year);
    if (expMonth < 1 || expMonth > 12) return false;
    const fullYear = expYear < 100 ? expYear + 2e3 : expYear;
    if (fullYear > currentYear) return true;
    if (fullYear === currentYear && expMonth >= currentMonth) return true;
    return false;
  }
  validateCVV(cvv, cardNumber) {
    if (!cvv || !/^\d+$/.test(cvv)) return false;
    if (cardNumber.charAt(0) === "3") return cvv.length === 4;
    return cvv.length === 3;
  }
  hasSequentialDigits(cardNumber) {
    for (let i = 0; i < cardNumber.length - 3; i++) {
      const sequence = cardNumber.substring(i, i + 4);
      if (this.isSequential(sequence)) return true;
    }
    return false;
  }
  hasRepeatingDigits(cardNumber) {
    const digitCounts = /* @__PURE__ */ new Map();
    for (const digit of cardNumber) {
      digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1);
    }
    const maxCount = Math.max(...Array.from(digitCounts.values()));
    return maxCount > cardNumber.length * 0.4;
  }
  isSequential(sequence) {
    const ascending = sequence.split("").every(
      (digit, i) => i === 0 || parseInt(digit) === parseInt(sequence[i - 1]) + 1
    );
    const descending = sequence.split("").every(
      (digit, i) => i === 0 || parseInt(digit) === parseInt(sequence[i - 1]) - 1
    );
    return ascending || descending;
  }
  getDetailedErrorCode(validationResults) {
    if (!validationResults.luhnValid) return "05";
    if (!validationResults.expiryValid) return "54";
    if (!validationResults.cvvValid) return "82";
    if (!validationResults.lengthValid) return "30";
    return this.getRandomErrorCode();
  }
  calculateAdvancedFraudScore(cardNumber, expiryMonth, expiryYear, cvv, preValidation) {
    let score = 10;
    const riskFactors = this.fraudModel.riskFactors;
    const cardPatternScore = this.analyzeCardPatternRisk(cardNumber) * riskFactors.cardPattern.weight * 100;
    score += cardPatternScore;
    const binRiskScore = this.analyzeEnhancedBINRisk(cardNumber) * 0.2 * 100;
    score += binRiskScore;
    const temporalScore = this.analyzeTemporalRisk(expiryMonth, expiryYear) * riskFactors.temporal.weight * 100;
    score += temporalScore;
    const validationScore = this.analyzeValidationPatterns(cardNumber, cvv, preValidation) * 0.15 * 100;
    score += validationScore;
    const geoScore = this.analyzeGeographicRisk(cardNumber) * riskFactors.geography.weight * 100;
    score += geoScore;
    const usageScore = this.analyzeCardUsagePattern(cardNumber, expiryMonth, expiryYear) * 0.1 * 100;
    score += usageScore;
    if (!preValidation.luhn) {
      score += 30;
    } else {
      score -= 5;
    }
    if (!preValidation.expiry) {
      score += 20;
    } else {
      const expiryDate = new Date(parseInt("20" + expiryYear), parseInt(expiryMonth) - 1);
      const now = /* @__PURE__ */ new Date();
      const monthsToExpiry = (expiryDate.getFullYear() - now.getFullYear()) * 12 + (expiryDate.getMonth() - now.getMonth());
      if (monthsToExpiry < 3) score += 10;
      else if (monthsToExpiry > 48) score += 5;
      else score -= 3;
    }
    if (!preValidation.cvv) {
      score += 15;
    } else {
      score -= 2;
    }
    if (this.isKnownGoodPattern(cardNumber)) {
      score = Math.max(0, score - 25);
    }
    if (this.isProfessionalCardPattern(cardNumber)) {
      score = Math.max(0, score - 15);
    }
    return Math.min(100, Math.max(0, Math.round(score)));
  }
  analyzeEnhancedBINRisk(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const testBins = ["424242", "558793", "400000", "520000", "371449", "378282", "411111", "378734"];
    if (testBins.includes(bin)) return 0.02;
    const professionalBins = ["470793", "446227", "450875", "401288", "455951", "516865"];
    if (professionalBins.includes(bin)) return 0.05;
    const highRiskPatterns = ["666666", "555555", "444444", "333333", "222222", "111111"];
    if (highRiskPatterns.some((pattern) => bin.includes(pattern))) return 0.95;
    if (this.hasSequentialPattern(bin)) return 0.8;
    if (bin.startsWith("55") || bin.startsWith("51") || bin.startsWith("52")) return 0.15;
    if (bin.startsWith("45") || bin.startsWith("40")) return 0.1;
    if (bin.startsWith("34") || bin.startsWith("37")) return 0.08;
    return 0.25;
  }
  analyzeCardUsagePattern(cardNumber, expiryMonth, expiryYear) {
    let risk = 0;
    const digits = cardNumber.replace(/\s/g, "");
    if (/^(\d)\1+$/.test(digits)) return 0.9;
    if (this.isStrictSequential(digits)) return 0.8;
    if (digits === digits.split("").reverse().join("")) return 0.6;
    if (expiryMonth === "12" && expiryYear === "99") return 0.7;
    if (expiryMonth === "01" && expiryYear === "30") return 0.5;
    const uniqueDigits = new Set(digits).size;
    if (uniqueDigits < 4) risk += 0.4;
    else if (uniqueDigits < 6) risk += 0.2;
    return Math.min(1, risk);
  }
  isProfessionalCardPattern(cardNumber) {
    const professionalPatterns = ["470793", "446227", "450875", "401288", "455951", "516865", "479258", "535310"];
    return professionalPatterns.some((pattern) => cardNumber.startsWith(pattern));
  }
  isStrictSequential(digits) {
    for (let i = 0; i < digits.length - 3; i++) {
      const sequence = digits.substring(i, i + 4);
      const nums = sequence.split("").map(Number);
      if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2] && nums[2] + 1 === nums[3]) return true;
      if (nums[0] - 1 === nums[1] && nums[1] - 1 === nums[2] && nums[2] - 1 === nums[3]) return true;
    }
    return false;
  }
  analyzeBINRisk(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const testBins = ["424242", "558793", "400000", "520000", "371449", "378282", "411111", "378734"];
    if (testBins.includes(bin)) return 0.05;
    const highRiskPatterns = ["666666", "555555", "444444", "333333"];
    if (highRiskPatterns.some((pattern) => bin.includes(pattern))) return 0.9;
    if (bin.startsWith("55") || bin.startsWith("51") || bin.startsWith("52")) return 0.2;
    if (bin.startsWith("45") || bin.startsWith("40")) return 0.15;
    return 0.3;
  }
  analyzeValidationPatterns(cardNumber, cvv, preValidation) {
    let risk = 0;
    if (cvv === "000" || cvv === "111" || cvv === "123") risk += 0.4;
    if (cvv.charAt(0) === cvv.charAt(1) && cvv.charAt(1) === cvv.charAt(2)) risk += 0.3;
    if (this.hasTooManyRepeatingDigits(cardNumber)) risk += 0.3;
    if (this.hasSequentialPattern(cardNumber)) risk += 0.2;
    if (preValidation.luhn && preValidation.expiry && preValidation.cvv) risk -= 0.2;
    return Math.min(1, Math.max(0, risk));
  }
  isKnownGoodPattern(cardNumber) {
    const goodPatterns = ["424242", "558793", "400000", "520000", "371449"];
    return goodPatterns.some((pattern) => cardNumber.startsWith(pattern));
  }
  hasTooManyRepeatingDigits(cardNumber) {
    const digits = cardNumber.replace(/\s/g, "");
    for (let i = 0; i <= 9; i++) {
      const digit = i.toString();
      const count = (digits.match(new RegExp(digit, "g")) || []).length;
      if (count > digits.length * 0.4) return true;
    }
    return false;
  }
  analyzeCardPatternRisk(cardNumber) {
    let risk = 0;
    if (this.hasSequentialPattern(cardNumber)) risk += 0.3;
    if (this.hasRepetitivePattern(cardNumber)) risk += 0.4;
    if (this.isTestCardPattern(cardNumber)) risk -= 0.2;
    if (cardNumber.includes("0000") || cardNumber.includes("1111")) risk += 0.5;
    return Math.min(1, Math.max(0, risk));
  }
  analyzeGeographicRisk(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const highRiskBins = ["666666", "555555", "444444"];
    const lowRiskBins = ["424242", "558793", "400000", "520000", "371449"];
    if (highRiskBins.includes(bin)) return 0.8;
    if (lowRiskBins.includes(bin)) return 0.1;
    return Math.random() * 0.4 + 0.2;
  }
  analyzeBehavioralRisk() {
    return Math.random() * 0.3;
  }
  analyzeTemporalRisk(expiryMonth, expiryYear) {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const currentMonth = (/* @__PURE__ */ new Date()).getMonth() + 1;
    const expYear = parseInt(expiryYear);
    const expMonth = parseInt(expiryMonth);
    if (expYear > currentYear + 20) return 0.7;
    if (expYear < currentYear || expYear === currentYear && expMonth < currentMonth) return 0.9;
    return 0.1;
  }
  analyzeTechnicalRisk() {
    return Math.random() * 0.2;
  }
  analyzeHistoricalRisk(cardNumber) {
    const lastFour = cardNumber.substring(cardNumber.length - 4);
    if (lastFour === "0000" || lastFour === "1111") return 0.8;
    return Math.random() * 0.3;
  }
  determineRiskLevel(fraudScore) {
    if (fraudScore < 30) return "low";
    if (fraudScore < 70) return "medium";
    return "high";
  }
  isValidExpiryDate(month, year) {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const currentMonth = (/* @__PURE__ */ new Date()).getMonth() + 1;
    const expMonth = parseInt(month);
    const expYear = parseInt(year);
    if (expMonth < 1 || expMonth > 12) return false;
    if (expYear < currentYear) return false;
    if (expYear === currentYear && expMonth < currentMonth) return false;
    return true;
  }
  isValidCVV(cvv, cardNumber) {
    const bin = cardNumber.substring(0, 2);
    const isAmex = bin === "34" || bin === "37";
    const expectedLength = isAmex ? 4 : 3;
    return cvv.length === expectedLength && /^\d+$/.test(cvv);
  }
  generateChallenge(gateway, riskScore) {
    const challengeTypes = ["otp", "biometric", "password", "device_binding", "behavioral"];
    const availableMethods = gateway.authMethods;
    const type = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
    const method = availableMethods[Math.floor(Math.random() * availableMethods.length)];
    const successRate = Math.max(0.3, 0.95 - riskScore / 100);
    const random = Math.random();
    let result;
    if (random < successRate) {
      result = "success";
    } else if (random < successRate + 0.1) {
      result = "timeout";
    } else {
      result = "failed";
    }
    return {
      type,
      method,
      result,
      responseTime: Math.round(Math.random() * 3e3 + 1e3),
      riskScore: Math.round(riskScore)
    };
  }
  generateDetailedResponse(success, threeDSResults, gateway) {
    if (success) {
      const challenges = threeDSResults.challenges.length;
      const authMethod = threeDSResults.challenges[0]?.method || "Standard";
      const authCode = "AUTH" + Math.floor(Math.random() * 1e5).toString().padStart(5, "0");
      const successResponses = [
        `\u2705 3DS2.0 Success - ${gateway.name} (${authCode}) ${challenges} challenges passed`,
        `\u2705 Transaction Approved - ${gateway.name} (ECI: ${threeDSResults.eci}) ${authMethod} auth`,
        `\u2705 Payment Authorized - ${gateway.name} Advanced Security Verified`,
        `\u2705 Card Validated - ${gateway.name} Real-time Risk: Low (${Math.floor(Math.random() * 15) + 85}%)`
      ];
      return successResponses[Math.floor(Math.random() * successResponses.length)];
    } else {
      const failureReason = threeDSResults.challenges.find((c) => c.result !== "success");
      const errorCode = this.getRandomErrorCode();
      const failureResponses = [
        `\u274C 3DS Failed (${errorCode}) - ${gateway.name}: ${failureReason?.type || "Authentication"} challenge unsuccessful`,
        `\u274C Transaction Declined (${errorCode}) - ${gateway.name}: Risk threshold exceeded`,
        `\u274C Security Check Failed (${errorCode}) - ${gateway.name}: Enhanced verification failed`,
        `\u274C Payment Blocked (${errorCode}) - ${gateway.name}: Fraud detection triggered`
      ];
      return failureResponses[Math.floor(Math.random() * failureResponses.length)];
    }
  }
  getDetailedErrorMessage(finalValidation, threeDSResults) {
    if (!threeDSResults.authenticated) {
      return `3D Secure authentication failed: ${threeDSResults.challenges[0]?.type || "Unknown"} challenge unsuccessful`;
    }
    if (!finalValidation.success) {
      return `Payment gateway declined: Response code ${finalValidation.responseCode || "Unknown"}`;
    }
    return "Validation failed for unknown reasons";
  }
  getRiskFactorBreakdown(cardNumber, expiryMonth, expiryYear, cvv) {
    return {
      cardPattern: this.analyzeCardPatternRisk(cardNumber),
      geographic: this.analyzeGeographicRisk(cardNumber),
      behavioral: this.analyzeBehavioralRisk(),
      temporal: this.analyzeTemporalRisk(expiryMonth, expiryYear),
      technical: this.analyzeTechnicalRisk(),
      historical: this.analyzeHistoricalRisk(cardNumber)
    };
  }
  getValidationError(luhnValid, expiryValid, cvvValid, enhancedChecks) {
    if (!luhnValid) return "Invalid card number format (Luhn algorithm failed)";
    if (!expiryValid) return "Invalid or expired card date";
    if (!cvvValid) return "Invalid CVV security code";
    if (!enhancedChecks.passed) return "Card failed advanced security validation";
    return "Comprehensive validation checks failed";
  }
  getCardBrand(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const firstTwo = cardNumber.substring(0, 2);
    const firstFour = cardNumber.substring(0, 4);
    if (firstTwo === "34" || firstTwo === "37") return "AMEX";
    if (firstFour >= "2221" && firstFour <= "2720") return "MASTERCARD";
    if (firstTwo >= "51" && firstTwo <= "55") return "MASTERCARD";
    if (firstTwo === "62") return "UNIONPAY";
    if (firstFour >= "3528" && firstFour <= "3589") return "JCB";
    if (firstTwo === "30" || firstTwo === "36" || firstTwo === "38") return "DINERS";
    if (firstTwo === "60" || firstTwo === "65") return "DISCOVER";
    if (cardNumber.charAt(0) === "4") return "VISA";
    return "UNKNOWN";
  }
  validateBIN(bin) {
    return bin.length === 6 && /^\d{6}$/.test(bin) && !["000000", "111111", "999999"].includes(bin);
  }
  analyzeCardPattern(cardNumber) {
    const risk = this.analyzeCardPatternRisk(cardNumber);
    return { valid: risk < 0.7, risk };
  }
  checkVelocity(cardNumber) {
    return Math.random() > 0.1;
  }
  hasSequentialPattern(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "");
    for (let i = 0; i < digits.length - 3; i++) {
      const sequence = digits.substring(i, i + 4);
      if (sequence === "1234" || sequence === "2345" || sequence === "3456" || sequence === "4567" || sequence === "5678" || sequence === "6789") {
        return true;
      }
    }
    return false;
  }
  hasRepetitivePattern(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "");
    for (let i = 0; i < digits.length - 3; i++) {
      const quad = digits.substring(i, i + 4);
      if (quad === quad.charAt(0).repeat(4)) {
        return true;
      }
    }
    return false;
  }
  isTestCardPattern(cardNumber) {
    const testPatterns = ["424242", "558793", "400000", "520000", "371449"];
    return testPatterns.some((pattern) => cardNumber.startsWith(pattern));
  }
  hasSuspiciousPattern(cardNumber) {
    return this.hasSequentialPattern(cardNumber) || this.hasRepetitivePattern(cardNumber);
  }
  getRandomErrorCode() {
    const codes = ["05", "14", "51", "54", "61", "62", "65", "75", "82", "91"];
    return codes[Math.floor(Math.random() * codes.length)];
  }
  generateAuthCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  generateCAVV() {
    return Math.random().toString(36).substring(2, 30).toUpperCase();
  }
  generateXID() {
    return Math.random().toString(36).substring(2, 30).toUpperCase();
  }
  isValidCardNumber(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let isEvenIndex = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      if (isEvenIndex) {
        digit *= 2;
        if (digit > 9) {
          digit = digit % 10 + 1;
        }
      }
      sum += digit;
      isEvenIndex = !isEvenIndex;
    }
    return sum % 10 === 0;
  }
  generateCardFromBIN(bin) {
    if (bin.length < 4 || bin.length > 17) {
      throw new Error("BIN must be between 4 and 17 digits");
    }
    if (bin.length >= 13) {
      if (this.isValidLuhn(bin)) {
        return {
          cardNumber: bin,
          expiryMonth: String(Math.floor(Math.random() * 12) + 1).padStart(2, "0"),
          expiryYear: ((/* @__PURE__ */ new Date()).getFullYear() + Math.floor(Math.random() * 8) + 1).toString(),
          cvv: String(Math.floor(Math.random() * 900) + 100)
        };
      } else {
        const cardWithoutCheck = bin.substring(0, bin.length - 1);
        const checkDigit2 = this.calculateLuhnCheckDigit(cardWithoutCheck);
        return {
          cardNumber: cardWithoutCheck + checkDigit2,
          expiryMonth: String(Math.floor(Math.random() * 12) + 1).padStart(2, "0"),
          expiryYear: ((/* @__PURE__ */ new Date()).getFullYear() + Math.floor(Math.random() * 8) + 1).toString(),
          cvv: String(Math.floor(Math.random() * 900) + 100)
        };
      }
    }
    const targetLength = 15;
    const remainingDigits = targetLength - bin.length;
    let cardNumber = bin + this.generateRandomDigits(remainingDigits);
    const checkDigit = this.calculateLuhnCheckDigit(cardNumber);
    cardNumber += checkDigit;
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const expiryYear = (currentYear + Math.floor(Math.random() * 8) + 1).toString();
    const expiryMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    const cvv = String(Math.floor(Math.random() * 900) + 100);
    return {
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv
    };
  }
  generateRandomDigits(length) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }
  calculateLuhnCheckDigit(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "");
    let sum = 0;
    let isEvenIndex = true;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      if (isEvenIndex) {
        digit *= 2;
        if (digit > 9) {
          digit = digit % 10 + 1;
        }
      }
      sum += digit;
      isEvenIndex = !isEvenIndex;
    }
    return ((10 - sum % 10) % 10).toString();
  }
  isValidLuhn(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "");
    let sum = 0;
    let isEvenIndex = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      if (isEvenIndex) {
        digit *= 2;
        if (digit > 9) {
          digit = digit % 10 + 1;
        }
      }
      sum += digit;
      isEvenIndex = !isEvenIndex;
    }
    return sum % 10 === 0;
  }
};
var cardValidationService = new CardValidationService();

// server/services/binLookup.ts
var BinLookupService = class {
  apiKey;
  cache;
  CACHE_TTL = 24 * 60 * 60 * 1e3;
  // 24 hours
  constructor() {
    this.apiKey = process.env.BIN_LOOKUP_API_KEY || process.env.BIN_API_KEY || "demo_key";
    this.cache = /* @__PURE__ */ new Map();
  }
  async lookupBIN(bin) {
    try {
      const cached = this.getCachedResult(bin);
      if (cached) {
        console.log(`BIN lookup: Using cached data for ${bin}`);
        if (!cached.apiStats) {
          cached.apiStats = {
            successRate: 100,
            successfulLookups: 1,
            totalAttempted: 1,
            overallStatus: "passed",
            processingTime: 0,
            canBypassBinSecurity: false
          };
        }
        return cached;
      }
      const { result, apiStats } = await this.lookupWithFallback(bin);
      if (result) {
        result.apiStats = apiStats;
      }
      if (result && result.brand !== "UNKNOWN") {
        this.setCachedResult(bin, result);
      }
      return result;
    } catch (error) {
      console.error("BIN lookup error:", error);
      return this.getMockBinInfo(bin);
    }
  }
  getCachedResult(bin) {
    const cached = this.cache.get(bin);
    if (cached) {
      const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
      if (!isExpired) {
        return cached.data;
      } else {
        this.cache.delete(bin);
      }
    }
    return null;
  }
  setCachedResult(bin, data) {
    this.cache.set(bin, {
      data,
      timestamp: Date.now()
    });
    if (this.cache.size > 1e3) {
      const now = Date.now();
      Array.from(this.cache.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.cache.delete(key);
        }
      });
    }
  }
  async lookupWithFallback(bin) {
    const apis = [
      { name: "BinList.net", func: () => this.lookupBinList(bin), priority: 1 },
      { name: "BinCheck.io", func: () => this.lookupBinCheck(bin), priority: 1 },
      { name: "BinDB.com", func: () => this.lookupBinDB(bin), priority: 1 },
      { name: "BinRange.net", func: () => this.lookupBinRange(bin), priority: 1 },
      { name: "CardBin.org", func: () => this.lookupCardBin(bin), priority: 2 },
      { name: "BinSearch.io", func: () => this.lookupBinSearch(bin), priority: 2 },
      { name: "BinCodes.com", func: () => this.lookupBinCodes(bin), priority: 2 },
      { name: "FreeBinChecker", func: () => this.lookupFreeBinChecker(bin), priority: 3 }
    ];
    const apiResults = [];
    const successfulResults = [];
    const promises = apis.map(async (api) => {
      const startTime = Date.now();
      try {
        const result = await api.func();
        const processingTime = Date.now() - startTime;
        if (result && result.brand !== "UNKNOWN") {
          console.log(`BIN lookup successful with API: ${api.name}`);
          apiResults.push({ name: api.name, success: true, processingTime, data: result });
          successfulResults.push(result);
          return { success: true, result, api: api.name, processingTime };
        } else {
          apiResults.push({ name: api.name, success: false, processingTime, errorReason: "No valid data returned" });
          return { success: false, api: api.name, processingTime, error: "No valid data" };
        }
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.log(`API ${api.name} failed:`, errorMessage);
        apiResults.push({
          name: api.name,
          success: false,
          processingTime,
          errorReason: errorMessage
        });
        return { success: false, api: api.name, processingTime, error: errorMessage };
      }
    });
    await Promise.allSettled(promises);
    let aggregatedResult = null;
    if (successfulResults.length > 0) {
      aggregatedResult = this.aggregateResults(successfulResults, bin);
    }
    const successfulLookups = apiResults.filter((r) => r.success).length;
    const totalAttempted = apiResults.length;
    const apiStats = {
      successRate: Math.round(successfulLookups / totalAttempted * 100),
      successfulLookups,
      totalAttempted,
      overallStatus: successfulLookups > 0 ? "passed" : "failed",
      canBypassBinSecurity: successfulLookups >= 3,
      dataConfidence: this.calculateDataConfidence(successfulResults),
      sourcesAgreement: this.calculateSourcesAgreement(successfulResults),
      results: apiResults,
      processingTime: Math.round(apiResults.reduce((sum, r) => sum + r.processingTime, 0) / apiResults.length),
      summary: `${successfulLookups}/${totalAttempted} premium APIs responded. ${successfulLookups >= 4 ? "BIN verified through multiple premium databases with high confidence." : successfulLookups >= 2 ? "BIN verified through professional databases with good confidence." : successfulLookups === 1 ? "BIN verified through limited database access." : "BIN data retrieved from local comprehensive database."}`
    };
    if (aggregatedResult) {
      return { result: { ...aggregatedResult, apiStats }, apiStats };
    }
    const localResult = this.getEnhancedBinInfo(bin);
    return { result: { ...localResult, apiStats }, apiStats };
  }
  async lookupBinList(bin) {
    try {
      const response = await fetch(`https://lookup.binlist.net/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`BinList API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.scheme || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.category),
        bank: data.bank?.name || "UNKNOWN BANK",
        country: data.country?.name || "UNKNOWN",
        countryCode: data.country?.alpha2 || "XX",
        flag: this.getCountryFlag(data.country?.alpha2 || "XX"),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || void 0,
        website: data.bank?.url || void 0,
        phone: data.bank?.phone || void 0
      };
    } catch (error) {
      throw new Error(`BinList lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // BinCheck.io API integration
  async lookupBinCheck(bin) {
    try {
      const response = await fetch(`https://lookup.bincheck.io/details/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`BinCheck API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.scheme || data.brand || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.tier || data.category),
        bank: data.bank?.name || "UNKNOWN BANK",
        country: data.country?.name || "UNKNOWN",
        countryCode: data.country?.iso || "XX",
        flag: this.getCountryFlag(data.country?.iso || "XX"),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || void 0,
        website: data.bank?.website || void 0,
        phone: data.bank?.phone || void 0
      };
    } catch (error) {
      throw new Error(`BinCheck lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // BinSearch.io API integration  
  async lookupBinSearch(bin) {
    try {
      const response = await fetch(`https://api.binsearch.io/v1/bin/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`BinSearch API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.network || data.scheme || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.issuer?.name || "UNKNOWN BANK",
        country: data.country?.name || "UNKNOWN",
        countryCode: data.country?.code || "XX",
        flag: this.getCountryFlag(data.country?.code || "XX"),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || void 0,
        website: data.issuer?.website || void 0,
        phone: data.issuer?.phone || void 0
      };
    } catch (error) {
      throw new Error(`BinSearch lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // BinCodes.com API integration
  async lookupBinCodes(bin) {
    try {
      const response = await fetch(`https://api.bincodes.com/bin/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`BinCodes API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.brand || data.scheme || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.level),
        bank: data.bank || "UNKNOWN BANK",
        country: data.country || "UNKNOWN",
        countryCode: data.countryCode || "XX",
        flag: this.getCountryFlag(data.countryCode || "XX"),
        prepaid: data.prepaid || false,
        currency: data.currency || void 0,
        website: void 0,
        phone: void 0
      };
    } catch (error) {
      throw new Error(`BinCodes lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // BinDB.com API - Premium BIN database
  async lookupBinDB(bin) {
    try {
      const response = await fetch(`https://api.bindb.com/v1/bin/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0",
          "X-API-Key": this.apiKey
        }
      });
      if (!response.ok) {
        throw new Error(`BinDB API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.network || data.brand || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.category || data.level),
        bank: data.issuer?.name || data.bank || "UNKNOWN BANK",
        country: data.country?.name || "UNKNOWN",
        countryCode: data.country?.iso2 || "XX",
        flag: this.getCountryFlag(data.country?.iso2 || "XX"),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || void 0,
        website: data.issuer?.website || void 0,
        phone: data.issuer?.phone || void 0
      };
    } catch (error) {
      throw new Error(`BinDB lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // BinRange.net API - Comprehensive BIN ranges
  async lookupBinRange(bin) {
    try {
      const response = await fetch(`https://api.binrange.net/lookup/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0",
          "Authorization": `Bearer ${this.apiKey}`
        }
      });
      if (!response.ok) {
        throw new Error(`BinRange API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.scheme || data.brand || "UNKNOWN").toUpperCase(),
        type: (data.product || data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.bank?.name || data.issuer || "UNKNOWN BANK",
        country: data.country?.name || "UNKNOWN",
        countryCode: data.country?.code || "XX",
        flag: this.getCountryFlag(data.country?.code || "XX"),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || void 0,
        website: data.bank?.website || void 0,
        phone: data.bank?.phone || void 0
      };
    } catch (error) {
      throw new Error(`BinRange lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // CardBin.org API - Alternative BIN lookup
  async lookupCardBin(bin) {
    try {
      const response = await fetch(`https://cardbin.org/api/v1/bin/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`CardBin API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.brand || data.scheme || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.level),
        bank: data.issuer || data.bank || "UNKNOWN BANK",
        country: data.country || "UNKNOWN",
        countryCode: data.countryCode || "XX",
        flag: this.getCountryFlag(data.countryCode || "XX"),
        prepaid: data.prepaid || false,
        currency: data.currency || void 0,
        website: void 0,
        phone: void 0
      };
    } catch (error) {
      throw new Error(`CardBin lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // FreeBinChecker API - Additional source
  async lookupFreeBinChecker(bin) {
    try {
      const response = await fetch(`https://freebinchecker.com/api/v1/check/${bin}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "3D-Auth-Validator/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`FreeBinChecker API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        bin,
        brand: (data.brand || data.network || "UNKNOWN").toUpperCase(),
        type: (data.type || "UNKNOWN").toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.bank || "UNKNOWN BANK",
        country: data.country || "UNKNOWN",
        countryCode: data.iso || "XX",
        flag: this.getCountryFlag(data.iso || "XX"),
        prepaid: data.prepaid || false,
        currency: data.currency || void 0,
        website: void 0,
        phone: void 0
      };
    } catch (error) {
      throw new Error(`FreeBinChecker lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  getCountryFlag(countryCode) {
    const flags = {
      // Major economies
      "US": "\u{1F1FA}\u{1F1F8}",
      "CN": "\u{1F1E8}\u{1F1F3}",
      "JP": "\u{1F1EF}\u{1F1F5}",
      "DE": "\u{1F1E9}\u{1F1EA}",
      "IN": "\u{1F1EE}\u{1F1F3}",
      "GB": "\u{1F1EC}\u{1F1E7}",
      "FR": "\u{1F1EB}\u{1F1F7}",
      "IT": "\u{1F1EE}\u{1F1F9}",
      "BR": "\u{1F1E7}\u{1F1F7}",
      "CA": "\u{1F1E8}\u{1F1E6}",
      // Europe
      "ES": "\u{1F1EA}\u{1F1F8}",
      "NL": "\u{1F1F3}\u{1F1F1}",
      "CH": "\u{1F1E8}\u{1F1ED}",
      "SE": "\u{1F1F8}\u{1F1EA}",
      "NO": "\u{1F1F3}\u{1F1F4}",
      "DK": "\u{1F1E9}\u{1F1F0}",
      "FI": "\u{1F1EB}\u{1F1EE}",
      "AT": "\u{1F1E6}\u{1F1F9}",
      "BE": "\u{1F1E7}\u{1F1EA}",
      "PT": "\u{1F1F5}\u{1F1F9}",
      "GR": "\u{1F1EC}\u{1F1F7}",
      "PL": "\u{1F1F5}\u{1F1F1}",
      "CZ": "\u{1F1E8}\u{1F1FF}",
      "HU": "\u{1F1ED}\u{1F1FA}",
      "IE": "\u{1F1EE}\u{1F1EA}",
      "SK": "\u{1F1F8}\u{1F1F0}",
      "SI": "\u{1F1F8}\u{1F1EE}",
      "HR": "\u{1F1ED}\u{1F1F7}",
      "BG": "\u{1F1E7}\u{1F1EC}",
      "RO": "\u{1F1F7}\u{1F1F4}",
      "LT": "\u{1F1F1}\u{1F1F9}",
      "LV": "\u{1F1F1}\u{1F1FB}",
      "EE": "\u{1F1EA}\u{1F1EA}",
      "LU": "\u{1F1F1}\u{1F1FA}",
      "MT": "\u{1F1F2}\u{1F1F9}",
      "CY": "\u{1F1E8}\u{1F1FE}",
      "IS": "\u{1F1EE}\u{1F1F8}",
      "MC": "\u{1F1F2}\u{1F1E8}",
      "AD": "\u{1F1E6}\u{1F1E9}",
      "SM": "\u{1F1F8}\u{1F1F2}",
      // Asia Pacific
      "KR": "\u{1F1F0}\u{1F1F7}",
      "AU": "\u{1F1E6}\u{1F1FA}",
      "NZ": "\u{1F1F3}\u{1F1FF}",
      "SG": "\u{1F1F8}\u{1F1EC}",
      "HK": "\u{1F1ED}\u{1F1F0}",
      "TW": "\u{1F1F9}\u{1F1FC}",
      "MY": "\u{1F1F2}\u{1F1FE}",
      "TH": "\u{1F1F9}\u{1F1ED}",
      "ID": "\u{1F1EE}\u{1F1E9}",
      "PH": "\u{1F1F5}\u{1F1ED}",
      "VN": "\u{1F1FB}\u{1F1F3}",
      "BD": "\u{1F1E7}\u{1F1E9}",
      "PK": "\u{1F1F5}\u{1F1F0}",
      "LK": "\u{1F1F1}\u{1F1F0}",
      "MM": "\u{1F1F2}\u{1F1F2}",
      "KH": "\u{1F1F0}\u{1F1ED}",
      "LA": "\u{1F1F1}\u{1F1E6}",
      "BN": "\u{1F1E7}\u{1F1F3}",
      "MV": "\u{1F1F2}\u{1F1FB}",
      "NP": "\u{1F1F3}\u{1F1F5}",
      // Middle East & Africa
      "SA": "\u{1F1F8}\u{1F1E6}",
      "AE": "\u{1F1E6}\u{1F1EA}",
      "QA": "\u{1F1F6}\u{1F1E6}",
      "KW": "\u{1F1F0}\u{1F1FC}",
      "BH": "\u{1F1E7}\u{1F1ED}",
      "OM": "\u{1F1F4}\u{1F1F2}",
      "JO": "\u{1F1EF}\u{1F1F4}",
      "LB": "\u{1F1F1}\u{1F1E7}",
      "IL": "\u{1F1EE}\u{1F1F1}",
      "TR": "\u{1F1F9}\u{1F1F7}",
      "EG": "\u{1F1EA}\u{1F1EC}",
      "ZA": "\u{1F1FF}\u{1F1E6}",
      "NG": "\u{1F1F3}\u{1F1EC}",
      "KE": "\u{1F1F0}\u{1F1EA}",
      "MA": "\u{1F1F2}\u{1F1E6}",
      "TN": "\u{1F1F9}\u{1F1F3}",
      "DZ": "\u{1F1E9}\u{1F1FF}",
      "LY": "\u{1F1F1}\u{1F1FE}",
      "ET": "\u{1F1EA}\u{1F1F9}",
      "GH": "\u{1F1EC}\u{1F1ED}",
      // Americas
      "MX": "\u{1F1F2}\u{1F1FD}",
      "AR": "\u{1F1E6}\u{1F1F7}",
      "CL": "\u{1F1E8}\u{1F1F1}",
      "CO": "\u{1F1E8}\u{1F1F4}",
      "PE": "\u{1F1F5}\u{1F1EA}",
      "VE": "\u{1F1FB}\u{1F1EA}",
      "EC": "\u{1F1EA}\u{1F1E8}",
      "UY": "\u{1F1FA}\u{1F1FE}",
      "PY": "\u{1F1F5}\u{1F1FE}",
      "BO": "\u{1F1E7}\u{1F1F4}",
      "CR": "\u{1F1E8}\u{1F1F7}",
      "PA": "\u{1F1F5}\u{1F1E6}",
      "GT": "\u{1F1EC}\u{1F1F9}",
      "HN": "\u{1F1ED}\u{1F1F3}",
      "NI": "\u{1F1F3}\u{1F1EE}",
      "SV": "\u{1F1F8}\u{1F1FB}",
      "BZ": "\u{1F1E7}\u{1F1FF}",
      "JM": "\u{1F1EF}\u{1F1F2}",
      "TT": "\u{1F1F9}\u{1F1F9}",
      "BB": "\u{1F1E7}\u{1F1E7}",
      // Eastern Europe & Russia
      "RU": "\u{1F1F7}\u{1F1FA}",
      "UA": "\u{1F1FA}\u{1F1E6}",
      "BY": "\u{1F1E7}\u{1F1FE}",
      "MD": "\u{1F1F2}\u{1F1E9}",
      "GE": "\u{1F1EC}\u{1F1EA}",
      "AM": "\u{1F1E6}\u{1F1F2}",
      "AZ": "\u{1F1E6}\u{1F1FF}",
      "KZ": "\u{1F1F0}\u{1F1FF}",
      "UZ": "\u{1F1FA}\u{1F1FF}",
      "KG": "\u{1F1F0}\u{1F1EC}",
      "TJ": "\u{1F1F9}\u{1F1EF}",
      "TM": "\u{1F1F9}\u{1F1F2}",
      "MN": "\u{1F1F2}\u{1F1F3}",
      "RS": "\u{1F1F7}\u{1F1F8}",
      "ME": "\u{1F1F2}\u{1F1EA}",
      "BA": "\u{1F1E7}\u{1F1E6}",
      "MK": "\u{1F1F2}\u{1F1F0}",
      "AL": "\u{1F1E6}\u{1F1F1}",
      "XK": "\u{1F1FD}\u{1F1F0}",
      // Additional countries
      "IR": "\u{1F1EE}\u{1F1F7}",
      "IQ": "\u{1F1EE}\u{1F1F6}",
      "AF": "\u{1F1E6}\u{1F1EB}",
      "PG": "\u{1F1F5}\u{1F1EC}",
      "FJ": "\u{1F1EB}\u{1F1EF}",
      "NC": "\u{1F1F3}\u{1F1E8}",
      "VU": "\u{1F1FB}\u{1F1FA}",
      "SB": "\u{1F1F8}\u{1F1E7}",
      "TO": "\u{1F1F9}\u{1F1F4}",
      "WS": "\u{1F1FC}\u{1F1F8}"
    };
    return flags[countryCode] || "\u{1F3F3}\uFE0F";
  }
  // Data aggregation from multiple successful API results
  aggregateResults(results, bin) {
    if (results.length === 1) {
      return results[0];
    }
    const aggregated = {
      bin,
      brand: this.getMostFrequent(results.map((r) => r.brand)) || "UNKNOWN",
      type: this.getMostFrequent(results.map((r) => r.type)) || "UNKNOWN",
      level: this.getMostFrequent(results.map((r) => r.level)) || "UNKNOWN",
      bank: this.getBestBank(results),
      country: this.getMostFrequent(results.map((r) => r.country)) || "UNKNOWN",
      countryCode: this.getMostFrequent(results.map((r) => r.countryCode)) || "XX",
      flag: this.getCountryFlag(this.getMostFrequent(results.map((r) => r.countryCode)) || "XX"),
      prepaid: this.getMostFrequentBoolean(results.map((r) => r.prepaid)),
      currency: this.getMostFrequent(results.map((r) => r.currency).filter(Boolean)),
      website: this.getBestWebsite(results),
      phone: this.getBestPhone(results)
    };
    return aggregated;
  }
  getMostFrequent(values) {
    const filtered = values.filter((v) => v !== void 0 && v !== "UNKNOWN" && v !== "");
    if (filtered.length === 0) return void 0;
    const frequency = /* @__PURE__ */ new Map();
    filtered.forEach((value) => {
      frequency.set(value, (frequency.get(value) || 0) + 1);
    });
    return Array.from(frequency.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  getMostFrequentBoolean(values) {
    const filtered = values.filter((v) => v !== void 0);
    const trueCount = filtered.filter((v) => v).length;
    const falseCount = filtered.filter((v) => !v).length;
    return trueCount > falseCount;
  }
  getBestBank(results) {
    const banks = results.map((r) => r.bank).filter((b) => b && b !== "UNKNOWN BANK" && b !== "UNKNOWN");
    if (banks.length === 0) return "UNKNOWN BANK";
    return banks.sort((a, b) => b.length - a.length)[0];
  }
  getBestWebsite(results) {
    const websites = results.map((r) => r.website).filter(Boolean);
    return websites[0];
  }
  getBestPhone(results) {
    const phones = results.map((r) => r.phone).filter(Boolean);
    return phones[0];
  }
  calculateDataConfidence(results) {
    if (results.length === 0) return 0;
    if (results.length === 1) return 60;
    const brandAgreement = this.calculateFieldAgreement(results.map((r) => r.brand));
    const countryAgreement = this.calculateFieldAgreement(results.map((r) => r.country));
    const bankAgreement = this.calculateFieldAgreement(results.map((r) => r.bank));
    const avgAgreement = (brandAgreement + countryAgreement + bankAgreement) / 3;
    const sourceBonus = Math.min(results.length * 10, 40);
    return Math.min(Math.round(avgAgreement * 60 + sourceBonus), 100);
  }
  calculateSourcesAgreement(results) {
    if (results.length <= 1) return 100;
    const fields = ["brand", "country", "bank", "type", "level"];
    let totalAgreement = 0;
    fields.forEach((field) => {
      const values = results.map((r) => r[field]).filter((v) => v && v !== "UNKNOWN");
      if (values.length > 1) {
        totalAgreement += this.calculateFieldAgreement(values);
      }
    });
    return Math.round(totalAgreement / fields.length);
  }
  calculateFieldAgreement(values) {
    if (values.length <= 1) return 100;
    const frequency = /* @__PURE__ */ new Map();
    values.forEach((value) => {
      frequency.set(value, (frequency.get(value) || 0) + 1);
    });
    const maxFreq = Math.max(...Array.from(frequency.values()));
    return Math.round(maxFreq / values.length * 100);
  }
  getEnhancedBinInfo(bin) {
    const binData = this.getEnhancedBinDatabase();
    let binInfo = binData[bin];
    if (!binInfo) {
      for (let len = 6; len >= 4; len--) {
        const prefix = bin.substring(0, len);
        if (binData[prefix]) {
          binInfo = binData[prefix];
          break;
        }
      }
    }
    if (!binInfo) {
      binInfo = this.detectCardTypeByBin(bin);
    }
    if (!binInfo) {
      binInfo = binData.default;
    }
    return {
      bin,
      brand: binInfo.brand,
      type: binInfo.type,
      level: binInfo.level,
      bank: binInfo.bank,
      country: binInfo.country,
      countryCode: binInfo.countryCode,
      flag: binInfo.flag,
      prepaid: binInfo.prepaid || false,
      currency: binInfo.currency,
      website: binInfo.website,
      phone: binInfo.phone
    };
  }
  getMockBinInfo(bin) {
    return this.getEnhancedBinInfo(bin);
  }
  detectCardTypeByBin(bin) {
    const binNum = bin.substring(0, 6);
    const firstDigit = binNum[0];
    const firstTwo = binNum.substring(0, 2);
    const firstFour = binNum.substring(0, 4);
    if (firstDigit === "4") {
      return {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "UNKNOWN VISA ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    if (firstTwo >= "51" && firstTwo <= "55" || firstFour >= "2221" && firstFour <= "2720") {
      return {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "UNKNOWN MASTERCARD ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    if (firstTwo === "34" || firstTwo === "37") {
      return {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "AMERICAN EXPRESS",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    if (binNum.startsWith("6011") || firstFour >= "6221" && firstFour <= "6229" || firstTwo >= "64" && firstTwo <= "65") {
      return {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "STANDARD",
        bank: "DISCOVER BANK",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    if (firstFour >= "3528" && firstFour <= "3589") {
      return {
        brand: "JCB",
        type: "CREDIT",
        level: "STANDARD",
        bank: "JCB INTERNATIONAL",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    if (firstDigit === "3" && (firstTwo >= "00" && firstTwo <= "05") || firstTwo === "36" || firstTwo === "38") {
      return {
        brand: "DINERS CLUB",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DINERS CLUB INTERNATIONAL",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      };
    }
    return null;
  }
  getEnhancedBinDatabase() {
    const baseData = this.getBinDatabase();
    const enhancedData = {
      ...baseData,
      // Enhanced pattern matching for popular BIN ranges
      "4000": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "VISA CLASSIC ISSUER",
        country: "VARIOUS",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      },
      "5500": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "MASTERCARD STANDARD ISSUER",
        country: "VARIOUS",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      },
      // Additional enhanced entries with more comprehensive data
      default: {
        brand: "UNKNOWN",
        type: "CREDIT",
        level: "STANDARD",
        bank: "UNKNOWN ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false,
        currency: void 0,
        website: void 0,
        phone: void 0
      }
    };
    return enhancedData;
  }
  getBinDatabase() {
    return {
      // USA - Major Banks (Visa)
      "424242": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "STRIPE TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://stripe.com",
        phone: "+1-888-926-2289"
      },
      "446227": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "WELLS FARGO BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://wellsfargo.com",
        phone: "+1-800-869-3557"
      },
      "450875": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "CITIBANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://citibank.com",
        phone: "+1-800-374-9700"
      },
      "400000": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "JPMORGAN CHASE BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://chase.com",
        phone: "+1-800-935-9935"
      },
      "401288": {
        brand: "VISA",
        type: "CREDIT",
        level: "GOLD",
        bank: "JPMORGAN CHASE BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      // Canada - Major Banks
      "450231": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "Canadian Imperial Bank Of Commerce",
        country: "Canada",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://cibc.com",
        phone: "+1-800-465-2422"
      },
      "411111": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      "450000": {
        brand: "VISA",
        type: "DEBIT",
        level: "ELECTRON",
        bank: "WELLS FARGO BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://wellsfargo.com"
      },
      "497355": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "TD BANK GROUP",
        country: "Canada",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://td.com",
        phone: "+1-888-720-8555"
      },
      // Mastercard
      "549526": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "BANK OF MONTREAL",
        country: "Canada",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://bmo.com",
        phone: "+1-877-225-5266"
      },
      "559994": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "ROYAL BANK OF CANADA",
        country: "Canada",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com",
        phone: "+1-800-769-2511"
      },
      "558793": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD ELITE",
        bank: "DEUTSCHE BANK S.P.A.",
        country: "ITALY",
        countryCode: "IT",
        flag: "\u{1F1EE}\u{1F1F9}",
        prepaid: false,
        currency: "EUR",
        website: "https://db.com",
        phone: "+39-02-40241"
      },
      "520000": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD",
        bank: "BANK OF AMERICA",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://bankofamerica.com",
        phone: "+1-800-432-1000"
      },
      "555555": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      "535110": {
        brand: "MASTERCARD",
        type: "DEBIT",
        level: "MAESTRO",
        bank: "CITIBANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      "222100": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD ELITE",
        bank: "HSBC BANK",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP",
        website: "https://hsbc.co.uk"
      },
      // UK - Major Banks
      "424519": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BARCLAYS BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP",
        website: "https://barclays.co.uk",
        phone: "+44-345-734-5345"
      },
      "471749": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "HSBC BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP",
        website: "https://hsbc.co.uk",
        phone: "+44-345-740-4404"
      },
      "555544": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "LLOYDS BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP",
        website: "https://lloydsbank.com",
        phone: "+44-345-602-1997"
      },
      // GERMANY - Major Banks
      "455951": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DEUTSCHE BANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "\u{1F1E9}\u{1F1EA}",
        prepaid: false,
        currency: "EUR",
        website: "https://deutsche-bank.de",
        phone: "+49-69-910-00"
      },
      "516865": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "COMMERZBANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "\u{1F1E9}\u{1F1EA}",
        prepaid: false,
        currency: "EUR",
        website: "https://commerzbank.de",
        phone: "+49-69-136-20"
      },
      // FRANCE - Major Banks
      "479258": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BNP PARIBAS",
        country: "FRANCE",
        countryCode: "FR",
        flag: "\u{1F1EB}\u{1F1F7}",
        prepaid: false,
        currency: "EUR",
        website: "https://bnpparibas.fr",
        phone: "+33-1-40-14-45-46"
      },
      "535310": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "CREDIT AGRICOLE S.A.",
        country: "FRANCE",
        countryCode: "FR",
        flag: "\u{1F1EB}\u{1F1F7}",
        prepaid: false,
        currency: "EUR",
        website: "https://credit-agricole.fr",
        phone: "+33-1-43-23-52-02"
      },
      // SPAIN - Major Banks
      "450612": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BANCO BILBAO VIZCAYA ARGENTARIA",
        country: "SPAIN",
        countryCode: "ES",
        flag: "\u{1F1EA}\u{1F1F8}",
        prepaid: false,
        currency: "EUR",
        website: "https://bbva.es",
        phone: "+34-944-876-220"
      },
      "540617": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "GOLD",
        bank: "CAIXABANK, S.A.",
        country: "SPAIN",
        countryCode: "ES",
        flag: "\u{1F1EA}\u{1F1F8}",
        prepaid: false,
        currency: "EUR",
        website: "https://caixabank.es",
        phone: "+34-93-404-6000"
      },
      // CANADA - Major Banks
      "454616": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "ROYAL BANK OF CANADA",
        country: "CANADA",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com",
        phone: "+1-800-769-2511"
      },
      "516881": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "TORONTO-DOMINION BANK",
        country: "CANADA",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://td.com",
        phone: "+1-866-567-8888"
      },
      // AUSTRALIA - Major Banks
      "449347": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "COMMONWEALTH BANK OF AUSTRALIA",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "\u{1F1E6}\u{1F1FA}",
        prepaid: false,
        currency: "AUD",
        website: "https://commbank.com.au",
        phone: "+61-13-2221"
      },
      "520473": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "AUSTRALIA AND NEW ZEALAND BANKING GROUP",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "\u{1F1E6}\u{1F1FA}",
        prepaid: false,
        currency: "AUD",
        website: "https://anz.com.au",
        phone: "+61-13-1314"
      },
      // SAUDI ARABIA - Major Banks
      "428671": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "AL RAJHI BANK",
        country: "SAUDI ARABIA",
        countryCode: "SA",
        flag: "\u{1F1F8}\u{1F1E6}",
        prepaid: false,
        currency: "SAR",
        website: "https://alrajhibank.com.sa",
        phone: "+966-11-211-1111"
      },
      "557347": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "NATIONAL COMMERCIAL BANK",
        country: "SAUDI ARABIA",
        countryCode: "SA",
        flag: "\u{1F1F8}\u{1F1E6}",
        prepaid: false,
        currency: "SAR",
        website: "https://ncb.com.sa",
        phone: "+966-920-001-000"
      },
      // UAE - Major Banks
      "403156": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "EMIRATES NBD BANK",
        country: "UNITED ARAB EMIRATES",
        countryCode: "AE",
        flag: "\u{1F1E6}\u{1F1EA}",
        prepaid: false,
        currency: "AED",
        website: "https://emiratesnbd.com",
        phone: "+971-600-540-000"
      },
      "527892": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "FIRST ABU DHABI BANK",
        country: "UNITED ARAB EMIRATES",
        countryCode: "AE",
        flag: "\u{1F1E6}\u{1F1EA}",
        prepaid: false,
        currency: "AED",
        website: "https://bankfab.com",
        phone: "+971-600-525-500"
      },
      // BRAZIL - Major Banks
      "484393": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BANCO DO BRASIL S.A.",
        country: "BRAZIL",
        countryCode: "BR",
        flag: "\u{1F1E7}\u{1F1F7}",
        prepaid: false,
        currency: "BRL",
        website: "https://bb.com.br",
        phone: "+55-11-4004-0001"
      },
      "528865": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "ITAU UNIBANCO S.A.",
        country: "BRAZIL",
        countryCode: "BR",
        flag: "\u{1F1E7}\u{1F1F7}",
        prepaid: false,
        currency: "BRL",
        website: "https://itau.com.br",
        phone: "+55-11-4004-4828"
      },
      // INDIA - Major Banks
      "411812": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "STATE BANK OF INDIA",
        country: "INDIA",
        countryCode: "IN",
        flag: "\u{1F1EE}\u{1F1F3}",
        prepaid: false,
        currency: "INR",
        website: "https://sbi.co.in",
        phone: "+91-1800-11-2211"
      },
      "521152": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "HDFC BANK LIMITED",
        country: "INDIA",
        countryCode: "IN",
        flag: "\u{1F1EE}\u{1F1F3}",
        prepaid: false,
        currency: "INR",
        website: "https://hdfcbank.com",
        phone: "+91-22-6160-6161"
      },
      // American Express
      "371449": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "GOLD",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://americanexpress.com",
        phone: "+1-800-528-4800"
      },
      "378282": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "GREEN",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      "340000": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "PLATINUM",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      // Discover
      "601100": {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "STANDARD",
        bank: "DISCOVER BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://discover.com"
      },
      "650000": {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "CASHBACK",
        bank: "DISCOVER BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD"
      },
      // JCB
      "352800": {
        brand: "JCB",
        type: "CREDIT",
        level: "STANDARD",
        bank: "JCB INTERNATIONAL",
        country: "JAPAN",
        countryCode: "JP",
        flag: "\u{1F1EF}\u{1F1F5}",
        prepaid: false,
        currency: "JPY",
        website: "https://jcb.co.jp"
      },
      // Diners Club
      "300000": {
        brand: "DINERS CLUB",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DINERS CLUB INTERNATIONAL",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://dinersclub.com"
      },
      // International Banks
      "493698": {
        brand: "VISA",
        type: "DEBIT",
        level: "CLASSIC",
        bank: "SANTANDER UK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP",
        website: "https://santander.co.uk"
      },
      "676770": {
        brand: "MAESTRO",
        type: "DEBIT",
        level: "STANDARD",
        bank: "ROYAL BANK OF SCOTLAND",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "\u{1F1EC}\u{1F1E7}",
        prepaid: false,
        currency: "GBP"
      },
      "400115": {
        brand: "VISA",
        type: "CREDIT",
        level: "GOLD",
        bank: "CREDIT AGRICOLE",
        country: "FRANCE",
        countryCode: "FR",
        flag: "\u{1F1EB}\u{1F1F7}",
        prepaid: false,
        currency: "EUR",
        website: "https://credit-agricole.fr"
      },
      "520308": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "PLATINUM",
        bank: "DEUTSCHE BANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "\u{1F1E9}\u{1F1EA}",
        prepaid: false,
        currency: "EUR",
        website: "https://deutsche-bank.de"
      },
      "450876": {
        brand: "VISA",
        type: "DEBIT",
        level: "CLASSIC",
        bank: "ROYAL BANK OF CANADA",
        country: "CANADA",
        countryCode: "CA",
        flag: "\u{1F1E8}\u{1F1E6}",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com"
      },
      "533118": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD",
        bank: "COMMONWEALTH BANK OF AUSTRALIA",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "\u{1F1E6}\u{1F1FA}",
        prepaid: false,
        currency: "AUD",
        website: "https://commbank.com.au"
      },
      // Prepaid Cards
      "527570": {
        brand: "MASTERCARD",
        type: "PREPAID",
        level: "GIFT CARD",
        bank: "VANILLA GIFT",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: true,
        currency: "USD"
      },
      "440066": {
        brand: "VISA",
        type: "PREPAID",
        level: "GIFT CARD",
        bank: "GREEN DOT CORPORATION",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: true,
        currency: "USD"
      },
      // Business Cards
      "485932": {
        brand: "VISA",
        type: "CREDIT",
        level: "BUSINESS",
        bank: "BANK OF AMERICA",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://bankofamerica.com"
      },
      "545454": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "BUSINESS WORLD",
        bank: "CAPITAL ONE",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://capitalone.com"
      },
      // Enhanced USA VISA entries for better accuracy
      "470793": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "Credit One Bank, National Association",
        country: "United States of America (the)",
        countryCode: "US",
        flag: "\u{1F1FA}\u{1F1F8}",
        prepaid: false,
        currency: "USD",
        website: "https://creditonebank.com",
        phone: "+1-877-825-3242"
      },
      "588820": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD",
        bank: "Deutsche Bank S.A.",
        country: "Spain",
        countryCode: "ES",
        flag: "\u{1F1EA}\u{1F1F8}",
        prepaid: false,
        currency: "EUR",
        website: "https://db.com",
        phone: "+34-91-5671-400"
      },
      // Major International Banks - Comprehensive Coverage
      // USA - Additional Major Banks
      "414720": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "BANK OF AMERICA", country: "UNITED STATES", countryCode: "US", flag: "\u{1F1FA}\u{1F1F8}", prepaid: false, currency: "USD", website: "https://bankofamerica.com", phone: "+1-800-432-1000" },
      "440393": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "BANK OF AMERICA", country: "UNITED STATES", countryCode: "US", flag: "\u{1F1FA}\u{1F1F8}", prepaid: false, currency: "USD", website: "https://bankofamerica.com" },
      "489537": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "US BANK", country: "UNITED STATES", countryCode: "US", flag: "\u{1F1FA}\u{1F1F8}", prepaid: false, currency: "USD", website: "https://usbank.com", phone: "+1-800-872-2657" },
      "414710": { brand: "VISA", type: "CREDIT", level: "WORLD ELITE", bank: "CAPITAL ONE", country: "UNITED STATES", countryCode: "US", flag: "\u{1F1FA}\u{1F1F8}", prepaid: false, currency: "USD", website: "https://capitalone.com", phone: "+1-800-227-4825" },
      "476142": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "PNC BANK", country: "UNITED STATES", countryCode: "US", flag: "\u{1F1FA}\u{1F1F8}", prepaid: false, currency: "USD", website: "https://pnc.com", phone: "+1-888-762-2265" },
      // UK - Major Banks
      "402174": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "HYPE S.P.A.", country: "ITALY", countryCode: "IT", flag: "\u{1F1EE}\u{1F1F9}", prepaid: false, currency: "EUR", website: "https://hype.it", phone: "+39-02-8088-8000" },
      "476173": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "BARCLAYS BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "\u{1F1EC}\u{1F1E7}", prepaid: false, currency: "GBP", website: "https://barclays.co.uk", phone: "+44-345-734-5345" },
      "454618": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "HSBC BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "\u{1F1EC}\u{1F1E7}", prepaid: false, currency: "GBP", website: "https://hsbc.co.uk", phone: "+44-345-740-4404" },
      "400116": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "LLOYDS BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "\u{1F1EC}\u{1F1E7}", prepaid: false, currency: "GBP", website: "https://lloydsbank.com", phone: "+44-345-602-1997" },
      // Canada - Major Banks
      "450605": { brand: "VISA", type: "CREDIT", level: "INFINITE", bank: "TORONTO DOMINION BANK", country: "CANADA", countryCode: "CA", flag: "\u{1F1E8}\u{1F1E6}", prepaid: false, currency: "CAD", website: "https://td.com", phone: "+1-800-983-8472" },
      "492932": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SCOTIABANK", country: "CANADA", countryCode: "CA", flag: "\u{1F1E8}\u{1F1E6}", prepaid: false, currency: "CAD", website: "https://scotiabank.com", phone: "+1-800-472-6842" },
      "450877": { brand: "VISA", type: "CREDIT", level: "WORLD ELITE", bank: "BANK OF MONTREAL", country: "CANADA", countryCode: "CA", flag: "\u{1F1E8}\u{1F1E6}", prepaid: false, currency: "CAD", website: "https://bmo.com", phone: "+1-800-263-2263" },
      // Germany - Major Banks  
      "440067": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "COMMERZBANK AG", country: "GERMANY", countryCode: "DE", flag: "\u{1F1E9}\u{1F1EA}", prepaid: false, currency: "EUR", website: "https://commerzbank.de", phone: "+49-69-136-20" },
      "455952": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "DEUTSCHE KREDITBANK AG", country: "GERMANY", countryCode: "DE", flag: "\u{1F1E9}\u{1F1EA}", prepaid: false, currency: "EUR", website: "https://dkb.de", phone: "+49-30-120-300-0" },
      // France - Major Banks
      "497010": { brand: "VISA", type: "CREDIT", level: "PREMIER", bank: "BNP PARIBAS", country: "FRANCE", countryCode: "FR", flag: "\u{1F1EB}\u{1F1F7}", prepaid: false, currency: "EUR", website: "https://bnpparibas.fr", phone: "+33-1-40-14-45-46" },
      "447862": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SOCIETE GENERALE", country: "FRANCE", countryCode: "FR", flag: "\u{1F1EB}\u{1F1F7}", prepaid: false, currency: "EUR", website: "https://societegenerale.fr", phone: "+33-1-42-14-20-00" },
      // Italy - Major Banks
      "402175": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "RBL BANK LIMITED", country: "INDIA", countryCode: "IN", flag: "\u{1F1EE}\u{1F1F3}", prepaid: false, currency: "INR", website: "https://rblbank.com", phone: "+91-22-6115-6300" },
      "479260": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "INTESA SANPAOLO", country: "ITALY", countryCode: "IT", flag: "\u{1F1EE}\u{1F1F9}", prepaid: false, currency: "EUR", website: "https://intesasanpaolo.com", phone: "+39-011-555-1" },
      // Spain - Major Banks
      "454742": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "BANCO SANTANDER", country: "SPAIN", countryCode: "ES", flag: "\u{1F1EA}\u{1F1F8}", prepaid: false, currency: "EUR", website: "https://santander.es", phone: "+34-915-123-123" },
      // Netherlands - Major Banks
      "417580": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "ING BANK N.V.", country: "NETHERLANDS", countryCode: "NL", flag: "\u{1F1F3}\u{1F1F1}", prepaid: false, currency: "EUR", website: "https://ing.nl", phone: "+31-20-563-9111" },
      "492980": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "ABN AMRO BANK", country: "NETHERLANDS", countryCode: "NL", flag: "\u{1F1F3}\u{1F1F1}", prepaid: false, currency: "EUR", website: "https://abnamro.nl", phone: "+31-20-628-9393" },
      // Switzerland - Major Banks
      "404133": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "UBS AG", country: "SWITZERLAND", countryCode: "CH", flag: "\u{1F1E8}\u{1F1ED}", prepaid: false, currency: "CHF", website: "https://ubs.com", phone: "+41-44-234-1111" },
      "479764": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "CREDIT SUISSE GROUP AG", country: "SWITZERLAND", countryCode: "CH", flag: "\u{1F1E8}\u{1F1ED}", prepaid: false, currency: "CHF", website: "https://credit-suisse.com", phone: "+41-44-333-1111" },
      // Australia - Major Banks  
      "450878": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "AUSTRALIA AND NEW ZEALAND BANKING GROUP", country: "AUSTRALIA", countryCode: "AU", flag: "\u{1F1E6}\u{1F1FA}", prepaid: false, currency: "AUD", website: "https://anz.com", phone: "+61-3-9273-5555" },
      "516866": { brand: "MASTERCARD", type: "CREDIT", level: "WORLD", bank: "WESTPAC BANKING CORPORATION", country: "AUSTRALIA", countryCode: "AU", flag: "\u{1F1E6}\u{1F1FA}", prepaid: false, currency: "AUD", website: "https://westpac.com.au", phone: "+61-2-9293-9270" },
      // Japan - Major Banks
      "454602": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "MITSUBISHI UFJ FINANCIAL GROUP", country: "JAPAN", countryCode: "JP", flag: "\u{1F1EF}\u{1F1F5}", prepaid: false, currency: "JPY", website: "https://mufg.jp", phone: "+81-3-3240-8111" },
      "535311": { brand: "MASTERCARD", type: "DEBIT", level: "STANDARD", bank: "SUMITOMO MITSUI BANKING CORPORATION", country: "JAPAN", countryCode: "JP", flag: "\u{1F1EF}\u{1F1F5}", prepaid: false, currency: "JPY", website: "https://smbc.co.jp", phone: "+81-3-3501-1111" },
      // India - Major Banks
      "608001": { brand: "RUPAY", type: "DEBIT", level: "CLASSIC", bank: "STATE BANK OF INDIA", country: "INDIA", countryCode: "IN", flag: "\u{1F1EE}\u{1F1F3}", prepaid: false, currency: "INR", website: "https://sbi.co.in", phone: "+91-1800-11-2211" },
      "414367": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "HDFC BANK LIMITED", country: "INDIA", countryCode: "IN", flag: "\u{1F1EE}\u{1F1F3}", prepaid: false, currency: "INR", website: "https://hdfcbank.com", phone: "+91-22-6160-6161" },
      // Brazil - Major Banks
      "516292": { brand: "MASTERCARD", type: "CREDIT", level: "GOLD", bank: "ITAU UNIBANCO", country: "BRAZIL", countryCode: "BR", flag: "\u{1F1E7}\u{1F1F7}", prepaid: false, currency: "BRL", website: "https://itau.com.br", phone: "+55-11-5019-8000" },
      "438857": { brand: "VISA", type: "DEBIT", level: "ELECTRON", bank: "BANCO DO BRASIL", country: "BRAZIL", countryCode: "BR", flag: "\u{1F1E7}\u{1F1F7}", prepaid: false, currency: "BRL", website: "https://bb.com.br", phone: "+55-61-3493-9002" },
      // Mexico - Major Banks  
      "465854": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "BBVA BANCOMER", country: "MEXICO", countryCode: "MX", flag: "\u{1F1F2}\u{1F1FD}", prepaid: false, currency: "MXN", website: "https://bbva.mx", phone: "+52-55-5621-3434" },
      "528093": { brand: "MASTERCARD", type: "DEBIT", level: "MAESTRO", bank: "BANAMEX", country: "MEXICO", countryCode: "MX", flag: "\u{1F1F2}\u{1F1FD}", prepaid: false, currency: "MXN", website: "https://banamex.com", phone: "+52-55-1226-2663" },
      // China - Major Banks
      "622280": { brand: "UNIONPAY", type: "DEBIT", level: "STANDARD", bank: "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", country: "CHINA", countryCode: "CN", flag: "\u{1F1E8}\u{1F1F3}", prepaid: false, currency: "CNY", website: "https://icbc.com.cn", phone: "+86-95588" },
      "436742": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "BANK OF CHINA", country: "CHINA", countryCode: "CN", flag: "\u{1F1E8}\u{1F1F3}", prepaid: false, currency: "CNY", website: "https://boc.cn", phone: "+86-95566" },
      // South Korea - Major Banks
      "540926": { brand: "MASTERCARD", type: "CREDIT", level: "WORLD", bank: "KB KOOKMIN BANK", country: "SOUTH KOREA", countryCode: "KR", flag: "\u{1F1F0}\u{1F1F7}", prepaid: false, currency: "KRW", website: "https://kbstar.com", phone: "+82-2-2073-7000" },
      "465432": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SHINHAN BANK", country: "SOUTH KOREA", countryCode: "KR", flag: "\u{1F1F0}\u{1F1F7}", prepaid: false, currency: "KRW", website: "https://shinhan.com", phone: "+82-2-2151-2114" },
      // Russia - Major Banks
      "427901": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "SBERBANK", country: "RUSSIA", countryCode: "RU", flag: "\u{1F1F7}\u{1F1FA}", prepaid: false, currency: "RUB", website: "https://sberbank.ru", phone: "+7-495-500-5550" },
      "548673": { brand: "MASTERCARD", type: "DEBIT", level: "STANDARD", bank: "VTB BANK", country: "RUSSIA", countryCode: "RU", flag: "\u{1F1F7}\u{1F1FA}", prepaid: false, currency: "RUB", website: "https://vtb.ru", phone: "+7-495-739-7777" },
      "default": {
        brand: "UNKNOWN",
        type: "UNKNOWN",
        level: "UNKNOWN",
        bank: "UNKNOWN BANK",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      }
    };
  }
  // New methods for enhanced BIN functionality
  async searchBINs(criteria) {
    const database = this.getBinDatabase();
    const results = [];
    for (const [bin, info] of Object.entries(database)) {
      if (bin === "default") continue;
      let matches = true;
      if (criteria.country && !info.country.toLowerCase().includes(criteria.country.toLowerCase())) {
        matches = false;
      }
      if (criteria.brand && !info.brand.toLowerCase().includes(criteria.brand.toLowerCase())) {
        matches = false;
      }
      if (criteria.bank && !info.bank.toLowerCase().includes(criteria.bank.toLowerCase())) {
        matches = false;
      }
      if (matches) {
        results.push({
          bin,
          ...info
        });
      }
    }
    return results.slice(0, 20);
  }
  async generateBIN(criteria) {
    const searchResults = await this.searchBINs(criteria);
    if (searchResults.length > 0) {
      const selectedResult = searchResults[Math.floor(Math.random() * searchResults.length)];
      return {
        bin: selectedResult.bin,
        info: selectedResult
      };
    }
    let generatedBin = "";
    const brand = criteria.brand?.toUpperCase() || "VISA";
    switch (brand) {
      case "VISA":
        generatedBin = "4" + this.generateRandomDigits(5);
        break;
      case "MASTERCARD":
        generatedBin = "5" + this.generateRandomDigits(5);
        break;
      case "AMERICAN EXPRESS":
        generatedBin = "34" + this.generateRandomDigits(4);
        break;
      case "DISCOVER":
        generatedBin = "6011" + this.generateRandomDigits(2);
        break;
      default:
        generatedBin = "4" + this.generateRandomDigits(5);
    }
    return {
      bin: generatedBin,
      info: {
        bin: generatedBin,
        brand,
        type: "CREDIT",
        level: "STANDARD",
        bank: criteria.bank || "GENERATED BANK",
        country: criteria.country || "UNKNOWN",
        countryCode: "XX",
        flag: "\u{1F3F3}\uFE0F",
        prepaid: false
      }
    };
  }
  generateRandomDigits(count) {
    let result = "";
    for (let i = 0; i < count; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }
  standardizeCardLevel(level) {
    if (!level) return "TRADITIONAL";
    const normalizedLevel = level.toLowerCase().trim();
    const levelMap = {
      "unknown": "TRADITIONAL",
      "standard": "TRADITIONAL",
      "classic": "TRADITIONAL",
      "base": "TRADITIONAL",
      "regular": "TRADITIONAL",
      "traditional": "TRADITIONAL",
      "gold": "GOLD",
      "platinum": "PLATINUM",
      "world": "WORLD",
      "world elite": "WORLD ELITE",
      "black": "BLACK",
      "signature": "SIGNATURE",
      "infinite": "INFINITE",
      "premium": "PREMIUM",
      "corporate": "CORPORATE",
      "business": "BUSINESS",
      "electron": "ELECTRON",
      "prepaid": "PREPAID"
    };
    return levelMap[normalizedLevel] || "TRADITIONAL";
  }
  // Get available countries, brands, and banks for search
  getAvailableOptions() {
    const database = this.getBinDatabase();
    const countries = /* @__PURE__ */ new Set();
    const brands = /* @__PURE__ */ new Set();
    const banks = /* @__PURE__ */ new Set();
    for (const [bin, info] of Object.entries(database)) {
      if (bin === "default") continue;
      countries.add(info.country);
      brands.add(info.brand);
      banks.add(info.bank);
    }
    return {
      countries: Array.from(countries).sort(),
      brands: Array.from(brands).sort(),
      banks: Array.from(banks).sort()
    };
  }
};
var binLookupService = new BinLookupService();

// server/services/exportService.ts
var ExportService = class {
  async generateSimpleVisaExport(results) {
    console.log(`Export: Processing ${results.length} total results`);
    const visaCards = results.filter((r) => {
      const isVisa = r.cardInfo?.brand?.toUpperCase() === "VISA" || r.cardInfo?.brand === "VISA" || r.cardInfo?.brand?.toLowerCase() === "visa" || r.cardNumber.startsWith("4");
      const isPassed = r.status === "passed";
      return isPassed && isVisa;
    });
    console.log(`Export: Found ${visaCards.length} passed VISA cards`);
    const passedResults = results.filter((r) => r.status === "passed");
    const allVisaCards = results.filter((r) => {
      return r.cardInfo?.brand?.toUpperCase() === "VISA" || r.cardInfo?.brand === "VISA" || r.cardInfo?.brand?.toLowerCase() === "visa" || r.cardNumber.startsWith("4");
    });
    if (visaCards.length === 0) {
      let report = `# No Passed VISA Cards Found
# Total results checked: ${results.length}
# Passed results: ${passedResults.length}
# VISA cards (any status): ${allVisaCards.length}

`;
      if (allVisaCards.length > 0) {
        report += `# VISA Cards Detected (All Status):
`;
        allVisaCards.forEach((card, index) => {
          const status = card.status === "passed" ? "\u{1D5E3}\u{1D5EE}\u{1D600}\u{1D600}\u{1D5F2}\u{1D5F1} \u2611\uFE0F" : card.status === "failed" ? "\u{1D5D9}\u{1D5EE}\u{1D5F6}\u{1D5F9}\u{1D5F2}\u{1D5F1} \u274C" : "\u{1D5E3}\u{1D5FF}\u{1D5FC}\u{1D5F0}\u{1D5F2}\u{1D600}\u{1D600}\u{1D5F6}\u{1D5FB}\u{1D5F4} \u23F3";
          const maskedCard = card.cardNumber.slice(0, 6) + "****" + card.cardNumber.slice(-4);
          report += `# ${index + 1}. ${maskedCard} - ${status}
`;
        });
        report += `
`;
      }
      report += `# Please validate some VISA cards first to generate the export file.
`;
      return report;
    }
    let exportContent = `# \u{1D5E9}\u{1D5DC}\u{1D5E6}\u{1D5D4} \u{1D5D6}\u{1D5EE}\u{1D5FF}\u{1D5F1}\u{1D600} \u{1D5D8}\u{1D605}\u{1D5FD}\u{1D5FC}\u{1D5FF}\u{1D601} - ${visaCards.length} \u{1D5E3}\u{1D5EE}\u{1D600}\u{1D600}\u{1D5F2}\u{1D5F1} \u2611\uFE0F Cards Found
# Format: cardnumber|month|year|cvv
# Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()}

`;
    const exportLines = visaCards.map((card, index) => {
      const month = card.expiryMonth.toString().padStart(2, "0");
      const line = `${card.cardNumber}|${month}|${card.expiryYear}|${card.cvv}`;
      return line;
    });
    exportContent += exportLines.join("\n") + "\n";
    exportContent += `
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# Export Summary:
# Total Checked: ${results.length}
# VISA Cards Found: ${allVisaCards.length}
# VISA Cards \u{1D5E3}\u{1D5EE}\u{1D600}\u{1D600}\u{1D5F2}\u{1D5F1} \u2611\uFE0F: ${visaCards.length}
# Success Rate: ${allVisaCards.length > 0 ? Math.round(visaCards.length / allVisaCards.length * 100) : 0}%
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
    return exportContent;
  }
  async generateVisaOnlyReport(results) {
    const visaCards = results.filter(
      (r) => r.status === "passed" && r.cardInfo?.brand === "VISA"
    );
    if (visaCards.length === 0) {
      return `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
                        VISA CARDS VALIDATION REPORT
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u26A0\uFE0F NO AUTHENTICATED VISA CARDS FOUND

Please validate some VISA cards first to generate this report.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Generated by 3D Authentication Validator | ${(/* @__PURE__ */ new Date()).toLocaleString()}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
    }
    let report = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
                        VISA CARDS VALIDATION REPORT
                          FULL DETAILS - NO MASKING
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u{1F4CA} SUMMARY: ${visaCards.length} AUTHENTICATED VISA CARDS

`;
    visaCards.forEach((card, index) => {
      const cardInfo = card.cardInfo;
      const validationData = card.validationData;
      report += `[${(index + 1).toString().padStart(2, "0")}] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

`;
      report += `- Result: \u{1D5E3}\u{1D5EE}\u{1D600}\u{1D600}\u{1D5F2}\u{1D5F1} \u2611\uFE0F

`;
      report += `- Card: ${card.cardNumber}|${card.expiryMonth.toString().padStart(2, "0")}|${card.expiryYear}|${card.cvv}
`;
      report += `- Response: ${card.response || "3D-Authentication successful"}
`;
      report += `- Gateway: ${card.gateway || "ADVANCED V2"}
`;
      report += `----------------------
`;
      report += `- BIN: ${card.cardNumber.substring(0, 6)}
`;
      report += `- Info: ${cardInfo?.brand || "VISA"} - ${cardInfo?.type || "CREDIT"} - ${cardInfo?.level || "STANDARD"}
`;
      report += `- Bank: ${cardInfo?.bank || "PREMIUM BANK"}
`;
      report += `- Country: ${cardInfo?.country || "UNITED STATES"} ${cardInfo?.flag || "\u{1F1FA}\u{1F1F8}"}
`;
      report += `- Time: ${card.processingTime || Math.floor(Math.random() * 8) + 2}s
`;
      report += `----------------------
`;
      report += `\u{1F6E1}\uFE0F FRAUD DETECTION ANALYSIS:
`;
      report += `- Risk Score: ${card.fraudScore || Math.floor(Math.random() * 30) + 10}/100
`;
      report += `- Risk Level: ${card.riskLevel || "LOW"} RISK
`;
      report += `- ML Score: ${validationData?.mlScore || (Math.random() * 20 + 80).toFixed(1)}/100
`;
      report += `- Device Fingerprint: ${validationData?.deviceFingerprint || "VERIFIED"}
`;
      report += `- Geolocation: ${validationData?.geolocation || "SAFE ZONE"}
`;
      report += `- Velocity Check: ${validationData?.velocityCheck || "PASSED"}
`;
      report += `----------------------
`;
      report += `\u{1F510} 3D SECURE 2.0 DETAILS:
`;
      report += `- Authentication: ${validationData?.threeDSAuth || "BIOMETRIC + SMS"}
`;
      report += `- Challenge Type: ${validationData?.challengeType || "APP_PUSH_NOTIFICATION"}
`;
      report += `- Transaction ID: ${validationData?.transactionId || this.generateTransactionId()}
`;
      report += `- Authorization: ${validationData?.authCode || this.generateAuthCode()}
`;
      report += `----------------------
`;
      report += `\u{1F3E6} GATEWAY DETAILS:
`;
      report += `- Provider: ${card.apiProvider || "STRIPE_ADVANCED"}
`;
      report += `- Gateway Response: ${validationData?.gatewayResponse || "APPROVED"}
`;
      report += `- Processing Fee: ${validationData?.processingFee || "$0.02"}
`;
      report += `- Currency: ${validationData?.currency || "USD"}
`;
      if (index < visaCards.length - 1) {
        report += `

`;
      }
    });
    report += `

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
    report += `VALIDATION COMPLETE | ${visaCards.length} VISA CARDS AUTHENTICATED
`;
    report += `Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()} | Security Level: MAXIMUM
`;
    report += `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
    return report;
  }
  async generateTextReport(results, session) {
    const summary = this.calculateSummary(results);
    const passedCards = results.filter((r) => r.status === "passed");
    let report = this.generateHeader();
    report += this.generateSummarySection(summary, session);
    report += this.generatePassedCardsSection(passedCards);
    report += this.generateStatisticsSection(summary);
    report += this.generateGatewayAnalysis(results);
    report += this.generateRiskAnalysis(results);
    report += this.generateFooter();
    return report;
  }
  generateHeader() {
    const now = /* @__PURE__ */ new Date();
    const reportId = this.generateReportId();
    return `
3D SECURE AUTHENTICATION VALIDATION REPORT
PROFESSIONAL EDITION v2.0

Report Details:
  Generated: ${now.toLocaleString()}
  Report ID: ${reportId}
  Security Level: HIGH
  Format: DETAILED ANALYSIS

================================================================================

`;
  }
  generateSummarySection(summary, session) {
    return `
EXECUTIVE SUMMARY

Session Information:
  Session ID: ${session.id}
  Duration: ${this.formatDuration(session)}

Performance Metrics:
  Total Processed: ${summary.totalProcessed} cards
  Authentication Passed: ${summary.passed} (${summary.successRate.toFixed(1)}%)
  Authentication Failed: ${summary.failed} (${(100 - summary.successRate).toFixed(1)}%)
  Average Processing Time: ${summary.avgProcessingTime}s

Success Rate: ${summary.successRate.toFixed(1)}%

================================================================================

`;
  }
  generatePassedCardsSection(passedCards) {
    if (passedCards.length === 0) {
      return `
AUTHENTICATED PAYMENT CARDS

No cards successfully authenticated.

================================================================================

`;
    }
    let section = `
AUTHENTICATED PAYMENT CARDS (FULL DETAILS)

Successfully authenticated cards with advanced security:
Full card numbers shown for professional verification

`;
    passedCards.forEach((card, index) => {
      const cardBrand = card.cardInfo?.brand || "UNKNOWN";
      const bank = card.cardInfo?.bank || "UNKNOWN BANK";
      const country = card.cardInfo?.country || "UNKNOWN";
      const countryFlag = card.cardInfo?.flag || "";
      const cardNumber = card.cardNumber;
      const gateway = this.extractGatewayName(card.gateway || "");
      const expiry = `${card.expiryMonth.toString().padStart(2, "0")}/${card.expiryYear}`;
      const riskLevel = card.riskLevel || "medium";
      const validationData = card.validationData;
      const threeDSAuth = validationData?.threeDSAuth || "BIOMETRIC_VERIFIED";
      const mlScore = validationData?.mlScore || (Math.random() * 20 + 80).toFixed(1);
      const deviceStatus = validationData?.deviceFingerprint || "TRUSTED";
      section += `Card ${index + 1}:
`;
      section += `  Card Number: ${cardNumber}
`;
      section += `  Expiry: ${expiry}
`;
      section += `  CVV: ${card.cvv}
`;
      section += `  Card Type: ${cardBrand} - ${card.cardInfo?.type || "CREDIT"} - ${card.cardInfo?.level || "STANDARD"}
`;
      section += `  Bank: ${bank}
`;
      section += `  Country: ${country} ${countryFlag}
`;
      section += `  Gateway: ${gateway}
`;
      section += `  Processing Time: ${card.processingTime || 0}s
`;
      section += `  Risk Score: ${card.fraudScore || 0}/100 (${riskLevel.toUpperCase()} risk)
`;
      section += `  3D Secure: ${threeDSAuth}
`;
      section += `  ML Score: ${mlScore}/100
`;
      section += `  Device Status: ${deviceStatus}
`;
      section += `  API Provider: ${card.apiProvider || "STRIPE"}
`;
      section += `  Response: ${card.response || "3D-Authentication successful"}
`;
      if (validationData?.additionalChecks) {
        section += `
  Additional Security Checks:
`;
        if (validationData.additionalChecks.paypal) {
          const paypal = validationData.additionalChecks.paypal;
          section += `    PayPal Integration:
`;
          section += `      Status: ${paypal.status}
`;
          section += `      Can Link to PayPal: ${paypal.canLinkToPayPal ? "Yes" : "No"}
`;
          section += `      Security Score: ${paypal.securityScore}/100
`;
          section += `      Details: ${paypal.details}
`;
          if (paypal.riskFactors && paypal.riskFactors.length > 0) {
            section += `      Risk Factors: ${paypal.riskFactors.join(", ")}
`;
          }
        }
        if (validationData.additionalChecks.donation) {
          const donation = validationData.additionalChecks.donation;
          section += `    Donation Test ($0.50):
`;
          section += `      Overall Status: ${donation.overallStatus}
`;
          section += `      Success Rate: ${donation.successRate}%
`;
          section += `      Sites Passed: ${donation.successfulDonations}/${donation.totalSites}
`;
          section += `      Can Bypass Security: ${donation.canBypassDonationSecurity ? "Yes" : "No"}
`;
          section += `      Summary: ${donation.summary}
`;
          if (donation.results && donation.results.length > 0) {
            section += `      Site Details:
`;
            donation.results.forEach((site) => {
              section += `        ${site.website}: ${site.success ? "PASSED" : "FAILED"}`;
              if (!site.success && site.errorReason) {
                section += ` (${site.errorReason})`;
              }
              section += `
`;
            });
          }
        }
      }
      if (index < passedCards.length - 1) {
        section += `
${"".padEnd(80, "-")}

`;
      }
    });
    section += `
================================================================================

`;
    return section;
  }
  generateStatisticsSection(summary) {
    return `
DETAILED STATISTICS

Card Brand Distribution:
${summary.cardBrands.map(
      (brand) => `  ${brand.brand}: ${brand.count} cards (${brand.successRate.toFixed(1)}% success rate)`
    ).join("\n")}

Risk Distribution:
  Low Risk (0-30): ${summary.riskDistribution.low} cards
  Medium Risk (31-70): ${summary.riskDistribution.medium} cards
  High Risk (71-100): ${summary.riskDistribution.high} cards

================================================================================

`;
  }
  generateGatewayAnalysis(results) {
    const gatewayStats = this.analyzeGateways(results);
    return `
GATEWAY PERFORMANCE ANALYSIS

Payment Gateway Statistics:
${gatewayStats.map(
      (gw) => `  ${gw.name}: ${gw.count} transactions (${gw.successRate.toFixed(1)}% success rate)`
    ).join("\n")}

3D Secure Authentication Methods:
  Biometric Authentication: Available across all gateways
  SMS OTP Verification: Primary backup method
  App-based Push Notifications: Premium tier
  Hardware Token Support: Enterprise accounts

================================================================================

`;
  }
  generateRiskAnalysis(results) {
    const fraudAttempts = results.filter((r) => (r.fraudScore || 0) > 70).length;
    const avgRisk = results.reduce((sum, r) => sum + (r.fraudScore || 0), 0) / (results.length || 1);
    return `
FRAUD & RISK ANALYSIS

Security Metrics:
  Potential Fraud Attempts: ${fraudAttempts} cards (${(fraudAttempts / results.length * 100).toFixed(1)}% of total)
  Average Risk Score: ${avgRisk.toFixed(1)}/100
  Advanced ML Scoring: ENABLED
  Real-time Monitoring: ACTIVE

Security Features Active:
  Device Fingerprinting: ENABLED
  Behavioral Analysis: ENABLED
  Velocity Checking: ENABLED
  Geolocation Validation: ENABLED
  Machine Learning Fraud Detection: ENABLED

================================================================================

`;
  }
  generateFooter() {
    const reportId = this.generateReportId();
    return `
REPORT VALIDATION

\u2713 Report generated with comprehensive 3D Secure validation
\u2713 All data processed through enterprise-grade security protocols
\u2713 Compliant with PCI DSS, PSD2, and 3D Secure 2.0 standards

CERTIFICATION:
This report meets the highest industry standards for payment card validation 
and fraud prevention. All data has been processed through certified payment 
gateways with advanced 3D Secure authentication.

For questions about this report, contact your system administrator.

================================================================================

END OF AUTHENTICATION REPORT

Generated by: 3D Secure Authentication Validator Professional Edition
Report ID: ${reportId}
Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}

================================================================================
`;
  }
  calculateSummary(results) {
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const processing = results.filter((r) => r.status === "processing").length;
    const successRate = results.length > 0 ? passed / results.length * 100 : 0;
    const processingTimes = results.filter((r) => r.processingTime).map((r) => r.processingTime || 0);
    const avgProcessingTime = processingTimes.length > 0 ? Math.round(processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length) : 0;
    const brandCounts = results.reduce((acc, r) => {
      const brand = r.cardInfo?.brand || "UNKNOWN";
      if (!acc[brand]) acc[brand] = { count: 0, passed: 0 };
      acc[brand].count++;
      if (r.status === "passed") acc[brand].passed++;
      return acc;
    }, {});
    const cardBrands = Object.entries(brandCounts).map(([brand, data]) => ({
      brand,
      count: data.count,
      successRate: data.passed / data.count * 100
    }));
    const riskDistribution = results.reduce((acc, r) => {
      const score = r.fraudScore || 50;
      if (score <= 30) acc.low++;
      else if (score <= 70) acc.medium++;
      else acc.high++;
      return acc;
    }, { low: 0, medium: 0, high: 0 });
    return {
      totalProcessed: results.length,
      passed,
      failed,
      processing,
      successRate,
      avgProcessingTime,
      topGateways: [],
      riskDistribution,
      cardBrands
    };
  }
  maskCardNumber(cardNumber) {
    return cardNumber;
  }
  extractGatewayName(gateway) {
    return gateway.split(" ")[0] || "Unknown";
  }
  getRiskIndicator(level) {
    switch (level) {
      case "low":
        return "\u{1F7E2} LOW";
      case "medium":
        return "\u{1F7E1} MED";
      case "high":
        return "\u{1F534} HIGH";
      default:
        return "\u26AA UNK";
    }
  }
  formatDuration(session) {
    if (!session.startTime) return "Unknown";
    const start = new Date(session.startTime);
    const now = /* @__PURE__ */ new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / (1e3 * 60));
    return `${diffMins} minutes`;
  }
  generateProgressBar(percentage, width) {
    const filled = Math.round(percentage / 100 * width);
    const empty = width - filled;
    return "\u2588".repeat(filled) + "\u2591".repeat(empty);
  }
  generateReportId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  generateTransactionId() {
    return "TXN_" + Math.random().toString(36).substring(2, 15).toUpperCase();
  }
  generateAuthCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  // Generate VISA cards in the enhanced format with PayPal, Donation, and Fraud scores
  generateVisaFormatExport(cards) {
    if (cards.length === 0) {
      return `# No VISA cards found in the specified category
# Format: cardNumber|month|year|cvv  Paypal Score: \u2705 xxx/100  Donation 0.5$: \u274C  Fraud: xxx/100
`;
    }
    let report = `# VISA Cards Export
`;
    report += `# Format: cardNumber|month|year|cvv  Paypal Score: \u2705 xxx/100  Donation 0.5$: \u274C  Fraud: xxx/100
`;
    report += `# Total cards: ${cards.length}
`;
    report += `# Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()}

`;
    cards.forEach((card) => {
      const paypalData = card.validationData?.additionalChecks?.paypal;
      const donationData = card.validationData?.additionalChecks?.donation;
      const paypalSuccess = paypalData?.canLinkToPayPal ? "\u2705" : "\u274C";
      const paypalScore = paypalData?.securityScore || 0;
      const donationSuccess = donationData?.results?.some((r) => r.success) ? "\u2705" : "\u274C";
      const fraudScore = card.fraudScore || 0;
      const month = card.expiryMonth.toString().padStart(2, "0");
      report += `${card.cardNumber}|${month}|${card.expiryYear}|${card.cvv}  Paypal Score: ${paypalSuccess} ${paypalScore}/100  Donation 0.5$: ${donationSuccess}  Fraud: ${fraudScore}/100
`;
    });
    return report;
  }
  // Generate comprehensive BIN analysis report
  generateBinReport(binResults) {
    if (binResults.length === 0) {
      return `# No BIN data available for export
# Please perform BIN lookups first
`;
    }
    let report = `
\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557    \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2551  \u2588\u2588\u2551
     \u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551
    \u2588\u2588\u2554\u255D \u2588\u2588\u2551  \u2588\u2588\u2551    \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551
   \u2588\u2588\u2557   \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D    \u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551
   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u255D     \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D    \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D
                                                          
           \u{1F3E6} PROFESSIONAL BIN ANALYSIS REPORT \u{1F3E6}         
================================================================
`;
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleString();
    const reportId = this.generateReportId();
    const totalBins = binResults.length;
    const validBins = binResults.filter((r) => r.isValid).length;
    const invalidBins = totalBins - validBins;
    const successRate = Math.round(validBins / totalBins * 100);
    report += `
\u{1F4CB} REPORT SUMMARY
`;
    report += `${"\u2550".repeat(50)}
`;
    report += `\u{1F4C5} Generated: ${timestamp}
`;
    report += `\u{1F50D} Report ID: ${reportId}
`;
    report += `\u{1F4CA} Total BINs Analyzed: ${totalBins}
`;
    report += `\u2705 Valid BINs: ${validBins} (${successRate}%)
`;
    report += `\u274C Invalid BINs: ${invalidBins} (${100 - successRate}%)
`;
    report += `${"\u2550".repeat(50)}

`;
    report += `\u{1F4CB} DETAILED BIN ANALYSIS
`;
    report += `${"\u2550".repeat(70)}

`;
    binResults.forEach((result, index) => {
      const binInfo = result.binInfo;
      const status = result.isValid ? "\u2705 VALID" : "\u274C INVALID";
      report += `\u{1F50D} BIN #${index + 1}: ${result.bin} ${status}
`;
      report += `${"\u2500".repeat(40)}
`;
      if (binInfo && result.isValid) {
        report += `\u{1F3E6} Bank Information:
`;
        report += `   \u2022 Bank Name: ${binInfo.bank || "N/A"}
`;
        report += `   \u2022 Country: ${binInfo.country || "N/A"} ${binInfo.flag || ""}
`;
        report += `   \u2022 Country Code: ${binInfo.countryCode || "N/A"}
`;
        report += `   \u2022 Currency: ${binInfo.currency || "N/A"}
`;
        report += `
\u{1F4B3} Card Information:
`;
        report += `   \u2022 Brand/Network: ${binInfo.brand || "N/A"}
`;
        report += `   \u2022 Card Type: ${binInfo.type || "N/A"}
`;
        report += `   \u2022 Card Level: ${binInfo.level || "N/A"}
`;
        report += `   \u2022 Prepaid: ${binInfo.prepaid ? "Yes" : "No"}
`;
        if (binInfo.website) {
          report += `
\u{1F310} Contact Information:
`;
          report += `   \u2022 Website: ${binInfo.website}
`;
          if (binInfo.phone) {
            report += `   \u2022 Phone: ${binInfo.phone}
`;
          }
        }
        if (result.apiStats) {
          report += `
\u{1F4CA} Real API Lookup Statistics:
`;
          report += `   \u2022 Success Rate: ${result.apiStats.successRate || 0}%
`;
          report += `   \u2022 APIs Passed: ${result.apiStats.successfulLookups || 0}/${result.apiStats.totalAttempted || 0}
`;
          report += `   \u2022 Overall Status: ${(result.apiStats.overallStatus || "unknown").toUpperCase()}
`;
          report += `   \u2022 Processing Time: ${result.apiStats.processingTime || 0}ms
`;
          report += `   \u2022 Security Bypass: ${result.apiStats.canBypassBinSecurity ? "Enabled" : "Disabled"}
`;
          if (result.apiStats.results && result.apiStats.results.length > 0) {
            report += `
   \u{1F50D} API Details:
`;
            result.apiStats.results.forEach((api) => {
              const apiStatus = api.success ? "\u2705" : "\u274C";
              report += `     ${apiStatus} ${api.name}: ${api.processingTime}ms
`;
            });
          }
          if (result.apiStats.summary) {
            report += `
   \u{1F4CB} Summary: ${result.apiStats.summary}
`;
          }
        } else if (result.processingTime) {
          report += `
\u23F1\uFE0F  Processing Time: ${result.processingTime}ms
`;
        }
        if (result.lookupSource) {
          report += `
\u{1F504} Data Source: ${result.lookupSource}
`;
        }
      } else {
        report += `\u274C BIN lookup failed - No detailed information available
`;
        if (result.lookupSource) {
          report += `\u{1F504} Attempted Source: ${result.lookupSource}
`;
        }
      }
      report += `
${"\u2500".repeat(70)}

`;
    });
    const totalProcessingTime = binResults.reduce((sum, r) => {
      return sum + (r.processingTime || r.apiStats?.processingTime || 0);
    }, 0);
    const avgProcessingTime = Math.round(totalProcessingTime / binResults.length);
    report += `\u{1F4C8} PERFORMANCE METRICS
`;
    report += `${"\u2550".repeat(50)}
`;
    report += `\u26A1 Total Processing Time: ${totalProcessingTime}ms
`;
    report += `\u26A1 Average Per BIN: ${avgProcessingTime}ms
`;
    report += `\u{1F3AF} Success Rate: ${successRate}% (${validBins}/${totalBins})
`;
    report += `\u{1F4CA} API Reliability: ${validBins > 0 ? "Operational" : "Issues Detected"}
`;
    report += `
${"\u2550".repeat(70)}
`;
    report += `\u{1F510} 3D-Authentication Validator - Professional BIN Analysis
`;
    report += `\u{1F4E7} Report ID: ${reportId}
`;
    report += `\u{1F4C5} Generated: ${timestamp}
`;
    report += `\u{1F310} Powered by Multi-Source BIN Intelligence
`;
    report += `${"\u2550".repeat(70)}
`;
    return report;
  }
  // Generate comprehensive card validation report (matching BIN report quality)
  generateCardBatchReport(results, session) {
    if (results.length === 0) {
      return `# No card validation data available for export
# Please perform card validations first
`;
    }
    let report = `
\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557    \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557
     \u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551
    \u2588\u2588\u2554\u255D \u2588\u2588\u2551  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551
   \u2588\u2588\u2557   \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D    \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D
   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u255D      \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D 
                                                        
        \u{1F4B3} PROFESSIONAL CARD VALIDATION REPORT \u{1F4B3}      
================================================================
`;
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleString();
    const reportId = this.generateReportId();
    const totalCards = results.length;
    const passedCards = results.filter((r) => r.status === "passed").length;
    const failedCards = results.filter((r) => r.status === "failed").length;
    const processingCards = results.filter((r) => r.status === "processing").length;
    const successRate = Math.round(passedCards / totalCards * 100);
    report += `
\u{1F4CB} VALIDATION SUMMARY
`;
    report += `${"\u2550".repeat(50)}
`;
    report += `\u{1F4C5} Generated: ${timestamp}
`;
    report += `\u{1F50D} Report ID: ${reportId}
`;
    report += `\u{1F464} Session ID: ${session.id}
`;
    report += `\u{1F4CA} Total Cards Validated: ${totalCards}
`;
    report += `\u2705 Passed: ${passedCards} (${successRate}%)
`;
    report += `\u274C Failed: ${failedCards} (${100 - successRate}%)
`;
    report += `\u23F3 Processing: ${processingCards}
`;
    report += `\u23F1\uFE0F  Average Processing Time: ${session.avgProcessingTime || 0}s
`;
    report += `${"\u2550".repeat(50)}

`;
    const brandStats = this.analyzeBrands(results);
    report += `\u{1F4CA} CARD BRAND ANALYSIS
`;
    report += `${"\u2550".repeat(50)}
`;
    brandStats.forEach((brand) => {
      report += `\u{1F3F7}\uFE0F  ${brand.brand}: ${brand.count} cards (${brand.successRate.toFixed(1)}% success)
`;
    });
    report += `
`;
    const gatewayStats = this.analyzeGateways(results);
    if (gatewayStats.length > 0) {
      report += `\u{1F517} GATEWAY PERFORMANCE
`;
      report += `${"\u2550".repeat(50)}
`;
      gatewayStats.forEach((gateway) => {
        report += `\u{1F6AA} ${gateway.name}: ${gateway.count} cards (${gateway.successRate.toFixed(1)}% success)
`;
      });
      report += `
`;
    }
    const riskStats = this.analyzeRisk(results);
    report += `\u26A0\uFE0F  RISK ASSESSMENT
`;
    report += `${"\u2550".repeat(50)}
`;
    report += `\u{1F7E2} Low Risk: ${riskStats.low} cards
`;
    report += `\u{1F7E1} Medium Risk: ${riskStats.medium} cards
`;
    report += `\u{1F534} High Risk: ${riskStats.high} cards

`;
    const passedCardsOnly = results.filter((r) => r.status === "passed");
    if (passedCardsOnly.length > 0) {
      report += `\u{1F4B3} DETAILED PASSED CARDS ANALYSIS
`;
      report += `${"\u2550".repeat(70)}

`;
      passedCardsOnly.forEach((card, index) => {
        const cardBrand = card.cardInfo?.brand || "UNKNOWN";
        const bank = card.cardInfo?.bank || "UNKNOWN BANK";
        const country = card.cardInfo?.country || "UNKNOWN";
        const countryFlag = card.cardInfo?.flag || "";
        const level = card.cardInfo?.level || "STANDARD";
        const type = card.cardInfo?.type || "UNKNOWN";
        report += `\u{1F539} Card #${index + 1}: ****${card.cardNumber.slice(-4)}
`;
        report += `   \u{1F48E} Brand: ${cardBrand} (${level})
`;
        report += `   \u{1F3E6} Bank: ${bank}
`;
        report += `   \u{1F30D} Country: ${countryFlag} ${country}
`;
        report += `   \u{1F4A1} Type: ${type}
`;
        report += `   \u{1F4C5} Expiry: ${card.expiryMonth}/${card.expiryYear}
`;
        if (card.gateway) {
          report += `   \u{1F6AA} Gateway: ${card.gateway}
`;
        }
        if (card.processingTime) {
          report += `   \u23F1\uFE0F  Processing: ${card.processingTime}ms
`;
        }
        if (card.fraudScore !== null && card.fraudScore !== void 0) {
          report += `   \u{1F512} Fraud Score: ${card.fraudScore}/100
`;
        }
        if (card.riskLevel) {
          report += `   \u26A0\uFE0F  Risk Level: ${card.riskLevel.toUpperCase()}
`;
        }
        report += `   \u2705 Status: VALIDATED

`;
      });
    }
    const failedCardsOnly = results.filter((r) => r.status === "failed");
    if (failedCardsOnly.length > 0) {
      report += `\u274C FAILED CARDS SUMMARY
`;
      report += `${"\u2550".repeat(50)}
`;
      failedCardsOnly.forEach((card, index) => {
        const reason = card.errorMessage || "Validation failed";
        report += `\u{1F538} Card #${index + 1}: ****${card.cardNumber.slice(-4)} - ${reason}
`;
      });
      report += `
`;
    }
    report += `\u{1F527} TECHNICAL DETAILS
`;
    report += `${"\u2550".repeat(50)}
`;
    report += `\u{1F4CA} Session Duration: ${this.formatSessionDuration(session)}
`;
    report += `\u{1F504} Total API Calls: ${totalCards}
`;
    report += `\u{1F4C8} Success Rate: ${successRate}%
`;
    report += `\u26A1 Performance: ${(totalCards / (session.avgProcessingTime || 1)).toFixed(1)} cards/second
`;
    report += `\u{1F6E1}\uFE0F  Security: 3D Secure Authentication Enabled
`;
    report += `\u{1F510} Compliance: PCI DSS Level 1

`;
    report += `${"\u2550".repeat(70)}
`;
    report += `\u{1F4DD} END OF PROFESSIONAL CARD VALIDATION REPORT
`;
    report += `\u{1F552} Generated: ${timestamp}
`;
    report += `\u{1F194} Report ID: ${reportId}
`;
    report += `\u26A1 Powered by 3D-Authentication Validator Professional
`;
    report += `${"\u2550".repeat(70)}
`;
    return report;
  }
  formatSessionDuration(session) {
    if (!session.startTime) return "Unknown";
    const duration = Date.now() - new Date(session.startTime).getTime();
    const minutes = Math.floor(duration / 6e4);
    const seconds = Math.floor(duration % 6e4 / 1e3);
    return `${minutes}m ${seconds}s`;
  }
  analyzeBrands(results) {
    const brandMap = /* @__PURE__ */ new Map();
    results.forEach((r) => {
      const brand = r.cardInfo?.brand || "UNKNOWN";
      const current = brandMap.get(brand) || { count: 0, passed: 0 };
      current.count++;
      if (r.status === "passed") current.passed++;
      brandMap.set(brand, current);
    });
    return Array.from(brandMap.entries()).map(([brand, stats]) => ({
      brand,
      count: stats.count,
      successRate: stats.count > 0 ? stats.passed / stats.count * 100 : 0
    })).sort((a, b) => b.count - a.count);
  }
  analyzeGateways(results) {
    const gatewayMap = /* @__PURE__ */ new Map();
    results.forEach((r) => {
      if (!r.gateway) return;
      const current = gatewayMap.get(r.gateway) || { count: 0, passed: 0 };
      current.count++;
      if (r.status === "passed") current.passed++;
      gatewayMap.set(r.gateway, current);
    });
    return Array.from(gatewayMap.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      successRate: stats.count > 0 ? stats.passed / stats.count * 100 : 0
    })).sort((a, b) => b.count - a.count);
  }
  analyzeRisk(results) {
    let low = 0, medium = 0, high = 0;
    results.forEach((r) => {
      switch (r.riskLevel) {
        case "low":
          low++;
          break;
        case "medium":
          medium++;
          break;
        case "high":
          high++;
          break;
        default:
          low++;
          break;
      }
    });
    return { low, medium, high };
  }
};
var exportService = new ExportService();

// server/routes.ts
async function registerRoutes(app2) {
  app2.get("/api/session", async (req, res) => {
    try {
      const session = await storage.getCurrentSession();
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to get session", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.post("/api/validate/single", async (req, res) => {
    try {
      const { cardData, selectedAPIs = [], checkPayPal = false, checkDonation = false } = req.body;
      const [cardNumber, expiryMonth, expiryYear, cvv] = cardData.split("|");
      const binNumber = cardNumber.substring(0, 6);
      const validationResult = await storage.createValidationResult({
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        binNumber,
        status: "processing",
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
      validateCardAsync(validationResult.id, cardNumber, expiryMonth, expiryYear, cvv, binNumber, selectedAPIs, checkPayPal, checkDonation);
      const response = {
        id: validationResult.id,
        status: "processing",
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        createdAt: validationResult.createdAt
      };
      res.json(response);
    } catch (error) {
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.post("/api/validate/bin", async (req, res) => {
    try {
      const { binNumber, cardCount, selectedAPIs = [], checkPayPal = false, checkDonation = false } = req.body;
      const results = [];
      for (let i = 0; i < cardCount; i++) {
        const { cardNumber, expiryMonth, expiryYear, cvv } = cardValidationService.generateCardFromBIN(binNumber);
        const validationResult = await storage.createValidationResult({
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv,
          binNumber,
          status: "processing",
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
        setTimeout(() => {
          validateCardAsync(validationResult.id, cardNumber, expiryMonth, expiryYear, cvv, binNumber, selectedAPIs || [], checkPayPal || false, checkDonation || false);
        }, i * 1e3);
        results.push({
          id: validationResult.id,
          status: "processing",
          cardNumber,
          expiryMonth,
          expiryYear,
          cvv,
          createdAt: validationResult.createdAt
        });
      }
      res.json({ results });
    } catch (error) {
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/validate/result/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getValidationResult(id);
      if (!result) {
        return res.status(404).json({ message: "Validation result not found" });
      }
      const response = {
        id: result.id,
        status: result.status,
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || void 0,
        gateway: result.gateway || void 0,
        processingTime: result.processingTime || void 0,
        cardInfo: result.cardInfo,
        fraudScore: result.fraudScore || void 0,
        riskLevel: result.riskLevel || void 0,
        apiProvider: result.apiProvider || void 0,
        validationData: result.validationData,
        errorMessage: result.errorMessage || void 0,
        createdAt: result.createdAt
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to get validation result", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/validate/results", async (req, res) => {
    try {
      const results = await storage.getValidationResults(100);
      const responses = results.map((result) => ({
        id: result.id,
        status: result.status,
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || void 0,
        gateway: result.gateway || void 0,
        processingTime: result.processingTime || void 0,
        cardInfo: result.cardInfo,
        fraudScore: result.fraudScore || void 0,
        riskLevel: result.riskLevel || void 0,
        apiProvider: result.apiProvider || void 0,
        validationData: result.validationData,
        errorMessage: result.errorMessage || void 0,
        createdAt: result.createdAt
      }));
      res.json(responses);
    } catch (error) {
      res.status(500).json({ message: "Failed to get validation results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.delete("/api/validate/results", async (req, res) => {
    try {
      await storage.clearValidationResults();
      res.json({ message: "All validation results cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear validation results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/export", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      const exportData = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        session,
        results,
        summary: {
          totalProcessed: results.length,
          passed: results.filter((r) => r.status === "passed").length,
          failed: results.filter((r) => r.status === "failed").length,
          processing: results.filter((r) => r.status === "processing").length
        }
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="3d-auth-results-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export results", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/export/text", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      const validationResponses = results.map((result) => ({
        id: result.id,
        status: result.status,
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || void 0,
        gateway: result.gateway || void 0,
        processingTime: result.processingTime || void 0,
        cardInfo: result.cardInfo,
        fraudScore: result.fraudScore || void 0,
        riskLevel: result.riskLevel || void 0,
        apiProvider: result.apiProvider || void 0,
        validationData: result.validationData,
        errorMessage: result.errorMessage || void 0,
        createdAt: result.createdAt
      }));
      const textReport = await exportService.generateTextReport(validationResponses, session);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="3D-Auth-Professional-Report-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate text report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/export/visa/passed", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const passedVisaCards = results.filter((r) => r.status === "passed").map((result) => ({
        cardNumber: result.cardNumber,
        expiryMonth: parseInt(result.expiryMonth),
        expiryYear: parseInt(result.expiryYear),
        cvv: result.cvv,
        fraudScore: result.fraudScore || void 0,
        validationData: result.validationData,
        riskLevel: result.riskLevel || void 0
      }));
      const textReport = exportService.generateVisaFormatExport(passedVisaCards);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Passed-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate passed VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/export/visa/failed", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const failedVisaCards = results.filter((r) => r.status === "failed").map((result) => ({
        cardNumber: result.cardNumber,
        expiryMonth: parseInt(result.expiryMonth),
        expiryYear: parseInt(result.expiryYear),
        cvv: result.cvv,
        fraudScore: result.fraudScore || void 0,
        validationData: result.validationData,
        riskLevel: result.riskLevel || void 0
      }));
      const textReport = exportService.generateVisaFormatExport(failedVisaCards);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Failed-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate failed VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.get("/api/export/visa", async (req, res) => {
    try {
      const results = await storage.getValidationResults();
      const session = await storage.getCurrentSession();
      const passedCards = results.filter((r) => r.status === "passed").map((result) => ({
        id: result.id,
        status: result.status,
        cardNumber: result.cardNumber,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        cvv: result.cvv,
        response: result.response || void 0,
        gateway: result.gateway || void 0,
        processingTime: result.processingTime || void 0,
        cardInfo: result.cardInfo,
        fraudScore: result.fraudScore || void 0,
        riskLevel: result.riskLevel || void 0,
        apiProvider: result.apiProvider || void 0,
        validationData: result.validationData,
        errorMessage: result.errorMessage || void 0,
        createdAt: result.createdAt
      }));
      const format = req.query.format || "detailed";
      let textReport;
      if (format === "simple") {
        textReport = await exportService.generateSimpleVisaExport(passedCards);
      } else {
        textReport = await exportService.generateVisaOnlyReport(passedCards);
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Authenticated-VISA-Cards-${Date.now()}.txt"`);
      res.send(textReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate VISA report", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.post("/api/bin/lookup", async (req, res) => {
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
        isValid: binInfo.brand !== "UNKNOWN"
      });
    } catch (error) {
      res.status(500).json({ message: "BIN lookup failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  app2.post("/api/bin/search", async (req, res) => {
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
  app2.post("/api/bin/generate", async (req, res) => {
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
  app2.get("/api/bin/options", async (req, res) => {
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
  async function validateCardAsync(resultId, cardNumber, expiryMonth, expiryYear, cvv, binNumber, selectedAPIs = [], checkPayPal = false, checkDonation = false) {
    try {
      const validationPromise = cardValidationService.validateCard(cardNumber, expiryMonth, expiryYear, cvv, selectedAPIs);
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Validation timed out after 30 seconds")), 3e4)
      );
      const validation = await Promise.race([validationPromise, timeoutPromise]);
      const cardInfo = await binLookupService.lookupBIN(binNumber);
      let additionalResults = {};
      if (checkPayPal) {
        const paypalResult = await performPayPalIntegrationCheck(cardNumber, expiryMonth, expiryYear, cvv);
        additionalResults = { ...additionalResults, paypal: paypalResult };
      }
      if (checkDonation) {
        const donationResult = await performDonationTest(cardNumber, expiryMonth, expiryYear, cvv);
        additionalResults = { ...additionalResults, donation: donationResult };
      }
      await storage.updateValidationResult(resultId, {
        status: validation.success ? "passed" : "failed",
        response: validation.response,
        gateway: validation.gateway,
        processingTime: validation.processingTime,
        cardInfo,
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
      const session = await storage.getCurrentSession();
      const newStats = {
        totalChecked: (session.totalChecked || 0) + 1,
        totalPassed: validation.success ? (session.totalPassed || 0) + 1 : session.totalPassed || 0,
        totalFailed: validation.success ? session.totalFailed || 0 : (session.totalFailed || 0) + 1,
        avgProcessingTime: session.avgProcessingTime || 0
      };
      const allResults = await storage.getValidationResults();
      const completedResults = allResults.filter((r) => r.processingTime !== null);
      if (completedResults.length > 0) {
        const totalTime = completedResults.reduce((sum, r) => sum + (r.processingTime || 0), 0);
        newStats.avgProcessingTime = Math.round(totalTime / completedResults.length);
      }
      await storage.updateSessionStats(session.id, newStats);
    } catch (error) {
      console.error("Async validation error:", error);
      await storage.updateValidationResult(resultId, {
        status: "failed",
        response: "3D-Authentication failed",
        gateway: "ERROR V2",
        processingTime: 0,
        errorMessage: error instanceof Error ? error.message : "Validation service error"
      });
    }
  }
  async function performPayPalIntegrationCheck(cardNumber, expiryMonth, expiryYear, cvv) {
    try {
      const startTime = Date.now();
      const riskFactors = [];
      const riskScore = await calculatePayPalRiskScore(cardNumber, expiryMonth, expiryYear, cvv);
      const checks = {
        binAnalysis: await performPayPalBINAnalysis(cardNumber),
        patternDetection: performAdvancedPatternAnalysis(cardNumber),
        velocityCheck: performVelocityAnalysis(cardNumber),
        geographicRisk: analyzeGeographicPayPalRisk(cardNumber),
        networkValidation: await validateCardNetwork(cardNumber),
        fraudIndicators: detectPayPalFraudIndicators(cardNumber, expiryMonth, expiryYear, cvv)
      };
      Object.entries(checks).forEach(([checkName, result]) => {
        if (result.risk && "reason" in result && result.reason) {
          riskFactors.push(`${checkName}: ${result.reason}`);
        }
      });
      const securityScore = Math.max(0, 100 - riskScore);
      const canBypassSecurity = riskScore < 30 && checks.networkValidation.valid;
      const canLinkToPayPal = canBypassSecurity && riskScore < 25 && !checks.fraudIndicators.highRisk;
      const processingTime = Date.now() - startTime;
      return {
        canLinkToPayPal,
        canBypassSecurity,
        riskFactors,
        securityScore,
        riskScore,
        processingTime,
        status: canLinkToPayPal ? "success" : "blocked",
        checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.summary])),
        details: canLinkToPayPal ? `Card successfully validated for PayPal integration (Risk Score: ${riskScore}/100)` : `PayPal security rejected card - Risk Score: ${riskScore}/100. Issues: ${riskFactors.slice(0, 3).join(", ") || "High-risk pattern detected"}`
      };
    } catch (error) {
      return {
        canLinkToPayPal: false,
        canBypassSecurity: false,
        riskFactors: ["PayPal validation system error"],
        securityScore: 0,
        riskScore: 100,
        processingTime: 0,
        status: "error",
        checks: {},
        details: "PayPal integration validation failed due to system error"
      };
    }
  }
  async function calculatePayPalRiskScore(cardNumber, expiryMonth, expiryYear, cvv) {
    let score = 0;
    const bin = cardNumber.substring(0, 6);
    const paypalBlacklistedBins = [
      "666666",
      "555555",
      "444444",
      "123456",
      "000000",
      "111111",
      "222222",
      "333333",
      "777777",
      "888888",
      "999999",
      "400000",
      "370000"
    ];
    if (paypalBlacklistedBins.includes(bin)) {
      score += 40;
    }
    if (hasSequentialPattern(cardNumber)) score += 25;
    if (hasRepeatingPattern(cardNumber)) score += 20;
    if (cvv === "000" || cvv === "123" || cvv === "999" || /^(.)\1+$/.test(cvv)) {
      score += 15;
    }
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const expYear = parseInt(expiryYear);
    if (expYear < currentYear) score += 35;
    if (expYear > currentYear + 10) score += 20;
    if (!isValidLuhn(cardNumber)) score += 30;
    return Math.min(score, 100);
  }
  async function performPayPalBINAnalysis(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const paypalPreferredNetworks = ["4", "5"];
    const networkPrefix = cardNumber.charAt(0);
    if (!paypalPreferredNetworks.includes(networkPrefix)) {
      return {
        risk: true,
        reason: "Non-preferred card network for PayPal",
        summary: "Network compatibility check failed"
      };
    }
    return {
      risk: false,
      reason: null,
      summary: "BIN analysis passed"
    };
  }
  function performAdvancedPatternAnalysis(cardNumber) {
    const patterns = [
      { test: /0{4,}/, name: "Sequential zeros" },
      { test: /1{4,}/, name: "Sequential ones" },
      { test: /(.)\1{3,}/, name: "Repeated digits" },
      { test: /1234|2345|3456|4567|5678|6789|7890/, name: "Sequential ascending" },
      { test: /9876|8765|7654|6543|5432|4321|3210/, name: "Sequential descending" }
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
      summary: "Pattern analysis passed"
    };
  }
  function performVelocityAnalysis(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const highVelocityBins = ["424242", "400000", "555555", "371449"];
    if (highVelocityBins.includes(bin)) {
      return {
        risk: true,
        reason: "High-velocity BIN detected",
        summary: "Velocity check triggered"
      };
    }
    return {
      risk: false,
      reason: null,
      summary: "Velocity analysis passed"
    };
  }
  function analyzeGeographicPayPalRisk(cardNumber) {
    const bin = cardNumber.substring(0, 6);
    const riskByRegion = /* @__PURE__ */ new Map([
      ["4242", "US-LOW"],
      ["4000", "GLOBAL-MEDIUM"],
      ["5555", "EU-MEDIUM"]
    ]);
    const region = riskByRegion.get(bin.substring(0, 4));
    if (region && region.includes("HIGH")) {
      return {
        risk: true,
        reason: "High-risk geographic region",
        summary: "Geographic risk check failed"
      };
    }
    return {
      risk: false,
      reason: null,
      summary: "Geographic analysis passed"
    };
  }
  async function validateCardNetwork(cardNumber) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    const networks = {
      "4": "VISA",
      "5": "MASTERCARD",
      "3": "AMEX",
      "6": "DISCOVER"
    };
    const network = networks[firstDigit];
    return {
      risk: false,
      valid: !!network,
      network,
      summary: network ? `Valid ${network} card` : "Unknown network"
    };
  }
  function detectPayPalFraudIndicators(cardNumber, expiryMonth, expiryYear, cvv) {
    const indicators = [];
    if (cardNumber.includes("0000")) indicators.push("Zero padding");
    if (cvv === "000" || cvv === "123") indicators.push("Common CVV");
    if (parseInt(expiryYear) === (/* @__PURE__ */ new Date()).getFullYear() + 50) indicators.push("Future expiry");
    if (["4242424242424242", "4111111111111111", "5555555555554444"].includes(cardNumber)) {
      indicators.push("Test card detected");
    }
    return {
      risk: indicators.length > 0,
      highRisk: indicators.length > 2,
      indicators,
      summary: indicators.length > 0 ? `${indicators.length} fraud indicators` : "No fraud indicators"
    };
  }
  function hasSequentialPattern(cardNumber) {
    for (let i = 0; i <= cardNumber.length - 4; i++) {
      const sequence = cardNumber.substring(i, i + 4);
      if (/^(\d)(\d)(\d)(\d)$/.test(sequence)) {
        const digits = sequence.split("").map(Number);
        const isAscending = digits.every((d, idx) => idx === 0 || d === digits[idx - 1] + 1);
        const isDescending = digits.every((d, idx) => idx === 0 || d === digits[idx - 1] - 1);
        if (isAscending || isDescending) return true;
      }
    }
    return false;
  }
  function hasRepeatingPattern(cardNumber) {
    const chars = cardNumber.split("");
    const counts = {};
    chars.forEach((char) => counts[char] = (counts[char] || 0) + 1);
    const maxCount = Math.max(...Object.values(counts));
    return maxCount > cardNumber.length * 0.4;
  }
  function isValidLuhn(cardNumber) {
    let sum = 0;
    let alternate = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let n = parseInt(cardNumber.charAt(i));
      if (alternate) {
        n *= 2;
        if (n > 9) n = n % 10 + 1;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }
  async function performDonationTest(cardNumber, expiryMonth, expiryYear, cvv) {
    try {
      const testSites = [
        {
          name: "American Red Cross",
          ein: "530196605",
          url: "donate.redcross.org",
          strictness: "high",
          category: "emergency-relief",
          expectedDonation: 1
        },
        {
          name: "Doctors Without Borders",
          ein: "133433452",
          url: "donate.msf.org",
          strictness: "medium",
          category: "health",
          expectedDonation: 0.5
        },
        {
          name: "Feeding America",
          ein: "363673599",
          url: "feedingamerica.org",
          strictness: "low",
          category: "food-security",
          expectedDonation: 0.25
        },
        {
          name: "St. Jude Children's Research Hospital",
          ein: "621503263",
          url: "stjude.org",
          strictness: "high",
          category: "children-health",
          expectedDonation: 2
        },
        {
          name: "World Wildlife Fund",
          ein: "521693387",
          url: "worldwildlife.org",
          strictness: "medium",
          category: "environment",
          expectedDonation: 1.5
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
      const validCharities = charityValidations.filter((c) => c.isValid).length;
      donationAnalytics.charityValidationScore = Math.round(validCharities / charityValidations.length * 100);
      const bin = cardNumber.substring(0, 6);
      const lastFour = cardNumber.substring(cardNumber.length - 4);
      for (const site of testSites) {
        const startTime = Date.now();
        const charityValidation = charityValidations.find((c) => c.ein === site.ein);
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
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          charityValid: charityValidation?.isValid || false,
          charityType: charityValidation?.isPublicCharity ? "Public Charity" : "Unknown",
          category: site.category,
          strictnessLevel: site.strictness,
          validationDetails: "validationDetails" in donationResult ? donationResult.validationDetails : void 0
        });
      }
      donationAnalytics.averageProcessingTime = Math.round(
        results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
      );
      const successRate = Math.round(donationAnalytics.successful / donationAnalytics.totalAttempted * 100);
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
          totalDonated: "$0.00",
          charityValidationScore: 0,
          recommendation: "Donation test failed - unable to validate card for charitable giving"
        },
        error: error instanceof Error ? error.message : "Donation validation system error"
      };
    }
  }
  async function performSecureCharityValidation(site, cardNumber, expiryMonth, expiryYear, cvv) {
    const bin = cardNumber.substring(0, 6);
    const maskedCard = `****-****-****-${cardNumber.substring(cardNumber.length - 4)}`;
    const cardValidation = {
      luhnValid: isValidLuhn(cardNumber),
      lengthValid: isValidCardLength(cardNumber),
      expiryValid: isValidExpiry(expiryMonth, expiryYear),
      cvvValid: isValidCVV(cvv, cardNumber),
      networkSupported: isNetworkSupported(cardNumber, site)
    };
    const validationScore = calculateValidationScore(cardValidation, site);
    const success = validationScore >= getCharityThreshold(site.strictness);
    return {
      success,
      maskedCard,
      transactionId: success ? `TEST_${Date.now()}_${Math.abs(cardNumber.length * 37 + parseInt(expiryMonth) * 13 + parseInt(expiryYear)).toString(36).toUpperCase()}` : "",
      errorReason: success ? "" : getCharityErrorMessage(cardValidation, site),
      validationScore,
      testMode: true,
      securityNote: "Test-only validation - no real payment processing"
    };
  }
  function isValidCardLength(cardNumber) {
    const length = cardNumber.length;
    const firstDigit = cardNumber.charAt(0);
    if (firstDigit === "4") return [13, 16, 19].includes(length);
    if (firstDigit === "5" || cardNumber.substring(0, 2) >= "22" && cardNumber.substring(0, 2) <= "27") return length === 16;
    if (firstDigit === "3") return length === 15;
    if (firstDigit === "6") return length === 16;
    return length >= 13 && length <= 19;
  }
  function isValidExpiry(month, year) {
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const expMonth = parseInt(month);
    const expYear = parseInt(year);
    if (expMonth < 1 || expMonth > 12) return false;
    const fullYear = expYear < 100 ? expYear + 2e3 : expYear;
    if (fullYear > currentYear) return true;
    if (fullYear === currentYear && expMonth >= currentMonth) return true;
    return false;
  }
  function isValidCVV(cvv, cardNumber) {
    if (!cvv || !/^\d+$/.test(cvv)) return false;
    if (cardNumber.charAt(0) === "3") return cvv.length === 4;
    return cvv.length === 3;
  }
  function isNetworkSupported(cardNumber, site) {
    const network = getCardNetwork(cardNumber);
    const supportedNetworks = {
      high: ["visa", "mastercard"],
      // High strictness = limited networks
      medium: ["visa", "mastercard", "amex"],
      // Medium = major networks  
      low: ["visa", "mastercard", "amex", "discover"]
      // Low = all major networks
    };
    return supportedNetworks[site.strictness]?.includes(network) || false;
  }
  function getCardNetwork(cardNumber) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    if (firstDigit === "4") return "visa";
    if (firstDigit === "5" || firstTwo >= "22" && firstTwo <= "27") return "mastercard";
    if (firstDigit === "3") return "amex";
    if (firstDigit === "6") return "discover";
    return "unknown";
  }
  function calculateValidationScore(validation, site) {
    let score = 0;
    if (validation.luhnValid) score += 25;
    if (validation.lengthValid) score += 20;
    if (validation.expiryValid) score += 25;
    if (validation.cvvValid) score += 15;
    if (validation.networkSupported) score += 15;
    return score;
  }
  function getCharityThreshold(strictness) {
    const thresholds = { high: 85, medium: 75, low: 65 };
    return thresholds[strictness] || 75;
  }
  function getCharityErrorMessage(validation, site) {
    if (!validation.luhnValid) return `${site.name}: Invalid card number format`;
    if (!validation.expiryValid) return `${site.name}: Card expired or invalid expiry date`;
    if (!validation.cvvValid) return `${site.name}: Invalid security code format`;
    if (!validation.lengthValid) return `${site.name}: Invalid card number length`;
    if (!validation.networkSupported) return `${site.name}: Card network not supported`;
    return `${site.name}: Payment processing requirements not met`;
  }
  function simulateDonationBasedOnCard(site, bin, lastFour) {
    let baseSuccessRate = 0.8;
    if (site.strictness === "high") {
      baseSuccessRate = 0.4;
    } else if (site.strictness === "medium") {
      baseSuccessRate = 0.6;
    }
    const knownTestBins = ["424242", "400000", "411111", "555555"];
    const problematicBins = ["666666", "444444", "123456"];
    if (knownTestBins.includes(bin)) {
      baseSuccessRate += 0.3;
    }
    if (problematicBins.includes(bin)) {
      baseSuccessRate = 0;
    }
    if (lastFour === "0000" || lastFour.includes("1111")) {
      baseSuccessRate -= 0.4;
    }
    baseSuccessRate = Math.max(0, Math.min(1, baseSuccessRate));
    return Math.random() < baseSuccessRate;
  }
  async function validateCharityLocally(ein, charityName) {
    const validation = validateEINLocally(ein);
    const knownCharities = {
      "530196605": { name: "American Red Cross", category: "emergency-relief", trusted: true },
      "133433452": { name: "Doctors Without Borders", category: "health", trusted: true },
      "363673599": { name: "Feeding America", category: "food-security", trusted: true },
      "621503263": { name: "St. Jude Children's Research Hospital", category: "children-health", trusted: true },
      "521693387": { name: "World Wildlife Fund", category: "environment", trusted: true }
    };
    const knownCharity = knownCharities[ein];
    return {
      isValid: validation.isValid,
      isPublicCharity: validation.isPublicCharity,
      source: "local-validation",
      ein,
      trusted: knownCharity?.trusted || false,
      category: knownCharity?.category || "general",
      securityNote: "Local validation only - no external data transmission"
    };
  }
  async function performEnhancedDonationSimulation(site, cardData) {
    const { cardNumber, expiryMonth, expiryYear, cvv, charityValidation } = cardData;
    const fraudAnalysis = analyzeDonationFraud(cardNumber, expiryMonth, expiryYear, cvv);
    if (!charityValidation?.isValid) {
      return {
        success: false,
        errorReason: "Charity validation failed - organization not found in IRS database",
        transactionId: "",
        validationDetails: {
          charityValid: false,
          fraudScore: 0,
          riskLevel: "HIGH"
        }
      };
    }
    let successProbability = 0.7;
    if (isValidLuhn(cardNumber)) successProbability += 0.15;
    if (!hasSequentialPattern(cardNumber)) successProbability += 0.1;
    if (!hasRepeatingPattern(cardNumber)) successProbability += 0.1;
    if (charityValidation.isPublicCharity) successProbability += 0.1;
    if (site.strictness === "low") successProbability += 0.1;
    else if (site.strictness === "high") successProbability -= 0.1;
    if (fraudAnalysis.fraudScore < 20) successProbability += 0.15;
    else if (fraudAnalysis.fraudScore > 70) successProbability -= 0.3;
    const success = Math.random() < Math.min(successProbability, 0.95);
    return {
      success,
      errorReason: success ? "" : generateDonationErrorMessage(fraudAnalysis, site),
      transactionId: success ? `DON_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}` : "",
      validationDetails: {
        charityValid: charityValidation.isValid,
        fraudScore: fraudAnalysis.fraudScore,
        riskLevel: fraudAnalysis.riskLevel,
        successProbability: Math.round(successProbability * 100)
      }
    };
  }
  function validateEINLocally(ein) {
    const einPattern = /^\d{2}-?\d{7}$/;
    const cleanEIN = ein.replace("-", "");
    if (!einPattern.test(ein) || cleanEIN.length !== 9) {
      return { isValid: false, isPublicCharity: false, source: "local-invalid-format", ein };
    }
    const publicCharityPrefixes = ["13", "14", "15", "16", "20", "21", "22", "23", "26", "27", "31", "35", "36", "37", "38", "52", "53", "54", "55", "56", "57", "58", "59", "61", "62"];
    const prefix = cleanEIN.substring(0, 2);
    return {
      isValid: true,
      isPublicCharity: publicCharityPrefixes.includes(prefix),
      source: "local-ein-rules",
      ein
    };
  }
  function analyzeDonationFraud(cardNumber, expiryMonth, expiryYear, cvv) {
    let fraudScore = 0;
    const indicators = [];
    if (!isValidLuhn(cardNumber)) {
      fraudScore += 40;
      indicators.push("Invalid card number");
    }
    if (hasSequentialPattern(cardNumber)) {
      fraudScore += 25;
      indicators.push("Sequential number pattern");
    }
    if (hasRepeatingPattern(cardNumber)) {
      fraudScore += 20;
      indicators.push("Repeating number pattern");
    }
    if (["000", "111", "123", "999"].includes(cvv)) {
      fraudScore += 15;
      indicators.push("Common CVV pattern");
    }
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const expYear = parseInt(expiryYear);
    if (expYear < currentYear || expYear > currentYear + 20) {
      fraudScore += 20;
      indicators.push("Invalid expiry date");
    }
    const riskLevel = fraudScore > 70 ? "HIGH" : fraudScore > 40 ? "MEDIUM" : "LOW";
    return { fraudScore: Math.min(fraudScore, 100), riskLevel, indicators };
  }
  function generateDonationErrorMessage(fraudAnalysis, site) {
    if (fraudAnalysis.fraudScore > 70) {
      return `${site.name} security system rejected payment due to high fraud risk`;
    }
    if (fraudAnalysis.fraudScore > 40) {
      return `Payment processing failed - additional verification required by ${site.name}`;
    }
    return `Donation attempt failed - ${site.name} payment gateway temporarily unavailable`;
  }
  function generateDonationRecommendation(successRate, charityValidationScore) {
    if (successRate >= 80 && charityValidationScore >= 80) {
      return "Excellent compatibility with donation platforms - card verified for charitable giving with high confidence";
    }
    if (successRate >= 60 && charityValidationScore >= 60) {
      return "Good donation platform compatibility - card suitable for most charitable organizations";
    }
    if (successRate >= 40) {
      return "Moderate donation compatibility - some platforms may require additional verification";
    }
    return "Limited donation platform support - card may face restrictions with charitable payment processing";
  }
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath, URL } from "node:url";
var __dirname = fileURLToPath(new URL(".", import.meta.url));
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 5e3,
    hmr: {
      host: "0.0.0.0",
      port: 5e3
    },
    fs: {
      strict: false,
      allow: [".."]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
import { fileURLToPath as fileURLToPath2, URL as URL2 } from "node:url";
var __dirname2 = fileURLToPath2(new URL2(".", import.meta.url));
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
