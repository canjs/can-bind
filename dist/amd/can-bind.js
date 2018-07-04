/*can-bind@0.2.0#can-bind*/
define([
    'require',
    'exports',
    'module',
    'can-reflect',
    'can-symbol',
    'can-namespace',
    'can-queues'
], function (require, exports, module) {
    'use strict';
    var canReflect = require('can-reflect');
    var canSymbol = require('can-symbol');
    var namespace = require('can-namespace');
    var queues = require('can-queues');
    var getChangesSymbol = canSymbol.for('can.getChangesDependencyRecord');
    var getValueSymbol = canSymbol.for('can.getValue');
    var onValueSymbol = canSymbol.for('can.onValue');
    var setValueSymbol = canSymbol.for('can.setValue');
    function defaultSetValue(newValue, observable) {
        canReflect.setValue(observable, newValue);
    }
    function turnOffListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
        if (listenToObservable[onValueSymbol]) {
            canReflect.offValue(listenToObservable, updateFunction, queue);
        }
    }
    function turnOnListeningAndUpdate(listenToObservable, updateObservable, updateFunction, queue) {
        if (listenToObservable[onValueSymbol]) {
            canReflect.onValue(listenToObservable, updateFunction, queue);
        }
    }
    function Semaphore() {
        this.value = 0;
    }
    Object.assign(Semaphore.prototype, {
        decrement: function () {
            this.value -= 1;
        },
        increment: function () {
            this.value += 1;
        }
    });
    function Bind(options) {
        this._options = options;
        if (options.queue === undefined) {
            options.queue = 'domUI';
        }
        if (options.cycles > 0 === false) {
            options.cycles = 0;
        }
        options.onInitDoNotUpdateChild = typeof options.onInitDoNotUpdateChild === 'boolean' ? options.onInitDoNotUpdateChild : false;
        options.onInitSetUndefinedParentIfChildIsDefined = typeof options.onInitSetUndefinedParentIfChildIsDefined === 'boolean' ? options.onInitSetUndefinedParentIfChildIsDefined : true;
        var childSemaphore = new Semaphore();
        var parentSemaphore = new Semaphore();
        var childToParent = true;
        if (typeof options.childToParent === 'boolean') {
            childToParent = options.childToParent;
        } else if (options.child[getValueSymbol] == null) {
            childToParent = false;
        } else if (options.setParent === undefined && options.parent[setValueSymbol] == null) {
            childToParent = false;
        }
        var parentToChild = true;
        if (typeof options.parentToChild === 'boolean') {
            parentToChild = options.parentToChild;
        } else if (options.parent[getValueSymbol] == null) {
            parentToChild = false;
        } else if (options.setChild === undefined && options.child[setValueSymbol] == null) {
            parentToChild = false;
        }
        if (childToParent === false && parentToChild === false) {
            throw new Error('Neither the child nor parent will be updated; this is a no-way binding');
        }
        this._childToParent = childToParent;
        this._parentToChild = parentToChild;
        if (options.setChild === undefined) {
            options.setChild = defaultSetValue;
        }
        if (options.setParent === undefined) {
            options.setParent = defaultSetValue;
        }
        if (options.priority !== undefined) {
            canReflect.setPriority(options.child, options.priority);
            canReflect.setPriority(options.parent, options.priority);
        }
        var allowedUpdates = options.cycles * 2;
        var allowedChildUpdates = allowedUpdates + (options.sticky === 'childSticksToParent' ? 1 : 0);
        var allowedParentUpdates = allowedUpdates + (options.sticky === 'parentSticksToChild' ? 1 : 0);
        var bindingState = this._bindingState = {
            child: false,
            parent: false
        };
        this._updateChild = function (newValue) {
            updateValue({
                bindingState: bindingState,
                newValue: newValue,
                debugObservableName: 'child',
                debugPartnerName: 'parent',
                observable: options.child,
                setValue: options.setChild,
                semaphore: childSemaphore,
                allowedUpdates: allowedChildUpdates,
                sticky: options.sticky === 'parentSticksToChild',
                partner: options.parent,
                setPartner: options.setParent,
                partnerSemaphore: parentSemaphore
            });
        };
        this._updateParent = function (newValue) {
            updateValue({
                bindingState: bindingState,
                newValue: newValue,
                debugObservableName: 'parent',
                debugPartnerName: 'child',
                observable: options.parent,
                setValue: options.setParent,
                semaphore: parentSemaphore,
                allowedUpdates: allowedParentUpdates,
                sticky: options.sticky === 'childSticksToParent',
                partner: options.child,
                setPartner: options.setChild,
                partnerSemaphore: childSemaphore
            });
        };
    }
    Object.defineProperty(Bind.prototype, 'parentValue', {
        get: function () {
            return canReflect.getValue(this._options.parent);
        }
    });
    Object.assign(Bind.prototype, {
        start: function () {
            var childValue;
            var options = this._options;
            var parentValue;
            this.startParent();
            this.startChild();
            if (this._childToParent === true && this._parentToChild === true) {
                parentValue = canReflect.getValue(options.parent);
                if (parentValue === undefined) {
                    childValue = canReflect.getValue(options.child);
                    if (childValue === undefined) {
                        if (options.onInitDoNotUpdateChild === false) {
                            this._updateChild(parentValue);
                        }
                    } else if (options.onInitSetUndefinedParentIfChildIsDefined === true) {
                        this._updateParent(childValue);
                    }
                } else {
                    if (options.onInitDoNotUpdateChild === false) {
                        this._updateChild(parentValue);
                    }
                }
            } else if (this._childToParent === true) {
                childValue = canReflect.getValue(options.child);
                this._updateParent(childValue);
            } else if (this._parentToChild === true) {
                if (options.onInitDoNotUpdateChild === false) {
                    parentValue = canReflect.getValue(options.parent);
                    this._updateChild(parentValue);
                }
            }
        },
        startChild: function () {
            if (this._bindingState.child === false && this._childToParent === true) {
                var options = this._options;
                this._bindingState.child = true;
                turnOnListeningAndUpdate(options.child, options.parent, this._updateParent, options.queue);
            }
        },
        startParent: function () {
            if (this._bindingState.parent === false && this._parentToChild === true) {
                var options = this._options;
                this._bindingState.parent = true;
                turnOnListeningAndUpdate(options.parent, options.child, this._updateChild, options.queue);
            }
        },
        stop: function () {
            var bindingState = this._bindingState;
            var options = this._options;
            if (bindingState.parent === true && this._parentToChild === true) {
                bindingState.parent = false;
                turnOffListeningAndUpdate(options.parent, options.child, this._updateChild, options.queue);
            }
            if (bindingState.child === true && this._childToParent === true) {
                bindingState.child = false;
                turnOffListeningAndUpdate(options.child, options.parent, this._updateParent, options.queue);
            }
        }
    });
    function updateValue(args) {
        var bindingState = args.bindingState;
        if (bindingState.child === false && bindingState.parent === false) {
            return;
        }
        var semaphore = args.semaphore;
        if (semaphore.value + args.partnerSemaphore.value <= args.allowedUpdates) {
            queues.batch.start();
            args.setValue(args.newValue, args.observable);
            semaphore.increment();
            queues.mutateQueue.enqueue(semaphore.decrement, semaphore, []);
            queues.batch.stop();
            if (args.sticky) {
                var observableValue = canReflect.getValue(args.observable);
                if (observableValue !== canReflect.getValue(args.partner)) {
                    args.setPartner(observableValue, args.partner);
                }
            }
        } else {
        }
    }
    module.exports = namespace.Bind = Bind;
});