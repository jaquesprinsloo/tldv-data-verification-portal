import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalSignInStep } from './sign-in-policy.ts';

test('client-facing profiles require the emailed code after their password', () => {
  assert.equal(portalSignInStep(['client_facing']), 'code');
});

test('staff sign in with a password', () => {
  assert.deepEqual(['admin', 'master_admin', 'examiner'].map(role => portalSignInStep([role])), ['session', 'session', 'session']);
});

test('an account without a portal role gets no session', () => {
  assert.equal(portalSignInStep([]), 'denied');
});