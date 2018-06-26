@property can-bind.prototype.parentValue parentValue
@parent can-bind.prototype
@description Returns the parent’s value.
@signature `binding.parentValue`

```js
import Bind from "can-bind";
import DefineMap from "can-define/map/map";
import value from "can-value";

const parentMap = new DefineMap({parentProp: "parent value"});
const parent = value.bind(parentMap, "parentProp");

const childMap = new DefineMap({childProp: "child value"});
const child = value.bind(childMap, "childProp");

const binding = new Bind({
  child: child,
  parent: parent
});

binding.parentValue; // is "parent value"
```

Using `parentValue` is the equivalent of using [can-reflect] to get the value:

```js
import canReflect from "can-reflect";

const parentValue = canReflect.getValue(parent);
```
