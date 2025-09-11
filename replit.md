# Overview

This is an advanced 3D-Authentication Validator web application for credit card validation and BIN (Bank Identification Number) lookup services. The application provides real-time card validation through multiple payment gateway APIs, comprehensive BIN information lookup, batch processing capabilities, fraud detection with risk scoring, and session tracking with detailed analytics. It's built as a professional payment processing tool with enhanced security features, using modern React frontend and Express.js backend architecture with real API integrations.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

**September 11, 2025**: Successfully imported and configured GitHub project for Replit environment.
- **GitHub Import**: Imported complete 3D Authentication Validator project from GitHub
- **TypeScript Configuration**: Fixed all TypeScript compilation errors and LSP diagnostics
- **Replit Environment Setup**: Configured Vite with proper host settings (0.0.0.0:5000, allowedHosts: true) for Replit proxy
- **CSS/Tailwind Fixes**: Resolved Tailwind CSS configuration issues and custom CSS variable conflicts
- **Workflow Configuration**: Set up development workflow running on port 5000 with proper webview output
- **Deployment Setup**: Configured autoscale deployment with build and production run commands
- **Security Enhancements**: Fixed critical PCI DSS vulnerabilities including PAN data masking and API logging redaction
- **Production Readiness**: Application is fully functional with professional UI, real-time validation, and secure data handling

**September 10, 2025**: Successfully enhanced BIN lookup system for maximum accuracy and consistency.
- **BIN Lookup Enhancement**: Upgraded from 4 to 8 premium APIs (BinList, BinCheck, BinSearch, BinCodes, BinDB, BinRange, CardBin, FreeBinChecker)
- **Data Aggregation**: Implemented intelligent data combination from multiple sources instead of first-match approach
- **Expanded Coverage**: Increased country flag mapping from 20+ to 100+ countries with comprehensive international bank database
- **Performance**: Added 24-hour result caching system with automatic cleanup for improved speed
- **Confidence Scoring**: Added data validation and confidence metrics for BIN lookup results
- **Batch Mode Enhancement**: Fixed batch BIN mode to show same comprehensive details as single mode with professional card layouts
- **Export Enhancement**: Upgraded export functionality for both modes with professional reports including ASCII headers, comprehensive statistics, certifications, and detailed analysis
- **UI Consistency**: Achieved complete feature parity between single and batch BIN lookup modes

# System Architecture

## Frontend Architecture
- **React 18** with TypeScript for the user interface
- **Vite** as the build tool and development server
- **TanStack Query** for server state management and API caching
- **Wouter** for lightweight client-side routing
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with a custom design system
- Component-based architecture with reusable UI components organized under `/client/src/components`

## Backend Architecture
- **Express.js** server with TypeScript
- **RESTful API** design with routes organized in `/server/routes.ts`
- **In-memory storage** implementation with interface-based design for easy database migration
- **Async validation processing** to handle time-consuming card validation operations
- **Session management** for tracking validation statistics and user activity
- **Service layer** architecture with dedicated services for card validation and BIN lookup

## Database Schema
- **Drizzle ORM** configured for PostgreSQL with schema definitions in `/shared/schema.ts`
- Two main entities:
  - **Validation Results**: Stores card validation attempts, responses, processing times, and BIN information
  - **Sessions**: Tracks user sessions with statistics (total checked, passed, failed, average processing time)
- Schema includes support for JSON storage of BIN lookup data and comprehensive validation metadata

## API Design
- **Single Card Validation**: `/api/validate/single` - Validates individual cards with real-time processing
- **Batch Validation**: `/api/validate/batch` - Processes multiple cards from BIN generation
- **BIN Validation**: `/api/validate/bin` - Generates and validates multiple cards from a 6-digit BIN
- **Results Retrieval**: `/api/validate/results` - Fetches validation history with pagination
- **Session Management**: `/api/session` - Tracks and retrieves current session statistics

## Validation Logic
- **Card Number Validation**: Implements Luhn algorithm for basic card number verification
- **Expiry Date Validation**: Checks for expired cards against current date
- **Async Processing**: Uses Promise-based architecture to handle gateway response delays (2-10 seconds)
- **Mock Gateway Integration**: Simulates real payment gateway responses for development/testing

## Real-time Features
- **Live Updates**: Frontend polls every 2 seconds for validation results and session statistics
- **Progress Tracking**: Real-time progress indicators during batch processing operations
- **Status Management**: Three-state system (processing, passed, failed) with appropriate UI feedback

# External Dependencies

## UI and Styling
- **@radix-ui** components for accessible UI primitives (dialogs, dropdowns, tooltips, etc.)
- **Tailwind CSS** for utility-first styling
- **class-variance-authority** for dynamic component styling
- **Font Awesome** icons for consistent iconography

## State Management and Data Fetching
- **@tanstack/react-query** for server state management, caching, and synchronization
- **React Hook Form** with **@hookform/resolvers** for form validation
- **Zod** for runtime schema validation and type safety

## Database and ORM
- **Drizzle ORM** for type-safe database operations
- **@neondatabase/serverless** for PostgreSQL connection (Neon Database)
- **drizzle-zod** for automatic schema-to-Zod validation generation

## Development Tools
- **Vite** for fast development and building
- **TypeScript** for type safety across the entire stack
- **ESBuild** for server-side bundling in production

## Session Storage
- **connect-pg-simple** for PostgreSQL-backed session storage (when database is connected)
- Memory-based session storage for development/testing environments

## Date and Utility Libraries
- **date-fns** for date manipulation and formatting
- **nanoid** for generating unique identifiers
- **clsx** and **tailwind-merge** for conditional CSS class management