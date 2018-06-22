@function can-bind.prototype.startChild startChild
@parent can-bind.prototype
@description Start listening to the child observable.
@signature `binding.startChild()`

@body

This method checks whether the binding should listen to the child; if it should
and it hasn’t already started listening, it will start listening in the `queue`
provided when the binding was initialized.
