var canBind = require("../can-bind");
var QUnit = require("steal-qunit");

QUnit.module('can-bind');

QUnit.test('basics', function() {
  QUnit.equal(typeof canBind, 'function');
});
