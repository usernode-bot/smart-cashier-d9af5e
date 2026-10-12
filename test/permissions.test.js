'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { can, checkRoleChange, PERMS } = require('../lib/api');

const ownerRole = { id: 1, is_owner: true, can_register: false, can_products: false, can_finance: false, can_insights: false, can_staff: false };
const cashierRole = { id: 3, is_owner: false, can_register: true, can_products: false, can_finance: false, can_insights: false, can_staff: false };

test('the Owner role always has every permission', () => {
  for (const p of PERMS) assert.strictEqual(can(ownerRole, p), true);
});
test('a normal role allows only what it holds', () => {
  assert.strictEqual(can(cashierRole, 'register'), true);
  assert.strictEqual(can(cashierRole, 'finance'), false);
  assert.strictEqual(can(null, 'register'), false);
});

test('a non-owner cannot assign or remove the Owner role', () => {
  assert.ok(checkRoleChange({ actorIsOwner: false, ownerCount: 2, ownerRoleId: 1, action: 'assign', roleId: 1 }));
  assert.ok(checkRoleChange({ actorIsOwner: false, ownerCount: 2, ownerRoleId: 1, action: 'unassign', roleId: 1 }));
  assert.strictEqual(checkRoleChange({ actorIsOwner: true, ownerCount: 2, ownerRoleId: 1, action: 'assign', roleId: 1 }), null);
});
test('a non-owner cannot rename the Owner role, and it can never be deleted', () => {
  assert.ok(checkRoleChange({ actorIsOwner: false, ownerCount: 1, ownerRoleId: 1, action: 'edit_role', roleId: 1, rename: true }));
  assert.ok(checkRoleChange({ actorIsOwner: true, ownerCount: 2, ownerRoleId: 1, action: 'delete_role', roleId: 1 }));
});
test('the last owner cannot be removed or demoted', () => {
  assert.ok(checkRoleChange({ actorIsOwner: true, ownerCount: 0, ownerRoleId: 1, action: 'unassign', roleId: 1 }));
  assert.ok(checkRoleChange({ actorIsOwner: true, ownerCount: 0, ownerRoleId: 1, action: 'remove_staff', roleId: 1 }));
  assert.strictEqual(checkRoleChange({ actorIsOwner: true, ownerCount: 1, ownerRoleId: 1, action: 'unassign', roleId: 1 }), null);
});
test('a role in use is refused before checkRoleChange by the API, and unrelated changes pass', () => {
  assert.strictEqual(checkRoleChange({ actorIsOwner: true, ownerCount: 1, ownerRoleId: 1, action: 'assign', roleId: 3 }), null);
  assert.strictEqual(checkRoleChange({ actorIsOwner: false, ownerCount: 1, ownerRoleId: 1, action: 'edit_role', roleId: 3, rename: true }), null);
  assert.strictEqual(checkRoleChange({ actorIsOwner: true, ownerCount: 1, ownerRoleId: 1, action: 'edit_role', roleId: 1, rename: true }), null);
});