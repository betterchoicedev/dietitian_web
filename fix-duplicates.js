npmimport fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the LanguageContext.jsx file
const filePath = path.join(__dirname, 'src', 'contexts', 'LanguageContext.jsx');
const content = fs.readFileSync(filePath, 'utf8');

// Function to find and remove duplicate keys in an object literal
function removeDuplicateKeys(content) {
  const lines = content.split('\n');
  const result = [];
  const seenKeys = new Map(); // Map to track keys and their first occurrence line number
  let inObjectLiteral = false;
  let braceLevel = 0;
  let currentLanguageSection = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect language sections (en: { or he: {)
    if (trimmedLine.match(/^\s*(en|he):\s*\{/)) {
      currentLanguageSection = trimmedLine.match(/^\s*(en|he):/)[1];
      seenKeys.clear(); // Clear seen keys for new language section
      inObjectLiteral = true;
      braceLevel = 1;
      result.push(line);
      continue;
    }
    
    // Track brace levels
    if (inObjectLiteral) {
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceLevel += openBraces - closeBraces;
      
      if (braceLevel <= 0) {
        inObjectLiteral = false;
        currentLanguageSection = null;
        seenKeys.clear();
      }
    }
    
    // Check for key definitions in object literals
    if (inObjectLiteral && trimmedLine.match(/^\s*\w+\s*:/)) {
      const keyMatch = trimmedLine.match(/^\s*(\w+)\s*:/);
      if (keyMatch) {
        const key = keyMatch[1];
        
        if (seenKeys.has(key)) {
          // This is a duplicate key, skip this line
          console.log(`Removing duplicate key "${key}" at line ${i + 1} in ${currentLanguageSection} section`);
          continue;
        } else {
          // First occurrence of this key
          seenKeys.set(key, i + 1);
        }
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

try {
  console.log('Processing LanguageContext.jsx to remove duplicate keys...');
  const fixedContent = removeDuplicateKeys(content);
  
  // Write the fixed content back to the file
  fs.writeFileSync(filePath, fixedContent, 'utf8');
  console.log('Successfully removed duplicate keys from LanguageContext.jsx');
  
  // Clean up the script file
  fs.unlinkSync(__filename);
  console.log('Cleanup completed');
  
} catch (error) {
  console.error('Error processing file:', error);
  process.exit(1);
}
