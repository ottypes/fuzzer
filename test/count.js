// This is a simple test for the fuzzer, using a trivial OT type. The type
// is correct - we should add tests where types are not correct get caught by
// the fuzzer.

const fuzzer = require('../lib')

// Each op is [expectedSnapshot, increment].
const count = {
  name: 'count',
  create: () => 1,

  apply(snapshot, op) {
    const [v, inc] = op;
    if (snapshot !== v) { throw new Error(`Op ${v} != snapshot ${snapshot}`); }
    return snapshot + inc;
  },
  
  transform(op1, op2) {
    if (op1[0] !== op2[0]) { throw new Error(`Op1 ${op1[0]} != op2 ${op2[0]}`); }
    return [op1[0] + op2[1], op1[1]];
  },
  
  compose(op1, op2) {
    if ((op1[0] + op1[1]) !== op2[0]) { throw new Error(`Op1 ${op1} + 1 != op2 ${op2}`); }
    return [op1[0], op1[1] + op2[1]];
  },
}


const genOp = doc => [[doc, 1], doc + 1];


describe('type count', () => it('should pass the randomizer tests', function() {
  this.slow(200);
  fuzzer(count, genOp);
}));

