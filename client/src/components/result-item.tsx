import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ValidationResponse } from "@/lib/types";

interface ResultItemProps {
  result: ValidationResponse;
}

export default function ResultItem({ result }: ResultItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'passed':
        return {
          icon: 'fas fa-check',
          text: '𝗣𝗮𝘀𝘀𝗲𝗱 ☑️',
          bgColor: 'bg-green-50/50 border-green-200',
          iconBg: 'bg-green-500',
          textColor: 'text-green-800',
          badgeVariant: 'default' as const,
          badgeColor: 'bg-green-100 text-green-800'
        };
      case 'failed':
        return {
          icon: 'fas fa-times',
          text: '𝗙𝗮𝗶𝗹𝗲𝗱 ❌',
          bgColor: 'bg-red-50/50 border-red-200',
          iconBg: 'bg-red-500',
          textColor: 'text-red-800',
          badgeVariant: 'destructive' as const,
          badgeColor: 'bg-red-100 text-red-800'
        };
      default:
        return {
          icon: 'fas fa-spinner fa-spin',
          text: '𝗣𝗿𝗼𝗰𝗲𝘀𝘀𝗶𝗻𝗴...',
          bgColor: 'bg-blue-50/50 border-blue-200',
          iconBg: 'bg-blue-500',
          textColor: 'text-blue-800',
          badgeVariant: 'secondary' as const,
          badgeColor: 'bg-blue-100 text-blue-800'
        };
    }
  };

  const statusConfig = getStatusConfig(result.status);
  const cardDisplay = `${result.cardNumber}|${result.expiryMonth}|${result.expiryYear}|${result.cvv}`;

  return (
    <Card className={`border rounded-lg ${statusConfig.bgColor}`} data-testid={`result-${result.id}`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className={`w-6 h-6 ${statusConfig.iconBg} rounded-full flex items-center justify-center`}>
              <i className={`${statusConfig.icon} text-white text-xs`}></i>
            </div>
            <div className="flex-1">
              <div className={`font-semibold ${statusConfig.textColor}`}>
                {statusConfig.text}
              </div>
              <div className="text-sm text-muted-foreground">
                {result.response || 'Checking 3D-Authentication'}
              </div>
              <div className="text-sm font-mono text-muted-foreground mt-1">
                {cardDisplay}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-sm font-medium text-foreground" data-testid={`time-${result.id}`}>
                {result.processingTime ? `${result.processingTime}s` : 'Processing...'}
              </div>
              <div className="text-xs text-muted-foreground">
                {result.processingTime ? 'Processing time' : 'Elapsed time'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="ml-2 h-8 w-8 p-0"
            >
              <i className={`fas fa-${isExpanded ? 'minus' : 'plus'} text-xs`}></i>
            </Button>
          </div>
        </div>
      </div>
      
      {/* Expandable Details Section */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-4">
          {/* Gateway Failover Results - Professional Full Width Table */}
          {result.validationData?.gatewayFailover && result.validationData.gatewayFailover.totalAttempted > 1 && (
            <div className="w-full mb-6 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
              {/* Header Section */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-network-wired text-white mr-3 text-lg"></i>
                    <h3 className="text-xl font-bold">Gateway Failover Analysis</h3>
                  </div>
                  <div className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
                    {result.validationData.gatewayFailover.totalAttempted} Gateway{result.validationData.gatewayFailover.totalAttempted > 1 ? 's' : ''} Tested
                  </div>
                </div>
              </div>

              {/* Statistics Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 border-b border-gray-200">
                <div className="p-4 text-center border-r border-gray-200 bg-green-50">
                  <div className="text-2xl font-bold text-green-600">
                    {result.validationData.gatewayFailover.successfulGateways}
                  </div>
                  <div className="text-sm text-green-700 font-medium">Successful</div>
                </div>
                    <div className="p-4 text-center border-r border-gray-200 bg-red-50">
                      <div className="text-2xl font-bold text-red-600">
                        {result.validationData.gatewayFailover.totalAttempted - result.validationData.gatewayFailover.successfulGateways}
                      </div>
                      <div className="text-sm text-red-700 font-medium">Failed</div>
                    </div>
                    <div className="p-4 text-center border-r border-gray-200 bg-blue-50">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round((result.validationData.gatewayFailover.successfulGateways / result.validationData.gatewayFailover.totalAttempted) * 100)}%
                      </div>
                      <div className="text-sm text-blue-700 font-medium">Success Rate</div>
                    </div>
                    <div className="p-4 text-center bg-indigo-50">
                      <div className="text-2xl font-bold text-indigo-600">
                        {result.processingTime}s
                      </div>
                      <div className="text-sm text-indigo-700 font-medium">Total Time</div>
                    </div>
                  </div>

                  {/* Gateway Sequence Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="w-16 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Order</th>
                          <th className="w-1/4 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Gateway</th>
                          <th className="w-24 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                          <th className="w-28 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Response Time</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Result</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {result.validationData.gatewayFailover.gatewaySequence?.map((gatewayResult: any, index: number) => (
                          <tr key={index} className={`hover:bg-gray-50 transition-colors ${gatewayResult.success ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-600">
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                    gatewayResult.success ? 'bg-green-100' : 'bg-red-100'
                                  }`}>
                                    <i className={`fas fa-${gatewayResult.success ? 'check' : 'times'} ${
                                      gatewayResult.success ? 'text-green-600' : 'text-red-600'
                                    }`}></i>
                                  </div>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {gatewayResult.gateway.name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {gatewayResult.gateway.provider}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                                gatewayResult.success 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {gatewayResult.success ? '✅ SUCCESS' : '❌ FAILED'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="flex items-center">
                                <i className="fas fa-clock text-gray-400 mr-2"></i>
                                <span className="font-mono">{gatewayResult.processingTime}s</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="break-words max-w-xs" title={gatewayResult.success ? gatewayResult.response : gatewayResult.errorReason}>
                                {gatewayResult.success ? gatewayResult.response : gatewayResult.errorReason}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer Summary */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center">
                      <i className="fas fa-info-circle text-blue-500 mr-2"></i>
                      <span className="text-sm text-gray-700 font-medium">Summary:</span>
                      <span className="text-sm text-gray-600 ml-2">{result.validationData.gatewayFailover.summary}</span>
                    </div>
                  </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              {result.gateway && (
                <div className="text-sm">
                  <span className="font-medium text-foreground">Gateway:</span>
                  <Badge className={`ml-2 ${statusConfig.badgeColor}`} data-testid={`gateway-${result.id}`}>
                    {result.gateway}
                  </Badge>
                </div>
              )}
              <div className="text-sm">
                <span className="font-medium text-foreground">BIN:</span>
                <span className="font-mono text-muted-foreground ml-2" data-testid={`bin-${result.id}`}>
                  {result.cardNumber.substring(0, 6)}
                </span>
              </div>
              {result.apiProvider && (
                <div className="text-sm">
                  <span className="font-medium text-foreground">Provider:</span>
                  <span className="text-muted-foreground ml-2 text-xs" data-testid={`provider-${result.id}`}>
                    {result.apiProvider}
                  </span>
                </div>
              )}
              {result.errorMessage && (
                <div className="text-sm">
                  <span className="font-medium text-foreground">Error:</span>
                  <span className="text-red-600 ml-2 text-xs" data-testid={`error-${result.id}`}>
                    {result.errorMessage}
                  </span>
                </div>
              )}
            </div>
            
            {result.cardInfo && (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium text-foreground">Type:</span>
                  <span className="text-muted-foreground ml-2" data-testid={`type-${result.id}`}>
                    {result.cardInfo.brand} - {result.cardInfo.type} - {result.cardInfo.level}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-foreground">Bank:</span>
                  <span className="text-muted-foreground ml-2" data-testid={`bank-${result.id}`}>
                    {result.cardInfo.bank}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-foreground">Country:</span>
                  <span className="text-muted-foreground ml-2" data-testid={`country-${result.id}`}>
                    {result.cardInfo.country} {result.cardInfo.flag}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Additional Checks Results */}
          {result.validationData && result.validationData.additionalChecks && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-sm font-medium text-foreground mb-3 flex items-center">
            <i className="fas fa-plus-circle mr-2 text-blue-600"></i>
            Additional Security Checks
          </div>
          
          {result.validationData.additionalChecks.paypal && (
            <div className="mb-3 p-2 bg-white dark:bg-gray-900 rounded border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <i className="fab fa-paypal mr-2 text-blue-600"></i>
                  <span className="font-medium text-sm">PayPal Integration</span>
                </div>
                <Badge variant={result.validationData.additionalChecks.paypal.canLinkToPayPal ? "secondary" : "destructive"}>
                  {result.validationData.additionalChecks.paypal.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Linkage: {result.validationData.additionalChecks.paypal.canLinkToPayPal ? "✓ Possible" : "✗ Blocked"}</div>
                <div>• Security Score: {result.validationData.additionalChecks.paypal.securityScore}/100</div>
                <div>• Details: {result.validationData.additionalChecks.paypal.details}</div>
              </div>
            </div>
          )}
          
          {result.validationData.additionalChecks.donation && (
            <div className="p-2 bg-white dark:bg-gray-900 rounded border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <i className="fas fa-donate mr-2 text-green-600"></i>
                  <span className="font-medium text-sm">Real Donation Test ($0.50)</span>
                </div>
                <Badge variant={result.validationData.additionalChecks.donation.overallStatus === "passed" ? "secondary" : "destructive"}>
                  {result.validationData.additionalChecks.donation.successRate}% Success
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Sites Passed: {result.validationData.additionalChecks.donation.successfulDonations}/{result.validationData.additionalChecks.donation.totalSites}</div>
                <div>• Total Donated: ${result.validationData.additionalChecks.donation.totalDonated || '0.00'}</div>
                <div>• Real API Calls: {result.validationData.additionalChecks.donation.realApiCalls ? "✓ Yes" : "✗ Simulation"}</div>
                <div>• Security Bypass: {result.validationData.additionalChecks.donation.canBypassDonationSecurity ? "✓ Yes" : "✗ No"}</div>
                <div>• Summary: {result.validationData.additionalChecks.donation.summary}</div>
              </div>
            </div>
          )}
            </div>
          )}

          {/* Security Information */}
          {(result.fraudScore !== undefined || result.riskLevel) && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm font-medium text-foreground mb-2 flex items-center">
                <i className="fas fa-shield-alt mr-2 text-primary"></i>
                Security Analysis
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.fraudScore !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Fraud Score:</span>
                    <div className="flex items-center">
                      <span className={`text-sm font-medium ${
                        result.fraudScore < 30 ? 'text-green-600' : 
                        result.fraudScore < 70 ? 'text-yellow-600' : 'text-red-600'
                      }`} data-testid={`fraud-score-${result.id}`}>
                        {result.fraudScore}/100
                      </span>
                    </div>
                  </div>
                )}
                {result.riskLevel && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Risk Level:</span>
                    <Badge 
                      className={`text-xs ${
                        result.riskLevel === 'low' ? 'bg-green-100 text-green-800' :
                        result.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}
                      data-testid={`risk-level-${result.id}`}
                    >
                      {result.riskLevel.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {result.status === 'processing' && !isExpanded && (
        <div className="px-4 pb-4">
          <div className="w-full bg-blue-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000 animate-pulse" style={{width: '65%'}}></div>
          </div>
        </div>
      )}
    </Card>
  );
}
