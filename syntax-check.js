// Simple syntax check for our TypeScript files
const fs = require('fs');
const path = require('path');

function checkSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Basic syntax checks
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    
    console.log(`Checking ${filePath}:`);
    console.log(`  Braces: ${openBraces} open, ${closeBraces} close`);
    console.log(`  Parentheses: ${openParens} open, ${closeParens} close`);
    console.log(`  Brackets: ${openBrackets} open, ${closeBrackets} close`);
    
    if (openBraces !== closeBraces) {
      console.log(`  ❌ Mismatched braces!`);
      return false;
    }
    if (openParens !== closeParens) {
      console.log(`  ❌ Mismatched parentheses!`);
      return false;
    }
    if (openBrackets !== closeBrackets) {
      console.log(`  ❌ Mismatched brackets!`);
      return false;
    }
    
    console.log(`  ✅ Basic syntax looks good`);
    return true;
  } catch (error) {
    console.log(`  ❌ Error reading file: ${error.message}`);
    return false;
  }
}

// Check our new files
const filesToCheck = [
  'src/service/disabledExtension.service.ts',
  'src/service/plugin.service.ts',
  'test/disabledExtension.test.ts'
];

let allGood = true;
filesToCheck.forEach(file => {
  if (!checkSyntax(file)) {
    allGood = false;
  }
  console.log('');
});

if (allGood) {
  console.log('🎉 All files passed basic syntax checks!');
} else {
  console.log('❌ Some files have syntax issues');
  process.exit(1);
}