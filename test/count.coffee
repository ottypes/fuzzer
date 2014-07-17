# This is a simple test for the fuzzer, using a trivial OT type. The type
# is correct - we should add tests where types are not correct get caught by
# the fuzzer.

fuzzer = require '../lib'

# Each op is [expectedSnapshot, increment].
count = {}
count.name = 'count'
count.create = -> 1

count.apply = (snapshot, op) ->
  [v, inc] = op
  throw new Error "Op #{v} != snapshot #{snapshot}" unless snapshot == v
  snapshot + inc

count.transform = (op1, op2) ->
  throw new Error "Op1 #{op1[0]} != op2 #{op2[0]}" unless op1[0] == op2[0]
  [op1[0] + op2[1], op1[1]]

count.compose = (op1, op2) ->
  throw new Error "Op1 #{op1} + 1 != op2 #{op2}" unless op1[0] + op1[1] == op2[0]
  [op1[0], op1[1] + op2[1]]

genOp = (doc) ->
  [[doc, 1], doc + 1]


describe 'type count', ->
  it 'should pass the randomizer tests', ->
    @slow 200
    fuzzer count, genOp

