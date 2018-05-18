@function can-bind.prototype.start start
@parent can-bind.prototype
@description Start listening to the observables and set their values depending
on their current state and the options provided to the binding when initialized.
@signature `binding.start()`

@body

This method turns on both the child and parent observable listeners by calling
[can-bind.prototype.startChild] and [can-bind.prototype.startParent].

Additionally, it tries to sync the values of the child and parent observables,
depending on:

1. Whether child or parent is `undefined`.
2. The values of the `onInitDoNotUpdateChild` and `onInitSetUndefinedParentIfChildIsDefined` options.
3. If it’s a one-way or two-way binding.

By default, the initialization works as diagrammed below:

```
Child start value      Parent start value     Child end value  Parent end value  API call

child=1           <->  parent=2           =>  child=2          parent=2          updateChild(2)
child=1           <->  parent=undefined   =>  child=1          parent=1          updateParent(1)
child=undefined   <->  parent=2           =>  child=2          parent=2          updateChild(2)
child=undefined   <->  parent=undefined   =>  child=undefined  parent=undefined  updateChild(undefined)
child=3           <->  parent=3           =>  child=3          parent=3          updateChild(3)

child=1            ->  parent=2           =>  child=1          parent=1          updateParent(1)
child=1            ->  parent=undefined   =>  child=1          parent=1          updateParent(1)
child=undefined    ->  parent=2           =>  child=undefined  parent=undefined  updateParent(undefined)
child=undefined    ->  parent=undefined   =>  child=undefined  parent=undefined  updateParent(undefined)
child=3            ->  parent=3           =>  child=3          parent=3          updateParent(3)

child=1           <-   parent=2           =>  child=2          parent=2          updateChild(2)
child=1           <-   parent=undefined   =>  child=undefined  parent=undefined  updateChild(undefined)
child=undefined   <-   parent=2           =>  child=2          parent=2          updateChild(2)
child=undefined   <-   parent=undefined   =>  child=undefined  parent=undefined  updateChild(undefined)
child=3           <-   parent=3           =>  child=3          parent=3          updateChild(3)
```

By default, one-way bindings initialize however the binding is set up: with
one-way parent-to-child, the parent always sets the child; likewise, one-way
child-to-parent always sets the parent’s value to the child’s value. This is
true even when one of them is `undefined` and/or if they’re already the same
value.

With two-way bindings, the logic is a little different: if one of the values is
`undefined`, it will be initialized with the value from the other. If they
conflict, the child’s value will be set to match the parent.

The `onInitDoNotUpdateChild` option can change how initialization works. This
option’s value is `false` by default, but if it’s set to `true`, then the child
will _never_ be set when the binding is initialized. This option has no effect
one-way child-to-parent bindings because the child’s value is never set.

The diagram above looks like the following with this option:

```
Δ Child start value     Parent start value     Child end value  Parent end value  API call

Δ child=1           <-> parent=2           =>  child=1          parent=2          None
  child=1           <-> parent=undefined   =>  child=1          parent=1          updateParent(1)
Δ child=undefined   <-> parent=2           =>  child=undefined  parent=2          None
Δ child=undefined   <-> parent=undefined   =>  child=undefined  parent=undefined  None
Δ child=3           <-> parent=3           =>  child=3          parent=3          None

Δ child=1           <-  parent=2           =>  child=1          parent=2          None
Δ child=1           <-  parent=undefined   =>  child=1          parent=undefined  None
Δ child=undefined   <-  parent=2           =>  child=undefined  parent=2          None
Δ child=undefined   <-  parent=undefined   =>  child=undefined  parent=undefined  None
Δ child=3           <-  parent=3           =>  child=3          parent=3          None
```
