# File Structure Guide

## Directory Organization

### `/bat/` - Batch Scripts
Contains all Windows batch files and PowerShell scripts for system management:

- `status.bat` - Display system status (Windows-compatible)
- `status.ps1` - Display system status (PowerShell with colors)  
- `validate-config.bat` - Validate all configuration files

### `/test/` - Test Scripts
Contains all testing utilities:

- `test-config.ts` - Test configuration file loading
- `test-api-config.ts` - Test API configuration system
- `test-routing.ts` - Test npm script routing logic

### Root Directory
Main system files and entry points:

- `start.bat` - Interactive system launcher
- `api-config.json` - Central API key configuration
- `.env.bnb.sol` - BNB account SOL trading config
- `.env.bnb.aster` - BNB account ASTER trading config
- `multi-instance-launcher.ts` - Core launcher
- `package.json` - npm scripts and dependencies

## Quick Start

### 1. Check System Status
```bash
# Option 1: Interactive launcher
start.bat

# Option 2: Direct status check
bat\status.bat
```

### 2. Validate Configuration
```bash
bat\validate-config.bat
```

### 3. Run Tests
```bash
npm run test:api       # Test API configuration
npm run test:config    # Test configuration files
npm run test:routing   # Test routing logic
```

### 4. Start Trading
```bash
npm run start:bnb-sol     # SOL trading (API key #2)
npm run start:bnb-aster   # ASTER trading (API key #1)
```

## File Cleanup Completed

Removed unnecessary files:
- ✅ Old status scripts from root
- ✅ Duplicate PowerShell scripts
- ✅ Test files moved to `/test/`
- ✅ Batch files moved to `/bat/`

## Directory Structure
```
ritmex-bot/
├── bat/                    # Batch scripts
│   ├── status.bat
│   ├── status.ps1
│   └── validate-config.bat
├── test/                   # Test scripts  
│   ├── test-config.ts
│   ├── test-api-config.ts
│   └── test-routing.ts
├── src/                    # Source code
├── docs/                   # Documentation
├── start.bat              # Interactive launcher
├── api-config.json        # API configuration
└── package.json           # npm scripts
```

System is now properly organized and ready for use!
