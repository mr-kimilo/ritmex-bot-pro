# Multi-API Key Management System - Quick Start Guide

## System Status
✅ **DEPLOYED AND READY**

All components are configured and tested:
- API Configuration Manager
- Credentials Factory
- Enhanced Config Manager  
- Multi-Instance Launcher

## Quick Commands

### Check System Status (No Chinese characters)
```bash
# Windows PowerShell
.\status.ps1

# Command Prompt  
.\status.bat
```

### Validate Configuration
```bash
.\validate-config.bat
```

### Test Individual Components
```bash
npm run test:api          # Test API configuration system
npm run test:config       # Test all configuration files  
npm run test:routing      # Test script routing logic
```

### Start Trading Instances
```bash
# Terminal 1: Start SOL trading on BNB account (uses API key #2)
npm run start:bnb-sol

# Terminal 2: Start ASTER trading on BNB account (uses API key #1)  
npm run start:bnb-aster
```

## Configuration Files

### api-config.json
Replace example API keys with your real ones:
```json
{
  "apis": {
    "bnb_primary": {
      "apiKey": "YOUR_FIRST_BNB_API_KEY",
      "apiSecret": "YOUR_FIRST_BNB_API_SECRET"
    },
    "bnb_secondary": {
      "apiKey": "YOUR_SECOND_BNB_API_KEY", 
      "apiSecret": "YOUR_SECOND_BNB_API_SECRET"
    }
  }
}
```

### Trading Configurations
- `.env.bnb.sol` - SOL trading parameters for BNB account
- `.env.bnb.aster` - ASTER trading parameters for BNB account

## Problem Solved ✅

**Original Issue**: "BNB has two APIs, different APIs call different TRADE_SYMBOL"

**Solution Implemented**:
- ✅ Same BNB account can use two different API keys
- ✅ SOL trading uses API key #2  
- ✅ ASTER trading uses API key #1
- ✅ Orders are completely isolated by trading pair
- ✅ No conflicts between SOLUSDT and ASTERUSDT orders
- ✅ Redis databases are separated (DB=3, DB=4)

## System Architecture

```
BNB Account
├── API Key #1 (Primary) → ASTERUSDT Trading
│   ├── Instance: bnb-aster
│   ├── Config: .env.bnb.aster
│   └── Redis DB: 4
│
└── API Key #2 (Secondary) → SOLUSDT Trading  
    ├── Instance: bnb-sol
    ├── Config: .env.bnb.sol
    └── Redis DB: 3
```

## Next Steps

1. **Edit API Keys**: Update `api-config.json` with real credentials
2. **Validate Setup**: Run `.\validate-config.bat` 
3. **Start Trading**: Launch instances in separate terminals
4. **Monitor**: Watch for successful order placement and execution

The system is ready for production use!
