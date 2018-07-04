/*[global-shim-start]*/
(function(exports, global, doEval) {
	// jshint ignore:line
	var origDefine = global.define;

	var get = function(name) {
		var parts = name.split("."),
			cur = global,
			i;
		for (i = 0; i < parts.length; i++) {
			if (!cur) {
				break;
			}
			cur = cur[parts[i]];
		}
		return cur;
	};
	var set = function(name, val) {
		var parts = name.split("."),
			cur = global,
			i,
			part,
			next;
		for (i = 0; i < parts.length - 1; i++) {
			part = parts[i];
			next = cur[part];
			if (!next) {
				next = cur[part] = {};
			}
			cur = next;
		}
		part = parts[parts.length - 1];
		cur[part] = val;
	};
	var useDefault = function(mod) {
		if (!mod || !mod.__esModule) return false;
		var esProps = { __esModule: true, default: true };
		for (var p in mod) {
			if (!esProps[p]) return false;
		}
		return true;
	};

	var hasCjsDependencies = function(deps) {
		return (
			deps[0] === "require" && deps[1] === "exports" && deps[2] === "module"
		);
	};

	var modules =
		(global.define && global.define.modules) ||
		(global._define && global._define.modules) ||
		{};
	var ourDefine = (global.define = function(moduleName, deps, callback) {
		var module;
		if (typeof deps === "function") {
			callback = deps;
			deps = [];
		}
		var args = [],
			i;
		for (i = 0; i < deps.length; i++) {
			args.push(
				exports[deps[i]]
					? get(exports[deps[i]])
					: modules[deps[i]] || get(deps[i])
			);
		}
		// CJS has no dependencies but 3 callback arguments
		if (hasCjsDependencies(deps) || (!deps.length && callback.length)) {
			module = { exports: {} };
			args[0] = function(name) {
				return exports[name] ? get(exports[name]) : modules[name];
			};
			args[1] = module.exports;
			args[2] = module;
		} else if (!args[0] && deps[0] === "exports") {
			// Babel uses the exports and module object.
			module = { exports: {} };
			args[0] = module.exports;
			if (deps[1] === "module") {
				args[1] = module;
			}
		} else if (!args[0] && deps[0] === "module") {
			args[0] = { id: moduleName };
		}

		global.define = origDefine;
		var result = callback ? callback.apply(null, args) : undefined;
		global.define = ourDefine;

		// Favor CJS module.exports over the return value
		result = module && module.exports ? module.exports : result;
		modules[moduleName] = result;

		// Set global exports
		var globalExport = exports[moduleName];
		if (globalExport && !get(globalExport)) {
			if (useDefault(result)) {
				result = result["default"];
			}
			set(globalExport, result);
		}
	});
	global.define.orig = origDefine;
	global.define.modules = modules;
	global.define.amd = true;
	ourDefine("@loader", [], function() {
		// shim for @@global-helpers
		var noop = function() {};
		return {
			get: function() {
				return { prepareGlobal: noop, retrieveGlobal: noop };
			},
			global: global,
			__exec: function(__load) {
				doEval(__load.source, global);
			}
		};
	});
})(
	{},
	typeof self == "object" && self.Object == Object
		? self
		: typeof process === "object" &&
		  Object.prototype.toString.call(process) === "[object process]"
			? global
			: window,
	function(__$source__, __$global__) {
		// jshint ignore:line
		eval("(function() { " + __$source__ + " \n }).call(__$global__);");
	}
);

/*can-bind@0.2.0#can-bind*/
define('can-bind', [
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
/*[global-shim-end]*/
(function(global) { // jshint ignore:line
	global._define = global.define;
	global.define = global.define.orig;
}
)(typeof self == "object" && self.Object == Object ? self : (typeof process === "object" && Object.prototype.toString.call(process) === "[object process]") ? global : window);