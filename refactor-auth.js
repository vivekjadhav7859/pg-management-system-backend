const fs = require('fs');
const path = require('path');

const functionsDir = path.join(__dirname, 'src', 'functions');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'auth') { // skip auth folder as those are auth endpoints
                processDir(fullPath);
            }
        } else if (fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Remove verifyToken import
    content = content.replace(/const\s*{\s*verifyToken\s*}\s*=\s*require\('\.\.\/\.\.\/services\/cognito\.service'\);\n?/g, '');
    
    // 2. We can keep dynamoService import because it might be used elsewhere, 
    // but usually it's only used for getUserByEmail in auth. We'll leave it in case.

    // 3. Find the auth extraction block. It generally starts with `const authHeader = ` and ends with the last user check before actual logic.
    // The safest way is to use regex to find the start and carefully replace up to the body/path parameters extraction.
    
    // Auth block starts usually with: const authHeader
    // and ends after dbUser check: if (!dbUser.status !== 'active') { return ... }
    
    // Since there are multiple variants, let's use a very generic replacement
    const newAuthCode = `        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }
`;

    // A regex that matches the start of the auth check down to the last typical check.
    // Let's use a simple approach: match from `const authHeader` up to `const dbUser = await dynamoService...` and the subsequent `if` blocks.
    
    const regex1 = /const authHeader[\s\S]*?(?:if\s*\(!dbUser[\s\S]*?return[^;]+;\s*\}|if\s*\(dbUser\.status !== 'active'[\s\S]*?return[^;]+;\s*\})/g;
    
    if (regex1.test(content)) {
        content = content.replace(regex1, newAuthCode.trim());
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Refactored auth in: ${filePath}`);
    } else {
        // Try alternate regex
        const regex2 = /const authHeader[\s\S]*?const dbUser = await dynamoService\.getUserByEmail\([^;]+;[\s\S]*?(?:if\s*\([^\)]+\)\s*\{\s*return[^;]+;\s*\}\s*)+/g;
        if (regex2.test(content)) {
            content = content.replace(regex2, newAuthCode.trim());
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Refactored auth in: ${filePath}`);
        } else {
             console.log(`Could not auto-refactor: ${filePath}`);
        }
    }
}

processDir(functionsDir);
