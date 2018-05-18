@module {Function} can-bind
@package ../package.json
@parent can-observables
@collection can-infrastructure
@description Bind two CanJS observable values together.
@group can-bind.prototype prototype

@signature `new Bind(options)`

  @param {Object} options An object with multiple options:
    - `child`: Required; the child observable.
    - `childToParent`: Optional boolean that defaults to `true` if `setParent` is provided or the parent has the `setValue` symbol, but can be overridden with `false` if you want a one-way parent-to-child binding.
    - `cycles`: Optional; defaults to `0`. When an observable’s value is changed in a two-way binding, the number of times it can be changed again as a result of setting the other observable. This can be any number greater than 0 if `sticky` is undefined; otherwise, an error will be thrown if this is provided with `sticky`.
    - `onInitDoNotUpdateChild`: Optional; defaults to `false`. If `true`, then never set the child when starting a binding.
    - `onInitSetUndefinedParentIfChildIsDefined`: Optional; defaults to `true`: when the binding is started, if the parent’s value is undefined and the child’s value is defined, then set the parent to the child’s value.
    - `parent`: Required; the parent observable.
    - `parentToChild`: Optional boolean that defaults to `true` if `setChild` is provided or the child has the `setValue` symbol, but can be overridden with `false` if you want a one-way child-to-parent binding.
    - `priority`: Optional; a number to set as the priority for the child and parent observables.
    - `queue`: Required; the name of the queue in which to listen for changes. Acceptable values include `"notify"`, `"derive"`, and `"domUI"`.
    - `setChild`: Optional; a custom function for setting the child observable’s value.
    - `setParent`: Optional; a custom function for setting the parent observable’s value.
    - `sticky`: Optional; defaults to `undefined`. Right now `"childSticksToParent"` is the only other allowed value, and it will try to make the child matches the parent’s value after setting the parent.
    - `updateChildName`: Optional; a debugging name for the function that listens to the parent’s value and updates the child.
    - `updateParentName`: Optional; a debugging name for the function that listens to the child’s value and updates the parent.
  @return {can-bind} A new binding instance.

@body

## Overview

[can-bind] is used to keep two observable values in sync with each other. These
two observable values, the `child` and `parent`, can be tied together by a
couple core options:

- `childToParent`: when the child’s value changes, update the parent.
- `parentToChild`: when the parent’s value changes, update the parent.

If only one of these two options is true, we call that a “one-way binding;”
likewise, if both are true, then it’s a two-way binding.

[can-bind] gives you a multitude of options to control how the binding works;
see the docs above for a brief explanation of each option, and read further
below to learn more about options such as `cycles`, `onInitDoNotUpdateChild`,
`onInitSetUndefinedParentIfChildIsDefined`, and `sticky`.

The binding object created by [can-bind] has the following methods:

- [can-bind.prototype.start]: turn on both bindings (if they’re not already turned on) and sync the values (depending on the options passed in)
- [can-bind.prototype.startChild]: turn on the child binding
- [can-bind.prototype.startParent]: turn on the parent binding
- [can-bind.prototype.stop]: turn off both bindings
- [can-bind.prototype.updateChild]: set the child’s value; this is the listener used in the parent binding
- [can-bind.prototype.updateParent]: set the parent’s value; this is the listener used in the child binding

The binding instance also has one property, [can-bind.prototype.parentValue],
which returns the value of the parent observable.

## Initialization

When [can-bind.prototype.start] is called, it binds to the child & parent
and then tries to sync their values, depending on:

1. Whether child or parent is `undefined`.
2. The values of the `onInitDoNotUpdateChild` and `onInitSetUndefinedParentIfChildIsDefined` options.
3. If it’s a one-way or two-way binding.

See the [can-bind.prototype.start] docs for more information about how
initialization works.

## How cycles & stickiness work

[can-bind] currently supports two main modes of two-way binding:

1. X number of cycles with no stickiness
2. 0 cycles with child “stickiness”

The first mode is conceptually more simple, so let’s look at that first:

### Cycles

The `cycles` option restricts the number of times a loop can be made while
updating the child or parent observables.

Let’s imagine child and parent observables that always increment their value by
one when they’re set:


```js
import canBind from "can-bind";
import SettableObservable from "can-simple-observable/settable/settable";

const child = new SettableObservable(function(newValue) {
	return newValue + 1;
}, null, 0);
const parent = new SettableObservable(function(newValue) {
	return newValue + 1;
}, null, 0);

const binding = canBind({
  child: child,
  parent: parent,
  queue: "domUI",
  updateChildName: "update child",
  updateParentName: "update parent"
});
```

If we set the child’s value to 1 (`child.set(1)`), it’ll increment its value to
2, then set the parent to 2, which will increment its value to 3, then set the
child… we’re in an infinite loop!

The `cycles` option protects against that: whichever value you set first, it
will only allow that value to be set `cycles` number of times as a result of the
binding.

In our example, with `cycles: 0`, the child would not be updated to 3. If
`cycles: 1`, then the child could be updated to 3 (and increment itself to 4),
then set the parent to 4 (which would be incremented to 5); one additional loop
is allowed, but no more.

### Stickiness

The `sticky` option adds another behavior as part of the update process. When
[can-bind.prototype.updateParent] is called, the parent’s value is set
to the child’s value.

With `sticky: "childSticksToParent"`, the parent’s value is checked _after_ it’s
set; if it doesn’t match the child’s value, then the child is set to the
parent’s new value. This option is useful in cases where the parent might change
its own value after being set.
