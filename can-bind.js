var canReflect = require("can-reflect");
var canReflectDeps = require("can-reflect-dependencies");
var canSymbol = require("can-symbol");
var queues = require("can-queues");

// Symbols
var getChangesSymbol = canSymbol.for("can.getChangesDependencyRecord");
var onValueSymbol = canSymbol.for("can.onValue");
var setValueSymbol = canSymbol.for("can.setValue");

// Default implementations for setting the child and parent values
function defaultSetChild(newValue) {
	canReflect.setValue(this.child, newValue);
}
function defaultSetParent(newValue) {
	canReflect.setValue(this.parent, newValue);
}

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
	if (options.child === undefined) {
		throw new TypeError("You must supply a child");
	}
	if (options.parent === undefined) {
		throw new TypeError("You must supply a parent");
	}
	if (options.queue === undefined) {
		throw new TypeError("You must supply a queue (such as notify, derive, or domUI)");
	} else if (["notify", "derive", "domUI"].indexOf(options.queue) === -1) {
		throw new RangeError("Invalid queue; must be one of notify, derive, or domUI");
	}
	//!steal-remove-end

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
	// equal to twice the number of allowed cycles.
	this.childSemaphore = new Semaphore();
	this.parentSemaphore = new Semaphore();

	// options.sticky === "childSticksToParent": after the child sets the parent,
	// check to see if the parent matches the child; if not, then set the child to
	// the parent’s value. This is used in cases where the parent modifies its own
	// value and the child should be kept in sync with it.
	//!steal-remove-start
	if (options.sticky === "childSticksToParent" && options.cycles > 0) {
		throw new Error("childSticksToParent && cycles > 0 is not yet tested");
	}
	//!steal-remove-end

	// options.sticky === "parentSticksToChild": after the parent sets the child,
	// check to see if the child matches the parent; if not, then set the parent
	// to the child’s value. This is used in cases where the child modifies its
	// own value and the parent should be kept in sync with it.
	//!steal-remove-start
	if (options.sticky === "parentSticksToChild") {
		throw new Error("parentSticksToChild is not yet tested");
	}
	//!steal-remove-end

	// Determine if the child and/or parent should be updated
	// Check if setParent was provided or the parent has setValue
	this._childToParent = !!(options.setParent || options.parent[setValueSymbol]);
	// If it does and the option is passed in, use the option’s value
	if (this._childToParent === true && typeof options.childToParent === "boolean") {
		this._childToParent = options.childToParent;
	}
	// Check if setChild was provided or the child has setValue
	this._parentToChild = !!(options.setChild || options.child[setValueSymbol]);
	// If it does and the option is passed in, use the option’s value
	if (this._parentToChild === true && typeof options.parentToChild === "boolean") {
		this._parentToChild = options.parentToChild;
	}
	if (this._childToParent === false && this._parentToChild === false) {
		throw new Error("Neither the child nor parent will be updated; this is a no-way binding");
	}

	// Custom child & parent setters can be supplied;
	// if they aren’t provided, then create our own.
	if (options.setChild === undefined) {
		options.setChild = defaultSetChild.bind(options);
	}
	if (options.setParent === undefined) {
		options.setParent = defaultSetParent.bind(options);
	}

	// Bind the methods to this instance
	this.start = this.start.bind(this);
	this.stop = this.stop.bind(this);
	this.updateChild = this.updateChild.bind(this);
	this.updateParent = this.updateParent.bind(this);

	// Set the observables’ priority
	if (options.priority !== undefined) {
		canReflect.setPriority(options.child, options.priority);
		canReflect.setPriority(options.parent, options.priority);
	}

	// This keeps track of whether we’re bound to the child and/or parent; this
	// allows startParent() to be called first and on() can be called later to
	// finish setting up the child binding.
	this._bindingState = {
		child: false,
		parent: false
	};

	//!steal-remove-start
	if (options.updateChildName) {
		Object.defineProperty(this.updateChild, "name", {
			value: options.updateChildName
		});
	}
	if (options.updateParentName) {
		Object.defineProperty(this.updateParent, "name", {
			value: options.updateParentName
		});
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
						this.updateChild(parentValue);
					}
				} else if (options.onInitSetUndefinedParentIfChildIsDefined === true) {
					this.updateParent(childValue);
				}
			} else {
				// Check if updating the child is allowed
				if (options.onInitDoNotUpdateChild === false) {
					this.updateChild(parentValue);
				}
			}

		} else if (this._childToParent === true) {
			// One-way child -> parent, so update the parent
			childValue = canReflect.getValue(options.child);
			this.updateParent(childValue);

		} else {
			// One-way parent -> child, so update the child
			// Check if updating the child is allowed
			if (options.onInitDoNotUpdateChild === false) {
				parentValue = canReflect.getValue(options.parent);
				this.updateChild(parentValue);
			}
		}
	},

	// Listen for changes to the child observable and update the parent
	startChild: function() {
		if (this._bindingState.child === false && this._childToParent === true) {
			var options = this._options;
			this._bindingState.child = true;
			turnOnListeningAndUpdate(options.child, options.parent, this.updateParent, options.queue);
		}
	},

	// Listen for changes to the parent observable and update the child
	startParent: function() {
		if (this._bindingState.parent === false && this._parentToChild === true) {
			var options = this._options;
			this._bindingState.parent = true;
			turnOnListeningAndUpdate(options.parent, options.child, this.updateChild, options.queue);
		}
	},

	// Turn off all the bindings
	stop: function() {
		var options = this._options;

		// Turn off the parent listener
		if (this._bindingState.parent === true && this._parentToChild === true) {
			this._bindingState.parent = false;
			turnOffListeningAndUpdate(options.parent, options.child, this.updateChild, options.queue);
		}

		// Turn off the child listener
		if (this._bindingState.child === true && this._childToParent === true) {
			this._bindingState.child = false;
			turnOffListeningAndUpdate(options.child, options.parent, this.updateParent, options.queue);
		}
	},

	// This is the listener that’s called when the parent changes
	updateChild: function(newValue) {
		var options = this._options;

		updateValue({
			newValue: newValue,

			// Main observable values
			observable: options.child,
			setValue: options.setChild,
			semaphore: this.childSemaphore,

			// If the sum of the semaphores is less than or equal to this number, then
			// it’s ok to update the child with the new value.
			allowedUpdates: options.cycles * 2 + (options.sticky === "childSticksToParent" ? 1 : 0),

			// If sticky is true, then after setting the child, check to see if its
			// value is different from what it was set to; if it is, then set the
			// parent to match the child’s new(est) value.
			sticky: options.sticky === "parentSticksToChild",

			// Partner observable values
			partner: options.parent,
			setPartner: options.setParent,
			partnerSemaphore: this.parentSemaphore
		});
	},

	// This is the listener that’s called when the child changes
	updateParent: function(newValue) {
		var options = this._options;

		updateValue({
			newValue: newValue,

			// Main observable values
			observable: options.parent,
			setValue: options.setParent,
			semaphore: this.parentSemaphore,

			// If the sum of the semaphores is less than or equal to this number, then
			// it’s ok to update the parent with the new value.
			allowedUpdates: options.cycles * 2 + (options.sticky === "parentSticksToChild" ? 1 : 0),

			// If sticky is true, then after setting the parent, check to see if its
			// value is different from what it was set to; if it is, then set the
			// child to match the parent’s new(est) value.
			sticky: options.sticky === "childSticksToParent",

			// Partner observable values
			partner: options.child,
			setPartner: options.setChild,
			partnerSemaphore: this.childSemaphore
		});
	}

});

// updateValue is a helper function that’s used by updateChild and updateParent
function updateValue(args) {
	var semaphore = args.semaphore;

	// Check the semaphore first; if this change is happening because the partner
	// observable was just updated, we only want to update this observable again
	// if the total count for both semaphores is less than or equal to the number
	// of allowed updates.
	if ((semaphore.value + args.partnerSemaphore.value) <= args.allowedUpdates) {
		queues.batch.start();

		// Update the observable’s value; this uses either a custom function passed
		// in when the binding was initialized or canReflect.setValue.
		args.setValue(args.newValue);

		// Increase the semaphore so that when the batch ends, if an update to the
		// partner observable’s value is made, then it won’t update this observable
		// again unless cycles are allowed.
		semaphore.increment();

		// Decrease the semaphore after all other updates have occurred
		queues.mutateQueue.enqueue(semaphore.decrement, semaphore, [], {});

		queues.batch.stop();

		// Stickiness is used in cases where the call to args.setValue above might
		// have resulted in the observable being set to a different value than what
		// was passed into this function (args.newValue). If sticy:true, then set
		// the partner observable’s value so they’re kept in sync.
		if (args.sticky) {
			var observableValue = canReflect.getValue(args.observable);
			if (observableValue !== canReflect.getValue(args.partner)) {
				args.setPartner(observableValue);
			}
		}
	}
}

module.exports = Bind;
