@function can-bind.prototype.startParent startParent
@parent can-bind.prototype
@description Start listening to the parent observable.
@signature `binding.startParent()`

This method checks whether the binding should listen to the parent; if it should
and it hasn’t already started listening, then it will start listening to the
`parent` and update the `child` in the `queue`
provided when the binding was initialized.

```js
import Bind from "can-bind";
import DefineMap from "can-define/map/map";
import value from "can-value";

const childMap = new DefineMap({childProp: "child value"});
const parentMap = new DefineMap({parentProp: "parent value"});

// Create the binding
const binding = new Bind({
  child: value.bind(childMap, "childProp"),
  parent: value.bind(parentMap, "parentProp")
});

// Turn on just the parent listener
binding.startParent();
```
