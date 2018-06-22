@property can-bind.prototype.parentValue parentValue
@parent can-bind.prototype
@description Returns the parent’s value.
@signature `binding.parentValue`

@body

This is the equivalent of doing:

```js
import canReflect from "can-reflect";

const parentValue = canReflect.getValue(parent);
```
