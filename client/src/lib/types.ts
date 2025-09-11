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

export interface SessionStats {
  id: string;
  startTime: Date;
  totalChecked: number;
  totalPassed: number;
  totalFailed: number;
  avgProcessingTime: number;
}

export interface BatchProcessingState {
  isProcessing: boolean;
  currentIndex: number;
  totalCount: number;
  results: ValidationResponse[];
}
