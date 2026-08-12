
const fs = require('fs');
let css = fs.readFileSync('web-frontend/src/styles/index.css', 'utf-8');

// Fix global shape overrides
css = css.replace(/\.dark \.rounded-2xl, \r?\n\.dark \.rounded-xl/g, '.rounded-2xl, \n.rounded-xl');
css = css.replace(/\.dark \.glass-panel/g, '.glass-panel');
css = css.replace(/\.dark \.primary-btn/g, '.primary-btn');
css = css.replace(/\.dark \.premium-btn-primary/g, '.premium-btn-primary');
css = css.replace(/\.dark \.premium-btn-secondary/g, '.premium-btn-secondary');
css = css.replace(/\.dark \.premium-tab-primary/g, '.premium-tab-primary');
css = css.replace(/\.dark \.premium-tab-secondary/g, '.premium-tab-secondary');

// Fix hardcoded gold colors in the newly made global rules
css = css.replace(/rgba\(212, 175, 55, 0\.9\)/g, 'rgba(var(--glow-rgb), 0.9)');
css = css.replace(/rgba\(212, 175, 55, 0\.8\)/g, 'rgba(var(--glow-rgb), 0.8)');

fs.writeFileSync('web-frontend/src/styles/index.css', css);
console.log('CSS fixed.');

