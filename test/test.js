var canBind = require("../can-bind");
var canReflect = require("can-reflect");
var canReflectDeps = require("can-reflect-dependencies");
var Observation = require("can-observation");
var QUnit = require("steal-qunit");
var SettableObservable = require("can-simple-observable/settable/settable");
var SimpleObservable = require("can-simple-observable");

var onlyDevTest = steal.isEnv("production") ? QUnit.skip : QUnit.test;

// Helper for taking a value and incrementing it by one
function incrementByOne(newValue) {
	return newValue + 1;
}

// Helper returns a function that can only be called 10 times before it throws an error
function protectAgainstInfiniteLoops(func) {
	var counter = 0;
	return function() {
		counter += 1;
		if (counter > 10) {
			throw new Error("Infinite loop");
		}
		return func.apply(null, arguments);
	};
};

QUnit.module('can-bind');

QUnit.test('one-way binding to child', function(assert) {
	var parentValue = new SimpleObservable(0);
	var parent = new Observation(function() {
		return parentValue.get();
	});
	var child = new SimpleObservable(0);
	var binding = canBind({
		child: child,
		parent: parent,
		queue: "domUI",
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	// Turn on the listeners
	binding.on();

	// Set the parent’s value and expect the child to update
	parentValue.set(15);
	assert.equal(canReflect.getValue(child), 15, 'child updates');

	// Set the child observable’s value and the parent should not update
	child.set(22);
	assert.equal(canReflect.getValue(parent), 15, 'parent does not update');

	// Turn off the listeners
	binding.off();

	// Setting the parent’s value should no longer update the child
	parentValue.set(45);
	assert.equal(canReflect.getValue(child), 22, 'parent listener correctly turned off()');
});

QUnit.test('one-way binding to parent', function(assert) {
	var parent = new SimpleObservable(0);
	var childValue = new SimpleObservable(0);
	var child = new Observation(function() {
		return childValue.get();
	});
	var binding = canBind({
		child: child,
		parent: parent,
		queue: "domUI",
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	// Turn on the listeners
	binding.on();

	// Set the parent observable’s value and the child should not update
	parent.set(15);
	assert.equal(canReflect.getValue(child), 0, 'child does not update');

	// Set the child’s value and expect the parent to update
	childValue.set(22);
	assert.equal(canReflect.getValue(parent), 22, 'parent updates');

	// Turn off the listeners
	binding.off();

	// Setting the child’s value should no longer update the parent
	childValue.set(58);
	assert.equal(canReflect.getValue(parent), 22, 'child listener correctly turned off()');
});

QUnit.test('basic two-way binding', function(assert) {
	var parent = new SimpleObservable(0);
	var child = new SimpleObservable(0);
	var binding = canBind({
		child: child,
		parent: parent,
		queue: "domUI",
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	// Turn on the listeners
	binding.on();

	// Set the parent observable’s value and expect the child to update
	parent.set(15);
	assert.equal(canReflect.getValue(child), 15, 'child updates');

	// Set the child observable’s value and expect the parent to update
	child.set(22);
	assert.equal(canReflect.getValue(parent), 22, 'parent updates');

	// Turn off the listeners
	binding.off();

	// Setting the parent observable’s value should no longer update the child
	parent.set(45);
	assert.equal(canReflect.getValue(child), 22, 'parent listener correctly turned off()');

	// Setting the child observable’s value should no longer update the parent
	child.set(58);
	assert.equal(canReflect.getValue(parent), 45, 'child listener correctly turned off()');
});

onlyDevTest('basic two-way binding - dependency data', function(assert) {
	var parent = new SimpleObservable(0);
	var child = new SimpleObservable(0);
	var binding = canBind({
		child: child,
		parent: parent,
		queue: "domUI",
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	// Turn on the listeners
	binding.on();

	// Child dependency/mutation data
	var childDepData = canReflectDeps.getDependencyDataOf(child);
	assert.deepEqual(
		childDepData,
		{
			whatChangesMe: {
				mutate: {
					valueDependencies: new Set([parent])
				}
			},
			whatIChange: {
				mutate: {
					valueDependencies: new Set([parent])
				}
			}
		},
		"child observable has the correct mutation dependencies"
	);

	// Parent dependency/mutation data
	var parentDepData = canReflectDeps.getDependencyDataOf(parent);
	assert.deepEqual(
		parentDepData,
		{
			whatChangesMe: {
				mutate: {
					valueDependencies: new Set([child])
				}
			},
			whatIChange: {
				mutate: {
					valueDependencies: new Set([child])
				}
			}
		},
		"parent observable has the correct mutation dependencies"
	);

	// Turn off the listeners
	binding.off();

	// Child dependency/mutation data
	childDepData = canReflectDeps.getDependencyDataOf(child);
	assert.equal(
		childDepData,
		undefined,
		"child observable has no mutation dependencies after off()"
	);

	// Parent dependency/mutation data
	parentDepData = canReflectDeps.getDependencyDataOf(parent);
	assert.equal(
		parentDepData,
		undefined,
		"parent observable has no mutation dependencies after off()"
	);
});

QUnit.test('priority option', function(assert) {
	var parent = new SettableObservable(function(newValue) {
		return newValue + 1;
	}, null, 0);
	var child = new SettableObservable(function(newValue) {
		return newValue + 1;
	}, null, 0);
	var binding = canBind({
		child: child,
		parent: parent,
		priority: 15,
		queue: "domUI",
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	assert.equal(canReflect.getPriority(child), 15, 'child priority set');
	assert.equal(canReflect.getPriority(parent), 15, 'parent priority set');
});

function cycleStickyTest(options) {
	var child = options.child;
	var cycles = options.cycles;
	var expectedChild = options.expectedChild;
	var expectedParent = options.expectedParent;
	var parent = options.parent;
	var sticky = options.sticky;

	// Create the binding
	var binding = canBind({
		child: child,
		cycles: cycles,
		parent: parent,
		queue: "domUI",
		sticky: sticky,
		updateChildName: "update child",
		updateParentName: "update parent"
	});

	// Turn on the listeners
	binding.on();

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
		options.expectedParent,
		"parent updates"
	);
	QUnit.equal(
		canReflect.getValue(child),
		options.expectedChild,
		"child updates"
	);

	// Turn off the listeners
	binding.off();
}

QUnit.test("cyclical two-way binding - 0 cycles not sticky", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

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

QUnit.test("cyclical two-way binding - 1 cycle not sticky", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

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
		parent: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, 0),

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
		parent: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, -1),

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

// Skipping this test because this may or may not be the correct behavior
QUnit.skip("two-way binding - 1 cycles childSticksToParent", function() {
	cycleStickyTest({

		// Parent observable adds 1 to whatever value it’s set to
		parent: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, -1),

		// Child observable doesn’t modify its own value
		child: new SimpleObservable(0),

		// After the child sets the parent, the parent can set the child once
		cycles: 1,

		// After the child sets the parent, check to see if they’re equal;
		// if different, then update the child to the parent’s value
		sticky: "childSticksToParent",

		// Start by setting the child observable to 1
		startBySetting: "child",

		// child sets parent to 1, parent changes its own value to 2
		// because the parent is 2 and the child is 1,
		// childSticksToParent dictates that child should be set to 2
		// because cycles: 1, do it again:
		// child would set parent to 2, but parent is already 2,
		// so the cycle does not continue
		expectedParent: 2,
		expectedChild: 2

	});
});

// Skipping this test because this may or may not be the correct behavior
QUnit.skip("two-way binding - 2 cycles childSticksToParent set parent", function() {
	cycleStickyTest({

		// Parent observable doesn’t modify its own value
		parent: new SimpleObservable(0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, -1),

		// After the child sets the parent, the parent can set the child twice
		cycles: 2,

		// After the child sets the parent, check to see if they’re equal;
		// if different, then update the child to the parent’s value
		sticky: "childSticksToParent",

		// Start by setting the parent observable to 1
		startBySetting: "parent",

		// parent sets child to 1, child changes its own value to 2
		// because cycles: 2, child can set parent:
		// child sets parent to 2, then parent tries to set child to 2 again
		// TODO: the child is already 2, so does it ignore the update?
		// OR does the child then change its own value to 3?, which means
		// because cycles: 2, the child can set the parent to 3,
		// the parent updates the child, which updates itself to 4?
		expectedParent: 3,
		expectedChild: 4

	});
});

// Skipping this test because parentSticksToChild isn’t implemented
QUnit.skip("two-way binding - 2 cycles parentSticksToChild", function() {
	cycleStickyTest({

		// Parent observable doesn’t modify its own value
		parent: new SimpleObservable(0),

		// Child observable adds 1 to whatever value it’s set to
		child: new SettableObservable(protectAgainstInfiniteLoops(incrementByOne), null, -1),

		// After the child sets the parent, the parent can set the child twice
		cycles: 2,

		// After the parent sets the child, check to see if they’re equal;
		// if different, then update the parent to the child’s value
		sticky: "parentSticksToChild",

		// Start by setting the parent observable to 1
		startBySetting: "parent",

		// parent sets child to 1, child changes its own value to 2
		// because the child is 2 and the parent is 1,
		// parentSticksToChild dictates that parent should be set to 2
		// because cycles: 2, do it again:
		// parent sets child to 2, child changes its own value to 3
		// because the child is 3 and the parent is 2,
		// parentSticksToChild dictates that parent should be set to 3
		// because cycles: 2, do it one more time:
		// parent sets child to 3, child changes its own value to 4
		expectedChild: 4,

		// because the child is 4 and the parent is 3,
		// parentSticksToChild dictates that parent should be set to 4
		expectedParent: 4

	});
});
