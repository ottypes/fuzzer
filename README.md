# The OT Fuzzer

This directory contains The Fuzzer (Bug finding hound, destroyer of confidence).

If you make an OT type and you haven't run the fuzzer on your type, you will
almost certainly find bugs with your implementation. It is obnoxious the number
of bugs this little bundle of joy has found over the years.

Use it like this:

```javascript
var fuzzer = require('ot-fuzzer');
var mytype = require('./mytype');

var generateRandomOp = function(snapshot) {
  // ...
  return [op, newSnapshot];
};

fuzzer(mytype, generateRandomOp);
```

You need to write a random op generator function for your type:

**generateRandomOp(snapshot) -> [op, newSnapshot]**: generateRandomOp
generates a random operation that is valid for the given snapshot. It returns
the operation along with the expected result of applying the operation. You
*should not* use `type.apply` to generate the expected snapshot - that would
make it very hard to find bugs in the apply function itself.

The fuzzer will start with an empty document (`type.create()`) and then
iteratively generate operations with generateRandomOp and apply them. If your
generateRandomOp function only makes operations which increase the size of the
document, the randomizer will eat all your RAM and get really slow. You should
strike a balance in your generateRandomOp function between growing and
shrinking the document.

Arguably this is a bug in the fuzzer - feel free to submit a pull request.

Once you've written generateRandomOp, you can run the fuzzer:

**fuzzer(type, generateRandomOp, [iterations])**: Runs the fuzzer. The
randomizer generates a few new operations from the initial document snapshot
and tests that the various OT functions do what they're supposed to.

If unspecified, the fuzzer defaults to 2000 iterations. When debugging your OT
type, you should increase this so you can run the fuzzer overnight.

### Random data functions

The fuzzer library also comes with a mersenne prime random number generator and
some helper functions. These functions make the fuzzer *repeatable*, so each
identical instantiation of the fuzzer will trigger the same bugs. This is
extremely convenient when you're debugging your library, and as such its highly
recommended that you use these functions instead of `Math.random()`.

The seed changes every 6 hours. If you want to do more testing, don't change
the seed - instead increase the iteration count or add more cases to your
generator.

**randomReal()**: Generate a random float less than 1. This function is a
direct replacement for Math.random(), except it uses a seed.

**randomInt(n)**: Generate a random int in the range [0,n). (Ie, a non-negative
integer less than n).

**randomWord(n)**: Select and return a random word. The word is chosen from the
jabberwocky.




---

# License

All code contributed to this repository is licensed under the standard MIT license:

Copyright 2011-2014 ottypes library contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following condition:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


