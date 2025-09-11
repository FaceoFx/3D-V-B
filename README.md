# 3D-Authentication Validator - Professional Card Validation Tool

A production-ready web application for professional credit card validation, BIN lookup services, and comprehensive fraud detection with enhanced security measures and Check Bot automation.

## 🔧 Quick Setup Guide

### Prerequisites
- **Node.js** 18 or higher
- **npm** (comes with Node.js)

### Installation & Setup

1. **Extract the deployment package:**
   ```bash
   tar -xzf 3D-Auth-Validator-v1.0.tar.gz
   cd workspace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Open your browser to: `http://localhost:5000`
   - The application will be ready to use immediately

## 🚀 Features

### Core Validation Engine
- **Single Card Validation** - Test individual cards with real-time processing
- **Batch Processing** - Validate multiple cards with configurable rate limiting
- **BIN Lookup** - Comprehensive Bank Identification Number analysis
- **Check Bot** - Automated batch processing with intelligent controls

### Security & Compliance
- **PCI DSS Compliant** - All card data properly masked and CVV protection
- **Data Sanitization** - Comprehensive security across all endpoints
- **Export Security** - All downloadable reports use masked data only
- **Session Management** - Secure session tracking and analytics

### Professional Gateway Integration
- **Multi-Gateway Support** - Stripe, Adyen, Square, PayPal integration
- **Industry Standard Responses** - Professional authentication codes
- **Real-time Processing** - Live validation with detailed feedback
- **Fraud Detection** - Advanced risk scoring and analysis

### Advanced Features
- **8-API BIN Lookup** - Premium database aggregation for maximum accuracy
- **Export Capabilities** - Multiple formats (JSON, VISA, detailed reports)
- **Session Analytics** - Comprehensive statistics and processing metrics
- **Settings Management** - Configurable preferences and system settings

## ⚙️ Configuration

### Environment Variables (Optional)
Create a `.env` file in the root directory for external API integration:

```env
# Payment Gateway APIs (Optional - uses simulation if not provided)
STRIPE_SECRET_KEY=your_stripe_key_here
ADYEN_API_KEY=your_adyen_key_here
SQUARE_API_KEY=your_square_key_here
PAYPAL_API_KEY=your_paypal_key_here

# BIN Lookup APIs (Optional - uses local database if not provided)
BIN_LOOKUP_API_KEY=your_bin_api_key_here
BIN_API_KEY=alternative_bin_key_here

# Database (Optional - uses in-memory storage if not provided)
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

**Note:** The application works perfectly without any API keys - it includes comprehensive simulation and local databases.

## 🎮 Usage Guide

### Single Card Validation
1. Navigate to the "Single Validation" tab
2. Enter card details (number, expiry, CVV)
3. Select validation APIs
4. Click "Validate Card" for instant results

### Check Bot (Batch Processing)
1. Switch to "Check Bot" tab
2. Configure batch size (1-50 cards) and delays
3. Input card data or generate from BIN
4. Monitor real-time processing progress

### BIN Lookup
1. Access "BIN Lookup" tab
2. Enter 6-digit BIN number
3. View comprehensive bank and card information
4. Export results in multiple formats

### Settings Configuration
1. Click the Settings button (⚙️) in the header
2. Configure default batch sizes and delays
3. Customize interface preferences
4. Set performance and export options

## 🔒 Security Features

### PCI DSS Compliance
- **Card Data Masking** - PAN displays only first 6 + last 4 digits
- **CVV Protection** - CVV never stored or transmitted
- **Secure Export** - All exports automatically sanitize sensitive data
- **Session Security** - Encrypted session management

### Data Protection
- **Local Processing** - All validation occurs locally
- **No Data Persistence** - Card data cleared between sessions
- **Secure Headers** - HTTPS-ready configuration
- **Input Validation** - Comprehensive bounds checking

## 📊 Export Formats

### Available Export Types
- **JSON Export** - Complete validation data
- **Professional Report** - Detailed text analysis
- **VISA Format** - Industry-standard card format
- **Custom Reports** - Configurable output options

### Export Security
All exports automatically:
- Mask PAN data (show only first 6 + last 4 digits)
- Remove all CVV information
- Include security compliance notices
- Add professional headers and certification

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **TanStack Query** for server state management
- **shadcn/ui** for professional components
- **Tailwind CSS** for responsive styling

### Backend (Express + TypeScript)
- **Express.js** server with TypeScript
- **RESTful API** design with proper error handling
- **In-memory storage** with interface-based design
- **Service layer** architecture for maintainability

### Key Components
```
├── client/                 # Frontend React application
│   ├── src/components/     # UI components
│   ├── src/pages/         # Page components
│   └── src/lib/           # Utilities and types
├── server/                # Backend Express server
│   ├── services/          # Business logic services
│   └── routes.ts          # API endpoint definitions
└── shared/                # Shared types and schemas
```

## 🛠️ Development

### Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run preview      # Preview production build
```

### Adding API Keys
1. Stop the development server (`Ctrl+C`)
2. Add your API keys to `.env` file
3. Restart the server (`npm run dev`)
4. API integration will be automatically enabled

## 🚀 Production Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Web Server
1. Copy the built files to your web server
2. Ensure Node.js is installed on the server
3. Set environment variables for production
4. Start with `npm start`

### Recommended Production Setup
- Use PM2 for process management
- Configure HTTPS with SSL certificate
- Set up reverse proxy (Nginx/Apache)
- Configure environment-specific variables

## 📈 Performance

### Optimizations Included
- **Component Lazy Loading** - Faster initial load times
- **API Response Caching** - Reduced server load
- **Bundle Optimization** - Minimal file sizes
- **Memory Management** - Efficient resource usage

### Performance Features
- **Real-time Updates** - Live processing feedback
- **Concurrent Processing** - Parallel API calls
- **Rate Limiting** - Configurable request throttling
- **Progress Tracking** - Visual processing indicators

## 🔧 Troubleshooting

### Common Issues

**Port 5000 already in use:**
```bash
# Kill the process using port 5000
lsof -ti:5000 | xargs kill -9
npm run dev
```

**Dependencies not installing:**
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Application not loading:**
1. Check Node.js version: `node --version` (should be 18+)
2. Verify port accessibility: `curl http://localhost:5000`
3. Check console for errors in browser developer tools

### Support

For issues or questions:
1. Check the browser developer console for errors
2. Verify Node.js and npm versions
3. Ensure port 5000 is available
4. Check firewall settings if accessing remotely

## 📄 License

This is a professional payment processing tool. All rights reserved.

## 🔐 Security Notice

This application is designed for professional payment processing environments. Always ensure:
- Secure network connections (HTTPS in production)
- Proper access controls and authentication
- Regular security updates and monitoring
- Compliance with relevant payment industry standards

---

**Version:** 1.0.0  
**Built with:** React, TypeScript, Express.js, Tailwind CSS  
**Security:** PCI DSS Compliant  
**Updated:** September 2025