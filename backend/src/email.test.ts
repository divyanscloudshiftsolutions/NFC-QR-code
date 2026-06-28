import assert from 'assert';
import { validateEmail } from './routes';

const invalidEmails = [
  'Divyan@gmail.com',
  'divyan_stony@gmail.com',
  'divyan-stony@gmail.com',
  'divyan+test@gmail.com',
  'divyan..stony@gmail.com',
  '.divyan@gmail.com',
  'divyan.@gmail.com',
  'divyan@mail.com',
  'divyan@mai.com',
  'divyan@gmail',
  'divyan@gmail.co'
];

const validEmails = [
  'divyan@gmail.com',
  'divyan123@gmail.com',
  'divyan.stony@gmail.com',
  'a.b.c.123@gmail.com',
  '',
  '  ',
  null,
  undefined
];

console.log('Running strict Gmail validation unit tests...');

// 1. Assert invalid emails return false
invalidEmails.forEach(email => {
  assert.strictEqual(
    validateEmail(email), 
    false, 
    `Expected email "${email}" to be invalid, but validateEmail returned true.`
  );
});
console.log('✓ All invalid Gmail examples correctly rejected.');

// 2. Assert valid emails return true
validEmails.forEach(email => {
  assert.strictEqual(
    validateEmail(email), 
    true, 
    `Expected email "${email}" to be valid, but validateEmail returned false.`
  );
});
console.log('✓ All valid Gmail examples correctly accepted.');

console.log('All strict Gmail validation unit tests passed successfully!');
