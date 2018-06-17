@module {Function} can-bind
@package ../package.json
@parent can-observables
@collection can-infrastructure
@description Bind two CanJS observable values together.
@group can-bind.prototype prototype

@signature `new Bind(options)`

  @param {Object} options An object with multiple options:
    - `child`: Required; the child observable.
    - `childToParent`: Optional boolean; by default, [can-bind] will check if the child has the [can-symbol/symbols/getValue can.getValue symbol] and either `setParent` is provided or the parent has the [can-symbol/symbols/setValue can.setValue symbol]; providing this option overrides those checks with the option’s value (e.g. `false` will force the binding to be one-way parent-to-child).
    - `cycles`: Optional; defaults to `0`. When an observable’s value is changed in a two-way binding, the number of times it can be changed again as a result of setting the other observable. This can be any number greater than 0 if `sticky` is undefined; otherwise, an error will be thrown if this is provided with `sticky`.
    - `onInitDoNotUpdateChild`: Optional; defaults to `false`. If `true`, then never set the child when starting a binding.
    - `onInitSetUndefinedParentIfChildIsDefined`: Optional; defaults to `true`: when the binding is started, if the parent’s value is undefined and the child’s value is defined, then set the parent to the child’s value.
    - `parent`: Required; the parent observable.
    - `parentToChild`: Optional boolean; by default, [can-bind] will check if the parent has the [can-symbol/symbols/getValue can.getValue symbol] and either `setChild` is provided or the child has the [can-symbol/symbols/setValue can.setValue symbol]; providing this option overrides those checks with the option’s value (e.g. `false` will force the binding to be one-way child-to-parent).
    - `priority`: Optional; a number to [can-reflect/setPriority set as the priority] for the child and parent observables.
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
couple of core options:

- `childToParent`: when the child’s value changes, update the parent.
- `parentToChild`: when the parent’s value changes, update the child.

If only one of these two options is true, we call that a “one-way binding;”
likewise, if both are true, then it’s a two-way binding.

Here’s an example of setting up a two-way binding:

```js
import Bind from "can-bind";
import canValue from "can-value";
import DefineMap from "can-define/map/map";

const childMap = new DefineMap({childProp: "original child value"});
const parentMap = new DefineMap({parentProp: "original parent value"});

const binding = new Bind({
  child: canValue.bind(bindMap, "inner.key"),
  parent: canValue.bind(bindMap, "inner.key"),
  queue: "domUI"
});
```

[can-bind] gives you more options to control how the binding works; see the
signature documentation above for a brief explanation of each option, and read
further below to learn more about options such as `cycles`,
`onInitDoNotUpdateChild`, `onInitSetUndefinedParentIfChildIsDefined`, and
`sticky`.

New [can-bind] instances have the following methods:

- [can-bind.prototype.start]: turn on both bindings (if they’re not already turned on) and sync the values (depending on the options passed in)
- [can-bind.prototype.startChild]: turn on just the child binding
- [can-bind.prototype.startParent]: turn on just the parent binding
- [can-bind.prototype.stop]: turn off both bindings
- [can-bind.prototype.updateChild]: set the child’s value; this is what’s called when the parent changes
- [can-bind.prototype.updateParent]: set the parent’s value; this is what’s called when the child changes

The binding instance also has one property, [can-bind.prototype.parentValue],
which returns the value of the parent observable.

## Initialization

When [can-bind.prototype.start] is called, it starts listening for changes to the
child & parent observables and then tries to sync their values, depending on:

1. Whether the child or parent is equal to `undefined`.
2. The values of the `onInitDoNotUpdateChild` and `onInitSetUndefinedParentIfChildIsDefined` options.
3. If it’s a one-way or two-way binding.

See the [can-bind.prototype.start] documentation for more information about how
initialization works.

## How cycles & stickiness work

There are two options that dictate how two-way bindings work:

- `cycles`: the number of times an observable can be updated as a result of the other observable being updated.
- `sticky`: if `"childSticksToParent"`, then [can-bind] will try to make the child match the parent’s value after the parent is set (if they do not already match).

Both of these options are described in more detail below.

### Cycles

The `cycles` option restricts the number of times a loop can be made while
updating the child or parent observables.

Let’s imagine child and parent observables that always increment their value by
one when they’re set:

```js
import Bind from "can-bind";
import SettableObservable from "can-simple-observable/settable/settable";

const child = new SettableObservable(function(newValue) {
	return newValue + 1;
}, null, 0);
const parent = new SettableObservable(function(newValue) {
	return newValue + 1;
}, null, 0);

const binding = new Bind({
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

The `sticky` option adds another behavior as part of the update process.

When [can-bind.prototype.updateParent] is called, the parent’s value is set to
the child’s value. With `sticky: "childSticksToParent"`, the parent’s value is
checked _after_ it’s set; if it doesn’t match the child’s value, then the child
is set to the parent’s new value.

This option is useful when the parent changes its own value, which might include
ignoring the value it is being set to.

Let’s imagine a parent observable that ignores being set to `undefined`:

```js
import Bind from "can-bind";
import canReflect from "can-reflect";
import SimpleObservable from "can-simple-observable";

// Both the child & parent values start at 15
const child = new SimpleObservable(15);
const parent = new SimpleObservable(15);

// If something tries to set the parent to undefined, ignore it
canReflect.assignSymbols(parent, {
  "can.setValue": function(newVal) {
    if (newVal !== undefined) {
      this.set(newVal);
    }
  }
});

// Create a two-way binding with sticky: "childSticksToParent"
const binding = new Bind({
  child: child,
  parent: parent,
  queue: "domUI",
  sticky: "childSticksToParent"
});
```

If we set the child’s value to `undefined` (`child.set(undefined)`),
[can-bind.prototype.updateParent] will be called to set the parent to
`undefined`; this will be ignored, so the parent’s value will remain at `15`.
With the `sticky: "childSticksToParent"` option, [can-bind] will see that the
child and parent values are not the same, and will set the child to the parent’s
value (`15`).

## How it works

> **Note:** this section is non-normative and only provided as a reference to
> _why_ [can-bind] works the way it does. The implementation described in this
> section is subject to change between releases. Do not depend on any of this
> information when using [can-bind].

### How does initialization work with the cycles and sticky options?

[can-bind]’s initialization code is meant to replicate
[how can-stache-bindings used to work](https://github.com/canjs/can-stache-bindings/blob/82ce7c98fdccd6558d3c908b6b7b183e1258b0d2/can-stache-bindings.js#L1026-L1054).
See the [can-bind.prototype.start] documentation for more information about how
the values are synchronized.

### In a two-way binding, what’s the difference between a value being the child vs. parent?

[can-stache-binding’s old binding code](https://github.com/canjs/can-stache-bindings/blob/82ce7c98fdccd6558d3c908b6b7b183e1258b0d2/can-stache-bindings.js#L655-L772)
had very different different code paths for updating the child and parent values.
This included only have a single semaphore to track cyclical updates, sometimes
calling [can-reflect.setValue] in a batch, and only implementing “stickiness” on
one side of the binding (parent setting child).

In [can-bind], all of those differences go away; the child and parent listeners
are implemented exactly the same. The only difference in how the child and parent
values are treated is how initialization works; read the
[can-bind.prototype.start] documentation for more information about how the
`onInitDoNotUpdateChild` and `onInitSetUndefinedParentIfChildIsDefined` options
influence how the two values are set when the binding is turned on.

### On init, why do we call updateChild/updateParent instead of setChild/setParent?

Let’s say we have a two-way binding with a defined parent and `undefined` child.
When the binding is initialized, the child’s value will be set to match the
parent (because the child is `undefined`). The listeners are already active when
the initial values are set, so the child listener will fire and want to update
the parent to match the child. This is prevented by the semaphore that’s
incremented when [can-bind.prototype.updateParent] is called.
