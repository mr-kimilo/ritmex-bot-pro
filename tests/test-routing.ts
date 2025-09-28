/**
 * 测试npm脚本路由逻辑
 */

function testRouting() {
  console.log("\n🧪 === 脚本路由测试 ===\n");
  
  const testCases = [
    { script: "start:bnb", expected: "./config/.env.bnb" },
    { script: "start:sol", expected: "./config/.env.sol" },
    { script: "start:bnb-sol", expected: "./config/.env.bnb.sol" },
    { script: "start:bnb-aster", expected: "./config/.env.bnb.aster" },
    { script: "start:custom", expected: "./config/.env" }
  ];

  testCases.forEach(({ script, expected }) => {
    // 模拟环境变量
    process.env.npm_lifecycle_event = script;
    
    // 复制路由逻辑（与config-manager.ts中的逻辑一致）
    let configFile = "./config/.env";
    const event = process.env.npm_lifecycle_event;
    
    if (event && event.includes(":bnb") && !event.includes("-")) {
      configFile = "./config/.env.bnb";
    } else if (event && event.includes(":sol") && !event.includes("-")) {
      configFile = "./config/.env.sol";
    } else if (event && event.includes("bnb-sol")) {
      configFile = "./config/.env.bnb.sol";
    } else if (event && event.includes("bnb-aster")) {
      configFile = "./config/.env.bnb.aster";
    }
    
    const status = configFile === expected ? "✅" : "❌";
    console.log(`${status} ${script} -> ${configFile} (期望: ${expected})`);
  });
  
  // 清除测试环境变量
  delete process.env.npm_lifecycle_event;
}

// 运行测试
testRouting();
