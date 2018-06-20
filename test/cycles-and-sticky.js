var Bind = require("../can-bind");
var canReflect = require("can-reflect");
var canTestHelpers = require("can-test-helpers");
var helpers = require("./helpers");
var QUnit = require("steal-qunit");
var SettableObservable = require("can-simple-observable/settable/settable");
var SimpleObservable = require("can-simple-observable");

QUnit.module("can-bind cycles and sticky");

QUnit.test("two-way binding with childSticksToParent", function(assert) {
	var child = new SimpleObservable(0);
	var parent = new SimpleObservable(0);
	canReflect.assignSymbols(parent, {
		"can.setValue": function(newVal) {
	    if (newVal !== undefined) {
				this.set(newVal);
			}
		}
	});

	var binding = new Bind({
		child: child,
		parent: parent,
		sticky: "childSticksToParent"
	});

	// Turn on the listeners
	binding.start();

	// Set the child observable’s value and both should update
	child.set(15);
	assert.equal(canReflect.getValue(child), 15, "child updates");
	assert.equal(canReflect.getValue(parent), 15, "parent updates");

	// Set the child’s value to undefined and expect the parent to ignore the update;
	// with childSticksToParent, the child will be reset back to the original value
	child.set(undefined);
	assert.equal(canReflect.getValue(child), 15, "child stays the same");
	assert.equal(canReflect.getValue(parent), 15, "parent stays the same");

	// Turn off the listeners
	binding.stop();
});

function cycleStickyTest(options) {
	var child = options.child;
	var cycles = options.cycles;
	var expectedChild = options.expectedChild;
	var expectedParent = options.expectedParent;
	var parent = options.parent;
	var sticky = options.sticky;

	// Create the binding
	var binding = new Bind({
		child: child,
		cycles: cycles,
		onInitDoNotUpdateChild: true,
		parent: parent,
		sticky: sticky
	});

	// Turn on the listeners
	binding.start();

	// Set the observable’s value
	if (options.startBySetting === "child") {
		child.set(1);
	} else if (options.startBySetting === "parent") {
		parent.set(1);
	} else {
		throw new Error("No startBySetting option given");
	}

	// Check the expected values
	QUnit.equal(
		canReflect.getValue(parent),
		expectedParent,
		"parent updates"
	);
	QUnit.equal(
		canReflect.getValue(child),
		expectedChild,
		"child updates"
	);

	// Turn off the listeners
	binding.stop();
}

QUnit.test("cyclical two-way binding - 0 cycles not sticky", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// After the parent sets the child, the child cannot set the parent
		cycles: 0,

		// After the parent sets the child, don’t check to see if they’re equal
		sticky: null,

		// Start by setting the parent observable to 1
		startBySetting: "parent",

		// parent changes its own value to 2
		expectedParent: 2,

		// parent sets child to 2, child changes its own value to 3
		expectedChild: 3

	});
});

canTestHelpers.dev.devOnlyTest("cyclical two-way binding - 0 cycles not sticky - warning in dev", function() {
	// Note that the actual warning shown in the console will be formatted nicely;
	// the “3” is the new value and the “2” is the parent’s current value
	var warningRegex = /The parent value will remain unchanged; it’s currently: %o 3 2/;
	var teardown = canTestHelpers.dev.willWarn(warningRegex);

	// Test is the same as the one above, we just need to do this in dev mode
	cycleStickyTest({
		parent: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),
		child: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),
		startBySetting: "parent",
		expectedParent: 2,
		expectedChild: 3
	});

	QUnit.equal(teardown(), 1, "warning shown");
});

QUnit.test("cyclical two-way binding - 1 cycle not sticky", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// After the parent sets the child, the child can set the parent once
		cycles: 1,

		// After the parent sets the child, don’t check to see if they’re equal
		sticky: null,

		// Start by setting the parent observable to 1
		startBySetting: "parent",

		// parent changes its own value to 2
		// parent sets child to 2, child changes its own value to 3
		// because cycles: 1, do it again:

		// child sets parent to 3, parent changes its own value to 4
		expectedParent: 4,

		// parent sets child to 4, child changes its own value to 5
		expectedChild: 5

	});
});

QUnit.test("cyclical two-way binding - 2 cycles not sticky", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, 0),

		// After the parent sets the child, the child can set the parent twice
		cycles: 2,

		// After the parent sets the child, don’t check to see if they’re equal
		sticky: null,

		// Start by setting the parent observable to 1
		startBySetting: "parent",

		// parent changes its own value to 2
		// parent sets child to 2, child changes its own value to 3
		// because cycles: 2, do it again:
		// child sets parent to 3, parent changes its own value to 4
		// parent sets child to 4, child changes its own value to 5
		// because cycles: 2, do it one more time:

		// child sets parent to 5, parent changes its own value to 6
		expectedParent: 6,

		// parent sets child to 6, child changes its own value to 7
		expectedChild: 7

	});
});

// This test matches how can-stache-bindings is configured
QUnit.test("two-way binding - 0 cycles childSticksToParent", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(helpers.protectAgainstInfiniteLoops(helpers.incrementByOne), null, -1),

		// Child observable doesn’t modify its own value
		child: new SimpleObservable(0),

		// After the child sets the parent, the parent cannot set the child
		cycles: 0,

		// After the child sets the parent, check to see if they’re equal;
		// if different, then update the child to the parent’s value
		sticky: "childSticksToParent",

		// Start by setting the child observable to 1
		startBySetting: "child",

		// child sets parent to 1, parent changes its own value to 2
		expectedParent: 2,

		// because the parent is 2 and the child is 1,
		// childSticksToParent dictates that child should be set to 2
		expectedChild: 2

	});
});
