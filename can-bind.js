var canReflect = require("can-reflect");
var canReflectDeps = require("can-reflect-dependencies");
var canSymbol = require("can-symbol");
var queues = require("can-queues");

// Symbols
var getChangesSymbol = canSymbol.for("can.getChangesDependencyRecord");
var onValueSymbol = canSymbol.for("can.onValue");
var setValueSymbol = canSymbol.for("can.setValue");

// Given an observable, stop listening to it and tear down the mutation dependencies
function turnOffListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
	if (listenToObservable[onValueSymbol]) {
		canReflect.offValue(listenToObservable, updateFunction, queue);

		//!steal-remove-start

		// The updateObservable is no longer mutated by listenToObservable
		canReflectDeps.deleteMutatedBy(updateObservable, listenToObservable);

		// The updateFunction no longer mutates anything
		updateFunction[getChangesSymbol] = function getChangesDependencyRecord() {
		};

		//!steal-remove-end
	}
}

// Given an observable, start listening to it and set up the mutation dependencies
function turnOnListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
	if (listenToObservable[onValueSymbol]) {
		canReflect.onValue(listenToObservable, updateFunction, queue);

		//!steal-remove-start

		// The updateObservable is mutated by listenToObservable
		canReflectDeps.addMutatedBy(updateObservable, listenToObservable);

		// The updateFunction mutates updateObservable
		updateFunction[getChangesSymbol] = function getChangesDependencyRecord() {
			return {
				valueDependencies: new Set([updateObservable])
			};
		};

		//!steal-remove-end
	}
}

module.exports = function(options) {
	var child = options.child;
	var parent = options.parent;
	var priority = options.priority;
	var queue = options.queue;
	var setChild = options.setChild;
	var setParent = options.setParent;
	var initUndefinedChildIfParentIsDefined = !!options.initUndefinedChildIfParentIsDefined;
	var initUndefinedParentIfChildIsDefined = !!options.initUndefinedParentIfChildIsDefined;
	var updateChildName = options.updateChildName;
	var updateParentName = options.updateParentName;

	// These parameters must be supplied
	if (!child) {
		throw new TypeError("You must supply a child");
	}
	if (!parent) {
		throw new TypeError("You must supply a parent");
	}
	if (!queue) {
		throw new TypeError("You must supply a queue (such as domUI or mutate)");
	}
	//!steal-remove-start
	if (!updateChildName) {
		throw new TypeError("You must supply updateChildName for debugging");
	}
	if (!updateParentName) {
		throw new TypeError("You must supply updateParentName for debugging");
	}
	//!steal-remove-end

	// cycles: when an observable is set in a two-way binding, it can update the
	// other bound observable, which can then update the original observable the
	// “cycles” number of times. For example, a child is set and updates the parent;
	// with cycles: 0, the parent could not update the child;
	// with cycles: 1, the parent could update the child, which can update the parent
	// with cycles: 2, the parent can update the child again, and so on and so forth…
	var cycles = options.cycles || 0;

	// The way the cycles are tracked is through this semaphore; currently, when
	// the child is updated, we increase the semaphore so that if it’s two-way
	// bound to the parent, then the parent will only update if the semaphore is
	// less than the number of allowed cycles.
	var semaphore = 0;

	// childSticksToParent: after the child sets the parent, check to see if the
	// parent matches the child; if not, then set the child to the parent’s value.
	// This is used in cases where the parent modifies its own value and the child
	// should be kept in sync with it.
	var childSticksToParent = options.sticky === "childSticksToParent";
	if (childSticksToParent && cycles > 0) {
		throw new Error("childSticksToParent && cycles > 0 is not yet implemented");
	}

	// parentSticksToChild: after the parent sets the child, check to see if the
	// child matches the parent; if not, then set the parent to the child’s value.
	// This is used in cases where the child modifies its own value and the parent
	// should be kept in sync with it.
	var parentSticksToChild = options.sticky === "parentSticksToChild";
	if (parentSticksToChild) {
		throw new Error("parentSticksToChild is not yet implemented");
	}

	// Determine if the child and/or parent should be updated
	// Check if the parent has setValue
	var bindChildToParent = !!parent[setValueSymbol];
	// If it does and the option is passed in, use the option’s value
	if (bindChildToParent && options.bindChildToParent !== undefined) {
		bindChildToParent = !!options.bindChildToParent;
	}
	// Check if the child has setValue
	var bindParentToChild = !!child[setValueSymbol];
	// If it does and the option is passed in, use the option’s value
	if (bindParentToChild && options.bindParentToChild !== undefined) {
		bindParentToChild = !!options.bindParentToChild;
	}

	// Custom child & parent setters can be supplied;
	// if they aren’t, then create our own.
	if (!setChild) {
		setChild = function(newValue) {
			canReflect.setValue(child, newValue);
		};
	}
	if (!setParent) {
		setParent = function(newValue) {
			canReflect.setValue(parent, newValue);
		};
	}

	// Set the observables’ priority
	if (priority !== undefined) {
		canReflect.setPriority(child, priority);
		canReflect.setPriority(parent, priority);
	}

	// This keeps track of whether we’re bound to the child and/or parent; this
	// allows bindParent() to be called first and on() can be called later to
	// finish setting up the child binding.
	var bindingState = {
		child: false,
		parent: false
	};

	// Set up the object that will be returned
	var binding = {

		// Listen for changes to the child observable and update the parent
		bindChild: function() {
			if (!bindingState.child && bindChildToParent) {
				turnOnListeningAndUpdate(child, parent, binding.updateParent, queue);
				bindingState.child = true;
			}
		},

		// Listen for changes to the parent observable and update the child
		bindParent: function() {
			if (!bindingState.parent && bindParentToChild) {
				turnOnListeningAndUpdate(parent, child, binding.updateChild, queue);
				bindingState.parent = true;
			}
		},

		// Turn off all the bindings
		off: function() {

			// Turn off the parent listener
			if (bindingState.parent && bindParentToChild) {
				turnOffListeningAndUpdate(parent, child, binding.updateChild, queue);
				bindingState.parent = false;
			}

			// Turn off the child listener
			if (bindingState.child && bindChildToParent) {
				turnOffListeningAndUpdate(child, parent, binding.updateParent, queue);
				bindingState.child = false;
			}
		},

		// Turn on any bindings that haven’t already been enabled;
		// also update the child or parent if need be.
		on: function() {

			// The tests don’t show that it matters which is bound first, but we’ll
			// bind to the parent first to stay consistent with how
			// can-stache-bindings did things.
			binding.bindParent();
			binding.bindChild();

			// Updates the parent or child value depending on the direction of the
			// binding, or if the child or parent is undefined.
			var forceUpdateParent = false;

			// One-way parent -> child
			if (bindParentToChild && !bindChildToParent) {
				// Update the child if it’s undefined
			}
			// One-way child -> parent
			else if (!bindParentToChild && bindChildToParent) {
				// Update the parent regardless of whether it’s undefined
				forceUpdateParent = true;
			}
			// Two-way undefined child
			else if (canReflect.getValue(child) === undefined) {
				// Update the child because it’s undefined
			}
			// Two-way undefined parent
			else if (canReflect.getValue(parent) === undefined) {
				// Update the parent because it’s undefined
				forceUpdateParent = true;
			}

			if (forceUpdateParent || initUndefinedParentIfChildIsDefined) {
				binding.updateParent( canReflect.getValue(child) );
			} else {
				if (initUndefinedChildIfParentIsDefined) {
					binding.updateChild( canReflect.getValue(parent) );
				}
			}
		},

		// This is the listener that’s called when the parent changes
		updateChild: function(newValue) {
			queues.batch.start();

			// Update the child’s value with either canReflect.setValue
			// or a custom function passed on init.
			setChild(newValue);

			// Increase the semaphore so that when the batch ends, if updateParent is
			// called, it won’t update the child unless cycles are allowed.
			semaphore += 1;
			queues.mutateQueue.enqueue(function decrementSemaphore() {
				// Decrease the semaphore after all other updates have occurred
				semaphore -= 1;
			}, null, [], {});

			queues.batch.stop();
		},

		// This is the listener that’s called when the child changes
		updateParent: function(newValue) {

			// Check the semaphore first; if this change is happening because the
			// child was just set in updateChild, we only want to update the parent
			// again if cycles are allowed.
			if (semaphore <= cycles) {
				var hasDependencies = canReflect.valueHasDependencies(parent);

				// Update the parent with the child’s value
				if (!hasDependencies || (canReflect.getValue(parent) !== newValue)) {
					setParent(newValue);
				}

				// childSticksToParent is used in cases where the parent might modify
				// its own value and the child should be kept in sync with it.
				if (childSticksToParent && hasDependencies) {
					var parentValue = canReflect.getValue(parent);
					if (parentValue !== canReflect.getValue(child)) {
						setChild(parentValue);
					}
				}
			}
		}
	};

	Object.defineProperty(binding, "parentValue", {
		get: function() {
			return canReflect.getValue(parent);
		}
	});

	//!steal-remove-start
	Object.defineProperty(binding.updateChild, "name", {
		value: updateChildName
	});
	Object.defineProperty(binding.updateParent, "name", {
		value: updateParentName
	});
	//!steal-remove-end

	return binding;
};
