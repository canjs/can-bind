@function can-bind.prototype.startParent startParent
@parent can-bind.prototype
@description Start listening to the parent observable.
@signature `binding.startParent()`

@body

This method checks whether the binding should listen to the parent; if it should
and it hasn’t already started listening, it will start listening in the `queue`
provided when the binding was initialized.
