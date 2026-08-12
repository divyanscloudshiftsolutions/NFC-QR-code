
const fs = require('fs');
let css = fs.readFileSync('web-frontend/src/styles/index.css', 'utf-8');

css = css.replace(/--glass-shadow: 0 4px 20px rgba\(0, 0, 0, 0\.03\), 0 1px 3px rgba\(0, 0, 0, 0\.01\);/g, '--glass-shadow: none;');
css = css.replace(/--glass-blur: 12px;/g, '--glass-blur: 0px;');

fs.writeFileSync('web-frontend/src/styles/index.css', css);

