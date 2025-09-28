# Ritmex Trading Bot Pro

A sophisticated multi-instance cryptocurrency trading bot with support for multiple API keys and trading strategies.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun runtime
- Redis server (for enhanced features)
- Valid API credentials

### Installation
```bash
npm install
# or
bun install
```

### Configuration
1. Copy configuration templates:
```bash
cp config/api-config.json.example config/api-config.json
cp config/.env.example config/.env
```

2. Edit `config/api-config.json` with your real API keys:
```json
{
  "apis": {
    "bnb_primary": {
      "apiKey": "YOUR_BNB_PRIMARY_API_KEY",
      "apiSecret": "YOUR_BNB_PRIMARY_API_SECRET"
    },
    "bnb_secondary": {
      "apiKey": "YOUR_BNB_SECONDARY_API_KEY", 
      "apiSecret": "YOUR_BNB_SECONDARY_API_SECRET"
    },
    "sol_dedicated": {
      "apiKey": "YOUR_SOL_DEDICATED_API_KEY",
      "apiSecret": "YOUR_SOL_DEDICATED_API_SECRET"
    }
  }
}
```

## 🎯 Multi-Instance Trading

### Available Commands

#### Start Trading Instances
```bash
# BNB Account - SOL Trading
npm run start:bnb-sol

# BNB Account - ASTER Trading  
npm run start:bnb-aster

# Dedicated SOL Account
npm run start:sol

# Dedicated BNB Account
npm run start:bnb
```

**✨ New Feature**: All multi-instance commands now include an interactive strategy selection menu:

1. **趋势跟随策略 (SMA30)** - Basic trend following with SMA30 signals
2. **增强趋势策略 (Redis+KDJ/RSI)** - Enhanced trend analysis with technical indicators (requires Redis)
3. **做市刷单策略** - Market making with liquidity provision
4. **偏移做市策略** - Offset market making with depth-based positioning

Simply run any instance command and choose your preferred trading strategy!

#### System Management
```bash
# Check system status
bat\status.bat

# Validate configuration
bat\validate-config.bat

# Test API configuration
npm run test:api

# Test configuration routing
npm run test:config
```

### Configuration Files

| Instance | Config File | Trading Pair | API Used |
|----------|-------------|--------------|----------|
| BNB-SOL | `config/.env.bnb.sol` | SOLUSDT | BNB Secondary API |
| BNB-ASTER | `config/.env.bnb.aster` | ASTERUSDT | BNB Primary API |
| SOL | `config/.env.sol` | SOLUSDT | SOL Dedicated Account |
| BNB | `config/.env.bnb` | ASTERUSDT | BNB Primary API |

### Multi-API Architecture

The bot supports multiple API keys for:
- **Same account, different APIs**: Use different API keys for different trading pairs on the same BNB account
- **Dedicated accounts**: Separate SOL account with its own API credentials
- **Load balancing**: Distribute trading load across multiple API keys

## 🛠️ Features

### Core Trading Features
- **Trend Following**: SMA-based trend detection and following
- **Risk Management**: Dynamic stop-loss and take-profit
- **Fee Protection**: Automatic fee monitoring and limits
- **Position Management**: Automated position sizing and management

### Advanced Features  
- **Multi-Instance Support**: Run multiple trading pairs simultaneously
- **API Key Management**: Centralized API credential management
- **Configuration Routing**: Automatic config file selection based on npm scripts
- **Enhanced Mode**: Redis-based market analysis and technical indicators

### Risk Management
- Dynamic risk calculation based on market conditions
- Percentage-based stop-loss and take-profit
- Fee monitoring and protection
- Position size limits

## 📊 Monitoring

### Real-time Monitoring
- Live position updates
- P&L tracking
- Fee monitoring
- Market data streaming

### Logging
- Structured JSON logging
- Instance-specific log prefixes
- Configurable log levels
- Fee summary reports

## 🔧 Development

### Run Tests
```bash
npm run test:config    # Configuration tests
npm run test:api       # API configuration tests  
npm run test:routing   # Route mapping tests
npm test              # Full test suite
```

### Development Mode
```bash
npm run dev           # Development with hot reload
bun run dev           # Using Bun runtime
```

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- **[API Management Guide](docs/guides/multi-api-management-guide.md)** - Multi-API setup and usage
- **[Deployment Guide](docs/deployment/multi-instance-deployment.md)** - Production deployment
- **[Configuration Reference](docs/guides/enhanced-trend-engine-guide.md)** - Detailed configuration options
- **[Quick Start Guide](docs/QUICK-START.md)** - Step-by-step setup instructions

## ⚠️ Security

- Never commit API keys to version control
- Use separate API keys for different instances
- Enable IP restrictions on your exchange account
- Use read-only API keys for monitoring

## 🤝 Support

For issues and questions:
1. Check the documentation in `docs/`
2. Run system diagnostics: `bat\validate-config.bat`  
3. Review logs for error details

## 📄 License

This project is for educational and personal use only. Trading cryptocurrencies involves substantial risk of loss.
