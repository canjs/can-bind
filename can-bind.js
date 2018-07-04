"use strict";
var canReflect = require("can-reflect");
var canSymbol = require("can-symbol");
var namespace = require("can-namespace");
var queues = require("can-queues");

//!steal-remove-start
if(process.env.NODE_ENV !== 'production') {
	var canLog = require("can-log/dev/dev");
	var canReflectDeps = require("can-reflect-dependencies");
}
//!steal-remove-end

// Symbols
var getChangesSymbol = canSymbol.for("can.getChangesDependencyRecord");
var getValueSymbol = canSymbol.for("can.getValue");
var onValueSymbol = canSymbol.for("can.onValue");
var setValueSymbol = canSymbol.for("can.setValue");

// Default implementations for setting the child and parent values
function defaultSetValue(newValue, observable) {
	canReflect.setValue(observable, newValue);
}

// Given an observable, stop listening to it and tear down the mutation dependencies
function turnOffListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
	if (listenToObservable[onValueSymbol]) {
		canReflect.offValue(listenToObservable, updateFunction, queue);

		//!steal-remove-start
		if(process.env.NODE_ENV !== 'production') {

			// The updateObservable is no longer mutated by listenToObservable
			canReflectDeps.deleteMutatedBy(updateObservable, listenToObservable);

			// The updateFunction no longer mutates anything
			updateFunction[getChangesSymbol] = function getChangesDependencyRecord() {
			};

		}
		//!steal-remove-end
	}
}

// Given an observable, start listening to it and set up the mutation dependencies
function turnOnListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
	if (listenToObservable[onValueSymbol]) {
		canReflect.onValue(listenToObservable, updateFunction, queue);

		//!steal-remove-start
		if(process.env.NODE_ENV !== 'production') {

			// The updateObservable is mutated by listenToObservable
			canReflectDeps.addMutatedBy(updateObservable, listenToObservable);

			// The updateFunction mutates updateObservable
			updateFunction[getChangesSymbol] = function getChangesDependencyRecord() {
				return {
					valueDependencies: new Set([updateObservable])
				};
			};

		}

		//!steal-remove-end
	}
}

// Semaphores are used to keep track of updates to the child & parent
function Semaphore() {
	this.value = 0;
}
Object.assign(Semaphore.prototype, {
	decrement: function() {
		this.value -= 1;
	},
	increment: function() {
		this.value += 1;
	}
});

function Bind(options) {
	this._options = options;

	// These parameters must be supplied
	//!steal-remove-start
	if(process.env.NODE_ENV !== 'production') {
		if (options.child === undefined) {
			throw new TypeError("You must supply a child");
		}
		if (options.parent === undefined) {
			throw new TypeError("You must supply a parent");
		}
		if (options.queue && ["notify", "derive", "domUI"].indexOf(options.queue) === -1) {
			throw new RangeError("Invalid queue; must be one of notify, derive, or domUI");
		}
	}
	//!steal-remove-end

	// queue; by default, domUI
	if (options.queue === undefined) {
		options.queue = "domUI";
	}

	// cycles: when an observable is set in a two-way binding, it can update the
	// other bound observable, which can then update the original observable the
	// “cycles” number of times. For example, a child is set and updates the parent;
	// with cycles: 0, the parent could not update the child;
	// with cycles: 1, the parent could update the child, which can update the parent
	// with cycles: 2, the parent can update the child again, and so on and so forth…
	if (options.cycles > 0 === false) {
		options.cycles = 0;
	}

	// onInitDoNotUpdateChild is false by default
	options.onInitDoNotUpdateChild =
		typeof options.onInitDoNotUpdateChild === "boolean" ?
			options.onInitDoNotUpdateChild
			: false;

	// onInitSetUndefinedParentIfChildIsDefined is true by default
	options.onInitSetUndefinedParentIfChildIsDefined =
		typeof options.onInitSetUndefinedParentIfChildIsDefined === "boolean" ?
			options.onInitSetUndefinedParentIfChildIsDefined
			: true;

	// The way the cycles are tracked is through semaphores; currently, when
	// either the child or parent is updated, we increase their respective
	// semaphore so that if it’s two-way binding, then the “other” observable
	// will only update if the total count for both semaphores is less than or
	// equal to twice the number of cycles (because a cycle means two updates).
	var childSemaphore = new Semaphore();
	var parentSemaphore = new Semaphore();

	// Determine if this is a one-way or two-way binding; by default, accept
	// whatever options are passed in, but if they’re not defined, then check for
	// the getValue and setValue symbols on the child and parent values.
	var childToParent = true;
	if (typeof options.childToParent === "boolean") {
		// Always let the option override any checks
		childToParent = options.childToParent;
	} else if (options.child[getValueSymbol] == null) {
		// Child to parent won’t work if we can’t get the child’s value
		childToParent = false;
	} else if (options.setParent === undefined && options.parent[setValueSymbol] == null) {
		// Child to parent won’t work if we can’t set the parent’s value
		childToParent = false;
	}
	var parentToChild = true;
	if (typeof options.parentToChild === "boolean") {
		// Always let the option override any checks
		parentToChild = options.parentToChild;
	} else if (options.parent[getValueSymbol] == null) {
		// Parent to child won’t work if we can’t get the parent’s value
		parentToChild = false;
	} else if (options.setChild === undefined && options.child[setValueSymbol] == null) {
		// Parent to child won’t work if we can’t set the child’s value
		parentToChild = false;
	}
	if (childToParent === false && parentToChild === false) {
		throw new Error("Neither the child nor parent will be updated; this is a no-way binding");
	}
	this._childToParent = childToParent;
	this._parentToChild = parentToChild;

	// Custom child & parent setters can be supplied; if they aren’t provided,
	// then create our own.
	if (options.setChild === undefined) {
		options.setChild = defaultSetValue;
	}
	if (options.setParent === undefined) {
		options.setParent = defaultSetValue;
	}

	// Set the observables’ priority
	if (options.priority !== undefined) {
		canReflect.setPriority(options.child, options.priority);
		canReflect.setPriority(options.parent, options.priority);
	}

	// These variables keep track of how many updates are allowed in a cycle.
	// cycles is multipled by two because one update is allowed for each side of
	// the binding, child and parent. One more update is allowed depending on the
	// sticky option; if it’s sticky, then one more update needs to be allowed.
	var allowedUpdates = options.cycles * 2;
	var allowedChildUpdates = allowedUpdates + (options.sticky === "childSticksToParent" ? 1 : 0);
	var allowedParentUpdates = allowedUpdates + (options.sticky === "parentSticksToChild" ? 1 : 0);

	// This keeps track of whether we’re bound to the child and/or parent; this
	// allows startParent() to be called first and on() can be called later to
	// finish setting up the child binding. This is also checked when updating
	// values; if stop() has been called but updateValue() is called, then we
	// ignore the update.
	var bindingState = this._bindingState = {
		child: false,
		parent: false
	};

	// This is the listener that’s called when the parent changes
	this._updateChild = function(newValue) {
		updateValue({
			bindingState: bindingState,
			newValue: newValue,

			// Some options used for debugging
			debugObservableName: "child",
			debugPartnerName: "parent",

			// Main observable values
			observable: options.child,
			setValue: options.setChild,
			semaphore: childSemaphore,

			// If the sum of the semaphores is less than or equal to this number, then
			// it’s ok to update the child with the new value.
			allowedUpdates: allowedChildUpdates,

			// If options.sticky === "parentSticksToChild", then after the parent sets
			// the child, check to see if the child matches the parent; if not, then
			// set the parent to the child’s value. This is used in cases where the
			// child modifies its own value and the parent should be kept in sync with
			// the child.
			sticky: options.sticky === "parentSticksToChild",

			// Partner observable values
			partner: options.parent,
			setPartner: options.setParent,
			partnerSemaphore: parentSemaphore
		});
	};

	// This is the listener that’s called when the child changes
	this._updateParent = function(newValue) {
		updateValue({
			bindingState: bindingState,
			newValue: newValue,

			// Some options used for debugging
			debugObservableName: "parent",
			debugPartnerName: "child",

			// Main observable values
			observable: options.parent,
			setValue: options.setParent,
			semaphore: parentSemaphore,

			// If the sum of the semaphores is less than or equal to this number, then
			// it’s ok to update the parent with the new value.
			allowedUpdates: allowedParentUpdates,

			// If options.sticky === "childSticksToParent", then after the child sets
			// the parent, check to see if the parent matches the child; if not, then
			// set the child to the parent’s value. This is used in cases where the
			// parent modifies its own value and the child should be kept in sync with
			// the parent.
			sticky: options.sticky === "childSticksToParent",

			// Partner observable values
			partner: options.child,
			setPartner: options.setChild,
			partnerSemaphore: childSemaphore
		});
	};

	//!steal-remove-start
	if(process.env.NODE_ENV !== 'production') {
		if (options.updateChildName) {
			Object.defineProperty(this._updateChild, "name", {
				value: options.updateChildName
			});
		}
		if (options.updateParentName) {
			Object.defineProperty(this._updateParent, "name", {
				value: options.updateParentName
			});
		}
	}
	//!steal-remove-end

}

Object.defineProperty(Bind.prototype, "parentValue", {
	get: function() {
		return canReflect.getValue(this._options.parent);
	}
});

Object.assign(Bind.prototype, {

	// Turn on any bindings that haven’t already been enabled;
	// also update the child or parent if need be.
	start: function() {
		var childValue;
		var options = this._options;
		var parentValue;

		// The tests don’t show that it matters which is bound first, but we’ll
		// bind to the parent first to stay consistent with how
		// can-stache-bindings did things.
		this.startParent();
		this.startChild();

		// Initialize the child & parent values
		if (this._childToParent === true && this._parentToChild === true) {
			// Two-way binding
			parentValue = canReflect.getValue(options.parent);
			if (parentValue === undefined) {
				childValue = canReflect.getValue(options.child);
				if (childValue === undefined) {
					// Check if updating the child is allowed
					if (options.onInitDoNotUpdateChild === false) {
						this._updateChild(parentValue);
					}
				} else if (options.onInitSetUndefinedParentIfChildIsDefined === true) {
					this._updateParent(childValue);
				}
			} else {
				// Check if updating the child is allowed
				if (options.onInitDoNotUpdateChild === false) {
					this._updateChild(parentValue);
				}
			}

		} else if (this._childToParent === true) {
			// One-way child -> parent, so update the parent
			childValue = canReflect.getValue(options.child);
			this._updateParent(childValue);

		} else if (this._parentToChild === true) {
			// One-way parent -> child, so update the child
			// Check if updating the child is allowed
			if (options.onInitDoNotUpdateChild === false) {
				parentValue = canReflect.getValue(options.parent);
				this._updateChild(parentValue);
			}
		}
	},

	// Listen for changes to the child observable and update the parent
	startChild: function() {
		if (this._bindingState.child === false && this._childToParent === true) {
			var options = this._options;
			this._bindingState.child = true;
			turnOnListeningAndUpdate(options.child, options.parent, this._updateParent, options.queue);
		}
	},

	// Listen for changes to the parent observable and update the child
	startParent: function() {
		if (this._bindingState.parent === false && this._parentToChild === true) {
			var options = this._options;
			this._bindingState.parent = true;
			turnOnListeningAndUpdate(options.parent, options.child, this._updateChild, options.queue);
		}
	},

	// Turn off all the bindings
	stop: function() {
		var bindingState = this._bindingState;
		var options = this._options;

		// Turn off the parent listener
		if (bindingState.parent === true && this._parentToChild === true) {
			bindingState.parent = false;
			turnOffListeningAndUpdate(options.parent, options.child, this._updateChild, options.queue);
		}

		// Turn off the child listener
		if (bindingState.child === true && this._childToParent === true) {
			bindingState.child = false;
			turnOffListeningAndUpdate(options.child, options.parent, this._updateParent, options.queue);
		}
	}

});

// updateValue is a helper function that’s used by updateChild and updateParent
function updateValue(args) {

	// Check to see whether the binding is active; ignore updates if it isn’t active
	var bindingState = args.bindingState;
	if (bindingState.child === false && bindingState.parent === false) {
		// We don’t warn the user about this because it’s a common occurrence in
		// can-stache-bindings, e.g. {{#if value}}<input value:bind="value"/>{{/if}}
		return;
	}

	// Now check the semaphore; if this change is happening because the partner
	// observable was just updated, we only want to update this observable again
	// if the total count for both semaphores is less than or equal to the number
	// of allowed updates.
	var semaphore = args.semaphore;
	if ((semaphore.value + args.partnerSemaphore.value) <= args.allowedUpdates) {
		queues.batch.start();

		// Update the observable’s value; this uses either a custom function passed
		// in when the binding was initialized or canReflect.setValue.
		args.setValue(args.newValue, args.observable);

		// Increase the semaphore so that when the batch ends, if an update to the
		// partner observable’s value is made, then it won’t update this observable
		// again unless cycles are allowed.
		semaphore.increment();

		// Decrease the semaphore after all other updates have occurred
		queues.mutateQueue.enqueue(semaphore.decrement, semaphore, []);

		queues.batch.stop();

		// Stickiness is used in cases where the call to args.setValue above might
		// have resulted in the observable being set to a different value than what
		// was passed into this function (args.newValue). If sticky:true, then set
		// the partner observable’s value so they’re kept in sync.
		if (args.sticky) {
			var observableValue = canReflect.getValue(args.observable);
			if (observableValue !== canReflect.getValue(args.partner)) {
				args.setPartner(observableValue, args.partner);
			}
		}

	} else {
		// It’s natural for this “else” block to be hit in two-way bindings; as an
		// example, if a parent gets set and the child gets updated, the child’s
		// listener to update the parent will be called, but it’ll be ignored if we
		// don’t want cycles. HOWEVER, if this gets called and the parent is not the
		// same value as the child, then their values are going to be out of sync,
		// probably unintentionally. This is worth pointing out to developers
		// because it can cause unexpected behavior… some people call those bugs. :)

		//!steal-remove-start
		if(process.env.NODE_ENV !== 'production'){
			var currentValue = canReflect.getValue(args.observable);
			if (currentValue !== args.newValue) {
				var warningParts = [
					"can-bind updateValue: attempting to update " + args.debugObservableName + " " + canReflect.getName(args.observable) + " to new value: %o",
					"…but the " + args.debugObservableName + " semaphore is at " + semaphore.value + " and the " + args.debugPartnerName + " semaphore is at " + args.partnerSemaphore.value + ". The number of allowed updates is " + args.allowedUpdates + ".",
					"The " + args.debugObservableName + " value will remain unchanged; it’s currently: %o"
				];
				canLog.warn(warningParts.join("\n"), args.newValue, currentValue);
			}
		}
		//!steal-remove-end
	}
}

module.exports = namespace.Bind = Bind;
