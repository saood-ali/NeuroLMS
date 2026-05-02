import assert from 'assert';
import app from '../../app';

console.log('Running bootstrap test...');
assert.ok(app, 'App should be defined');
console.log('Bootstrap test passed.');
process.exit(0);
