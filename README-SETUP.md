# 3D-Authentication Validator - Setup Guide

## Local Computer Setup

### Prerequisites
- Node.js 18+ installed on your computer
- npm or yarn package manager

### Installation Steps

1. **Extract the project files** to a folder on your computer

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and go to: http://localhost:5000

### Features
- Real-time card validation with fraud detection
- BIN lookup using live APIs
- Batch processing from BIN numbers
- Risk scoring and security analysis
- Professional dashboard interface

### Testing
- Single card: `5587930167053600|01|2030|100`
- BIN batch: `558793` (generates multiple cards)

## Uploading to Replit.com

### Method 1: Using GitHub (Recommended)

1. **Push to GitHub**:
   - Create a new repository on GitHub
   - Push your local files to GitHub:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git remote add origin https://github.com/yourusername/your-repo.git
     git push -u origin main
     ```

2. **Import to Replit**:
   - Go to replit.com
   - Click "Create Repl"
   - Select "Import from GitHub"
   - Enter your repository URL
   - Click "Import from GitHub"

### Method 2: Manual Copy

1. **Create new Repl**:
   - Go to replit.com
   - Click "Create Repl"
   - Choose "Node.js" template
   - Name your project

2. **Copy files manually**:
   - Upload each file from your local project
   - Copy and paste the content into Replit's editor
   - Make sure to include all folders: client/, server/, shared/

3. **Install dependencies**:
   - Replit will automatically detect package.json
   - Dependencies will install automatically

### Important Notes
- The project uses Node.js with TypeScript
- Frontend is built with React and Vite
- Backend uses Express.js
- Real API integrations for BIN lookup
- Enhanced fraud detection system

## Project Structure
```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared types and schemas
├── package.json     # Dependencies
└── vite.config.ts   # Build configuration
```