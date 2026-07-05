const fs = require('fs');

const file = 'serverless.yml';
let content = fs.readFileSync(file, 'utf8');

// The functions block begins around `functions:`
// Each function has an `events` array, then `- http:`, then `path`, `method`, `cors`.
// We want to add:
//           authorizer:
//             name: authorizer
//             resultTtlInSeconds: 0
//             identitySource: $request.header.Authorization
//             type: request
// 
// Wait, for HTTP API, authorizers are different.
// But the project uses `events: - http:`, which is REST API (API Gateway v1).
// For REST API, the syntax is:
//           authorizer:
//             name: authorizer
//             resultTtlInSeconds: 0
//             identitySource: method.request.header.Authorization
//             type: request
// Actually, `type: token` is standard for standard token authorizers, and it uses `event.authorizationToken`.
// So:
//           authorizer:
//             name: authorizer
//             resultTtlInSeconds: 0
//             identitySource: method.request.header.Authorization
//             type: token

const newAuthStr = `
          authorizer:
            name: authorizer
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            type: token`;

const unprotected = ['signup', 'login', 'refreshToken', 'logout', 'verifyToken'];

let inFunctions = false;
let currentFunction = '';
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    newLines.push(line);
    
    if (line.startsWith('functions:')) {
        inFunctions = true;
        // Insert authorizer definition right after functions:
        newLines.push('  authorizer:');
        newLines.push('    handler: src/functions/auth/authorizer.handler');
        continue;
    }
    
    if (inFunctions) {
        const funcMatch = line.match(/^  ([a-zA-Z0-9]+):/);
        if (funcMatch) {
            currentFunction = funcMatch[1];
        }
        
        // Match `cors: true` inside a function
        if (line.match(/^\s+cors:\s*true/)) {
            // Check if current function is protected
            if (!unprotected.includes(currentFunction) && currentFunction !== 'authorizer') {
                // Add authorizer block
                newLines.push(newAuthStr);
            }
        }
    }
}

fs.writeFileSync(file, newLines.join('\n'));
console.log('Done modifying serverless.yml');
